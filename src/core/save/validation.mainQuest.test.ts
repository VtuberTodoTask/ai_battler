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
