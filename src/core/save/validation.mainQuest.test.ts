import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { dispatchMainQuest } from '../mainQuest/dispatch.ts'
import { MAIN_QUEST_THREAT_DEFINITION_MAP } from '../mainQuest/threats.ts'
import { TAVERN_ECONOMY_CONFIG } from '../economy/economyConfig.ts'
import { serializeGameSave } from './serializer.ts'
import { SaveValidationErrorClass, validateGameSave } from './validation.ts'
import type { StatusEffect } from '../models/types.ts'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// A real save's `funds` must always equal its Ledger total (checked by the
// validator itself), so a test fixture cannot just set `finance.funds`
// directly without a matching Ledger entry. Bumping the shared starting-
// funds config before building the fixture Campaign keeps the resulting
// opening_balance entry — and the funds derived from it — self-consistent,
// with no hand-authored Ledger entry to keep in sync. Scoped to this file
// only (Vitest isolates each test file's module graph).
;(TAVERN_ECONOMY_CONFIG as { initialFunds: number }).initialFunds = 100000

function dispatchedAndResolvedSave(seed: string) {
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
  // A save is only ever taken while the current day is 'planning' — advance
  // past the day the Attempt resolved on, same as any other real save point.
  const advanced = advanceCampaignDay(resolved)
  return {
    save: clone(serializeGameSave({ campaign: advanced })),
    attemptId: dispatch.attemptId,
  }
}

