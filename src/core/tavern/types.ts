import type {
  Adventurer,
  AdventurerRank,
  AdventurerRole,
  BattleOutcome,
} from '../models/types.ts'
import type {
  EnvironmentType,
  EscortHandoffStatus,
  ExpeditionFeature,
  ExpeditionOutcome,
  ExpeditionRequest,
  ExpeditionResult,
  ObjectiveType,
} from '../expedition/types.ts'

export type CampaignPartyEventType =
  | 'arrived'
  | 'departedScheduled'
  | 'departedCasualty'
  | 'startedRecovery'
  | 'finishedRecovery'

export interface CampaignPartyEvent {
  type: CampaignPartyEventType
  partyId: string
  partyName: string
  dayNumber: number
}

export interface TavernDayState {
  id: string
  seed: string
  requests: TavernRequestOffer[]
  parties: TavernParty[]
  offers: BrokerageOfferAttempt[]
  matches: BrokerageMatch[]
  status: 'planning' | 'resolved'
  results: ResolvedDispatch[]
  partyEvents?: CampaignPartyEvent[]
}

export interface TavernRequestOffer {
  id: string
  title: string
  briefing: string
  objectiveType: ObjectiveType
  rank: AdventurerRank
  environment: EnvironmentType
  publicTags: string[]
  recommendedPartySize: number
  expeditionRequest: ExpeditionRequest
}

export interface PublicRequestProfile {
  id: string
  objectiveType: ObjectiveType
  rank: AdventurerRank
  environment: EnvironmentType
  publicTags: string[]
}

export interface AdventurerParty {
  id: string
  name: string
  rank: AdventurerRank
  leaderId: string
  members: Adventurer[]
  archetypeId: string
}

export interface TavernParty {
  id: string
  party: AdventurerParty
  acceptedRequestId?: string
  availability?: 'available' | 'recovering'
  recoveryDaysRemaining?: number
  arrivalDay?: number
  plannedDepartureDay?: number
  isNew?: boolean
}

export interface PartyTemplate {
  id: string
  roles: [AdventurerRole, AdventurerRole, AdventurerRole, AdventurerRole]
  leaderSlot: 0 | 1 | 2 | 3
}

export type AcceptanceReasonCode =
  'appropriate' | 'challengingButSuitable' | 'tooDangerous' | 'poorFit'

export interface OfferEvaluation {
  decision: 'accepted' | 'declined'
  reason: AcceptanceReasonCode
  requestRank: AdventurerRank
  partyRank: AdventurerRank
  rankGap: number
  relevantRoleCount: number
  leaderJudgment: number
}

export interface BrokerageOfferAttempt {
  id: string
  requestId: string
  partyId: string
  decision: 'accepted' | 'declined'
  reason: AcceptanceReasonCode
  evaluation: OfferEvaluation
}

export interface BrokerageMatch {
  requestId: string
  partyId: string
  acceptedOfferId: string
}

export interface ResolvedDispatch {
  requestId: string
  request: TavernRequestOffer
  partyId?: string
  partyName?: string
  leaderName?: string
  memberIds: string[]
  status: 'resolved' | 'notBrokered'
  result?: ExpeditionResult
  report?: DispatchReport
}

export interface DispatchPartyResult {
  adventurerId: string
  name: string
  role: AdventurerRole
  rank: AdventurerRank
  finalHp: number
  maxHp: number
  finalMp: number
  maxMp: number
  finalMorale: number
  incapacitated: boolean
  dead: boolean
}

export interface InvestigationDispatchSummary {
  type: 'investigation'
  progress: number
  completed: boolean
  discoveredInformationCount: number
  completeInformationCount: number
  battleIntelCount: number
}

export interface EliminationDispatchSummary {
  type: 'elimination'
  requiredTargetCount: number
  defeatedCount: number
  escapedCount: number
  survivingCount: number
  unknownCount: number
  confirmedCount: number
  progress: number
  completed: boolean
}

export interface RescueDispatchSummary {
  type: 'rescue'
  targetName: string
  finalHp: number
  maxHp: number
  located: boolean
  reached: boolean
  stabilized: boolean
  evacuated: boolean
  returned: boolean
  abandoned: boolean
  completed: boolean
}

export interface EscortDispatchSummary {
  type: 'escort'
  targetName: string
  finalHp: number
  maxHp: number
  stress: number
  routeProgress: number
  destinationReached: boolean
  handoffStatus: EscortHandoffStatus
  delivered: boolean
  returnedToOrigin: boolean
  stranded: boolean
  completed: boolean
}

export interface RetrievalDispatchSummary {
  type: 'retrieval'
  targetName: string
  finalIntegrity: number
  minimumAcceptableIntegrity: number
  secured: boolean
  extracted: boolean
  returned: boolean
  completed: boolean
}

export interface SurveyDispatchSummary {
  type: 'survey'
  areaName: string
  coveragePercent: number
  averageQuality: number
  minimumAcceptableQuality: number
  reportReturned: boolean
  surveyedSectorCount: number
  completed: boolean
}

export type DispatchObjectiveSummary =
  | InvestigationDispatchSummary
  | EliminationDispatchSummary
  | RescueDispatchSummary
  | EscortDispatchSummary
  | RetrievalDispatchSummary
  | SurveyDispatchSummary

export interface DispatchReport {
  requestId: string
  objectiveType: ObjectiveType
  outcome: ExpeditionOutcome
  objectiveCompleted: boolean
  objectiveProgress: number
  elapsedTime: number
  battleOutcome?: BattleOutcome
  party: DispatchPartyResult[]
  casualties: string[]
  incapacitated: string[]
  keyFacts: string[]
  objective: DispatchObjectiveSummary
}

export interface TavernRequestTemplate {
  id: string
  objectiveType: ObjectiveType
  title: string
  environment: EnvironmentType
  briefing: string
  features: ExpeditionFeature[]
  publicTags: string[]
  battleChance: number
  build(context: {
    requestId: string
    seed: string
    rank: AdventurerRank
    battleEnabled: boolean
  }): TavernRequestOffer
}
