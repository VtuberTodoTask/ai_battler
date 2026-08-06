import { SeededRng } from '../rng/seededRng.ts'
import {
  AbilityDefinition,
  AbilityId,
  AbilityInstance,
  BaseStats,
  Enemy,
  EnemyArchetype,
  EnemyRank,
  EnemySpecies,
  EnemyTier,
  SkillSet,
  StatName,
  WeaknessDefinition,
  WeaknessInstance,
} from '../models/types.ts'
import {
  ABILITIES,
  ARCHETYPE_MAP,
  ArchetypeDefinition,
  ENEMY_NAME_CORES,
  ENEMY_NAME_PREFIXES,
  ENEMY_NAME_SUFFIXES,
  SPECIES_MAP,
  SpeciesDefinition,
  WEAKNESSES,
  WEAKNESS_MAP,
  abilityCountForRank,
} from '../../data/enemyData.ts'
import {
  ABILITY_THREAT_COST,
  ENEMY_BASE_THREAT,
  ENEMY_RANK_BASE,
  MAX_STAT_NORMAL,
  MIN_STAT,
  TIER_HP_MULTIPLIER,
  TIER_THREAT_MULTIPLIER,
} from '../balance/constants.ts'
import { WEAPONS, ARMORS } from '../../data/equipment.ts'
import { clamp, deepClone, round } from '../util.ts'

const STAT_NAMES: StatName[] = ['str', 'con', 'dex', 'int', 'per', 'wil', 'soc']

const MIN_BODY_SCALE = 0.7
const MAX_BODY_SCALE = 1.3

function scaleStats(stats: BaseStats, scale: number): BaseStats {
  const scaled = { ...stats } as BaseStats
  for (const name of STAT_NAMES) {
    scaled[name] = clamp(
      round(stats[name] * scale),
      MIN_STAT,
      MAX_STAT_NORMAL + 20,
    )
  }
  return scaled
}

const SKILL_FORMULAS: Record<keyof SkillSet, (s: BaseStats) => number> = {
  melee: (s) => round((s.str + s.dex) / 2),
  ranged: (s) => s.dex,
  defense: (s) => round((s.con + s.dex) / 2),
  tactics: (s) => s.int,
  attackMagic: (s) => round((s.int + s.wil) / 2),
  defenseMagic: (s) => s.wil,
  healing: (s) => round((s.int + s.wil) / 2),
  scouting: (s) => round((s.per + s.dex) / 2),
  stealth: (s) => round((s.dex + s.per) / 2),
  trapDetection: (s) => round((s.per + s.int) / 2),
  trapDisarm: (s) => round((s.dex + s.int) / 2),
  survival: (s) => round((s.con + s.per) / 2),
  monsterKnowledge: (s) => s.int,
  firstAid: (s) => round((s.int + s.dex) / 2),
  leadership: (s) => round((s.soc + s.wil) / 2),
}

const SKILL_BONUS_BY_ARCHETYPE: Record<EnemyArchetype, Partial<SkillSet>> = {
  assault: { melee: 10, defense: 5 },
  skirmisher: { ranged: 10, stealth: 5 },
  ambusher: { stealth: 15, ranged: 5 },
  tank: { defense: 15, melee: 5 },
  controller: { attackMagic: 10, defenseMagic: 5 },
  swarm: { melee: 5, defense: 5 },
}

function randomSpecies(rng: SeededRng): EnemySpecies {
  const all: EnemySpecies[] = [
    'humanoid',
    'beast',
    'undead',
    'construct',
    'aberration',
    'insect',
  ]
  return rng.pick(all)
}

function randomArchetypeForSpecies(
  rng: SeededRng,
  species: EnemySpecies,
): EnemyArchetype {
  const preferred = SPECIES_MAP[species].preferredArchetypes
  return rng.pick(preferred)
}

function randomRank(rng: SeededRng): EnemyRank {
  const roll = rng.d100()
  if (roll <= 25) return 'E'
  if (roll <= 50) return 'D'
  if (roll <= 70) return 'C'
  if (roll <= 85) return 'B'
  if (roll <= 95) return 'A'
  return 'S'
}

