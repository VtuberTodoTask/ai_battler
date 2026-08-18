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
}

export interface TavernDayRecord {
  dayNumber: number
  daySeed: string
  reputationSummary: DayReputationSummary
  results: ResolvedDispatch[]
  partyEvents: CampaignPartyEvent[]
  progressionEvents: CampaignProgressionEvent[]
  relationshipEvents: CampaignRelationshipEvent[]
}

export interface TavernCampaignState {
  version: 1
  seed: string
  dayNumber: number
  reputation: TavernReputationState
  nextPartySerial: number
  parties: CampaignParty[]
  currentDay: TavernDayState
  history: TavernDayRecord[]
  narrativeCandidates: NarrativeCandidate[]
  narrativeGenerations: NarrativeGenerationRecord[]
  finance: TavernFinanceState
}
