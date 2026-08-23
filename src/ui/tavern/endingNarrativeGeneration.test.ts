// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { runEndingNarrativeGeneration } from './endingNarrativeGeneration.ts'
import {
  createTavernCampaign,
  resolveCampaignDay,
} from '../../core/tavern/campaign/campaign.ts'
import { dispatchMainQuest } from '../../core/mainQuest/dispatch.ts'
import { generateMainQuestNarrative } from '../../core/mainQuest/narrative.ts'
import {
  applyMainQuestNarrative,
  startMainQuestPresentation,
} from '../../core/mainQuest/presentation.ts'
import {
  MAIN_QUEST_THREAT_DEFINITION_MAP,
  NATIONAL_THREAT_IDS,
} from '../../core/mainQuest/threats.ts'
import { completeMainQuestPresentationForCampaign } from '../../core/ending/transition.ts'
import { TAVERN_ECONOMY_CONFIG } from '../../core/economy/economyConfig.ts'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'
import type { NarrativeProvider } from '../../ai/narrative/types.ts'

;(TAVERN_ECONOMY_CONFIG as { initialFunds: number }).initialFunds = 100000

const FAKE_MAIN_QUEST_TEXT = `===PRE-BATTLE===
出発前の物語。

===POST-BATTLE===
戦いの後の物語。`

const FAKE_ENDING_TEXT = `===AFTERMATH===
戦いの直後の物語。

===TAVERN_RETURN===
酒場へ戻ってからの物語。

===CLOSING===
締めくくりの短い場面。`

function fakeProvider(text: string): NarrativeProvider {
  return {
    id: 'fake-ending-async-test',
    async generate() {
      return { text }
    },
  }
}

function withAllNationalThreatsDefeated(
  campaign: TavernCampaignState,
): TavernCampaignState {
  const next = { ...campaign, mainQuest: { ...campaign.mainQuest } }
  next.mainQuest.threats = { ...next.mainQuest.threats }
  for (const id of NATIONAL_THREAT_IDS) {
    next.mainQuest.threats[id] = {
      ...next.mainQuest.threats[id],
      status: 'defeated',
      defeatedDay: 1,
      defeatedByPartyId: 'placeholder-party',
    }
  }
  next.mainQuest.threats.nosferatu = {
    ...next.mainQuest.threats.nosferatu,
    status: 'available',
  }
  return next
}

/** A Campaign whose Ending has just reached `narrative_pending` (Nosferatu
 * victory, Main Quest Presentation already completed, Facts attached) —
 * the exact state `runEndingNarrativeGeneration` is meant to act on. */
async function buildNarrativePendingEndingCampaign(
  seedPrefix: string,
): Promise<TavernCampaignState> {
  for (let s = 0; s < 60; s++) {
    const campaign = withAllNationalThreatsDefeated(
      createTavernCampaign(`${seedPrefix}-${s}`),
    )
    const definition = MAIN_QUEST_THREAT_DEFINITION_MAP.nosferatu
    const party = campaign.parties[0]
    party.party.rank = definition.requiredPartyRank
    party.relationship.affinity = definition.requiredAffinity
    campaign.currentDay.parties = campaign.currentDay.parties.map((p) =>
      p.id === party.id
        ? { ...p, party: { ...p.party, rank: definition.requiredPartyRank } }
        : p,
    )
    const dispatch = dispatchMainQuest(campaign, 'nosferatu', party.id)
    if (!dispatch.ok || !dispatch.attemptId) {
      throw new Error('test setup: dispatch failed')
    }
    const resolved = resolveCampaignDay(dispatch.campaign)
    const attempt = resolved.mainQuest.attempts.find(
      (a) => a.id === dispatch.attemptId,
    )!
    if (!attempt.result!.monsterDefeated) continue

    const campaignParty = resolved.parties.find(
      (p) => p.id === attempt.partyId,
    )!
    const { script } = await generateMainQuestNarrative(
      definition,
      attempt,
      campaignParty,
      fakeProvider(FAKE_MAIN_QUEST_TEXT),
    )
    let next = applyMainQuestNarrative(resolved, dispatch.attemptId, script)
    next = startMainQuestPresentation(next, dispatch.attemptId)
    next = completeMainQuestPresentationForCampaign(next, dispatch.attemptId)
    return next
  }
  throw new Error('no Nosferatu victory found within 60 seeds')
}

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