function randomTier(rng: SeededRng, allowedTiers?: EnemyTier[]): EnemyTier {
  const tiers: EnemyTier[] = allowedTiers ?? [
    'minion',
    'standard',
    'elite',
    'boss',
  ]
  const weights = tiers.map((t) =>
    t === 'standard' ? 3 : t === 'minion' ? 2 : t === 'elite' ? 1.5 : 0.3,
  )
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rng.next() * total
  for (let i = 0; i < tiers.length; i++) {
    r -= weights[i]
    if (r <= 0) return tiers[i]
  }
  return tiers[tiers.length - 1]
}

function generateName(
  rng: SeededRng,
  species: EnemySpecies,
  archetype: EnemyArchetype,
  tier: EnemyTier,
): string {
  const prefix = rng.pick(ENEMY_NAME_PREFIXES[species])
  const core = rng.pick(ENEMY_NAME_CORES[species])
  const suffix = rng.pick(ENEMY_NAME_SUFFIXES[archetype])
  const tierLabel = tier === 'boss' ? '王' : tier === 'elite' ? '長' : ''
  return `${prefix}${core}${suffix}${tierLabel}`
}

function generateStats(
  rng: SeededRng,
  rank: EnemyRank,
  archetype: ArchetypeDefinition,
  species: SpeciesDefinition,
): BaseStats {
  const base = ENEMY_RANK_BASE[rank]
  const stats = {} as BaseStats
  STAT_NAMES.forEach((stat) => {
    const archMod = archetype.statMods[stat] ?? 0
    const speciesMod = species.statMods?.[stat] ?? 0
    const individual = rng.integer(-5, 5)
    stats[stat] = clamp(
      base + archMod + speciesMod + individual,
      MIN_STAT,
      MAX_STAT_NORMAL + 20,
    )
  })
  return stats
}

function generateSkills(stats: BaseStats, archetype: EnemyArchetype): SkillSet {
  const skills = {} as SkillSet
  ;(Object.keys(SKILL_FORMULAS) as (keyof SkillSet)[]).forEach((k) => {
    const base = SKILL_FORMULAS[k](stats)
    const bonus = SKILL_BONUS_BY_ARCHETYPE[archetype][k] ?? 0
    skills[k] = clamp(base + bonus, 1, 120)
  })
  return skills
}

function abilityPoolForSpecies(species: EnemySpecies): AbilityDefinition[] {
  return ABILITIES.filter((a) => {
    if (species === 'undead' && a.id === 'poisonAttack') return false
    if (
      species === 'construct' &&
      (a.id === 'poisonAttack' || a.id === 'bleedAttack')
    )
      return false
    return true
  })
}

export function calculateAbilityThreat(abilities: AbilityInstance[]): number {
  return abilities.reduce((total, a) => {
    return total + (ABILITY_THREAT_COST[a.abilityId as AbilityId] ?? 0)
  }, 0)
}

function generateAbilities(
  rng: SeededRng,
  rank: EnemyRank,
  species: EnemySpecies,
): AbilityInstance[] {
  const { min, max } = abilityCountForRank(rank)
  const count = rng.integer(min, max)
  const pool = abilityPoolForSpecies(species)
  const available = rng.shuffle([...pool])
  return available.slice(0, count).map((a) => ({
    abilityId: a.id,
    name: a.name,
  }))
}

function generateAbilitiesForCount(
  seed: string,
  rank: EnemyRank,
  species: EnemySpecies,
  count: number,
): AbilityInstance[] {
  const rng = new SeededRng(`${seed}:abilities:${rank}`)
  const pool = abilityPoolForSpecies(species)
  const available = rng.shuffle([...pool])
  return available.slice(0, count).map((a) => ({
    abilityId: a.id,
    name: a.name,
  }))
}

function generateWeaknesses(
  rng: SeededRng,
  species: EnemySpecies,
): WeaknessInstance[] {
  const guaranteed: WeaknessDefinition[] = []
  if (species === 'undead') guaranteed.push(WEAKNESS_MAP.holy)
  if (species === 'construct') {
    guaranteed.push(WEAKNESS_MAP.powerCore)
    guaranteed.push(WEAKNESS_MAP.joints)
  }
  if (species === 'insect') guaranteed.push(WEAKNESS_MAP.fire)

  const count = rng.integer(1, 2)
  const pool = rng.shuffle([...WEAKNESSES])
  const picks: WeaknessDefinition[] = [...guaranteed]
  while (picks.length < count + guaranteed.length && pool.length > 0) {
    const next = pool.pop()
    if (next && !picks.find((w) => w.id === next.id)) {
      picks.push(next)
    }
  }
  return picks.slice(0, count + guaranteed.length).map((w) => ({
    weaknessId: w.id,
    name: w.name,
    known: species !== 'aberration',
  }))
}

