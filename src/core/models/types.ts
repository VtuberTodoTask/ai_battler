import { z } from 'zod'
import type {
  CharacterIdentity,
  CharacterLifeBackground,
  CharacterRomanticProfile,
  CulturalInfluence,
  PersonalityContradiction,
} from '../identity/types.ts'

export const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'] as const
export const ENEMY_RANKS = [...RANKS, 'DISASTER'] as const

export const ADVENTURER_ROLES = [
  'vanguard',
  'guardian',
  'scout',
  'ranger',
  'mage',
  'healer',
  'support',
] as const

export const ENEMY_SPECIES = [
  'humanoid',
  'beast',
  'undead',
  'construct',
  'aberration',
  'insect',
] as const

export const ENEMY_ARCHETYPES = [
  'assault',
  'skirmisher',
  'ambusher',
  'tank',
  'controller',
  'swarm',
] as const

export const ENEMY_TIERS = ['minion', 'standard', 'elite', 'boss'] as const

export const ENCOUNTER_SHAPES = [
  'standard',
  'eliteGroup',
  'swarm',
  'boss',
] as const

export type EncounterShape = (typeof ENCOUNTER_SHAPES)[number]

export const ELEMENTS = [
  'physical',
  'fire',
  'ice',
  'lightning',
  'holy',
  'dark',
  'poison',
] as const

export type AdventurerRank = (typeof RANKS)[number]
export type EnemyRank = (typeof ENEMY_RANKS)[number]
export type AdventurerRole = (typeof ADVENTURER_ROLES)[number]
export type EnemySpecies = (typeof ENEMY_SPECIES)[number]
export type EnemyArchetype = (typeof ENEMY_ARCHETYPES)[number]
export type EnemyTier = (typeof ENEMY_TIERS)[number]
export type ElementType = (typeof ELEMENTS)[number]

export interface BaseStats {
  str: number
  con: number
  dex: number
  int: number
  per: number
  wil: number
  soc: number
}

export type StatName = keyof BaseStats

export interface SkillSet {
  melee: number
  ranged: number
  defense: number
  tactics: number
  attackMagic: number
  defenseMagic: number
  healing: number
  scouting: number
  stealth: number
  trapDetection: number
  trapDisarm: number
  survival: number
  monsterKnowledge: number
  firstAid: number
  leadership: number
}

export type SkillName = keyof SkillSet

export interface Personality {
  bravery: number
  caution: number
  cooperation: number
  discipline: number
  altruism: number
  greed: number
}

export interface CharacterNarrativeProfile {
  temperament?: string
  socialStyle?: string
  values?: string[]
  flaws?: string[]
  fears?: string[]
  habits?: string[]
  speechStyle?: string
  beliefs?: string[]
  attitudes?: string[]
  contradictions?: PersonalityContradiction[]
}

export interface Weapon {
  id: string
  name: string
  kind: 'melee' | 'ranged' | 'magic'
  damage: number
  element?: ElementType
  attribute?: string
}

export interface Armor {
  id: string
  name: string
  reduction: number
}

export interface EquipmentSet {
  weapon: Weapon
  armor: Armor
}

export type TraitEffect = Partial<Record<string, number | boolean>>

export interface TraitDefinition {
  id: string
  name: string
  positive: boolean
  effects: TraitEffect
  excludes?: string[]
}

export interface TraitInstance {
  traitId: string
  name: string
}

export type AbilityEffect = Partial<Record<string, number | boolean | string>>

export type AbilityId =
  | 'flight'
  | 'poisonAttack'
  | 'bleedAttack'
  | 'areaAttack'
  | 'revive'
  | 'regeneration'
  | 'frontDefense'
  | 'magicResist'
  | 'physicalResist'
  | 'darknessBoost'
  | 'corpseExplosion'
  | 'summon'
  | 'taunt'
  | 'fear'
  | 'healBlock'
  | 'counter'
  | 'stealthStart'
  | 'swarmCoordination'

export interface AbilityDefinition {
  id: string
  name: string
  description: string
  threatLevel: 'minor' | 'standard' | 'strong' | 'extreme'
  effects: AbilityEffect
}

export interface AbilityInstance {
  abilityId: string
  name: string
}

export type WeaknessEffect =
  | 'damage'
  | 'defenseDown'
  | 'stunChance'
  | 'disable'
  | 'moraleDown'
  | 'fleeChance'

export interface WeaknessDefinition {
  id: string
  name: string
  element?: ElementType
  multiplier?: number
  effect?: WeaknessEffect
}

