import { describe, expect, it } from 'vitest'
import {
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { dispatchMainQuest } from '../mainQuest/dispatch.ts'
import { generateMainQuestNarrative } from '../mainQuest/narrative.ts'
import {
  applyMainQuestNarrative,
  startMainQuestPresentation,
} from '../mainQuest/presentation.ts'
import {
  MAIN_QUEST_THREAT_DEFINITION_MAP,
  NATIONAL_THREAT_IDS,
} from '../mainQuest/threats.ts'
import { completeMainQuestPresentationForCampaign } from './transition.ts'
import {
  applyEndingNarrative,
  completeEndingPresentation,
  startEndingPresentation,
} from './presentation.ts'
import { generateEndingNarrative } from './narrative.ts'
import { TAVERN_ECONOMY_CONFIG } from '../economy/economyConfig.ts'
import type { NarrativeProvider } from '../../ai/narrative/types.ts'
import type { TavernCampaignState } from '../tavern/campaign/types.ts'
import type { CampaignEndingNarrativeScript } from './types.ts'

;(TAVERN_ECONOMY_CONFIG as { initialFunds: number }).initialFunds = 100000

function fakeProvider(text: string): NarrativeProvider {
  return {
    id: 'fake-ending-presentation-test',
    async generate() {
      return { text }
    },
  }
}

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

function fakeEndingScript(): CampaignEndingNarrativeScript {
  return {
    aftermath: '戦いの直後の物語。',
    tavernReturn: '酒場へ戻ってからの物語。',
    closing: '締めくくりの短い場面。',
    promptVersion: 'test-v1',
    providerId: 'fake-test-provider',
    createdAt: new Date(0).toISOString(),
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

/** Runs dispatch -> Simulation -> Narrative -> Main Quest Presentation for
 * Nosferatu until a victory is found, leaving `ending.status ===
 * 'narrative_pending'` with Facts already attached. */
async function buildNarrativePendingEnding(
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

async function buildReadyEnding(seedPrefix: string) {
  const pending = await buildNarrativePendingEnding(seedPrefix)
  return applyEndingNarrative(pending, fakeEndingScript())
}

async function buildViewingEnding(seedPrefix: string) {
  const ready = await buildReadyEnding(seedPrefix)
  return startEndingPresentation(ready)
}

async function buildCompletedEnding(seedPrefix: string) {
  const viewing = await buildViewingEnding(seedPrefix)
  return completeEndingPresentation(viewing)
}

describe('Ending Presentation state machine', () => {
  it('applyEndingNarrative: locked -> narrative_pending -> ready succeeds and sets status', async () => {
    const pending = await buildNarrativePendingEnding(
      'ending-presentation-happy-apply',
    )
    const next = applyEndingNarrative(pending, fakeEndingScript())
    expect(next.ending.status).toBe('ready')
    expect(next.ending.narrative).toEqual(fakeEndingScript())
  })

  it('applyEndingNarrative rejects when ending.status is not narrative_pending', async () => {
    const ready = await buildReadyEnding('ending-presentation-reject-apply')
    expect(() => applyEndingNarrative(ready, fakeEndingScript())).toThrow()
  })

  it('applyEndingNarrative rejects when Facts are missing', async () => {
    const pending = await buildNarrativePendingEnding(
      'ending-presentation-no-facts',
    )
    const withoutFacts: TavernCampaignState = {
      ...pending,
      ending: { ...pending.ending, facts: undefined },
    }
    expect(() =>
      applyEndingNarrative(withoutFacts, fakeEndingScript()),
    ).toThrow()
  })

  it('startEndingPresentation: ready -> viewing succeeds', async () => {
    const ready = await buildReadyEnding('ending-presentation-happy-start')
    const next = startEndingPresentation(ready)
    expect(next.ending.status).toBe('viewing')
  })

  it('startEndingPresentation rejects narrative_pending -> viewing (skipping ready)', async () => {
    const pending = await buildNarrativePendingEnding(
      'ending-presentation-reject-skip-start',
    )
    expect(() => startEndingPresentation(pending)).toThrow()
  })

  it('completeEndingPresentation: viewing -> completed succeeds and stamps completedDay', async () => {
    const viewing = await buildViewingEnding(
      'ending-presentation-happy-complete',
    )
    const next = completeEndingPresentation(viewing)
    expect(next.ending.status).toBe('completed')
    expect(next.ending.completedDay).toBe(next.dayNumber)
  })

  it('completeEndingPresentation rejects narrative_pending -> completed (skipping ready and viewing)', async () => {
    const pending = await buildNarrativePendingEnding(
      'ending-presentation-reject-skip-a',
    )
    expect(() => completeEndingPresentation(pending)).toThrow()
  })

  it('completeEndingPresentation rejects ready -> completed (skipping viewing)', async () => {
    const ready = await buildReadyEnding('ending-presentation-reject-skip-b')
    expect(() => completeEndingPresentation(ready)).toThrow()
  })

  it('rejects locked -> ready directly (via applyEndingNarrative on a locked Ending)', () => {
    const campaign = withAllNationalThreatsDefeated(
      createTavernCampaign('ending-presentation-reject-locked-ready'),
    )
    expect(() => applyEndingNarrative(campaign, fakeEndingScript())).toThrow()
  })

  it('rejects locked -> completed directly', () => {
    const campaign = withAllNationalThreatsDefeated(
      createTavernCampaign('ending-presentation-reject-locked-completed'),
    )
    expect(() => completeEndingPresentation(campaign)).toThrow()
  })

  it('no further transition is possible once completed (completed -> completed rejected)', async () => {
    const completed = await buildCompletedEnding(
      'ending-presentation-reject-completed-completed',
    )
    expect(() => completeEndingPresentation(completed)).toThrow()
    expect(() => startEndingPresentation(completed)).toThrow()
    expect(() => applyEndingNarrative(completed, fakeEndingScript())).toThrow()
  })

  it('the full happy path narrative_pending -> ready -> viewing -> completed uses the real generated Narrative unchanged', async () => {
    const pending = await buildNarrativePendingEnding(
      'ending-presentation-full-happy-path',
    )
    const finalCampaignParty = pending.parties.find(
      (p) => p.id === pending.ending.facts!.finalParty.partyId,
    )!
    const { script } = await generateEndingNarrative(
      pending.ending.facts!,
      finalCampaignParty,
      fakeProvider(FAKE_ENDING_TEXT),
    )
    let next = applyEndingNarrative(pending, script)
    expect(next.ending.status).toBe('ready')
    next = startEndingPresentation(next)
    expect(next.ending.status).toBe('viewing')
    next = completeEndingPresentation(next)
    expect(next.ending.status).toBe('completed')
    expect(next.ending.narrative).toEqual(script)
  })
})
