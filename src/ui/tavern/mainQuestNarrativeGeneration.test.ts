// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  runMainQuestNarrativeGeneration,
  type MainQuestNarrativeGenerationDeps,
} from './TavernSimulator.tsx'
import {
  createTavernCampaign,
  resolveCampaignDay,
} from '../../core/tavern/campaign/campaign.ts'
import { dispatchMainQuest } from '../../core/mainQuest/dispatch.ts'
import { MAIN_QUEST_THREAT_DEFINITION_MAP } from '../../core/mainQuest/threats.ts'
import { TAVERN_ECONOMY_CONFIG } from '../../core/economy/economyConfig.ts'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'
import type { NarrativeProvider } from '../../ai/narrative/types.ts'

// A real save's `funds` must always equal its Ledger total, so the fixture
// Campaign needs enough starting funds to afford the Main Quest fee.
// Scoped to this file only (Vitest isolates each test file's module graph).
;(TAVERN_ECONOMY_CONFIG as { initialFunds: number }).initialFunds = 100000

const FAKE_NARRATIVE_TEXT = `===PRE-BATTLE===
出発前の物語。

===POST-BATTLE===
戦いの後の物語。`

function fakeProvider(): NarrativeProvider {
  return {
    id: 'fake-async-test',
    async generate() {
      return { text: FAKE_NARRATIVE_TEXT }
    },
  }
}

/** A resolved Campaign with one Main Quest Attempt sitting at
 * `narrative_pending` (Simulation done, no Narrative generated yet) — the
 * exact state `runMainQuestNarrativeGeneration` is meant to act on. */
function buildPendingCampaign(seed: string): {
  campaign: TavernCampaignState
  attemptId: string
} {
  const campaign = createTavernCampaign(seed)
  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP.alden
  const party = campaign.parties[0]
  party.party.rank = definition.requiredPartyRank
  party.relationship.affinity = definition.requiredAffinity
  campaign.currentDay.parties = campaign.currentDay.parties.map((p) =>
    p.id === party.id
      ? { ...p, party: { ...p.party, rank: definition.requiredPartyRank } }
      : p,
  )
  const dispatch = dispatchMainQuest(campaign, 'alden', party.id)
  if (!dispatch.ok || !dispatch.attemptId) {
    throw new Error('test setup: dispatch failed')
  }
  const resolved = resolveCampaignDay(dispatch.campaign)
  return { campaign: resolved, attemptId: dispatch.attemptId }
}

function makeDeps(
  campaign: TavernCampaignState,
  attemptId: string,
  narrativeProvider: NarrativeProvider,
  setCampaign: MainQuestNarrativeGenerationDeps['setCampaign'],
): MainQuestNarrativeGenerationDeps {
  return {
    campaignRef: { current: campaign },
    setCampaign,
    narrativeProvider,
    attemptId,
  }
}

