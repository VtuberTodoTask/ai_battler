import type {
  Adventurer,
  AdventurerRank,
  BattleOutcome,
  BattleResult,
  Difficulty,
  EncounterShape,
  EnemySpecies,
  SkillName,
  StatusEffect,
} from '../models/types.ts'
import type { EncounterPlan } from '../generators/encounterGenerator.ts'
import type { SeededRng } from '../rng/seededRng.ts'

export type ExpeditionPhase =
  | 'preparation'
  | 'approach'
  | 'contact'
  | 'exploration'
  | 'objective'
  | 'battle'
  | 'return'
  | 'aftermath'

export type ImplementedObjectiveType =
  'investigation' | 'elimination' | 'rescue' | 'escort' | 'retrieval'

export type ObjectiveType = ImplementedObjectiveType | 'retrieval' | 'survey'

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
  battleIntel?: BattleIntel
}

export interface HiddenInformation {
  id: string
  name: string
  description: string
  difficulty: number
  requiredSkill?: SkillName
  battleIntel?: BattleIntel
}

export interface BattleIntel {
  kind: 'weakness' | 'ability'
  id: string
  name: string
  targetSpecies?: EnemySpecies
}

export interface DiscoveredInformation {
  id: string
  name: string
  description: string
  source: string
  completeness: 'fragment' | 'complete'
  battleIntel?: BattleIntel
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
  sourceType?: 'expedition' | 'battle'
  sourceId?: string
}

export interface InvestigationObjectiveState {
  type: 'investigation'
}

export interface EliminationObjectiveState {
  type: 'elimination'
  mode: 'allEnemies'
  confirmationRequired: boolean
  requiredTargetIds: string[]
  defeatedTargetIds: string[]
  escapedTargetIds: string[]
  survivingTargetIds: string[]
  unknownTargetIds: string[]
  confirmedTargetIds: string[]
  progress: number
  completed: boolean
}

export interface RescueObjectiveState {
  type: 'rescue'
  targetId: string
  targetName: string
  maxHp: number
  currentHp: number
  mobility: RescueTargetMobility
  statusEffects: StatusEffect[]
  located: boolean
  reached: boolean
  stabilized: boolean
  protectorId?: string
  evacuated: boolean
  returned: boolean
  abandoned: boolean
  battleExposureDamage: number
  returnDamage: number
  progress: number
  completed: boolean
}

export interface EscortObjectiveState {
  type: 'escort'
  targetId: string
  targetName: string
  destinationId: string
  destinationName: string
  maxHp: number
  currentHp: number
  mobility: EscortTargetMobility
  statusEffects: StatusEffect[]
  travelStress: number
  accompanying: boolean
  departed: boolean
  coordinated: boolean
  routeProgress: number
  protectorId?: string
  travelDamage: number
  battleExposureDamage: number
  careProvided: boolean
  careHealing: number
  careDamage: number
  destinationReached: boolean
  handoffStatus: EscortHandoffStatus
  delivered: boolean
  returnedToOrigin: boolean
  stranded: boolean
  progress: number
  completed: boolean
}

export type RetrievalTargetBulk = 'portable' | 'bulky' | 'heavy'

export type RetrievalHandlingType = 'standard' | 'delicate' | 'arcane'

export type RetrievalFragility = 'rugged' | 'standard' | 'fragile'

export interface RetrievalTargetConfig {
  id: string
  name: string
  initialIntegrity: number
  minimumAcceptableIntegrity: number
  bulk: RetrievalTargetBulk
  handling: RetrievalHandlingType
  fragility: RetrievalFragility
  locationKnown: boolean
  discoveryDifficulty: number
  accessDifficulty: number
  securingDifficulty: number
  protectionDifficulty: number
  extractionDifficulty: number
}

export interface RetrievalObjectiveConfig {
  target: RetrievalTargetConfig
}

export interface RetrievalObjectiveState {
  type: 'retrieval'
  targetId: string
  targetName: string
  initialIntegrity: number
  minimumAcceptableIntegrity: number
  currentIntegrity: number
  bulk: RetrievalTargetBulk
  handling: RetrievalHandlingType
  fragility: RetrievalFragility
  located: boolean
  reached: boolean
  protectorId?: string
  secured: boolean
  protectedForTransport: boolean
  extracted: boolean
  returned: boolean
  abandoned: boolean
  lostDuringReturn: boolean
  carrierIds: string[]
  battleExposureDamage: number
  securingDamage: number
  extractionDamage: number
  progress: number
  completed: boolean
}

export type ExpeditionObjectiveState =
  | InvestigationObjectiveState
  | EliminationObjectiveState
  | RescueObjectiveState
  | EscortObjectiveState
  | RetrievalObjectiveState

export interface ExpeditionState {
  currentPhase: ExpeditionPhase
  elapsedTime: number
  partyHp: Record<string, number>
  partyMp: Record<string, number>
  partyMorale: Record<string, number>
  partyStatusEffects: Record<string, StatusEffect[]>
  supplies: {
    food: number
    medicine: number
    tools: number
  }
  information: DiscoveredInformation[]
  injuries: ExpeditionInjury[]
  casualties: string[]
  incapacitated: string[]
  objectiveProgress: number
  objectiveCompleted: boolean
  discoveredThreats: ExpeditionFeature[]
  avoidedThreats: ExpeditionFeature[]
  logs: ExpeditionLogEntry[]
  battleEntrySnapshot?: BattleEntryConditions
  battles: ExpeditionBattleRecord[]
  battleOutcome?: BattleOutcome
  objectiveState?: ExpeditionObjectiveState
  metadata?: Record<string, unknown>
}

