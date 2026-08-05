import { SeededRng } from '../rng/seededRng.ts'
import {
  Adventurer,
  AdventurerGenerationOptions,
  AdventurerRank,
  AdventurerRole,
  BaseStats,
  Personality,
  SkillSet,
  StatName,
  TraitInstance,
} from '../models/types.ts'
import { zAdventurerGenerationOptions } from '../models/types.ts'
import { ROLE_MAP, RoleDefinition } from '../../data/roles.ts'
import { TRAITS, TRAIT_MAP } from '../../data/traits.ts'
import { WEAPONS, ARMORS } from '../../data/equipment.ts'
import { FIRST_NAMES, LAST_NAMES } from '../../data/names.ts'
import {
  ADVENTURER_RANK_BASE,
  MAX_SKILL_NORMAL,
  MAX_SKILL_S,
  MAX_STAT_NORMAL,
  MAX_STAT_S,
  MIN_SKILL,
  MIN_STAT,
} from '../balance/constants.ts'
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

interface TraitModifiers {
  statBonus: Partial<Record<StatName, number>>
  skillBonus: Partial<Record<keyof SkillSet, number>>
  maxHpBonus: number
  maxMpBonus: number
  moraleBonus: number
  retreatThresholdModifier: number
  misc: Record<string, number>
}

function getRankForRng(rng: SeededRng): AdventurerRank {
  const roll = rng.d100()
  if (roll <= 30) return 'E'
  if (roll <= 60) return 'D'
  if (roll <= 80) return 'C'
  if (roll <= 92) return 'B'
  if (roll <= 98) return 'A'
  return 'S'
}

function getRoleForRng(rng: SeededRng): AdventurerRole {
  const roles: AdventurerRole[] = [
    'vanguard',
    'guardian',
    'scout',
    'ranger',
    'mage',
    'healer',
    'support',
  ]
  return roles[rng.integer(0, roles.length - 1)]
}

