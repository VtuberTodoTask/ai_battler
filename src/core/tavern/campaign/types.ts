import type {
  ExpeditionInjury,
  ExpeditionOutcome,
} from '../../expedition/types.ts'
import type { AdventurerRank } from '../../models/types.ts'
import type {
  AdventurerParty,
  CampaignPartyEvent,
  PartyRiskTolerance,
  ResolvedDispatch,
  TavernDayState,
  TavernPartyStats,
  TavernRequestOffer,
} from '../types.ts'
import type {
  CharacterArcSignal,
  CharacterMemory,
  CharacterRelationship,
  DowntimeEvent,
  MinorNarrativeFingerprint,
  MinorScenePresentationPlan,
  NarrativeCandidate,
  NarrativeGenerationRecord,
  RelationshipMilestone,
  StayExtensionReason,
} from '../../narrative/types.ts'
import type { TavernFinanceState } from '../../economy/types.ts'

export type TavernRank = 1 | 2 | 3 | 4 | 5

export interface TavernReputationEventSource {
  type: 'expedition'
  requestId: string
  partyId: string
}

export interface TavernReputationEvent {
  id: string
  day: number
  kind: 'quest_outcome'
  delta: number
  source: TavernReputationEventSource
}

export interface TavernReputationState {
  score: number
  peakScore: number
  events: TavernReputationEvent[]
}

export interface DayReputationSummary {
  beforeScore: number
  delta: number
  afterScore: number
  beforeRank: TavernRank
  afterRank: TavernRank
  promoted: boolean
}

export type TavernUpgradeId =
  | 'quest_board'
  | 'intel_archive'
  | 'recovery_room'
  | 'guest_room'
  | 'training_yard'

export interface TavernUpgradeLevels {
  quest_board: number
  intel_archive: number
  recovery_room: number
  guest_room: number
  training_yard: number
}

export interface TavernUpgradeState {
  levels: TavernUpgradeLevels
}

export interface CampaignPartyCondition {
  incapacitatedIds: string[]
  injuries: ExpeditionInjury[]
}

export type PartyLifecycleStatus = 'staying' | 'away' | 'retired'

/**
 * Persistent visit-history metadata. `arrivalDay` on CampaignParty already
 * tracks the current/most recent stay's arrival day (lastArrivalDay), so it
 * is not duplicated here.
 */
export interface PartyLifecycleState {
  status: PartyLifecycleStatus
  firstArrivalDay: number
  visitCount: number
  lastDepartureDay?: number
  returnEligibleDay?: number
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
      primaryReason: StayExtensionReason
      secondaryReason?: StayExtensionReason
      relevantCharacterIds?: string[]
      presentationPlan: MinorScenePresentationPlan
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
  /** Per-character persistent memories from expeditions. Optional for backward compatibility. */
  characterMemories?: Record<string, CharacterMemory[]>
  /** Number of expeditions shared by each unordered pair of members. Optional for backward compatibility. */
  sharedExpeditionCounts?: Record<string, number>
  /** Persistent relationship / personal arc signals derived from memories. Optional for backward compatibility. */
  arcSignals?: CharacterArcSignal[]
  /** Persistent relationship milestones achieved by this party. Optional for backward compatibility. */
  relationshipMilestones?: RelationshipMilestone[]
  /** Downtime events accumulated while the party was not on expedition. Optional for backward compatibility. */
  downtimeEvents?: DowntimeEvent[]
  /** Recent minor narrative fingerprints for this party, used to avoid repeated framing. Optional for backward compatibility. */
  minorNarrativeFingerprints?: MinorNarrativeFingerprint[]
  departingCasualty?: boolean
  lifecycle: PartyLifecycleState
}

/**
 * Phase 9.6 Quest Chain. A short (3-step) persistent follow-up sequence
 * that starts deterministically from a successful standalone quest — not
 * a Main Quest / Story system (those are later phases, entirely separate
 * authoritative state).
 */
export type QuestChainDefinitionId =
  'chain-a' | 'chain-b' | 'chain-c' | 'chain-d'

export type QuestChainStatus = 'active' | 'completed' | 'failed' | 'abandoned'

export type QuestChainStepStatus = 'scheduled' | 'resolved' | 'notBrokered'

export interface QuestChainStepState {
  stepNumber: 1 | 2 | 3
  scheduledDay: number
  request: TavernRequestOffer
  status: QuestChainStepStatus
  partyId?: string
  outcome?: ExpeditionOutcome
}

export interface QuestChainState {
  id: string
  definitionId: QuestChainDefinitionId
  status: QuestChainStatus
  startedDay: number
  rankCeiling: AdventurerRank
  steps: QuestChainStepState[]
}

export type QuestChainEvent =
  | {
      type: 'started'
      chainId: string
      dayNumber: number
    }
  | {
      type: 'advanced'
      chainId: string
      dayNumber: number
      completedStep: number
      nextStep: number
    }
  | {
      type: 'completed'
      chainId: string
      dayNumber: number
    }
  | {
      type: 'failed'
      chainId: string
      dayNumber: number
      outcome: ExpeditionOutcome
    }
  | {
      type: 'abandoned'
      chainId: string
      dayNumber: number
    }

/**
 * Phase 9.7 World Event. A regional, fixed-duration situation that adds
 * one Event-linked Request to the board each active day — persistent
 * Context, never a hidden Simulation modifier (no combat/reward/success
 * rate special-casing anywhere in this system).
 */
export type WorldEventDefinitionId =
  'monster_migration' | 'flooded_routes' | 'exposed_ruins' | 'missing_caravans'

export type WorldEventStatus = 'active' | 'contained' | 'unresolved'

export interface WorldEventState {
  id: string
  definitionId: WorldEventDefinitionId
  status: WorldEventStatus
  startedDay: number
  plannedEndDay: number
  endedDay?: number
  requestRank: AdventurerRank
  responsePoints: number
}

export type WorldEventEvent =
  | {
      type: 'started'
      eventId: string
      definitionId: WorldEventDefinitionId
      dayNumber: number
    }
  | {
      type: 'response'
      eventId: string
      requestId: string
      dayNumber: number
      delta: number
      responsePointsAfter: number
    }
  | {
      type: 'contained'
      eventId: string
      dayNumber: number
    }
  | {
      type: 'unresolved'
      eventId: string
      dayNumber: number
    }

export interface TavernDayRecord {
  dayNumber: number
  daySeed: string
  reputationSummary: DayReputationSummary
  results: ResolvedDispatch[]
  partyEvents: CampaignPartyEvent[]
  progressionEvents: CampaignProgressionEvent[]
  relationshipEvents: CampaignRelationshipEvent[]
  questChainEvents: QuestChainEvent[]
  worldEventEvents: WorldEventEvent[]
}

export interface TavernCampaignState {
  version: 1
  seed: string
  dayNumber: number
  reputation: TavernReputationState
  nextPartySerial: number
  parties: CampaignParty[]
  awayParties: CampaignParty[]
  retiredParties: CampaignParty[]
  currentDay: TavernDayState
  history: TavernDayRecord[]
  narrativeCandidates: NarrativeCandidate[]
  narrativeGenerations: NarrativeGenerationRecord[]
  finance: TavernFinanceState
  upgrades: TavernUpgradeState
  questChains: QuestChainState[]
  worldEvents: WorldEventState[]
}
