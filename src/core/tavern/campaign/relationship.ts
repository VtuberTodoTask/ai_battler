import { clamp } from '../../util.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import type { ExpeditionOutcome } from '../../expedition/types.ts'
import type { Adventurer } from '../../models/types.ts'
import type { PartyRiskTolerance, TavernPartyStats } from '../types.ts'
import type {
  CampaignParty,
  CampaignPartyRelationship,
  CampaignRelationshipEvent,
} from './types.ts'

export const AFFINITY_DELTA: Record<ExpeditionOutcome, number> = {
  completeSuccess: 12,
  success: 8,
  partialSuccess: 3,
  failedObjective: -5,
  forcedRetreat: -8,
  lostExpedition: -12,
}

export const FINANCIAL_PRESSURE_OUTCOME_DELTA: Record<
  ExpeditionOutcome,
  number
> = {
  completeSuccess: -25,
  success: -20,
  partialSuccess: -8,
  failedObjective: 5,
  forcedRetreat: 10,
  lostExpedition: 15,
}

export const FINANCIAL_PRESSURE_IDLE_DELTA = 8
export const FINANCIAL_PRESSURE_RECOVERY_DELTA = 4

export function getAffinityTier(affinity: number): string {
  if (affinity < 20) return '一見'
  if (affinity < 40) return '顔なじみ'
  if (affinity < 60) return '信頼'
  if (affinity < 80) return '常連'
  return '贔屓'
}

export function getFinancialPressureTier(pressure: number): string {
  if (pressure < 20) return '余裕あり'
  if (pressure < 40) return '安定'
  if (pressure < 60) return 'やや入用'
  if (pressure < 80) return '苦しい'
  return '切迫'
}

export function getRiskToleranceFromLeader(
  leader: Adventurer | undefined,
): PartyRiskTolerance {
  if (!leader) return 'balanced'
  const signal =
    (leader.personality?.bravery ?? 0) -
    (leader.personality?.caution ?? 0) +
    Math.round((leader.personality?.greed ?? 0) / 2)
  if (signal <= -2) return 'cautious'
  if (signal >= 2) return 'bold'
  return 'balanced'
}

export function getMaxStayExtensionDays(affinity: number): number {
  if (affinity < 20) return 0
  if (affinity < 40) return 2
  if (affinity < 60) return 4
  if (affinity < 80) return 6
  return 8
}

export function createInitialRelationship(
  campaignSeed: string,
  arrivalSerial: number,
  leader: Adventurer | undefined,
): CampaignPartyRelationship {
  const pressureRng = new SeededRng(
    `${campaignSeed}:arrival:${arrivalSerial}:financial-pressure`,
  )
  return {
    affinity: 10,
    financialPressure: pressureRng.integer(20, 60),
    riskTolerance: getRiskToleranceFromLeader(leader),
    stayExtensionDaysUsed: 0,
  }
}

export function applyAffinityFromOutcome(
  party: CampaignParty,
  outcome: ExpeditionOutcome,
  dayNumber: number,
): CampaignRelationshipEvent {
  const before = party.relationship.affinity
  const delta = AFFINITY_DELTA[outcome]
  const after = clamp(before + delta, 0, 100)
  party.relationship.affinity = after
  return {
    type: 'affinityChanged',
    partyId: party.id,
    partyName: party.party.name,
    dayNumber,
    outcome,
    before,
    delta: after - before,
    after,
  }
}

export function applyFinancialPressure(
  party: CampaignParty,
  delta: number,
  source: 'expedition' | 'idle' | 'recovery',
  dayNumber: number,
): CampaignRelationshipEvent {
  const before = party.relationship.financialPressure
  const after = clamp(before + delta, 0, 100)
  party.relationship.financialPressure = after
  return {
    type: 'financialPressureChanged',
    partyId: party.id,
    partyName: party.party.name,
    dayNumber,
    source,
    before,
    delta: after - before,
    after,
  }
}

export function applyFinancialPressureFromOutcome(
  party: CampaignParty,
  outcome: ExpeditionOutcome,
  dayNumber: number,
): CampaignRelationshipEvent {
  const delta = FINANCIAL_PRESSURE_OUTCOME_DELTA[outcome]
  return applyFinancialPressure(party, delta, 'expedition', dayNumber)
}

export function applyIdleFinancialPressure(
  party: CampaignParty,
  dayNumber: number,
): CampaignRelationshipEvent {
  return applyFinancialPressure(
    party,
    FINANCIAL_PRESSURE_IDLE_DELTA,
    'idle',
    dayNumber,
  )
}

export function applyRecoveryFinancialPressure(
  party: CampaignParty,
  dayNumber: number,
): CampaignRelationshipEvent {
  return applyFinancialPressure(
    party,
    FINANCIAL_PRESSURE_RECOVERY_DELTA,
    'recovery',
    dayNumber,
  )
}

export function tryExtendStay(
  party: CampaignParty,
  nextDayNumber: number,
  dayNumber: number,
): CampaignRelationshipEvent | null {
  if (party.departingCasualty) return null
  if (party.plannedDepartureDay >= nextDayNumber) return null

  const budget = getMaxStayExtensionDays(party.relationship.affinity)
  const remaining = budget - party.relationship.stayExtensionDaysUsed
  if (remaining <= 0) return null

  const previousDepartureDay = party.plannedDepartureDay
  party.plannedDepartureDay += remaining
  party.relationship.stayExtensionDaysUsed += remaining

  return {
    type: 'stayExtended',
    partyId: party.id,
    partyName: party.party.name,
    dayNumber,
    previousDepartureDay,
    newDepartureDay: party.plannedDepartureDay,
    extensionDays: remaining,
    affinity: party.relationship.affinity,
  }
}

export function getPositiveBrokerageRate(
  stats: TavernPartyStats,
): number | null {
  if (stats.totalExpeditions === 0) return null
  const positive =
    stats.completeSuccesses + stats.successes + stats.partialSuccesses
  return Math.round((positive / stats.totalExpeditions) * 100)
}

export function getPositiveBrokerageText(stats: TavernPartyStats): string {
  const positive =
    stats.completeSuccesses + stats.successes + stats.partialSuccesses
  if (stats.totalExpeditions === 0) {
    return '紹介実績 0件'
  }
  return `紹介実績 ${stats.totalExpeditions}件 成功 ${positive} 失敗・撤退 ${stats.failures + stats.retreats}`
}
