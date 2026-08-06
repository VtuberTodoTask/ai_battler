import type {
  Adventurer,
  AdventurerRank,
  Difficulty,
  EncounterShape,
  SkillName,
} from '../models/types.ts'
import type { EncounterPlan } from '../generators/encounterGenerator.ts'

export type ExpeditionPhase =
  | 'preparation'
  | 'approach'
  | 'contact'
  | 'exploration'
  | 'objective'
  | 'battle'
  | 'return'
  | 'aftermath'

export type ObjectiveType =
  'elimination' | 'investigation' | 'rescue' | 'escort' | 'retrieval' | 'survey'

export type EnvironmentType =
  | 'forest'
  | 'mountain'
  | 'cave'
  | 'ruins'
  | 'plains'
  | 'swamp'
  | 'desert'
  | 'urban'
  | 'magical'

export type ExpeditionFeature =
  | 'traps'
  | 'ambushRisk'
  | 'flyingEnemies'
  | 'poisonRisk'
  | 'unstableTerrain'
  | 'poorVisibility'
  | 'navigationDifficulty'
  | 'civilianPresence'
  | 'negotiationOpportunity'
  | 'limitedSupplies'
  | 'longDuration'
  | 'retreatDifficulty'

export interface KnownInformation {
  id: string
  name: string
  description: string
}

export interface HiddenInformation {
  id: string
  name: string
  description: string
  difficulty: number
  requiredSkill?: SkillName
}

export interface DiscoveredInformation {
  id: string
  name: string
  description: string
  source: string
  completeness: 'fragment' | 'complete'
}

export type CheckResult =
  | 'criticalSuccess'
  | 'success'
  | 'partialSuccess'
  | 'failure'
  | 'criticalFailure'

export interface InformationDiscoveryAttempt {
  informationId: string
  requiredSkill: SkillName
  difficulty: number
  result: CheckResult
}

export interface ExpeditionCheck {
  phase: ExpeditionPhase
  skill: SkillName
  responsibleMemberIds: string[]
  difficultyModifier: number
  assistanceMemberIds: string[]
}

export interface ExpeditionEffect {
  type: string
  value?: number
  targetId?: string
  metadata?: Record<string, unknown>
}

export interface ExpeditionLogEntry {
  phase: ExpeditionPhase
  type: string
  actorIds: string[]
  targetIds?: string[]
  check?: {
    skill: SkillName
    effectiveValue: number
    roll: number
    result: CheckResult
  }
  effects: ExpeditionEffect[]
  facts: string[]
}

export interface ExpeditionInjury {
  id: string
  adventurerId: string
  type: 'light' | 'serious'
  cause: string
  hpLoss: number
  status: 'active' | 'treated' | 'worsened'
}

export interface ExpeditionState {
  currentPhase: ExpeditionPhase
  elapsedTime: number
  partyHp: Record<string, number>
  partyMp: Record<string, number>
  partyMorale: Record<string, number>
  partyStatusEffects: Record<string, string[]>
  supplies: {
    food: number
    medicine: number
    tools: number
  }
  information: DiscoveredInformation[]
  injuries: ExpeditionInjury[]
  casualties: string[]
  objectiveProgress: number
  objectiveCompleted: boolean
  discoveredThreats: ExpeditionFeature[]
  avoidedThreats: ExpeditionFeature[]
  logs: ExpeditionLogEntry[]
  battleEntrySnapshot?: BattleEntryConditions
  metadata?: Record<string, unknown>
}

export interface ExpeditionRequest {
  id: string
  seed: string
  rank: AdventurerRank
  difficulty: Difficulty
  objectiveType: ObjectiveType
  environment: EnvironmentType
  distance: number
  timeLimit?: number
  features: ExpeditionFeature[]
  knownInformation: KnownInformation[]
  hiddenInformation: HiddenInformation[]
  encounter?: { shape: EncounterShape; count: number } | EncounterPlan
}

export interface EnvironmentEffect {
  type: 'lighting' | 'noise' | 'water' | 'smoke' | 'visibility' | 'terrain'
  value: string | number | boolean
}

export interface BattleEntryConditions {
  /** Snapshot of absolute values taken at the moment a battle would start. */
  surprise: 'partyAdvantage' | 'neutral' | 'enemyAdvantage'
  initialHp: Record<string, number>
  initialMp: Record<string, number>
  initialMorale: Record<string, number>
  initialStatusEffects: Record<string, string[]>
  knownEnemyWeaknesses: string[]
  knownEnemyAbilities: string[]
  environmentEffects: EnvironmentEffect[]
}

export type ExpeditionOutcome =
  | 'completeSuccess'
  | 'success'
  | 'partialSuccess'
  | 'failedObjective'
  | 'forcedRetreat'
  | 'lostExpedition'

export interface ExpeditionResult {
  request: ExpeditionRequest
  outcome: ExpeditionOutcome
  state: ExpeditionState
  party: Adventurer[]
}
