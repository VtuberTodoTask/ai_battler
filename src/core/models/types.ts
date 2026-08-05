import { z } from 'zod'

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

export interface WeaknessDefinition {
  id: string
  name: string
  element?: ElementType
  multiplier?: number
  effect?:
    | 'damage'
    | 'defenseDown'
    | 'stunChance'
    | 'disable'
    | 'moraleDown'
    | 'fleeChance'
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
  'poisoned' | 'bleeding' | 'stunned' | 'weakened' | 'guarded' | 'frightened'

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
  equipment: EquipmentSet
  statusEffects: StatusEffect[]
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

export interface EncounterGenerationOptions {
  seed: string
  partyThreat: number
  difficulty: 'easy' | 'normal' | 'hard' | 'deadly'
  allowedSpecies?: EnemySpecies[]
  bossAllowed?: boolean
  maxEnemyCount?: number
}

export type ContactResultType =
  'greatSuccess' | 'success' | 'failure' | 'greatFailure'

export interface ContactResult {
  type: ContactResultType
  partyScouting: number
  enemyStealth: number
  successChance: number
  roll: number
  effects: Record<string, unknown>
}

export type BattleOutcome =
  | 'victory'
  | 'costlyVictory'
  | 'partialVictory'
  | 'retreat'
  | 'defeat'
  | 'totalLoss'
  | 'stalemate'

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
}

export interface InjuryResult {
  adventurerId: string
  name: string
  severity: number
  survivalRoll: number
  survivalChance: number
  category: 'light' | 'serious' | 'critical' | 'permanentInjury' | 'dead'
}

export interface BattleResult {
  seed: string
  outcome: BattleOutcome
  rounds: number
  survivingAdventurers: string[]
  incapacitatedAdventurers: string[]
  deadAdventurers: string[]
  survivingEnemies: string[]
  defeatedEnemies: string[]
  escapedEnemies: string[]
  injuries: InjuryResult[]
  discoveredWeaknesses: string[]
  partyDamageDealt: number
  enemyDamageDealt: number
  contactResult: ContactResult
  retreatResult?: RetreatResult
  logs: BattleLogEntry[]
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
})