function generateBehavior(
  rng: SeededRng,
  archetype: ArchetypeDefinition,
  species: EnemySpecies,
): Enemy['behavior'] {
  const base = archetype.defaultBehavior
  const isMindless = species === 'undead' || species === 'construct'
  return {
    aggression: clamp(base.aggression + rng.integer(-10, 10), 0, 100),
    caution: clamp(base.caution + rng.integer(-10, 10), 0, 100),
    targetPreference: base.targetPreference,
    retreatThreshold: isMindless
      ? 0
      : clamp(base.retreatThreshold + rng.integer(-10, 10), 0, 100),
    protectsLeader: base.protectsLeader,
    usesAbilitiesFirst: base.usesAbilitiesFirst,
  }
}

function averageAbilityCost(): number {
  const values = Object.values(ABILITY_THREAT_COST)
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function expectedAbilityThreat(rank: EnemyRank): number {
  const { min, max } = abilityCountForRank(rank)
  return ((min + max) / 2) * averageAbilityCost()
}

export function pickRankForTarget(target: number, tier: EnemyTier): EnemyRank {
  const ranks: EnemyRank[] = ['E', 'D', 'C', 'B', 'A', 'S']
  let bestRank: EnemyRank = 'E'
  let bestScore = Infinity
  for (const rank of ranks) {
    const base = ENEMY_BASE_THREAT[rank] * TIER_THREAT_MULTIPLIER[tier]
    const expected = base + expectedAbilityThreat(rank)
    if (expected <= 0) continue
    const score = Math.abs(Math.log(expected / target))
    if (score < bestScore) {
      bestScore = score
      bestRank = rank
    }
  }
  return bestRank
}

export interface EnemyGenerationOverrides {
  rank?: EnemyRank
  species?: EnemySpecies
  archetype?: EnemyArchetype
  tier?: EnemyTier
  allowedTiers?: EnemyTier[]
  rankLimit?: EnemyRank
  threatScale?: number
  targetThreat?: number
  abilities?: AbilityInstance[]
}

function rankIndex(rank: EnemyRank): number {
  const order: EnemyRank[] = ['E', 'D', 'C', 'B', 'A', 'S', 'DISASTER']
  return order.indexOf(rank)
}

interface BuildCandidate {
  rank: EnemyRank
  abilities: AbilityInstance[]
  abilityThreat: number
  baseThreat: number
  bodyScale: number
  actualThreat: number
  inRange: boolean
  error: number
}

function findBestBuild(
  seed: string,
  species: EnemySpecies,
  archetype: EnemyArchetype,
  tier: EnemyTier,
  targetThreat: number,
  suggestedRank?: EnemyRank,
): BuildCandidate {
  const ranks: EnemyRank[] = ['E', 'D', 'C', 'B', 'A', 'S']
  const startIndex = suggestedRank ? ranks.indexOf(suggestedRank) : -1
  const searchRanks =
    startIndex >= 0
      ? [
          ...ranks.slice(0, startIndex + 1).reverse(),
          ...ranks.slice(startIndex + 1),
        ]
      : ranks

  let best: BuildCandidate | undefined

  for (const rank of searchRanks) {
    const baseThreat = ENEMY_BASE_THREAT[rank] * TIER_THREAT_MULTIPLIER[tier]
    if (baseThreat <= 0) continue
    const maxCount = abilityCountForRank(rank).max

    for (let count = 0; count <= maxCount; count++) {
      const abilities = generateAbilitiesForCount(
        `${seed}:build:${rankIndex(rank)}`,
        rank,
        species,
        count,
      )
      const abilityThreat = calculateAbilityThreat(abilities)
      const rawScale = (targetThreat - abilityThreat) / baseThreat
      const bodyScale = clamp(rawScale, MIN_BODY_SCALE, MAX_BODY_SCALE)
      const actualThreat = baseThreat * bodyScale + abilityThreat
      const error = Math.abs(actualThreat - targetThreat)
      const inRange = rawScale >= MIN_BODY_SCALE && rawScale <= MAX_BODY_SCALE

      const candidate: BuildCandidate = {
        rank,
        abilities,
        abilityThreat,
        baseThreat,
        bodyScale,
        actualThreat,
        inRange,
        error,
      }

      if (best === undefined) {
        best = candidate
        continue
      }

      if (candidate.inRange && !best.inRange) {
        best = candidate
      } else if (candidate.inRange === best.inRange) {
        if (candidate.error < best.error) {
          best = candidate
        }
      }
    }
  }

  return best as BuildCandidate
}

export function generateEnemy(
  seed: string,
  overrides: EnemyGenerationOverrides = {},
): Enemy {
  const rng = new SeededRng(seed)
  const species = overrides.species ?? randomSpecies(rng)
  const archetype =
    overrides.archetype ?? randomArchetypeForSpecies(rng, species)
  const tier = overrides.tier ?? randomTier(rng, overrides.allowedTiers)

  const archetypeDef = ARCHETYPE_MAP[archetype]
  const speciesDef = SPECIES_MAP[species]

  let rank: EnemyRank
  let abilities: AbilityInstance[]
  let abilityThreat: number
  let baseThreat: number
  let bodyScale: number
  let actualThreat: number

  if (overrides.targetThreat !== undefined) {
    rank = overrides.rank ?? pickRankForTarget(overrides.targetThreat, tier)
    const build = findBestBuild(
      seed,
      species,
      archetype,
      tier,
      overrides.targetThreat,
      rank,
    )
    rank = build.rank
    abilities = build.abilities
    abilityThreat = build.abilityThreat
    baseThreat = build.baseThreat
    bodyScale = build.bodyScale
    actualThreat = build.actualThreat
  } else {
    rank = overrides.rank ?? randomRank(rng)
    abilities = overrides.abilities ?? generateAbilities(rng, rank, species)
    abilityThreat = calculateAbilityThreat(abilities)
    baseThreat = ENEMY_BASE_THREAT[rank] * TIER_THREAT_MULTIPLIER[tier]
    bodyScale = overrides.threatScale ?? 1
    actualThreat = baseThreat * bodyScale + abilityThreat
  }

  const statScale = Math.sqrt(bodyScale)
  const rawStats = generateStats(rng, rank, archetypeDef, speciesDef)
  const stats = scaleStats(rawStats, statScale)
  const skills = generateSkills(stats, archetype)
  const maxHp = round((25 + round(stats.con * 0.7)) * TIER_HP_MULTIPLIER[tier])
  const morale =
    species === 'undead' || species === 'construct'
      ? 100
      : 20 + round(stats.wil * 0.5)

  const weaknesses = generateWeaknesses(rng, species)
  const behavior = generateBehavior(rng, archetypeDef, species)

  const enemy: Enemy = {
    id: `${rank}-${species}-${archetype}-${tier}-${seed}`,
    seed,
    name: generateName(rng, species, archetype, tier),
    rank,
    species,
    archetype,
    stats,
    skills,
    maxHp,
    currentHp: maxHp,
    morale,
    threatCost: actualThreat,
    tier,
    abilities,
    weaknesses,
    behavior,
    statusEffects: [],
  }

  if (species === 'humanoid') {
    const weaponId =
      archetype === 'skirmisher'
        ? 'shortbow'
        : archetype === 'controller' || archetype === 'ambusher'
          ? 'wand'
          : 'longsword'
    const armorId = archetype === 'tank' ? 'heavy' : 'leather'
    const weapon = deepClone(WEAPONS[weaponId])
    const armor = deepClone(ARMORS[armorId])
    if (bodyScale !== 1) {
      weapon.damage = round(weapon.damage * statScale)
    }
    enemy.equipment = { weapon, armor }
  }

  return enemy
}

export function enemyFromSeed(seed: string, rank: EnemyRank): Enemy {
  return generateEnemy(seed, { rank })
}
