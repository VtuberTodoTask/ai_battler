import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from './campaign.ts'
import { dispatchMainQuest } from '../../mainQuest/dispatch.ts'
import { generateMainQuestNarrative } from '../../mainQuest/narrative.ts'
import {
  applyMainQuestNarrative,
  startMainQuestPresentation,
} from '../../mainQuest/presentation.ts'
import {
  MAIN_QUEST_THREAT_DEFINITION_MAP,
  NATIONAL_THREAT_IDS,
} from '../../mainQuest/threats.ts'
import { completeMainQuestPresentationForCampaign } from '../../ending/transition.ts'
import { isCampaignVictoryAchieved } from '../../ending/victory.ts'
import { generateEndingNarrative } from '../../ending/narrative.ts'
import {
  applyEndingNarrative,
  completeEndingPresentation,
  startEndingPresentation,
} from '../../ending/presentation.ts'
import { serializeGameSave } from '../../save/serializer.ts'
import { validateGameSave } from '../../save/validation.ts'
import { TAVERN_ECONOMY_CONFIG } from '../../economy/economyConfig.ts'
import type { NarrativeProvider } from '../../../ai/narrative/types.ts'
import type { TavernCampaignState } from './types.ts'
import type { MainQuestThreatId } from '../../mainQuest/types.ts'

;(TAVERN_ECONOMY_CONFIG as { initialFunds: number }).initialFunds = 100000

