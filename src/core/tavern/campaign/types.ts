import type {
  ExpeditionInjury,
  ExpeditionOutcome,
} from '../../expedition/types.ts'
import type {
  AdventurerParty,
  CampaignPartyEvent,
  ResolvedDispatch,
  TavernDayState,
} from '../types.ts'

export type TavernReputationTier =
  'unknown' | 'local' | 'trusted' | 'renowned' | 'legendary'

export interface CampaignPartyCondition {
  incapacitatedIds: string[]
  injuries: ExpeditionInjury[]
}

export type CampaignInjurySnapshot = ExpeditionInjury

export interface CampaignPartyStats {
  totalExpeditions: number
  completeSuccesses: number
  successes: number
  partialSuccesses: number
  failures: number
  retreats: number
}

export interface CampaignPartyProgression {
  growthXp: number
  totalGrowthXp: number
  growthMilestones: number
  trainingDays: number
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
}
