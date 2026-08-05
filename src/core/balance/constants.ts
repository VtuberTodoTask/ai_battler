import { AdventurerRank, EnemyRank, EnemyTier } from '../models/types.ts'

export const ADVENTURER_RANK_BASE: Record<AdventurerRank, number> = {
  E: 42,
  D: 48,
  C: 55,
  B: 62,
  A: 70,
  S: 78,
}

export const ADVENTURER_THREAT: Record<AdventurerRank, number> = {
  E: 1,
  D: 2,
  C: 4,
  B: 7,
  A: 11,
  S: 16,
}

export const ENEMY_RANK_BASE: Record<EnemyRank, number> = {
  E: 40,
  D: 48,
  C: 56,
  B: 64,
  A: 72,
  S: 80,
  DISASTER: 90,
}

export const ENEMY_BASE_THREAT: Record<EnemyRank, number> = {
  E: 1,
  D: 2,
  C: 4,
  B: 7,
  A: 11,
  S: 16,
  DISASTER: 24,
}

export const TIER_THREAT_MULTIPLIER: Record<EnemyTier, number> = {
  minion: 0.5,
  standard: 1,
  elite: 1.5,
  boss: 2.5,
}

export const TIER_HP_MULTIPLIER: Record<EnemyTier, number> = {
  minion: 0.6,
  standard: 1,
  elite: 1.6,
  boss: 2.8,
}

export const DIFFICULTY_BUDGET_MULTIPLIER = {
  easy: 0.7,
  normal: 1.0,
  hard: 1.25,
  deadly: 1.5,
}

export const MIN_STAT = 20
export const MAX_STAT_NORMAL = 95
export const MAX_STAT_S = 100
export const MIN_SKILL = 1
export const MAX_SKILL_NORMAL = 95
export const MAX_SKILL_S = 100

export const MIN_HIT_CHANCE = 5
export const MAX_HIT_CHANCE = 95

export const MAX_ROUNDS = 20

export const MORALE_INITIAL_BASE = 20

export const RETREAT_MORALE_THRESHOLD = 30

export const ABILITY_THREAT_BONUS = {
  minor: 0,
  standard: 0.1,
  strong: 0.25,
  extreme: 0.5,
}

export const DIFFICULTY_TARGET_WINRATE = {
  easy: { min: 0.8, max: 0.95 },
  normal: { min: 0.55, max: 0.7 },
  hard: { min: 0.3, max: 0.5 },
  deadly: { min: 0.1, max: 0.3 },
}