describe('runEndingNarrativeGeneration', () => {
  it('applies the generated Ending Narrative and commits it via the atomic commit path', async () => {
    const campaign =
      await buildNarrativePendingEndingCampaign('ending-async-001')
    const { campaignRef, commitCampaign, committedHistory } =
      makeCommitHarness(campaign)

    const result = await runEndingNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: fakeProvider(FAKE_ENDING_TEXT),
    })

    expect(result.ok).toBe(true)
    expect(committedHistory).toHaveLength(1)
    expect(committedHistory[0].ending.status).toBe('ready')
    expect(committedHistory[0].ending.narrative).toBeDefined()
    expect(campaignRef.current).toBe(committedHistory[0])
  })

  it('never applies a stale AI response once a New Game was started (committed via the real commitCampaign path) while the AI call was in flight', async () => {
    const campaign =
      await buildNarrativePendingEndingCampaign('ending-async-002')
    const { campaignRef, commitCampaign, committedHistory } =
      makeCommitHarness(campaign)

    const provider: NarrativeProvider = {
      id: 'fake-new-game-mid-flight',
      async generate() {
        commitCampaign(createTavernCampaign('ending-async-002-new-game'))
        return { text: FAKE_ENDING_TEXT }
      },
    }

    const result = await runEndingNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: provider,
    })

    expect(result.ok).toBe(false)
    // Only the New Game's own commit ever landed.
    expect(committedHistory).toHaveLength(1)
    expect(committedHistory[0].ending.status).toBe('locked')
    expect(campaignRef.current).toBe(committedHistory[0])
  })

  it('never lets a stale AI response overwrite a Loaded Campaign committed while the AI call was in flight', async () => {
    const campaign =
      await buildNarrativePendingEndingCampaign('ending-async-003')
    const loadedCampaign = await buildNarrativePendingEndingCampaign(
      'ending-async-003-loaded',
    )
    const { campaignRef, commitCampaign, committedHistory } =
      makeCommitHarness(campaign)

    const provider: NarrativeProvider = {
      id: 'fake-load-mid-flight',
      async generate() {
        commitCampaign(loadedCampaign)
        return { text: FAKE_ENDING_TEXT }
      },
    }

    const result = await runEndingNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: provider,
    })

    expect(result.ok).toBe(false)
    expect(committedHistory).toHaveLength(1)
    expect(committedHistory[0]).toBe(loadedCampaign)
    // The Loaded Campaign's own Ending is untouched by the stale response.
    expect(campaignRef.current!.ending.narrative).toBeUndefined()
    expect(campaignRef.current!.ending.status).toBe('narrative_pending')
  })

  it('never applies a stale AI response when the Ending state is invalidated mid-flight', async () => {
    const campaign =
      await buildNarrativePendingEndingCampaign('ending-async-004')
    const { campaignRef, commitCampaign, committedHistory } =
      makeCommitHarness(campaign)

    const provider: NarrativeProvider = {
      id: 'fake-invalidated-ending-mid-flight',
      async generate() {
        const current = campaignRef.current!
        commitCampaign({
          ...current,
          ending: { ...current.ending, status: 'locked' as const },
        })
        return { text: FAKE_ENDING_TEXT }
      },
    }

    const result = await runEndingNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: provider,
    })

    expect(result.ok).toBe(false)
    expect(committedHistory).toHaveLength(1)
  })

  it('retries successfully after a failed apply, once the Ending is valid again', async () => {
    const campaign =
      await buildNarrativePendingEndingCampaign('ending-async-005')
    const { campaignRef, commitCampaign, committedHistory } =
      makeCommitHarness(campaign)

    const failingProvider: NarrativeProvider = {
      id: 'fake-fail-then-retry',
      async generate() {
        const current = campaignRef.current!
        commitCampaign({
          ...current,
          ending: { ...current.ending, status: 'locked' as const },
        })
        return { text: FAKE_ENDING_TEXT }
      },
    }
    const failed = await runEndingNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: failingProvider,
    })
    expect(failed.ok).toBe(false)
    expect(committedHistory).toHaveLength(1)

    // Restore the pending Ending state (mirrors the redirect back into
    // EndingScene re-arming retry) and retry with a normal provider.
    const restored = campaignRef.current!
    commitCampaign({
      ...restored,
      ending: { ...restored.ending, status: 'narrative_pending' as const },
    })
    expect(committedHistory).toHaveLength(2)

    const retried = await runEndingNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: fakeProvider(FAKE_ENDING_TEXT),
    })

    expect(retried.ok).toBe(true)
    expect(committedHistory).toHaveLength(3)
    expect(committedHistory[2].ending.status).toBe('ready')
  })

  it('returns ok:true without calling the provider when the Ending already has a Narrative', async () => {
    const campaign =
      await buildNarrativePendingEndingCampaign('ending-async-006x')
    const withNarrative: TavernCampaignState = {
      ...campaign,
      ending: {
        ...campaign.ending,
        status: 'ready',
        narrative: {
          aftermath: '既存の物語',
          tavernReturn: '既存の帰還',
          closing: '既存の締めくくり',
          promptVersion: 'v0',
          providerId: 'existing',
          createdAt: new Date(0).toISOString(),
        },
      },
    }
    const { campaignRef, commitCampaign } = makeCommitHarness(withNarrative)
    const generateSpy = vi.fn()

    const result = await runEndingNarrativeGeneration({
      campaignRef,
      commitCampaign,
      narrativeProvider: { id: 'unused', generate: generateSpy },
    })

    expect(result.ok).toBe(true)
    expect(generateSpy).not.toHaveBeenCalled()
  })
})