export interface ExpeditionBattleConfig {
  enabled: boolean
  seed: string
  triggerPhase: 'afterExploration'
  shape?: EncounterShape
  allowedSpecies?: EnemySpecies[]
  bossAllowed?: boolean
  recommendedPartySize?: number
}

export type RescueTargetMobility = 'mobile' | 'assisted' | 'immobile'

export type EscortTargetMobility = 'mobile' | 'assisted' | 'immobile'

export type EscortHandoffRequirement = 'none' | 'standard'

export type EscortHandoffStatus =
  'notStarted' | 'notRequired' | 'pending' | 'completed' | 'failed'

export interface EscortTargetConfig {
  id: string
  name: string
  maxHp: number
  initialHp: number
  mobility: EscortTargetMobility
  initialStatusEffects?: StatusEffect[]
  initialStress: number
  coordinationDifficulty: number
  routeDifficulty: number
  protectionDifficulty: number
  careDifficulty: number
}

export interface EscortDestinationConfig {
  id: string
  name: string
  handoffRequirement: EscortHandoffRequirement
  handoffDifficulty: number
}

export interface EscortObjectiveConfig {
  target: EscortTargetConfig
  destination: EscortDestinationConfig
}

export interface RescueTargetConfig {
  id: string
  name: string
  maxHp: number
  initialHp: number
  mobility: RescueTargetMobility
  initialStatusEffects?: StatusEffect[]
  locationKnown: boolean
  discoveryDifficulty: number
  accessDifficulty: number
  stabilizationDifficulty: number
  evacuationDifficulty: number
}

export interface RescueObjectiveConfig {
  target: RescueTargetConfig
}

export interface EliminationObjectiveConfig {
  mode: 'allEnemies'
  confirmationRequired: boolean
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
  battle?: ExpeditionBattleConfig
  elimination?: EliminationObjectiveConfig
  rescue?: RescueObjectiveConfig
  escort?: EscortObjectiveConfig
  retrieval?: RetrievalObjectiveConfig
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
  initialStatusEffects: Record<string, StatusEffect[]>
  knownEnemyWeaknesses: BattleIntel[]
  knownEnemyAbilities: BattleIntel[]
  environmentEffects: EnvironmentEffect[]
}

export interface ExpeditionBattleRecord {
  id: string
  phase: ExpeditionPhase
  trigger: string
  encounterSeed: string
  combatSeed: string
  entrySnapshot: BattleEntryConditions
  enemyIds: string[]
  enemyComposition: string
  outcome: BattleOutcome
  rounds: number
  survivingAdventurerIds: string[]
  incapacitatedAdventurerIds: string[]
  deadAdventurerIds: string[]
  knownEnemyWeaknesses: BattleIntel[]
  knownEnemyAbilities: BattleIntel[]
  matchedWeaknessIntel: BattleIntel[]
  unmatchedWeaknessIntel: BattleIntel[]
  matchedAbilityIntel: BattleIntel[]
  unmatchedAbilityIntel: BattleIntel[]
  discoveredWeaknesses: string[]
  injuries: ExpeditionInjury[]
  result: BattleResult
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

export interface ExpeditionExecutionContext {
  request: ExpeditionRequest
  party: Adventurer[]
  state: ExpeditionState
  rng: SeededRng
}

export type ExpeditionOutcomeContext = ExpeditionExecutionContext

export interface ExpeditionFlowDefinition {
  preparation: boolean
  approach: boolean
  exploration: boolean
  battle: 'none' | 'optional' | 'required'
  objective: boolean
  objectiveAfterForcedBattleRetreat?: boolean
  return: boolean
  aftermath: boolean
}

export interface ExpeditionBattleResolvedContext extends ExpeditionExecutionContext {
  battleId: string
  battleResult: BattleResult
  battleRecord: ExpeditionBattleRecord
  initialEnemyIds: string[]
}

export interface ExpeditionBattleExecutionResult {
  battleId: string
  battleResult: BattleResult
  battleRecord: ExpeditionBattleRecord
  initialEnemyIds: string[]
}

export interface ExpeditionObjectiveHandler {
  flow: ExpeditionFlowDefinition
  validateRequest(request: ExpeditionRequest): void
  initializeObjectiveState(request: ExpeditionRequest): ExpeditionObjectiveState
  afterPreparation?(context: ExpeditionExecutionContext): void
  beforeBattle?(context: ExpeditionExecutionContext): void
  onBattleResolved?(context: ExpeditionBattleResolvedContext): void
  runObjective(context: ExpeditionExecutionContext): void
  beforeReturn?(context: ExpeditionExecutionContext): void
  afterReturn?(context: ExpeditionExecutionContext): void
  finalizeObjectiveState(context: ExpeditionExecutionContext): {
    objectiveCompleted: boolean
    progressFact: string
  }
  determineOutcome(context: ExpeditionOutcomeContext): ExpeditionOutcome
}
