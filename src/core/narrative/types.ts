import type {
  AdventurerRank,
  AdventurerRole,
  CharacterNarrativeProfile,
  Personality,
} from '../models/types.ts'
import type {
  CharacterIdentity,
  CharacterLifeBackground,
  CharacterRomanticProfile,
  CulturalInfluence,
} from '../identity/types.ts'
import type {
  EnvironmentType,
  ExpeditionOutcome,
  ExpeditionState,
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
  narrativeProfile?: CharacterNarrativeProfile
  identity?: CharacterIdentity
  lifeBackground?: CharacterLifeBackground
  culturalInfluences?: CulturalInfluence[]
  romanticProfile?: CharacterRomanticProfile
  incapacitated?: boolean
  dead?: boolean
  memories?: string[]
}

export type MemoryValence = 'positive' | 'negative' | 'mixed' | 'neutral'

export type RelationshipMemoryType =
  | 'rescued'
  | 'healed'
  | 'protected'
  | 'abandoned'
  | 'supported'
  | 'conflict'
  | 'disagreement'
  | 'shared_success'
  | 'shared_failure'
  | 'retreat'
  | 'casualty'
  | 'romantic_moment'
  | 'trust_event'
  | 'other'

export interface RelationshipMemory {
  id: string
  sourceCharacterId: string
  targetCharacterId: string
  expeditionId?: string
  day?: number
  type: RelationshipMemoryType
  summary: string
  importance: number
  valence: MemoryValence
  relatedFactIds?: string[]
  relatedBeatIds?: string[]
  createdAtDay?: number
  lastReferencedDay?: number
}

export type CharacterMemoryType =
  | 'major_success'
  | 'major_failure'
  | 'injury'
  | 'critical_injury'
  | 'retreat'
  | 'rescue'
  | 'casualty'
  | 'objective_failure'
  | 'objective_success'
  | 'other'

export interface CharacterMemory {
  id: string
  characterId: string
  expeditionId?: string
  day?: number
  type: CharacterMemoryType
  summary: string
  importance: number
  valence: MemoryValence
  relatedCharacterIds?: string[]
  relatedBeatIds?: string[]
  createdAtDay?: number
  lastReferencedDay?: number
}

export interface CharacterRelationship {
  sourceCharacterId: string
  targetCharacterId: string
  affinity: number
  trust: number
  respect: number
  tension: number
  romanticAttraction?: number
  sharedExpeditions?: number
  tags?: string[]
  recentEvents?: RelationshipMemory[]
}

