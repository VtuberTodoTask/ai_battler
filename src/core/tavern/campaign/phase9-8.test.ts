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
  completeMainQuestPresentation,
  startMainQuestPresentation,
} from '../../mainQuest/presentation.ts'
import {
  MAIN_QUEST_THREAT_DEFINITION_MAP,
  NATIONAL_THREAT_IDS,
  isNosferatuUnlocked,
} from '../../mainQuest/threats.ts'
import {
  deserializeGameSave,
  saveToSlot,
  serializeGameSave,
} from '../../save/serializer.ts'
import { InMemorySaveRepository } from '../../save/inMemorySaveRepository.ts'
import { validateGameSave } from '../../save/validation.ts'
import { TAVERN_ECONOMY_CONFIG } from '../../economy/economyConfig.ts'
import type { NarrativeProvider } from '../../../ai/narrative/types.ts'
import type { TavernCampaignState } from './types.ts'
import type { MainQuestThreatId } from '../../mainQuest/types.ts'

// A real save's `funds` must always equal its Ledger total (checked by the
// validator itself), so test fixtures cannot just assign `finance.funds`
// directly without a matching Ledger entry. Bumping the shared starting-
// funds config before building fixture Campaigns keeps the resulting
// opening_balance entry — and the funds derived from it — self-consistent.
// Scoped to this file only (Vitest isolates each test file's module graph).
;(TAVERN_ECONOMY_CONFIG as { initialFunds: number }).initialFunds = 100000

function fakeProvider(text: string): NarrativeProvider {
  return {
    id: 'fake-mainquest-e2e',
    async generate() {
      return { text }
    },
  }
}

const FAKE_NARRATIVE_TEXT = `===PRE-BATTLE===
出発前の物語。

===POST-BATTLE===
戦いの後の物語。`

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

/** Runs the full Simulation -> Narrative -> Presentation lifecycle for one
 * Attempt on a freshly created Campaign, returning the final state. */
async function runFullLifecycle(
  seed: string,
  threatId: MainQuestThreatId,
): Promise<{ campaign: TavernCampaignState; attemptId: string }> {
  const campaign = createTavernCampaign(seed)
  const { campaign: dispatched, attemptId } = dispatchEligibleParty(
    campaign,
    threatId,
  )
  const resolved = resolveCampaignDay(dispatched)
  const attempt = resolved.mainQuest.attempts.find((a) => a.id === attemptId)!
  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[threatId]
  const campaignParty = resolved.parties.find((p) => p.id === attempt.partyId)!

  const { script } = await generateMainQuestNarrative(
    definition,
    attempt,
    campaignParty,
    fakeProvider(FAKE_NARRATIVE_TEXT),
  )

  let campaignAfter = applyMainQuestNarrative(resolved, attemptId, script)
  campaignAfter = startMainQuestPresentation(campaignAfter, attemptId)
  campaignAfter = completeMainQuestPresentation(campaignAfter, attemptId)
  return { campaign: campaignAfter, attemptId }
}

