// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  runMainQuestNarrativeGeneration,
  type MainQuestNarrativeGenerationDeps,
} from './mainQuestNarrativeGeneration.ts'
import {
  createTavernCampaign,
  resolveCampaignDay,
} from '../../core/tavern/campaign/campaign.ts'
import { resolveFinishDayTransition } from './finishDayTransition.ts'
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

/** A Campaign with one Main Quest Attempt just dispatched (day still
 * 'planning', Attempt not yet simulated) — the state right before
 * `resolveCampaignDay`/`resolveFinishDayTransition` runs. */
function buildDispatchedCampaign(
  seed: string,
  threatId: 'alden' | 'velga' = 'alden',
): {
  campaign: TavernCampaignState
  attemptId: string
} {
  const campaign = createTavernCampaign(seed)
  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[threatId]
  const party = campaign.parties[0]
  party.party.rank = definition.requiredPartyRank
  party.relationship.affinity = definition.requiredAffinity
  campaign.currentDay.parties = campaign.currentDay.parties.map((p) =>
    p.id === party.id
      ? { ...p, party: { ...p.party, rank: definition.requiredPartyRank } }
      : p,
  )
  const dispatch = dispatchMainQuest(campaign, threatId, party.id)
  if (!dispatch.ok || !dispatch.attemptId) {
    throw new Error('test setup: dispatch failed')
  }
  return { campaign: dispatch.campaign, attemptId: dispatch.attemptId }
}

/** A resolved Campaign with one Main Quest Attempt sitting at
 * `narrative_pending` (Simulation done, no Narrative generated yet) — the
 * exact state `runMainQuestNarrativeGeneration` is meant to act on. */
function buildPendingCampaign(
  seed: string,
  threatId: 'alden' | 'velga' = 'alden',
): {
  campaign: TavernCampaignState
  attemptId: string
} {
  const { campaign, attemptId } = buildDispatchedCampaign(seed, threatId)
  return { campaign: resolveCampaignDay(campaign), attemptId }
}

/**
 * Mirrors `TavernSimulator`'s real `commitCampaign`: `campaignRef.current`
 * and the "rendered" Campaign state are updated in the exact same
 * synchronous call, with every commit recorded — so a test can assert not
 * just the final state, but that a stale write was never committed as a
 * step in between, exactly like the production atomic-commit path.
 */
function makeCommitHarness(initial: TavernCampaignState): {
  campaignRef: { current: TavernCampaignState | null }
  commitCampaign: (next: TavernCampaignState) => void
  committedHistory: TavernCampaignState[]
} {
  const campaignRef: { current: TavernCampaignState | null } = {
    current: initial,
  }
  const committedHistory: TavernCampaignState[] = []
  const commitCampaign = (next: TavernCampaignState) => {
    campaignRef.current = next
    committedHistory.push(next)
  }
  return { campaignRef, commitCampaign, committedHistory }
}

