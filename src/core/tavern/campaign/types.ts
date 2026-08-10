import type {
  ExpeditionInjury,
  ExpeditionOutcome,
} from '../../expedition/types.ts'
import type {
  AdventurerParty,
  CampaignPartyEvent,
  PartyRiskTolerance,
  ResolvedDispatch,
  TavernDayState,
  TavernPartyStats,
} from '../types.ts'
import type {
  CharacterRelationship,
  NarrativeCandidate,
  NarrativeGenerationRecord,
} from '../../narrative/types.ts'

export type TavernReputationTier =
  'unknown' | 'local' | 'trusted' | 'renowned' | 'legendary'

export interface CampaignPartyCondition {
  incapacitatedIds: string[]
  injuries: ExpeditionInjury[]
}

export type CampaignInjurySnapshot = ExpeditionInjury

export type CampaignPartyStats = TavernPartyStats

export interface CampaignPartyProgression {
  growthXp: number
  totalGrowthXp: number
  growthMilestones: number
  trainingDays: number
}

export interface CampaignPartyRelationship {
  affinity: number
  financialPressure: number
  riskTolerance: PartyRiskTolerance
  stayExtensionDaysUsed: number
}

export type CampaignProgressionSource =
  | 'completeSuccess'
  | 'success'
  | 'partialSuccess'
  | 'failedObjective'
  | 'forcedRetreat'
  | 'training'

export type CampaignProgressionEvent =
  | {
      type: 'experienceGained'
      partyId: string
      partyName: string
      dayNumber: number
      source: CampaignProgressionSource
      amount: number
      growthXpAfter: number
      totalGrowthXpAfter: number
    }
  | {
      type: 'training'
      partyId: string
      partyName: string
      dayNumber: number
      amount: number
    }
  | {
      type: 'skillImproved'
      partyId: string
      partyName: string
      memberId: string
      memberName: string
      skill: string
      before: number
      after: number
      milestone: number
      dayNumber: number
    }
  | {
      type: 'progressionSkipped'
      partyId: string
      partyName: string
      dayNumber: number
      reason: string
    }

export type CampaignRelationshipEvent =
  | {
      type: 'affinityChanged'
      partyId: string
      partyName: string
      dayNumber: number
      outcome: ExpeditionOutcome
      before: number
      delta: number
      after: number
    }
  | {
      type: 'financialPressureChanged'
      partyId: string
      partyName: string
      dayNumber: number
      source: 'expedition' | 'idle' | 'recovery'
      before: number
      delta: number
      after: number
    }
  | {
      type: 'stayExtended'
      partyId: string
      partyName: string
      dayNumber: number
      previousDepartureDay: number
      newDepartureDay: number
      extensionDays: number
      affinity: number
    }

export interface CampaignParty {
  id: string
  party: AdventurerParty
  arrivalSerial: number
  arrivalDay: number
  plannedDepartureDay: number
  recoveringThroughDay?: number
  condition: CampaignPartyCondition
  stats: CampaignPartyStats
  progression: CampaignPartyProgression
  relationship: CampaignPartyRelationship
  /** Per-character directional relationships among party members. Optional for backward compatibility. */
  memberRelationships?: Record<string, CharacterRelationship>
  departingCasualty?: boolean
}

export interface ReputationChangeEntry {
  requestId: string
  outcome: ExpeditionOutcome
  rawDelta: number
}

export interface ReputationChangeSummary {
  before: number
  rawDelta: number
  appliedDelta: number
  after: number
  entries: ReputationChangeEntry[]
}

export interface TavernDayRecord {
  dayNumber: number
  daySeed: string
  reputationBefore: number
  reputationAfter: number
  reputationChange: ReputationChangeSummary
  results: ResolvedDispatch[]
  partyEvents: CampaignPartyEvent[]
  progressionEvents: CampaignProgressionEvent[]
  relationshipEvents: CampaignRelationshipEvent[]
}

export interface TavernCampaignState {
  version: 1
  seed: string
  dayNumber: number
  reputation: number
  nextPartySerial: number
  parties: CampaignParty[]
  currentDay: TavernDayState
  history: TavernDayRecord[]
  narrativeCandidates: NarrativeCandidate[]
  narrativeGenerations: NarrativeGenerationRecord[]
}