export interface CharacterRelationshipSnapshot {
  sourceCharacterId: string
  sourceName: string
  targetCharacterId: string
  targetName: string
  affinity: number
  trust: number
  respect: number
  tension: number
  romanticAttraction?: number
  sharedExpeditions?: number
  tags?: string[]
  recentEvents?: RelationshipMemory[]
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
  characterRelationships?: CharacterRelationshipSnapshot[]
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

export type NarrativeTimelinePhase =
  | 'departure'
  | 'approach'
  | 'exploration'
  | 'objective'
  | 'battle'
  | 'return'
  | 'aftermath'

export type NarrativeTimelineBeatKind =
  'event' | 'transition' | 'battle' | 'outcome' | 'return'

export interface NarrativeTimelineBeat {
  id: string
  phase: NarrativeTimelinePhase
  kind: NarrativeTimelineBeatKind
  text: string
  actorIds?: string[]
  targetIds?: string[]
  importance: number
}

export interface NarrativeSceneSelection {
  beatIds: string[]
  focus: string
  reason: string
  characterIds?: string[]
}

export interface NarrativeFocus {
  summary: string
  characterIds?: string[]
  relatedBeatIds?: string[]
  reason?: string
}

export interface NarrativeInteractionHint {
  characterIds: string[]
  beatIds: string[]
  relationshipSummary?: string
  suggestedDynamic?: string
}

export interface NarrativeDirection {
  focus?: NarrativeFocus
  mainScenes: NarrativeSceneSelection[]
  secondaryScenes: NarrativeSceneSelection[]
  montageBeatIds: string[]
  omittedBeatIds?: string[]
  interactionHints?: NarrativeInteractionHint[]
}

export interface NarrativeAcceptanceInfo {
  reason: AcceptanceReasonCode
  rankGap: number
  specializationMatch: 'strong' | 'neutral' | 'weak'
}

export interface ExpeditionBattleMetric {
  sourceEvents: number
  beats: number
}

export interface NarrativeMemoryContextItem {
  summary: string
  type: string
  importance: number
  valence: MemoryValence
}

export type ArcSignalStatus = 'emerging' | 'established' | 'fading'

export type ArcSignalDirection = 'positive' | 'negative' | 'mixed' | 'neutral'

export type CharacterArcSignalType =
  | 'growing_reliance'
  | 'growing_trust'
  | 'recurring_support'
  | 'comfortable_familiarity'
  | 'comfortable_teasing'
  | 'protective_pattern'
  | 'recurring_conflict'
  | 'decision_friction'
  | 'eroding_trust'
  | 'growing_tension'
  | 'avoidance_pattern'
  | 'shared_failure_bond'
  | 'shared_success_bond'
  | 'unresolved_debt'
  | 'reciprocal_support'
  | 'romantic_interest_possible'
  | 'repeated_injury'
  | 'repeated_success'
  | 'repeated_failure'
  | 'other'

export interface CharacterArcSignal {
  id: string
  type: CharacterArcSignalType
  /** The character whose perspective the signal describes, if directional. */
  sourceCharacterId?: string
  /** The other character involved, if directional. */
  targetCharacterId?: string
  /** All character IDs relevant to this signal (1 for personal, 2 for pair). */
  characterIds: string[]
  strength: number
  confidence: number
  supportingMemoryIds: string[]
  supportingEventIds?: string[]
  firstDetectedDay?: number
  lastUpdatedDay?: number
  status: ArcSignalStatus
  direction: ArcSignalDirection
}

export interface NarrativeArcSignal {
  type: CharacterArcSignalType
  summary: string
  strength: number
  confidence: number
  status: ArcSignalStatus
  direction: ArcSignalDirection
  characterIds: string[]
  sourceCharacterId?: string
  targetCharacterId?: string
}

export type RelationshipMilestoneStatus = 'active' | 'legacy'

export type RelationshipMilestoneType =
  | 'established_mutual_reliance'
  | 'established_directional_reliance'
  | 'established_working_rhythm'
  | 'established_reciprocal_support'
  | 'established_trusted_friction'
  | 'established_decision_friction'
  | 'established_strained_trust'
  | 'established_shared_resilience'
  | 'persistent_romantic_interest'

export interface RelationshipMilestone {
  id: string
  type: RelationshipMilestoneType
  characterIds: string[]
  sourceCharacterId?: string
  targetCharacterId?: string
  achievedDay: number
  status: RelationshipMilestoneStatus
  strength: number
  confidence: number
  supportingArcSignalIds: string[]
  supportingMemoryIds: string[]
  deactivatedDay?: number
}

export interface RelationshipMilestoneCandidate {
  type: RelationshipMilestoneType
  characterIds: string[]
  sourceCharacterId?: string
  targetCharacterId?: string
  score: number
  confidence: number
  supportingArcSignalIds: string[]
  supportingMemoryIds: string[]
  eligible: boolean
}

export interface NarrativeRelationshipMilestone {
  type: RelationshipMilestoneType
  summary: string
  strength: number
  confidence: number
  status: RelationshipMilestoneStatus
  characterIds: string[]
  sourceCharacterId?: string
  targetCharacterId?: string
}

export type NarrativeQualityWarning =
  'identity_pronoun_mismatch' | 'abstract_relationship_summary'

export interface CharacterNarrativeContext {
  characterId: string
  name?: string
  gender?: string
  identitySummary?: string
  relevantBackground?: string[]
  relevantCulturalInfluences?: string[]
  relevantExperiences?: string[]
  currentTraits?: string[]
  relationshipHints?: string[]
  romanticHint?: string
  memories?: NarrativeMemoryContextItem[]
  arcSignals?: NarrativeArcSignal[]
}

export interface ExpeditionNarrativeContext {
  kind: 'expedition'
  party: NarrativePartySnapshot
  request: NarrativeRequestInfo
  acceptance?: NarrativeAcceptanceInfo
  report: DispatchReport
  /** Full expedition state including logs and battles. Optional for backward compatibility. */
  state?: ExpeditionState
  /** Precomputed deterministic narrative timeline. Preferred over state for prompts. */
  timeline?: NarrativeTimelineBeat[]
  /** Per-battle source event and compressed beat counts for audit/metrics. */
  battleMetrics?: ExpeditionBattleMetric[]
  /** Deterministic narrative direction: main/secondary scenes and montage beats. */
  direction?: NarrativeDirection
  /** Per-character background projected for the narrative focus. */
  characterContexts?: CharacterNarrativeContext[]
  /** Per-character memories selected as relevant to the narrative focus. */
  characterMemories?: Record<string, NarrativeMemoryContextItem[]>
  /** Per-pair relationship memories selected as relevant to the narrative focus. */
  relationshipMemories?: Record<string, NarrativeMemoryContextItem[]>
  /** Relationship arc signals selected as relevant to the narrative focus. */
  relationshipArcs?: NarrativeArcSignal[]
  /** Relationship milestones selected as relevant to the narrative focus. */
  relationshipMilestones?: NarrativeRelationshipMilestone[]
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
