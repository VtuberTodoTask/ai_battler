import type {
  AdventurerRank,
  AdventurerRole,
  Personality,
} from '../models/types.ts'
import type {
  EnvironmentType,
  ExpeditionOutcome,
  ObjectiveType,
} from '../expedition/types.ts'
import type {
  DispatchReport,
  PartyRiskTolerance,
  TavernPartyStats,
} from '../tavern/types.ts'
import type { PartyMissionSpecialization } from '../tavern/specialization.ts'
import type { AcceptanceReasonCode } from '../tavern/types.ts'

export type NarrativeCandidateCategory = 'expedition' | 'characterEvent'

export type CharacterNarrativeEventType =
  | 'partyArrival'
  | 'riskyRequestAccepted'
  | 'weakObjectiveSuccess'
  | 'recoveryFinished'
  | 'stayExtended'
  | 'becameRegular'
  | 'becameFavorite'
  | 'farewell'
  | 'casualtyDeparture'

export interface NarrativeMemberSnapshot {
  id: string
  name: string
  role: AdventurerRole
  rank: AdventurerRank
  personality: Personality
  incapacitated?: boolean
  dead?: boolean
}

export interface NarrativePartySnapshot {
  id: string
  name: string
  rank: AdventurerRank
  leaderId: string
  leaderName: string
  members: NarrativeMemberSnapshot[]
  missionSpecialization: PartyMissionSpecialization
  affinity: number
  financialPressure: number
  riskTolerance: PartyRiskTolerance
  growthMilestones: number
  trainingDays: number
  stats: TavernPartyStats
  arrivalDay: number
  plannedDepartureDay: number
}

export interface NarrativeRequestInfo {
  id: string
  title: string
  briefing: string
  rank: AdventurerRank
  objectiveType: ObjectiveType
  environment: EnvironmentType
  publicTags: string[]
}

export interface NarrativeAcceptanceInfo {
  reason: AcceptanceReasonCode
  rankGap: number
  specializationMatch: 'strong' | 'neutral' | 'weak'
}

export interface ExpeditionNarrativeContext {
  kind: 'expedition'
  party: NarrativePartySnapshot
  request: NarrativeRequestInfo
  acceptance?: NarrativeAcceptanceInfo
  report: DispatchReport
}

export interface NarrativeHistoryHighlight {
  dayNumber: number
  requestTitle: string
  objectiveType: ObjectiveType
  outcome: ExpeditionOutcome
  isWeakObjective: boolean
  rankGap: number
}

export interface CharacterEventNarrativeContext {
  kind: 'characterEvent'
  eventType: CharacterNarrativeEventType
  secondaryTriggers: CharacterNarrativeEventType[]
  party: NarrativePartySnapshot
  eventFacts: Record<string, unknown>
  recentHighlights: NarrativeHistoryHighlight[]
}

export type NarrativeContext =
  ExpeditionNarrativeContext | CharacterEventNarrativeContext

export interface NarrativeCandidate {
  id: string
  version: 1
  category: NarrativeCandidateCategory
  eventType?: CharacterNarrativeEventType
  dayNumber: number
  partyId: string
  partyName: string
  requestId?: string
  requestTitle?: string
  priority: number
  title: string
  context: NarrativeContext
  state: 'available' | 'generated' | 'dismissed'
  activeGenerationId?: string
}

export interface NarrativeGenerationRecord {
  id: string
  candidateId: string
  generatedText: string
  promptVersion: string
  providerId: string
  model?: string
  createdAt: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}