export interface WeaknessInstance {
  weaknessId: string
  name: string
  known: boolean
}

export interface EnemyBehavior {
  aggression: number
  caution: number
  targetPreference:
    'lowestHp' | 'highestThreat' | 'healer' | 'mage' | 'random' | 'frontline'
  retreatThreshold: number
  protectsLeader: boolean
  usesAbilitiesFirst: boolean
}

export interface StatusEffect {
  type: StatusEffectType
  value?: number
  duration: number
  sourceId: string
}

export type StatusEffectType =
  | 'poisoned'
  | 'bleeding'
  | 'stunned'
  | 'weakened'
  | 'guarded'
  | 'frightened'
  | 'healBlocked'
  | 'stealthed'
  | 'defenseDown'

export interface Adventurer {
  id: string
  seed: string
  name: string
  rank: AdventurerRank
  role: AdventurerRole
  level: number
  stats: BaseStats
  skills: SkillSet
  maxHp: number
  currentHp: number
  maxMp: number
  currentMp: number
  morale: number
  traits: TraitInstance[]
  personality: Personality
  narrativeProfile?: CharacterNarrativeProfile
  equipment: EquipmentSet
  statusEffects: StatusEffect[]

  identity?: CharacterIdentity
  lifeBackground?: CharacterLifeBackground
  culturalInfluences?: CulturalInfluence[]
  romanticProfile?: CharacterRomanticProfile
  contradiction?: PersonalityContradiction
}

export interface Enemy {
  id: string
  seed: string
  name: string
  rank: EnemyRank
  species: EnemySpecies
  archetype: EnemyArchetype
  stats: BaseStats
  skills: SkillSet
  maxHp: number
  currentHp: number
  morale: number
  threatCost: number
  tier: EnemyTier
  abilities: AbilityInstance[]
  weaknesses: WeaknessInstance[]
  behavior: EnemyBehavior
  equipment?: EquipmentSet
  statusEffects: StatusEffect[]
}

export interface AdventurerGenerationOptions {
  seed: string
  rank?: AdventurerRank
  role?: AdventurerRole
  count?: number
}

export type Difficulty = 'easy' | 'normal' | 'hard' | 'deadly'

export interface EncounterGenerationOptions {
  seed: string
  partyThreat: number
  difficulty: Difficulty
  allowedSpecies?: EnemySpecies[]
  bossAllowed?: boolean
  maxEnemyCount?: number
  shape?: EncounterShape
  planSeed?: string
  partySize?: number
}

export type ContactResultType =
  'greatSuccess' | 'success' | 'failure' | 'greatFailure'

export interface ContactEffects {
  firstRoundHitBonus?: number
  initiativeBonus?: number
  enemyInitiativeBonus?: number
  initialDamage?: number
  moralePenalty?: number
  stunnedEnemies?: number
  side?: 'party' | 'enemy'
}

export interface ContactResult {
  type: ContactResultType
  partyScouting: number
  enemyStealth: number
  successChance: number
  roll: number
  effects: ContactEffects
}

export interface BattleContext {
  lighting: 'dark' | 'bright' | 'normal'
  noise: number
  water: boolean
  smoke: boolean
}

export type BattleOutcome =
  | 'victory'
  | 'costlyVictory'
  | 'partialVictory'
  | 'retreat'
  | 'defeat'
  | 'totalLoss'
  | 'stalemate'

export type RetreatTriggerReason =
  | 'halfIncapacitated'
  | 'healerLostWithWounded'
  | 'lowPartyHp'
  | 'lowMorale'
  | 'overwhelmed'
  | 'memberProposal'
  | 'criticalMember'
  | 'fearPanic'
  | 'individualEscape'

export interface RetreatDiagnostic {
  reason: RetreatTriggerReason
  round: number
  success: boolean
  successChance: number
  roll: number
  aliveCount: number
  incapacitatedCount: number
  healerAlive: boolean
  partyHpRatio: number
  averageMorale: number
  moraleThreshold: number
  retreatHpThreshold: number
  partyThreat: number
  enemyThreat: number
  matchedReasons: RetreatTriggerReason[]

  proposerId?: string
  proposerRole?: string
  proposerHpRatio?: number
  proposerMorale?: number
  leaderId?: string
  approved?: boolean
  attempted?: boolean
  attemptCount?: number
}

export interface RetreatResult {
  side: 'party' | 'enemy'
  success: boolean
  roll: number
  chance: number
}