describe('Phase 9.8 Main Quest end-to-end smoke', () => {
  it('A: a freshly created campaign has 7 available national Threats, a locked Nosferatu, and an active curse', () => {
    const campaign = createTavernCampaign('mainquest-e2e-a')
    expect(campaign.mainQuest.attempts).toEqual([])
    expect(campaign.mainQuest.playerCurseStatus).toBe('active')
    expect(campaign.mainQuest.threats.nosferatu.status).toBe('locked')
    for (const id of NATIONAL_THREAT_IDS) {
      expect(campaign.mainQuest.threats[id].status).toBe('available')
    }
    expect(isNosferatuUnlocked(campaign.mainQuest)).toBe(false)
  })

  it('B: full lifecycle (dispatch -> resolve -> narrative -> presentation) ends with a completed Attempt and no pending Presentation', async () => {
    const { campaign, attemptId } = await runFullLifecycle(
      'mainquest-e2e-b',
      'alden',
    )
    const attempt = campaign.mainQuest.attempts.find((a) => a.id === attemptId)!
    expect(attempt.result).toBeDefined()
    expect(attempt.battleTrace).toBeDefined()
    expect(attempt.narrative).toBeDefined()
    expect(attempt.presentationStatus).toBe('completed')
    expect(campaign.mainQuest.pendingPresentationAttemptId).toBeUndefined()
  })

  it('C: advanceCampaignDay after a completed Presentation moves the day forward with no leftover pending state', async () => {
    const { campaign } = await runFullLifecycle('mainquest-e2e-c', 'velga')
    const advanced = advanceCampaignDay(campaign)
    expect(advanced.dayNumber).toBe(campaign.dayNumber + 1)
    expect(advanced.mainQuest.pendingPresentationAttemptId).toBeUndefined()
  })

  it('C2: a day with no Main Quest attempt advances normally with resolveCampaignDay -> advanceCampaignDay', () => {
    const campaign = createTavernCampaign('mainquest-e2e-c2')
    const resolved = resolveCampaignDay(campaign)
    expect(resolved.mainQuest.pendingPresentationAttemptId).toBeUndefined()
    const advanced = advanceCampaignDay(resolved)
    expect(advanced.dayNumber).toBe(campaign.dayNumber + 1)
  })

  it('C3: resolving a day with a Main Quest dispatch leaves the day number unchanged and marks the Attempt pending', () => {
    const campaign = createTavernCampaign('mainquest-e2e-c3')
    const { campaign: dispatched } = dispatchEligibleParty(campaign, 'alden')
    const resolved = resolveCampaignDay(dispatched)
    expect(resolved.dayNumber).toBe(campaign.dayNumber)
    expect(resolved.mainQuest.pendingPresentationAttemptId).toBeDefined()
  })

  it('C4: advanceCampaignDay is rejected while a Main Quest Presentation is pending, and succeeds once it completes', async () => {
    const campaign = createTavernCampaign('mainquest-e2e-c4')
    const { campaign: dispatched, attemptId } = dispatchEligibleParty(
      campaign,
      'alden',
    )
    const resolved = resolveCampaignDay(dispatched)
    expect(resolved.mainQuest.pendingPresentationAttemptId).toBe(attemptId)
    expect(() => advanceCampaignDay(resolved)).toThrow()

    const attempt = resolved.mainQuest.attempts.find((a) => a.id === attemptId)!
    const definition = MAIN_QUEST_THREAT_DEFINITION_MAP.alden
    const campaignParty = resolved.parties.find(
      (p) => p.id === attempt.partyId,
    )!
    const { script } = await generateMainQuestNarrative(
      definition,
      attempt,
      campaignParty,
      fakeProvider(FAKE_NARRATIVE_TEXT),
    )
    let completed = applyMainQuestNarrative(resolved, attemptId, script)
    // Still pending after narrative/viewing — advance must keep rejecting.
    expect(() => advanceCampaignDay(completed)).toThrow()
    completed = startMainQuestPresentation(completed, attemptId)
    expect(() => advanceCampaignDay(completed)).toThrow()
    completed = completeMainQuestPresentation(completed, attemptId)
    expect(completed.mainQuest.pendingPresentationAttemptId).toBeUndefined()

    const advanced = advanceCampaignDay(completed)
    expect(advanced.dayNumber).toBe(campaign.dayNumber + 1)
  })

  it('D: a victorious Attempt marks its Threat defeated with the dispatching Party recorded', async () => {
    for (let s = 0; s < 30; s++) {
      const { campaign, attemptId } = await runFullLifecycle(
        `mainquest-e2e-d-${s}`,
        'kared',
      )
      const attempt = campaign.mainQuest.attempts.find(
        (a) => a.id === attemptId,
      )!
      if (attempt.result!.monsterDefeated) {
        const threatState = campaign.mainQuest.threats.kared
        expect(threatState.status).toBe('defeated')
        expect(threatState.defeatedDay).toBe(attempt.dayNumber)
        expect(threatState.defeatedByPartyId).toBe(attempt.partyId)
        return
      }
    }
    throw new Error('no Threat victory found within 30 seeds')
  })

  it('E: defeating all 7 national Threats unlocks Nosferatu (status becomes available)', () => {
    for (let s = 0; s < 60; s++) {
      const campaign = createTavernCampaign(`mainquest-e2e-e-${s}`)
      // Directly mark the first 6 national Threats already defeated — this
      // test verifies the unlock transition itself, not 7 independent boss
      // victories, which would make the test extremely slow/flaky.
      for (const id of NATIONAL_THREAT_IDS.slice(0, 6)) {
        campaign.mainQuest.threats[id] = {
          ...campaign.mainQuest.threats[id],
          status: 'defeated',
          defeatedDay: 1,
          defeatedByPartyId: 'placeholder-party',
        }
      }
      const lastThreatId = NATIONAL_THREAT_IDS[6]
      const { campaign: dispatched } = dispatchEligibleParty(
        campaign,
        lastThreatId,
      )
      const resolved = resolveCampaignDay(dispatched)
      const attempt = resolved.mainQuest.attempts[0]
      if (attempt.result!.monsterDefeated) {
        expect(resolved.mainQuest.threats[lastThreatId].status).toBe('defeated')
        expect(isNosferatuUnlocked(resolved.mainQuest)).toBe(true)
        expect(resolved.mainQuest.threats.nosferatu.status).toBe('available')
        return
      }
    }
    throw new Error('no Threat victory found within 60 seeds')
  })

  it('F: save/load round-trips a Main Quest campaign exactly, including a completed Attempt, and passes validation', async () => {
    const { campaign: resolved } = await runFullLifecycle(
      'mainquest-e2e-f',
      'celesta',
    )
    // A save is only ever taken while the current day is 'planning' — advance
    // past the day the Attempt resolved on, same as any other real save point.
    const campaign = advanceCampaignDay(resolved)
    const save = serializeGameSave({ campaign })
    expect(() => validateGameSave(save)).not.toThrow()
    const loaded = deserializeGameSave(save)
    expect(loaded.campaign.mainQuest).toEqual(campaign.mainQuest)
  })

  it('G: reloading a save never resimulates an already-resolved Attempt (identical result/battleTrace before and after)', async () => {
    const { campaign: resolved, attemptId } = await runFullLifecycle(
      'mainquest-e2e-g',
      'eldia',
    )
    // A save is only ever taken while the current day is 'planning'.
    const campaign = advanceCampaignDay(resolved)
    const before = campaign.mainQuest.attempts.find((a) => a.id === attemptId)!
    const save = serializeGameSave({ campaign })
    const loaded = deserializeGameSave(save)
    const after = loaded.campaign.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    expect(after.result).toEqual(before.result)
    expect(after.battleTrace).toEqual(before.battleTrace)

    const reAdvanced = advanceCampaignDay(
      resolveCampaignDay(loaded.campaign) as TavernCampaignState,
    )
    const stillThere = reAdvanced.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    expect(stillThere.result).toEqual(before.result)
    expect(stillThere.battleTrace).toEqual(before.battleTrace)
  })

  it('H: zero AI calls happen anywhere except the explicit Narrative generation step', async () => {
    const campaign = createTavernCampaign('mainquest-e2e-h')
    const { campaign: dispatched, attemptId } = dispatchEligibleParty(
      campaign,
      'ragna',
    )
    const resolved = resolveCampaignDay(dispatched)
    // No narrative has been generated yet: zero narrativeGenerations, but
    // the Attempt already carries a Result/Trace from pure Simulation.
    expect(resolved.narrativeGenerations.length).toBe(0)
    const attempt = resolved.mainQuest.attempts.find((a) => a.id === attemptId)!
    expect(attempt.result).toBeDefined()
    expect(attempt.narrative).toBeUndefined()
  })

  it('I: determinism — identical seed and dispatch produce an identical Simulation Result and Battle Trace', () => {
    const campaignA = createTavernCampaign('mainquest-e2e-i')
    const campaignB = createTavernCampaign('mainquest-e2e-i')
    const { campaign: dispatchedA } = dispatchEligibleParty(campaignA, 'halma')
    const { campaign: dispatchedB } = dispatchEligibleParty(campaignB, 'halma')
    const resolvedA = resolveCampaignDay(dispatchedA)
    const resolvedB = resolveCampaignDay(dispatchedB)
    expect(resolvedA.mainQuest.attempts[0].result).toEqual(
      resolvedB.mainQuest.attempts[0].result,
    )
    expect(resolvedA.mainQuest.attempts[0].battleTrace).toEqual(
      resolvedB.mainQuest.attempts[0].battleTrace,
    )
  })

  it('long-run smoke: 20 days of normal play alongside one Main Quest dispatch never violate core invariants', async () => {
    let campaign = createTavernCampaign('mainquest-e2e-longrun')
    for (let day = 0; day < 20; day++) {
      if (day === 3) {
        const { campaign: dispatched } = dispatchEligibleParty(
          campaign,
          'alden',
        )
        campaign = dispatched
      }
      campaign = resolveCampaignDay(campaign)

      const pendingId = campaign.mainQuest.pendingPresentationAttemptId
      if (pendingId) {
        const attempt = campaign.mainQuest.attempts.find(
          (a) => a.id === pendingId,
        )!
        if (attempt.presentationStatus === 'narrative_pending') {
          const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[attempt.threatId]
          const campaignParty = campaign.parties.find(
            (p) => p.id === attempt.partyId,
          )!
          const { script } = await generateMainQuestNarrative(
            definition,
            attempt,
            campaignParty,
            fakeProvider(FAKE_NARRATIVE_TEXT),
          )
          campaign = applyMainQuestNarrative(campaign, pendingId, script)
        }
        campaign = startMainQuestPresentation(campaign, pendingId)
        campaign = completeMainQuestPresentation(campaign, pendingId)
      }

      campaign = advanceCampaignDay(campaign)
    }

    expect(new Set(campaign.mainQuest.attempts.map((a) => a.id)).size).toBe(
      campaign.mainQuest.attempts.length,
    )
    expect(() =>
      validateGameSave(serializeGameSave({ campaign })),
    ).not.toThrow()
  })
})