function generateName(rng: SeededRng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`
}

function generateStats(
  rng: SeededRng,
  rank: AdventurerRank,
  role: RoleDefinition,
): BaseStats {
  const base = ADVENTURER_RANK_BASE[rank]
  const mods: Record<StatName, number> = {
    str: 0,
    con: 0,
    dex: 0,
    int: 0,
    per: 0,
    wil: 0,
    soc: 0,
  }
  const { mostImportant, good, standard, weak, fatal } = role.stats
  mods[mostImportant] += 15
  good.forEach((s) => (mods[s] += 8))
  standard.forEach((s) => (mods[s] += 0))
  mods[weak] -= 8
  mods[fatal] -= 15

  const values: Partial<BaseStats> = {}
  STAT_NAMES.forEach((stat) => {
    const individual = rng.integer(-5, 5)
    const max = rank === 'S' ? MAX_STAT_S : MAX_STAT_NORMAL
    values[stat] = clamp(base + mods[stat] + individual, MIN_STAT, max)
  })
  return values as BaseStats
}

function generateBaseSkills(stats: BaseStats): SkillSet {
  const skills = {} as SkillSet
  ;(Object.keys(SKILL_FORMULAS) as (keyof SkillSet)[]).forEach((k) => {
    skills[k] = SKILL_FORMULAS[k](stats)
  })
  return skills
}

function applyProficiencies(
  skills: SkillSet,
  role: RoleDefinition,
  rng: SeededRng,
): SkillSet {
  const result = { ...skills }
  const allSkills = Object.keys(result) as (keyof SkillSet)[]
  const expert = role.expertSkills
  const trained = role.trainedSkills
  const remaining = allSkills.filter(
    (s) => !expert.includes(s) && !trained.includes(s),
  )
  const inexperiencedCount = rng.integer(2, 4)
  const inexperienced = rng.shuffle(remaining).slice(0, inexperiencedCount)

  allSkills.forEach((s) => {
    if (expert.includes(s)) result[s] += 20
    else if (trained.includes(s)) result[s] += 10
    else if (inexperienced.includes(s)) result[s] -= 15
  })
  return result
}

function selectTraits(rng: SeededRng): TraitInstance[] {
  const positives = TRAITS.filter((t) => t.positive)
  const negatives = TRAITS.filter((t) => !t.positive)

  const firstPositive = rng.pick(positives)
  const secondPositiveCandidates = positives.filter(
    (t) => t.id !== firstPositive.id && !firstPositive.excludes?.includes(t.id),
  )
  const secondPositive = rng.pick(secondPositiveCandidates)

  const excluded = new Set([
    firstPositive.id,
    secondPositive.id,
    ...(firstPositive.excludes ?? []),
    ...(secondPositive.excludes ?? []),
  ])
  const negativeCandidates = negatives.filter((t) => !excluded.has(t.id))
  const negative = rng.pick(negativeCandidates)

  return [
    { traitId: firstPositive.id, name: firstPositive.name },
    { traitId: secondPositive.id, name: secondPositive.name },
    { traitId: negative.id, name: negative.name },
  ]
}

function extractTraitModifiers(traits: TraitInstance[]): TraitModifiers {
  const mods: TraitModifiers = {
    statBonus: {},
    skillBonus: {},
    maxHpBonus: 0,
    maxMpBonus: 0,
    moraleBonus: 0,
    retreatThresholdModifier: 0,
    misc: {},
  }
  traits.forEach((t) => {
    const def = TRAIT_MAP[t.traitId]
    if (!def) return
    Object.entries(def.effects).forEach(([key, value]) => {
      if (typeof value !== 'number' && typeof value !== 'boolean') return
      if (typeof value === 'boolean') return

      for (const stat of STAT_NAMES) {
        if (key === `${stat}Bonus`) {
          mods.statBonus[stat] = (mods.statBonus[stat] ?? 0) + value
          return
        }
        if (key === `${stat}Penalty`) {
          mods.statBonus[stat] = (mods.statBonus[stat] ?? 0) - value
          return
        }
      }

      const skillNames = Object.keys(SKILL_FORMULAS) as (keyof SkillSet)[]
      for (const skill of skillNames) {
        if (key === `${skill}Bonus`) {
          mods.skillBonus[skill] = (mods.skillBonus[skill] ?? 0) + value
          return
        }
        if (key === `${skill}Penalty`) {
          mods.skillBonus[skill] = (mods.skillBonus[skill] ?? 0) - value
          return
        }
      }

      if (key === 'maxHpBonus') mods.maxHpBonus += value
      else if (key === 'maxMpBonus') mods.maxMpBonus += value
      else if (key === 'moraleBonus') mods.moraleBonus += value
      else if (key === 'moralePenalty') mods.moraleBonus -= value
      else if (key === 'retreatThresholdModifier')
        mods.retreatThresholdModifier += value
      else mods.misc[key] = (mods.misc[key] ?? 0) + value
    })
  })
  return mods
}

function applyModifiers(
  stats: BaseStats,
  skills: SkillSet,
  traits: TraitInstance[],
  rank: AdventurerRank,
): {
  stats: BaseStats
  skills: SkillSet
  maxHpBonus: number
  maxMpBonus: number
  moraleBonus: number
  retreatThresholdModifier: number
} {
  const mods = extractTraitModifiers(traits)
  const maxStat = rank === 'S' ? MAX_STAT_S : MAX_STAT_NORMAL
  const maxSkill = rank === 'S' ? MAX_SKILL_S : MAX_SKILL_NORMAL

  const newStats = { ...stats }
  STAT_NAMES.forEach((s) => {
    newStats[s] = clamp(
      newStats[s] + (mods.statBonus[s] ?? 0),
      MIN_STAT,
      maxStat,
    )
  })

  const newSkills = { ...skills }
  ;(Object.keys(newSkills) as (keyof SkillSet)[]).forEach((s) => {
    newSkills[s] = clamp(
      newSkills[s] + (mods.skillBonus[s] ?? 0),
      MIN_SKILL,
      maxSkill,
    )
  })

  return {
    stats: newStats,
    skills: newSkills,
    maxHpBonus: mods.maxHpBonus,
    maxMpBonus: mods.maxMpBonus,
    moraleBonus: mods.moraleBonus,
    retreatThresholdModifier: mods.retreatThresholdModifier,
  }
}

function generatePersonality(rng: SeededRng): Personality {
  return {
    bravery: rng.integer(-3, 3),
    caution: rng.integer(-3, 3),
    cooperation: rng.integer(-3, 3),
    discipline: rng.integer(-3, 3),
    altruism: rng.integer(-3, 3),
    greed: rng.integer(-3, 3),
  }
}

export function generateAdventurer(
  options: AdventurerGenerationOptions,
): Adventurer {
  const parsed = zAdventurerGenerationOptions.parse(options)
  const rng = new SeededRng(parsed.seed)

  const rank: AdventurerRank = parsed.rank ?? getRankForRng(rng)
  const roleDef = ROLE_MAP[parsed.role ?? getRoleForRng(rng)]
  const role = roleDef.id

  const stats = generateStats(rng, rank, roleDef)
  const baseSkills = generateBaseSkills(stats)
  const profSkills = applyProficiencies(baseSkills, roleDef, rng)
  const traits = selectTraits(rng)
  const {
    stats: finalStats,
    skills: finalSkills,
    maxHpBonus,
    maxMpBonus,
    moraleBonus,
  } = applyModifiers(stats, profSkills, traits, rank)

  const maxHp = 25 + round(finalStats.con * 0.7) + maxHpBonus
  const isMagicRole = role === 'mage' || role === 'healer' || role === 'support'
  const maxMp = isMagicRole
    ? 10 + round((finalStats.int + finalStats.wil) / 4) + maxMpBonus
    : rng.integer(0, 10) + maxMpBonus

  const morale = clamp(20 + round(finalStats.wil * 0.5) + moraleBonus, 0, 100)

  return {
    id: `${rank}-${role}-${parsed.seed}`,
    seed: parsed.seed,
    name: generateName(rng),
    rank,
    role,
    level:
      rank === 'S' ? 20 : 5 + ['E', 'D', 'C', 'B', 'A', 'S'].indexOf(rank) * 4,
    stats: finalStats,
    skills: finalSkills,
    maxHp,
    currentHp: maxHp,
    maxMp,
    currentMp: maxMp,
    morale,
    traits,
    personality: generatePersonality(rng),
    equipment: {
      weapon: deepClone(WEAPONS[roleDef.weaponId]),
      armor: deepClone(ARMORS[roleDef.armorId]),
    },
    statusEffects: [],
  }
}

export function generateAdventurers(
  options: AdventurerGenerationOptions,
): Adventurer[] {
  const parsed = zAdventurerGenerationOptions.parse(options)
  const count = parsed.count ?? 1
  return Array.from({ length: count }, (_, i) =>
    generateAdventurer({
      seed: `${parsed.seed}-adv-${i}`,
      rank: parsed.rank,
      role: parsed.role,
    }),
  )
}