describe('runMainQuestNarrativeGeneration', () => {
  it('applies the generated Narrative to the latest Campaign and commits it via the atomic commit path', async () => {
    const { campaign, attemptId } = buildPendingCampaign('narrative-async-001')
    const { campaignRef, commitCampaign, committedHistory } =
      makeCommitHarness(campaign)
    const deps: MainQuestNarrativeGenerationDeps = {
      campaignRef,
      commitCampaign,
      narrativeProvider: fakeProvider(),
      attemptId,
    }

    const result = await runMainQuestNarrativeGeneration(deps)

    expect(result.ok).toBe(true)
    expect(committedHistory).toHaveLength(1)
    const attempt = committedHistory[0].mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    expect(attempt.presentationStatus).toBe('ready')
    expect(attempt.narrative).toBeDefined()
    expect(campaignRef.current).toBe(committedHistory[0])
  })

  it('never applies a stale AI response once a New Game was started (committed via the real commitCampaign path) while the AI call was in flight', async () => {
    const { campaign, attemptId } = buildPendingCampaign('narrative-async-002')
    const { campaignRef, commitCampaign, committedHistory } =
      makeCommitHarness(campaign)

    const provider: NarrativeProvider = {
      id: 'fake-new-game-mid-flight',
      async generate() {
        // Reproduces `TavernSimulator.startCampaign()`'s real commit path
        // (`commitCampaign`) firing mid-`await`, the same abstraction
        // `handleNewGame` uses — not a raw `campaignRef.current` poke.
        commitCampaign(createTavernCampaign('narrative-async-002-new-game'))
        return { text: FAKE_NARRATIVE_TEXT }
      },
    }

    const result = await runMainQuestNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: provider,
      attemptId,
    })

    expect(result.ok).toBe(false)
    // Only the New Game's own commit ever landed — a second, stale commit
    // from the narrative apply would show up here as a 2nd entry.
    expect(committedHistory).toHaveLength(1)
    expect(committedHistory[0].mainQuest.attempts.length).toBe(0)
    expect(campaignRef.current).toBe(committedHistory[0])
  })

  it('never lets a stale AI response overwrite a Loaded Campaign committed (via the real commitCampaign path) while the AI call was in flight', async () => {
    const { campaign, attemptId } = buildPendingCampaign('narrative-async-006')
    const { campaignRef, commitCampaign, committedHistory } =
      makeCommitHarness(campaign)

    // A different, unrelated save being loaded mid-flight — its own Main
    // Quest Attempt (if any) must be what survives, not the in-flight one.
    const { campaign: loadedCampaign } = buildPendingCampaign(
      'narrative-async-006-loaded',
      'velga',
    )

    const provider: NarrativeProvider = {
      id: 'fake-load-mid-flight',
      async generate() {
        // Reproduces `TavernSimulator.handleLoadGame()`'s real commit path.
        commitCampaign(loadedCampaign)
        return { text: FAKE_NARRATIVE_TEXT }
      },
    }

    const result = await runMainQuestNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: provider,
      attemptId,
    })

    expect(result.ok).toBe(false)
    // Only the Load's own commit ever landed.
    expect(committedHistory).toHaveLength(1)
    expect(committedHistory[0]).toBe(loadedCampaign)
    expect(campaignRef.current).toBe(loadedCampaign)
    // The Loaded Campaign's own (different) Attempt is completely
    // untouched by the stale response generated for the old Attempt.
    const loadedAttempt = campaignRef.current!.mainQuest.attempts[0]
    expect(loadedAttempt.narrative).toBeUndefined()
    expect(loadedAttempt.presentationStatus).toBe('narrative_pending')
  })

  it('never applies a stale AI response when the pending Attempt reference is invalidated mid-flight by another commit', async () => {
    const { campaign, attemptId } = buildPendingCampaign('narrative-async-003')
    const { campaignRef, commitCampaign, committedHistory } =
      makeCommitHarness(campaign)

    const provider: NarrativeProvider = {
      id: 'fake-invalidated-pending-mid-flight',
      async generate() {
        const current = campaignRef.current!
        commitCampaign({
          ...current,
          mainQuest: {
            ...current.mainQuest,
            pendingPresentationAttemptId: undefined,
          },
        })
        return { text: FAKE_NARRATIVE_TEXT }
      },
    }

    const result = await runMainQuestNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: provider,
      attemptId,
    })

    expect(result.ok).toBe(false)
    expect(committedHistory).toHaveLength(1)
    const attempt = campaignRef.current!.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    expect(attempt.narrative).toBeUndefined()
    expect(attempt.presentationStatus).toBe('narrative_pending')
  })

  it('retries successfully after a failed apply, once the Campaign is valid again', async () => {
    const { campaign, attemptId } = buildPendingCampaign('narrative-async-004')
    const { campaignRef, commitCampaign, committedHistory } =
      makeCommitHarness(campaign)

    const failingProvider: NarrativeProvider = {
      id: 'fake-fail-then-retry',
      async generate() {
        const current = campaignRef.current!
        commitCampaign({
          ...current,
          mainQuest: {
            ...current.mainQuest,
            pendingPresentationAttemptId: undefined,
          },
        })
        return { text: FAKE_NARRATIVE_TEXT }
      },
    }
    const failed = await runMainQuestNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: failingProvider,
      attemptId,
    })
    expect(failed.ok).toBe(false)
    expect(committedHistory).toHaveLength(1)

    // The redirect back into MainQuestScene re-arms the pending reference —
    // retrying afterwards must succeed exactly like a first attempt would.
    const restored = campaignRef.current!
    commitCampaign({
      ...restored,
      mainQuest: {
        ...restored.mainQuest,
        pendingPresentationAttemptId: attemptId,
      },
    })
    expect(committedHistory).toHaveLength(2)

    const retried = await runMainQuestNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: fakeProvider(),
      attemptId,
    })

    expect(retried.ok).toBe(true)
    expect(committedHistory).toHaveLength(3)
    expect(
      committedHistory[2].mainQuest.attempts.find((a) => a.id === attemptId)!
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
    const { campaignRef, commitCampaign } = makeCommitHarness(withNarrative)
    const generateSpy = vi.fn()

    const result = await runMainQuestNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: { id: 'unused', generate: generateSpy },
      attemptId,
    })

    expect(result.ok).toBe(true)
    expect(generateSpy).not.toHaveBeenCalled()
  })

  it('a same-turn commitCampaign of a resolved Main Quest day (handleFinishDay-equivalent) lets the first automatic Narrative generation succeed, no retry needed', async () => {
    const { campaign: dispatched, attemptId } = buildDispatchedCampaign(
      'narrative-async-007',
    )
    const { campaignRef, commitCampaign } = makeCommitHarness(dispatched)

    // Mirrors `TavernSimulator.handleFinishDay()` exactly: compute the
    // resolved Campaign, then `commitCampaign` it in the same synchronous
    // call — no `useEffect`-based ref sync in between, matching how the
    // Canvas UI can react (redirect -> maybeRequestNarrative()) before any
    // effect would have run.
    const resolved = resolveFinishDayTransition(dispatched)
    commitCampaign(resolved)

    expect(resolved.currentDay.status).toBe('resolved')
    expect(resolved.mainQuest.pendingPresentationAttemptId).toBe(attemptId)
    const resolvedAttempt = campaignRef.current!.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    expect(resolvedAttempt.result).toBeDefined()
    expect(resolvedAttempt.battleTrace).toBeDefined()

    const generateSpy = vi.fn(async () => ({ text: FAKE_NARRATIVE_TEXT }))
    const result = await runMainQuestNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: { id: 'fake-same-turn', generate: generateSpy },
      attemptId,
    })

    expect(result.ok).toBe(true)
    expect(generateSpy).toHaveBeenCalledTimes(1)
    const finalAttempt = campaignRef.current!.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    expect(finalAttempt.presentationStatus).toBe('ready')
  })

  it('a same-turn commitCampaign of a resolved Main Quest day (handleResolve-equivalent) lets the first automatic Narrative generation succeed, no retry needed', async () => {
    const { campaign: dispatched, attemptId } = buildDispatchedCampaign(
      'narrative-async-008',
    )
    const { campaignRef, commitCampaign } = makeCommitHarness(dispatched)

    // Mirrors `TavernSimulator.handleResolve()`: `resolveCampaignDay` then
    // `commitCampaign`, same synchronous call.
    const resolved = resolveCampaignDay(dispatched)
    commitCampaign(resolved)

    expect(resolved.mainQuest.pendingPresentationAttemptId).toBe(attemptId)
    const resolvedAttempt = campaignRef.current!.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    expect(resolvedAttempt.result).toBeDefined()
    expect(resolvedAttempt.battleTrace).toBeDefined()

    const generateSpy = vi.fn(async () => ({ text: FAKE_NARRATIVE_TEXT }))
    const result = await runMainQuestNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: {
        id: 'fake-same-turn-resolve',
        generate: generateSpy,
      },
      attemptId,
    })

    expect(result.ok).toBe(true)
    expect(generateSpy).toHaveBeenCalledTimes(1)
    const finalAttempt = campaignRef.current!.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    expect(finalAttempt.presentationStatus).toBe('ready')
  })
})
