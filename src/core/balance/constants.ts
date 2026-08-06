import {
  AbilityId,
  AdventurerRank,
  EnemyRank,
  EnemyTier,
} from '../models/types.ts'

export const ADVENTURER_RANK_BASE: Record<AdventurerRank, number> = {
  E: 42,
  D: 48,
  C: 55,
  B: 62,
  A: 70,
  S: 78,
}

// Calibrated from measured per-rank combat metrics (expected DPR * survival).
export const ADVENTURER_THREAT: Record<AdventurerRank, number> = {
  E: 2.58,
  D: 3.39,
  C: 4.01,
  B: 5.31,
  A: 6.13,
  S: 7.24,
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

// Calibrated against simulated Normal encounters to keep favorable outcome
// rates within 55–70% across ranks. DISASTER is set to roughly 2.5x S standard.
export const ENEMY_BASE_THREAT: Record<EnemyRank, number> = {
  E: 2.31,
  D: 4.77,
  C: 5.18,
  B: 6.51,
  A: 7.74,
  S: 7.99,
  DISASTER: 19.98,
}

export const TIER_THREAT_MULTIPLIER: Record<EnemyTier, number> = {
  minion: 0.35,
  standard: 1,
  elite: 1.4,
  boss: 2.2,
}

export const TIER_HP_MULTIPLIER: Record<EnemyTier, number> = {
  minion: 0.6,
  standard: 1,
  elite: 1.6,
  boss: 2.8,
}

export const DIFFICULTY_BUDGET_MULTIPLIER = {
  easy: 0.9,
  normal: 1.56,
  hard: 2.15,
  deadly: 2.85,
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

export const ABILITY_THREAT_COST: Record<AbilityId, number> = {
  flight: 0.425,
  poisonAttack: 0.703,
  bleedAttack: 0.2,
  areaAttack: 0.225,
  revive: 0.269,
  regeneration: 1.208,
  frontDefense: 0.499,
  magicResist: 0.653,
  physicalResist: 1.25,
  darknessBoost: 0.204,
  corpseExplosion: 0.272,
  summon: 0.984,
  taunt: 0.396,
  fear: 1.09,
  healBlock: 1.25,
  counter: 0.278,
  stealthStart: 0.1,
  swarmCoordination: 0.141,
}

export const DIFFICULTY_TARGET_WINRATE = {
  easy: { min: 0.8, max: 0.95 },
  normal: { min: 0.55, max: 0.7 },
  hard: { min: 0.3, max: 0.5 },
  deadly: { min: 0.1, max: 0.3 },
}