// `TavernSimulator.handleFinishDay()` only autosaves once
// `next.currentDay.status === 'planning'` — `saveToSlot` itself hard-rejects
// anything else, and a resolved-but-pending Main Quest Presentation means
// the day never reaches 'planning' inside that same call. These tests
// reproduce handleFinishDay's exact resolve/advance sequence against the
// real `saveToSlot` to prove the autosave gate matches what the Save
// contract actually accepts, for all three points in the day/Presentation
// cycle it can be invoked from.
describe('Phase 9.8 final re-review: planning-only autosave contract', () => {
  it('a normal day (no Main Quest) reaches planning within one handleFinishDay call, and autosave succeeds', async () => {
    const campaign = createTavernCampaign('mainquest-autosave-normal')
    let next = campaign
    if (next.currentDay.status === 'planning') {
      next = resolveCampaignDay(next)
    }
    if (
      next.currentDay.status === 'resolved' &&
      next.mainQuest.pendingPresentationAttemptId === undefined
    ) {
      next = advanceCampaignDay(next)
    }
    expect(next.currentDay.status).toBe('planning')

    const repo = new InMemorySaveRepository()
    await expect(
      saveToSlot(repo, 'autosave', { campaign: next }),
    ).resolves.toBeUndefined()
  })

  it('a Main Quest day stays resolved (pending Presentation) within one handleFinishDay call, and would be rejected by saveToSlot', async () => {
    const campaign = createTavernCampaign('mainquest-autosave-pending')
    const { campaign: dispatched } = dispatchEligibleParty(campaign, 'alden')
    let next = dispatched
    if (next.currentDay.status === 'planning') {
      next = resolveCampaignDay(next)
    }
    if (
      next.currentDay.status === 'resolved' &&
      next.mainQuest.pendingPresentationAttemptId === undefined
    ) {
      next = advanceCampaignDay(next)
    }
    // This is exactly the state handleFinishDay's autosave gate must skip —
    // still 'resolved', with a Presentation pending.
    expect(next.currentDay.status).toBe('resolved')
    expect(next.mainQuest.pendingPresentationAttemptId).toBeDefined()

    const repo = new InMemorySaveRepository()
    await expect(
      saveToSlot(repo, 'autosave', { campaign: next }),
    ).rejects.toThrow('保存できません。翌日へ進んでから保存してください')
  })

  it('once Presentation completes, the next handleFinishDay call reaches planning, and autosave succeeds', async () => {
    const { campaign: completed } = await runFullLifecycle(
      'mainquest-autosave-completed',
      'velga',
    )
    // Presentation is already 'completed' and pendingPresentationAttemptId
    // cleared, but the day itself is still 'resolved' — mirrors calling
    // handleFinishDay again after the redirect back from MainQuestScene.
    expect(completed.currentDay.status).toBe('resolved')
    expect(completed.mainQuest.pendingPresentationAttemptId).toBeUndefined()

    let next = completed
    if (next.currentDay.status === 'planning') {
      next = resolveCampaignDay(next)
    }
    if (
      next.currentDay.status === 'resolved' &&
      next.mainQuest.pendingPresentationAttemptId === undefined
    ) {
      next = advanceCampaignDay(next)
    }
    expect(next.currentDay.status).toBe('planning')

    const repo = new InMemorySaveRepository()
    await expect(
      saveToSlot(repo, 'autosave', { campaign: next }),
    ).resolves.toBeUndefined()
  })
})