function fakeProvider(text: string): NarrativeProvider {
  return {
    id: 'fake-ending-e2e',
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

function dispatchEligibleParty(
  campaign: TavernCampaignState,
  threatId: MainQuestThreatId,
): { campaign: TavernCampaignState; partyId: string; attemptId: string } {
  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[threatId]
  const campaignParty = campaign.parties[0]
  campaignParty.party.rank = definition.requiredPartyRank
  campaignParty.relationship.affinity = definition.requiredAffinity
  campaign.currentDay.parties = campaign.currentDay.parties.map((p) =>
    p.id === campaignParty.id
      ? { ...p, party: { ...p.party, rank: definition.requiredPartyRank } }
      : p,
  )

  const result = dispatchMainQuest(campaign, threatId, campaignParty.id)
  if (!result.ok || !result.attemptId) {
    throw new Error(`test setup failed to dispatch ${threatId}`)
  }
  return {
    campaign: result.campaign,
    partyId: campaignParty.id,
    attemptId: result.attemptId,
  }
}

/** Marks all 7 national Threats already defeated (Phase 9.8's own unlock
 * mechanics are proven elsewhere — see `phase9-8.test.ts` Test E; this file
 * only needs to reach "Nosferatu available" quickly and deterministically
 * to exercise the NEW Phase 9.9 Ending machinery). */
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
  // `isNosferatuUnlocked` is a pure selector — the STORED `nosferatu.status`
  // field is normally flipped to 'available' by `resolveMainQuestForDay`
  // once it observes all 7 national Threats defeated. Since this helper
  // bypasses that normal transition, it must mirror the same result by
  // hand so `dispatchMainQuest`'s own eligibility check (which reads the
  // stored field) behaves exactly as it would after a real playthrough.
  next.mainQuest.threats.nosferatu = {
    ...next.mainQuest.threats.nosferatu,
    status: 'available',
  }
  return next
}

/** Runs the full Nosferatu Simulation -> Narrative -> Presentation ->
 * Ending lifecycle (dispatch through GAME CLEAR) on a Campaign that
 * already has all 7 national Threats defeated. Returns `null` if this
 * seed's Simulation did not result in a Nosferatu victory (the caller
 * retries with a different seed). */
async function runNosferatuVictoryToGameClear(
  seed: string,
): Promise<{ campaign: TavernCampaignState; attemptId: string } | null> {
  const campaign = withAllNationalThreatsDefeated(createTavernCampaign(seed))
  const { campaign: dispatched, attemptId } = dispatchEligibleParty(
    campaign,
    'nosferatu',
  )
  const resolved = resolveCampaignDay(dispatched)
  const attempt = resolved.mainQuest.attempts.find((a) => a.id === attemptId)!
  if (!attempt.result!.monsterDefeated) {
    return null
  }

  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP.nosferatu
  const campaignParty = resolved.parties.find((p) => p.id === attempt.partyId)!
  const { script } = await generateMainQuestNarrative(
    definition,
    attempt,
    campaignParty,
    fakeProvider(FAKE_MAIN_QUEST_TEXT),
  )
  let next = applyMainQuestNarrative(resolved, attemptId, script)
  next = startMainQuestPresentation(next, attemptId)
  next = completeMainQuestPresentationForCampaign(next, attemptId)

  // Ending should now be narrative_pending — drive it through to completed.
  expect(next.ending.status).toBe('narrative_pending')
  const finalCampaignParty = next.parties.find((p) => p.id === attempt.partyId)!
  const { script: endingScript } = await generateEndingNarrative(
    next.ending.facts!,
    finalCampaignParty,
    fakeProvider(FAKE_ENDING_TEXT),
  )
  next = applyEndingNarrative(next, endingScript)
  next = startEndingPresentation(next)
  next = completeEndingPresentation(next)

  return { campaign: next, attemptId }
}

describe('Phase 9.9 Ending & Game Clear end-to-end smoke', () => {
  it('A: a freshly created campaign starts with Ending locked and no Victory', () => {
    const campaign = createTavernCampaign('ending-e2e-a')
    expect(campaign.ending.status).toBe('locked')
    expect(campaign.ending.facts).toBeUndefined()
    expect(campaign.ending.narrative).toBeUndefined()
    expect(campaign.ending.triggerAttemptId).toBeUndefined()
    expect(isCampaignVictoryAchieved(campaign)).toBe(false)
  })

  it('B: all 7 national Threats defeated alone is not Victory, and Nosferatu is unlocked but Ending stays locked', () => {
    const campaign = withAllNationalThreatsDefeated(
      createTavernCampaign('ending-e2e-b'),
    )
    expect(isCampaignVictoryAchieved(campaign)).toBe(false)
    expect(campaign.mainQuest.threats.nosferatu.status).toBe('available')
    expect(campaign.ending.status).toBe('locked')
  })

  it('C: a Nosferatu failure never achieves Victory or unlocks the Ending, even after full Presentation', async () => {
    for (let s = 0; s < 40; s++) {
      const campaign = withAllNationalThreatsDefeated(
        createTavernCampaign(`ending-e2e-c-${s}`),
      )
      const { campaign: dispatched, attemptId } = dispatchEligibleParty(
        campaign,
        'nosferatu',
      )
      const resolved = resolveCampaignDay(dispatched)
      const attempt = resolved.mainQuest.attempts.find(
        (a) => a.id === attemptId,
      )!
      if (attempt.result!.monsterDefeated) continue

      const definition = MAIN_QUEST_THREAT_DEFINITION_MAP.nosferatu
      const campaignParty = resolved.parties.find(
        (p) => p.id === attempt.partyId,
      )!
      const { script } = await generateMainQuestNarrative(
        definition,
        attempt,
        campaignParty,
        fakeProvider(FAKE_MAIN_QUEST_TEXT),
      )
      let next = applyMainQuestNarrative(resolved, attemptId, script)
      next = startMainQuestPresentation(next, attemptId)
      next = completeMainQuestPresentationForCampaign(next, attemptId)

      expect(isCampaignVictoryAchieved(next)).toBe(false)
      expect(next.ending.status).toBe('locked')
      // The day can still advance normally after a Nosferatu defeat.
      const advanced = advanceCampaignDay(next)
      expect(advanced.dayNumber).toBe(next.dayNumber + 1)
      return
    }
    throw new Error('no Nosferatu defeat found within 40 seeds')
  })

  it('D: Simulation victory alone (before the final Presentation completes) does not start the Ending', async () => {
    for (let s = 0; s < 40; s++) {
      const campaign = withAllNationalThreatsDefeated(
        createTavernCampaign(`ending-e2e-d-${s}`),
      )
      const { campaign: dispatched, attemptId } = dispatchEligibleParty(
        campaign,
        'nosferatu',
      )
      const resolved = resolveCampaignDay(dispatched)
      const attempt = resolved.mainQuest.attempts.find(
        (a) => a.id === attemptId,
      )!
      if (!attempt.result!.monsterDefeated) continue

      // Simulation decided victory, curse lifted, but Presentation has not
      // even started yet — the Ending must not exist.
      expect(resolved.mainQuest.playerCurseStatus).toBe('lifted')
      expect(isCampaignVictoryAchieved(resolved)).toBe(true)
      expect(resolved.ending.status).toBe('locked')
      expect(resolved.mainQuest.pendingPresentationAttemptId).toBe(attemptId)
      expect(() => advanceCampaignDay(resolved)).toThrow()
      return
    }
    throw new Error('no Nosferatu victory found within 40 seeds')
  })

  it('E: the final Main Quest Presentation completing starts the Ending exactly once, with Facts attached', async () => {
    for (let s = 0; s < 40; s++) {
      const result = await runFinalPresentationOnly(`ending-e2e-e-${s}`)
      if (!result) continue
      const { next, attemptId } = result
      expect(next.ending.status).toBe('narrative_pending')
      expect(next.ending.triggerAttemptId).toBe(attemptId)
      expect(next.ending.facts).toBeDefined()
      expect(next.ending.facts!.finalAttemptId).toBe(attemptId)
      return
    }
    throw new Error('no Nosferatu victory found within 40 seeds')
  })

  it('F: advanceCampaignDay is rejected at every Ending sub-status (narrative_pending, ready, viewing), not just locked-with-victory or completed', async () => {
    for (let s = 0; s < 40; s++) {
      const result = await runFinalPresentationOnly(`ending-e2e-f-${s}`)
      if (!result) continue
      const { next: pending, attemptId } = result

      expect(pending.ending.status).toBe('narrative_pending')
      expect(() => advanceCampaignDay(pending)).toThrow(
        '物語が完結しているため翌日へ進めません',
      )

      const attempt = pending.mainQuest.attempts.find(
        (a) => a.id === attemptId,
      )!
      const finalCampaignParty = pending.parties.find(
        (p) => p.id === attempt.partyId,
      )!
      const { script } = await generateEndingNarrative(
        pending.ending.facts!,
        finalCampaignParty,
        fakeProvider(FAKE_ENDING_TEXT),
      )
      const ready = applyEndingNarrative(pending, script)
      expect(ready.ending.status).toBe('ready')
      expect(() => advanceCampaignDay(ready)).toThrow(
        '物語が完結しているため翌日へ進めません',
      )

      const viewing = startEndingPresentation(ready)
      expect(viewing.ending.status).toBe('viewing')
      expect(() => advanceCampaignDay(viewing)).toThrow(
        '物語が完結しているため翌日へ進めません',
      )
      return
    }
    throw new Error('no Nosferatu victory found within 40 seeds')
  })

  it('full lifecycle: dispatch -> Simulation victory -> curse lifted -> Main Quest Presentation -> Ending -> GAME CLEAR', async () => {
    for (let s = 0; s < 60; s++) {
      const result = await runNosferatuVictoryToGameClear(
        `ending-e2e-full-${s}`,
      )
      if (!result) continue
      const { campaign, attemptId } = result

      expect(isCampaignVictoryAchieved(campaign)).toBe(true)
      expect(campaign.ending.status).toBe('completed')
      expect(campaign.ending.triggerAttemptId).toBe(attemptId)
      expect(campaign.ending.completedDay).toBe(campaign.dayNumber)
      expect(campaign.ending.narrative).toBeDefined()
      expect(campaign.ending.facts).toBeDefined()

      // Victory itself blocks any further day progression, from here on.
      expect(() => advanceCampaignDay(campaign)).toThrow()

      // Phase 9.9 deliberately keeps the pre-existing planning-only Save
      // Policy unchanged (item 34): since Victory permanently blocks
      // `advanceCampaignDay`, `currentDay.status` can never return to
      // 'planning' after GAME CLEAR, so a normal Campaign Save of this
      // state is correctly rejected — a cleared-save/terminal-checkpoint
      // feature is explicitly out of scope for this phase.
      const save = serializeGameSave({ campaign })
      expect(() => validateGameSave(save)).toThrow(
        '本日の状態が確定(planning)ではありません',
      )
      return
    }
    throw new Error('no Nosferatu victory found within 60 seeds')
  }, 20000)
})

/** Like `runNosferatuVictoryToGameClear` but stops right after the final
 * Main Quest Presentation completes (before any Ending Narrative/
 * Presentation step) — used to isolate the Ending-trigger transition
 * itself (Test E). */
async function runFinalPresentationOnly(
  seed: string,
): Promise<{ next: TavernCampaignState; attemptId: string } | null> {
  const campaign = withAllNationalThreatsDefeated(createTavernCampaign(seed))
  const { campaign: dispatched, attemptId } = dispatchEligibleParty(
    campaign,
    'nosferatu',
  )
  const resolved = resolveCampaignDay(dispatched)
  const attempt = resolved.mainQuest.attempts.find((a) => a.id === attemptId)!
  if (!attempt.result!.monsterDefeated) return null

  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP.nosferatu
  const campaignParty = resolved.parties.find((p) => p.id === attempt.partyId)!
  const { script } = await generateMainQuestNarrative(
    definition,
    attempt,
    campaignParty,
    fakeProvider(FAKE_MAIN_QUEST_TEXT),
  )
  let next = applyMainQuestNarrative(resolved, attemptId, script)
  next = startMainQuestPresentation(next, attemptId)
  next = completeMainQuestPresentationForCampaign(next, attemptId)
  return { next, attemptId }
}