export interface BattleLogEntry {
  round: number
  phase: 'contact' | 'combat' | 'retreat' | 'aftermath'
  actorId?: string
  targetIds?: string[]
  actionType: string
  roll?: number
  successChance?: number
  result: string
  damage?: number
  statusApplied?: string[]
  metadata?: Record<string, unknown>
  /**
   * Authoritative structured facts, additive to the loosely-typed fields
   * above — consumers that need certainty (e.g. Presentation projections)
   * should read these instead of inferring from `damage`/`result`/message
   * text. Populated only where the acting code already has the fact on
   * hand; absent (not false/0) when not applicable to this entry's
   * `actionType`.
   */
  /** Whether an attack-like action actually connected. Never infer this
   * from `typeof damage === 'number'` — a miss also carries `damage: 0`. */
  hit?: boolean
  /** Whether an attack-like action landed as a critical hit. */
  critical?: boolean
  /** Actual HP restored by a heal/regen/revive action, post-clamp to the
   * target's missing HP — never the same value space as `damage`. */
  healAmount?: number
  /** Signed change to the actor's MP caused by this action (negative for
   * consumption, positive for recovery). */
  mpDelta?: number
  /** Status effect types that were actively removed by this action (e.g. a
   * heal clearing poison/bleeding) — distinct from a status naturally
   * expiring, which uses `actionType: 'statusExpired'`. */
  statusRemoved?: string[]
  /** Full authoritative `StatusEffect` object for each type listed in
   * `statusApplied`, captured immediately after the mutation resolved
   * (`../battle/actions.ts` `collectStatusEffects`) — `duration`/`value`/
   * `sourceId` are Gameplay Facts too, not just `type` (Phase 9.8.3).
   * Additive alongside `statusApplied`, which stays a bare type list for
   * existing consumers. */
  statusEffectsApplied?: StatusEffect[]
}

export interface InjuryResult {
  adventurerId: string
  name: string
  severity: number
  survivalRoll: number
  survivalChance: number
  category: 'light' | 'serious' | 'critical' | 'permanentInjury' | 'dead'
}

export interface BattleOptions {
  context?: BattleContext
  forcedContactType?: 'success' | 'failure'
}

export interface TrialFingerprint {
  partyIds: string[]
  partyRoles: AdventurerRole[]
  enemyIds: string[]
  enemyComposition: string
}

export interface BattleParticipantFinalState {
  id: string
  currentHp: number
  currentMp: number
  morale: number
  statusEffects: StatusEffect[]
  alive: boolean
  incapacitated: boolean
  dead: boolean
}

export interface BattleResult {
  seed: string
  outcome: BattleOutcome
  rounds: number
  survivingAdventurers: string[]
  incapacitatedAdventurers: string[]
  deadAdventurers: string[]
  finalAdventurerStates: BattleParticipantFinalState[]
  survivingEnemies: string[]
  defeatedEnemies: string[]
  escapedEnemies: string[]
  injuries: InjuryResult[]
  discoveredWeaknesses: string[]
  partyDamageDealt: number
  enemyDamageDealt: number
  abilityUsage: Record<string, number>
  contactResult: ContactResult
  retreatResult?: RetreatResult
  retreatDiagnostic?: RetreatDiagnostic
  retreatAttempts?: RetreatDiagnostic[]
  logs: BattleLogEntry[]
  adventurerActionCount: number
  enemyActionCount: number
}

export const zAdventurerRank = z.enum(RANKS)
export const zEnemyRank = z.enum(ENEMY_RANKS)
export const zAdventurerRole = z.enum(ADVENTURER_ROLES)
export const zEnemySpecies = z.enum(ENEMY_SPECIES)
export const zEnemyArchetype = z.enum(ENEMY_ARCHETYPES)
export const zEnemyTier = z.enum(ENEMY_TIERS)

export const zAdventurerGenerationOptions = z.object({
  seed: z.string(),
  rank: zAdventurerRank.optional(),
  role: zAdventurerRole.optional(),
  count: z.number().int().min(1).optional(),
})

export const zEncounterGenerationOptions = z.object({
  seed: z.string(),
  partyThreat: z.number().nonnegative(),
  difficulty: z.enum(['easy', 'normal', 'hard', 'deadly']),
  allowedSpecies: z.array(zEnemySpecies).optional(),
  bossAllowed: z.boolean().optional(),
  maxEnemyCount: z.number().int().min(1).optional(),
  shape: z.enum(ENCOUNTER_SHAPES).optional(),
  planSeed: z.string().optional(),
  partySize: z.number().int().min(1).optional(),
})
