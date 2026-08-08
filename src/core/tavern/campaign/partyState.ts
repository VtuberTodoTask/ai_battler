import { deepClone } from '../../util.ts'
import { isUnresolvedSeriousInjury } from '../../expedition/injuries.ts'
import type { ExpeditionResult } from '../../expedition/types.ts'
import type { CampaignParty } from './types.ts'

export function updateCampaignPartyFromResult(
  party: CampaignParty,
  result: ExpeditionResult,
): void {
  const { state } = result
  const casualties = new Set(state.casualties)

  for (const member of party.party.members) {
    const id = member.id
    member.currentHp = casualties.has(id)
      ? 0
      : (state.partyHp[id] ?? member.currentHp)
    member.currentMp = state.partyMp[id] ?? member.currentMp
    member.morale = state.partyMorale[id] ?? member.morale
    member.statusEffects = deepClone(state.partyStatusEffects[id] ?? [])
  }

  party.condition.incapacitatedIds = deepClone(state.incapacitated)
  party.condition.injuries = deepClone(state.injuries)

  if (state.casualties.length > 0) {
    party.departingCasualty = true
  }
}

export function calculateRecoveryDays(party: CampaignParty): number {
  if (party.departingCasualty) return 0

  const hasIncapacitated = party.condition.incapacitatedIds.length > 0
  const unresolvedSerious = party.condition.injuries.some(
    isUnresolvedSeriousInjury,
  )
  const minHpRatio = Math.min(
    ...party.party.members.map((m) => m.currentHp / m.maxHp),
  )

  if (hasIncapacitated || unresolvedSerious || minHpRatio <= 0.25) {
    return 2
  }

  const anyInjury = party.condition.injuries.length > 0
  if (anyInjury || minHpRatio < 0.7) {
    return 1
  }

  return 0
}

export function applyRecoveryCompletion(party: CampaignParty): void {
  for (const member of party.party.members) {
    member.currentHp = member.maxHp
    member.currentMp = member.maxMp
    member.morale = clamp(member.morale + 20, 70, 100)
    member.statusEffects = []
  }
  party.condition.incapacitatedIds = []
  party.condition.injuries = []
  party.recoveringThroughDay = undefined
}

export function applyOvernightRecovery(party: CampaignParty): void {
  if (party.recoveringThroughDay !== undefined || party.departingCasualty) {
    return
  }

  for (const member of party.party.members) {
    member.currentHp = Math.min(
      member.maxHp,
      Math.ceil(member.currentHp + member.maxHp * 0.2),
    )
    member.currentMp = member.maxMp
    member.morale = clamp(member.morale + 10, 0, 100)
  }
}

export function isRecoveringOnDay(
  party: CampaignParty,
  dayNumber: number,
): boolean {
  return (
    party.recoveringThroughDay !== undefined &&
    dayNumber <= party.recoveringThroughDay
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