describe('Phase 9.8 Main Quest Save Validation', () => {
  it('accepts a valid save with a resolved, un-narrated Attempt', () => {
    const { save } = dispatchedAndResolvedSave('mainquest-save-001')
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('accepts a fresh save with no Main Quest activity at all', () => {
    const campaign = createTavernCampaign('mainquest-save-002')
    const save = clone(serializeGameSave({ campaign }))
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('rejects a Threat marked defeated with no winning Attempt to justify it ("fake defeat")', () => {
    const campaign = createTavernCampaign('mainquest-save-003')
    const save = clone(serializeGameSave({ campaign }))
    save.campaign.mainQuest.threats.alden.status = 'defeated'

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a winning Attempt whose Threat is not marked defeated', () => {
    const { save, attemptId } = dispatchedAndResolvedSave('mainquest-save-004')
    const attempt = save.campaign.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    // Force a victory result regardless of the real Simulation outcome, to
    // isolate the Threat-status-vs-Attempt-result causality check itself.
    attempt.result!.monsterDefeated = true
    save.campaign.mainQuest.threats.alden.status = 'available'

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects Nosferatu unlocked/attempted before all 7 national Threats are defeated', () => {
    const campaign = createTavernCampaign('mainquest-save-005')
    const save = clone(serializeGameSave({ campaign }))
    save.campaign.mainQuest.threats.nosferatu.status = 'available'

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects the curse being lifted with no Nosferatu victory Attempt', () => {
    const campaign = createTavernCampaign('mainquest-save-006')
    const save = clone(serializeGameSave({ campaign }))
    save.campaign.mainQuest.playerCurseStatus = 'lifted'

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a tampered main_quest_payment Ledger amount', () => {
    const { save } = dispatchedAndResolvedSave('mainquest-save-007')
    const entry = save.campaign.finance.ledgerEntries.find(
      (e) => e.kind === 'main_quest_payment',
    )!
    entry.amount -= 500

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a missing main_quest_payment Ledger entry for a real Attempt', () => {
    const { save } = dispatchedAndResolvedSave('mainquest-save-008')
    save.campaign.finance.ledgerEntries =
      save.campaign.finance.ledgerEntries.filter(
        (e) => e.kind !== 'main_quest_payment',
      )

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a duplicate Attempt id', () => {
    const { save, attemptId } = dispatchedAndResolvedSave('mainquest-save-009')
    const attempt = save.campaign.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    save.campaign.mainQuest.attempts.push(clone(attempt))

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a Battle Trace event referencing an unknown participant id', () => {
    const { save } = dispatchedAndResolvedSave('mainquest-save-010')
    const attempt = save.campaign.mainQuest.attempts[0]
    attempt.battleTrace!.events.push({
      type: 'hit',
      round: 1,
      actorId: 'not-a-real-participant',
      targetId: 'also-not-real',
      actionType: 'melee',
      critical: false,
    })

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a Battle Trace whose monsterDefeated event disagrees with the Result', () => {
    const { save } = dispatchedAndResolvedSave('mainquest-save-011')
    const attempt = save.campaign.mainQuest.attempts[0]
    // Flip the Result's monsterDefeated without touching the Trace, so the
    // two disagree regardless of which way the real Simulation actually went.
    attempt.result!.monsterDefeated = !attempt.result!.monsterDefeated

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })
})

describe('Phase 9.8.2/9.8.3 Status Battle Trace Save Validation', () => {
  it('rejects a statusApplied event carrying an unknown status type', () => {
    const { save } = dispatchedAndResolvedSave('mainquest-status-001')
    const attempt = save.campaign.mainQuest.attempts[0]
    const memberId =
      attempt.battleTrace!.initialSnapshot.partyMembers[0].characterId
    attempt.battleTrace!.events.push({
      type: 'statusApplied',
      round: 1,
      targetId: memberId,
      effect: {
        type: 'not-a-real-status' as unknown as StatusEffect['type'],
        duration: 2,
        value: 5,
        sourceId: memberId,
      },
    })

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a statusRemoved event for a status that was never applied (and is not in the Initial Snapshot)', () => {
    const { save } = dispatchedAndResolvedSave('mainquest-status-002')
    const attempt = save.campaign.mainQuest.attempts[0]
    const memberId =
      attempt.battleTrace!.initialSnapshot.partyMembers[0].characterId
    // 'guarded' is never present on this member in the Initial Snapshot for
    // a fresh Attempt, and no prior statusApplied for it precedes this.
    attempt.battleTrace!.events.push({
      type: 'statusRemoved',
      round: 1,
      targetId: memberId,
      status: 'guarded',
    })

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects an injected statusApplied event with no matching status in the final member state', () => {
    const { save } = dispatchedAndResolvedSave('mainquest-status-003')
    const attempt = save.campaign.mainQuest.attempts[0]
    const memberId =
      attempt.battleTrace!.initialSnapshot.partyMembers[0].characterId
    attempt.battleTrace!.events.push({
      type: 'statusApplied',
      round: 1,
      targetId: memberId,
      effect: { type: 'weakened', duration: 2, value: 5, sourceId: memberId },
    })
    // finalMemberStates is left untouched, so the replayed final status
    // (now including 'weakened') disagrees with the stored Result.

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a final member state carrying a status the Battle Trace never applied', () => {
    const { save } = dispatchedAndResolvedSave('mainquest-status-004')
    const attempt = save.campaign.mainQuest.attempts[0]
    const finalState = attempt.result!.finalMemberStates[0]
    finalState.statusEffects = [
      ...finalState.statusEffects,
      { type: 'poisoned', duration: 3, value: 3, sourceId: 'tamper' },
    ]

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('accepts a Battle Trace where a status is legitimately applied then removed and reflected in the final state', () => {
    const { save } = dispatchedAndResolvedSave('mainquest-status-005')
    const attempt = save.campaign.mainQuest.attempts[0]
    const memberId =
      attempt.battleTrace!.initialSnapshot.partyMembers[0].characterId
    const events = attempt.battleTrace!.events
    // Insert immediately before the trailing `battleEnded` event, at that
    // same final round, so round-monotonicity holds regardless of how many
    // rounds this particular seeded Attempt actually ran.
    const finalRound = (events[events.length - 1] as { round: number }).round
    events.splice(
      events.length - 1,
      0,
      {
        type: 'statusApplied',
        round: finalRound,
        targetId: memberId,
        effect: { type: 'weakened', duration: 2, value: 5, sourceId: memberId },
      },
      {
        type: 'statusRemoved',
        round: finalRound,
        targetId: memberId,
        status: 'weakened',
      },
    )
    // Applied then removed nets to no lingering status, so the stored final
    // state (untouched) still matches replay.

    expect(() => validateGameSave(save)).not.toThrow()
  })

  /**
   * Builds a save where `weakened` (duration 2 / value 5 / sourceId
   * `memberId`) is legitimately applied at the final round and survives to
   * the end of Battle — both the Trace event and the stored final state
   * agree, so this passes validation as-is. Each Phase 9.8.3 field-tamper
   * test starts from this baseline and corrupts exactly one field.
   */
  function saveWithSurvivingStatus(seed: string) {
    const { save } = dispatchedAndResolvedSave(seed)
    const attempt = save.campaign.mainQuest.attempts[0]
    const memberId =
      attempt.battleTrace!.initialSnapshot.partyMembers[0].characterId
    const effect = {
      type: 'weakened' as const,
      duration: 2,
      value: 5,
      sourceId: memberId,
    }
    const events = attempt.battleTrace!.events
    const finalRound = (events[events.length - 1] as { round: number }).round
    const injectedEvent = {
      type: 'statusApplied' as const,
      round: finalRound,
      targetId: memberId,
      effect: { ...effect },
    }
    events.splice(events.length - 1, 0, injectedEvent)
    const finalState = attempt.result!.finalMemberStates.find(
      (s) => s.id === memberId,
    )!
    finalState.statusEffects = [...finalState.statusEffects, { ...effect }]
    // Return the exact injected event's own `effect` object — the Trace
    // may already carry OTHER, naturally-occurring `statusApplied` events
    // from the real battle, so each tamper test must mutate precisely this
    // one, never whichever `statusApplied` a `.find()` happens to hit first.
    return { save, injectedEffect: injectedEvent.effect, memberId }
  }

  it('accepts the surviving-status baseline fixture unmodified', () => {
    const { save } = saveWithSurvivingStatus('mainquest-status-baseline')
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('rejects a tampered Trace statusApplied duration (2 -> 99)', () => {
    const { save, injectedEffect } = saveWithSurvivingStatus(
      'mainquest-status-006',
    )
    injectedEffect.duration = 99

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a tampered Trace statusApplied value (5 -> 500)', () => {
    const { save, injectedEffect } = saveWithSurvivingStatus(
      'mainquest-status-007',
    )
    injectedEffect.value = 500

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a tampered Trace statusApplied sourceId (member-A -> a different member)', () => {
    const { save, injectedEffect, memberId } = saveWithSurvivingStatus(
      'mainquest-status-008',
    )
    const attempt = save.campaign.mainQuest.attempts[0]
    const otherMemberId =
      attempt.battleTrace!.initialSnapshot.partyMembers.find(
        (m) => m.characterId !== memberId,
      )?.characterId
    if (!otherMemberId) return
    injectedEffect.sourceId = otherMemberId

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a tampered Initial Snapshot status (an unaccounted-for status added at Battle start)', () => {
    const { save } = dispatchedAndResolvedSave('mainquest-status-009')
    const attempt = save.campaign.mainQuest.attempts[0]
    const member = attempt.battleTrace!.initialSnapshot.partyMembers[0]
    member.statusEffects = [
      ...member.statusEffects,
      { type: 'poisoned', duration: 3, value: 3, sourceId: 'system' },
    ]
    // No Trace event ever removes it and finalMemberStates is left
    // untouched, so the replayed final state (now poisoned) disagrees with
    // the stored Result.

    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })
})
