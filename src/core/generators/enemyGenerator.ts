import { SeededRng } from '../rng/seededRng.ts'
import {
  AbilityDefinition,
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
  ABILITY_MAP,
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
  ABILITY_THREAT_BONUS,
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

function generateAbilities(
  rng: SeededRng,
  rank: EnemyRank,
  species: EnemySpecies,
): AbilityInstance[] {
  const { min, max } = abilityCountForRank(rank)
  const count = rng.integer(min, max)
  const pool = ABILITIES.filter((a) => {
    if (species === 'undead' && a.id === 'poisonAttack') return false
    if (
      species === 'construct' &&
      (a.id === 'poisonAttack' || a.id === 'bleedAttack')
    )
      return false
    return true
  })
  const picked: AbilityDefinition[] = []
  const available = rng.shuffle([...pool])
  for (let i = 0; i < count && i < available.length; i++) {
    picked.push(available[i])
  }
  return picked.map((a) => ({ abilityId: a.id, name: a.name }))
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

export interface EnemyGenerationOverrides {
  rank?: EnemyRank
  species?: EnemySpecies
  archetype?: EnemyArchetype
  tier?: EnemyTier
  allowedTiers?: EnemyTier[]
  rankLimit?: EnemyRank
}

export function generateEnemy(
  seed: string,
  overrides: EnemyGenerationOverrides = {},
): Enemy {
  const rng = new SeededRng(seed)
  const rank = overrides.rank ?? randomRank(rng)
  const species = overrides.species ?? randomSpecies(rng)
  const archetype =
    overrides.archetype ?? randomArchetypeForSpecies(rng, species)
  const tier = overrides.tier ?? randomTier(rng, overrides.allowedTiers)

  const archetypeDef = ARCHETYPE_MAP[archetype]
  const speciesDef = SPECIES_MAP[species]

  const stats = generateStats(rng, rank, archetypeDef, speciesDef)
  const skills = generateSkills(stats, archetype)
  const maxHp = round((25 + round(stats.con * 0.7)) * TIER_HP_MULTIPLIER[tier])
  const morale =
    species === 'undead' || species === 'construct'
      ? 100
      : 20 + round(stats.wil * 0.5)

  const abilities = generateAbilities(rng, rank, species)
  const baseThreat = ENEMY_BASE_THREAT[rank] * TIER_THREAT_MULTIPLIER[tier]
  const abilityThreat = abilities.reduce((total, a) => {
    const def = ABILITY_MAP[a.abilityId]
    if (!def) return total
    return total + baseThreat * ABILITY_THREAT_BONUS[def.threatLevel]
  }, 0)
  const threatCost = round(baseThreat + abilityThreat)

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
    threatCost,
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
    enemy.equipment = {
      weapon: deepClone(WEAPONS[weaponId]),
      armor: deepClone(ARMORS[armorId]),
    }
  }

  return enemy
}

export function enemyFromSeed(seed: string, rank: EnemyRank): Enemy {
  return generateEnemy(seed, { rank })
}
