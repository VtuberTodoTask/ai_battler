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

export interface CampaignParty {
  id: string
  party: AdventurerParty
  arrivalSerial: number
  arrivalDay: number
  plannedDepartureDay: number
  recoveringThroughDay?: number
  condition: CampaignPartyCondition
  stats: CampaignPartyStats
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