describe('runMainQuestNarrativeGeneration', () => {
  it('applies the generated Narrative to the latest Campaign and commits it via campaignRef + setCampaign', async () => {
    const { campaign, attemptId } = buildPendingCampaign('narrative-async-001')
    let committed: TavernCampaignState | null = null
    const deps = makeDeps(campaign, attemptId, fakeProvider(), (next) => {
      committed = next
    })

    const result = await runMainQuestNarrativeGeneration(deps)

    expect(result.ok).toBe(true)
    expect(committed).not.toBeNull()
    const attempt = committed!.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    expect(attempt.presentationStatus).toBe('ready')
    expect(attempt.narrative).toBeDefined()
    // campaignRef is updated synchronously alongside the state commit, so a
    // second call issued right after would see the already-applied result.
    expect(deps.campaignRef.current).toBe(committed)
  })

  it('never applies a stale AI response once the Campaign was replaced during the await (e.g. New Game)', async () => {
    const { campaign, attemptId } = buildPendingCampaign('narrative-async-002')
    const deps = makeDeps(
      campaign,
      attemptId,
      // The provider's `generate()` runs during the `await` in production —
      // swapping the ref here simulates the Campaign moving on to a fresh
      // game while the AI call was still in flight.
      {
        id: 'fake-new-game-mid-flight',
        async generate() {
          deps.campaignRef.current = createTavernCampaign(
            'narrative-async-002-new-game',
          )
          return { text: FAKE_NARRATIVE_TEXT }
        },
      },
      vi.fn(),
    )

    const result = await runMainQuestNarrativeGeneration(deps)

    expect(result.ok).toBe(false)
    expect(deps.setCampaign).not.toHaveBeenCalled()
    // The swapped-in Campaign (with no Main Quest activity at all) is
    // untouched — the stale script was never written anywhere.
    expect(deps.campaignRef.current!.mainQuest.attempts.length).toBe(0)
  })

  it('never applies a stale AI response when the pending Attempt reference is invalidated mid-flight', async () => {
    const { campaign, attemptId } = buildPendingCampaign('narrative-async-003')
    const deps = makeDeps(
      campaign,
      attemptId,
      {
        id: 'fake-invalidated-pending-mid-flight',
        async generate() {
          const current = deps.campaignRef.current!
          deps.campaignRef.current = {
            ...current,
            mainQuest: {
              ...current.mainQuest,
              pendingPresentationAttemptId: undefined,
            },
          }
          return { text: FAKE_NARRATIVE_TEXT }
        },
      },
      vi.fn(),
    )

    const result = await runMainQuestNarrativeGeneration(deps)

    expect(result.ok).toBe(false)
    expect(deps.setCampaign).not.toHaveBeenCalled()
    const attempt = deps.campaignRef.current!.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    expect(attempt.narrative).toBeUndefined()
    expect(attempt.presentationStatus).toBe('narrative_pending')
  })

  it('retries successfully after a failed apply, once the Campaign is valid again', async () => {
    const { campaign, attemptId } = buildPendingCampaign('narrative-async-004')
    let committed: TavernCampaignState | null = null
    const commitSpy = vi.fn((next: TavernCampaignState) => {
      committed = next
    })

    const failingDeps = makeDeps(
      campaign,
      attemptId,
      {
        id: 'fake-fail-then-retry',
        async generate() {
          const current = failingDeps.campaignRef.current!
          failingDeps.campaignRef.current = {
            ...current,
            mainQuest: {
              ...current.mainQuest,
              pendingPresentationAttemptId: undefined,
            },
          }
          return { text: FAKE_NARRATIVE_TEXT }
        },
      },
      commitSpy,
    )
    const failed = await runMainQuestNarrativeGeneration(failingDeps)
    expect(failed.ok).toBe(false)
    expect(committed).toBeNull()
    expect(commitSpy).not.toHaveBeenCalled()

    // The redirect back into MainQuestScene re-arms the pending reference —
    // retrying afterwards must succeed exactly like a first attempt would.
    const restored = failingDeps.campaignRef.current!
    const retryCampaign: TavernCampaignState = {
      ...restored,
      mainQuest: {
        ...restored.mainQuest,
        pendingPresentationAttemptId: attemptId,
      },
    }
    const retryDeps = makeDeps(
      retryCampaign,
      attemptId,
      fakeProvider(),
      commitSpy,
    )
    const retried = await runMainQuestNarrativeGeneration(retryDeps)

    expect(retried.ok).toBe(true)
    expect(committed).not.toBeNull()
    expect(
      committed!.mainQuest.attempts.find((a) => a.id === attemptId)!
        .presentationStatus,
    ).toBe('ready')
  })

  it('returns ok:true without calling the provider when the Attempt already has a Narrative', async () => {
    const { campaign, attemptId } = buildPendingCampaign('narrative-async-005')
    const withNarrative: TavernCampaignState = {
      ...campaign,
      mainQuest: {
        ...campaign.mainQuest,
        attempts: campaign.mainQuest.attempts.map((a) =>
          a.id === attemptId
            ? {
                ...a,
                narrative: {
                  preBattle: '既存の物語',
                  battleInterludes: [],
                  postBattle: '既存の結末',
                  promptVersion: 'v0',
                  providerId: 'existing',
                  createdAt: new Date(0).toISOString(),
                },
              }
            : a,
        ),
      },
    }
    const generateSpy = vi.fn()
    const deps = makeDeps(
      withNarrative,
      attemptId,
      { id: 'unused', generate: generateSpy },
      vi.fn(),
    )

    const result = await runMainQuestNarrativeGeneration(deps)

    expect(result.ok).toBe(true)
    expect(generateSpy).not.toHaveBeenCalled()
  })
})
