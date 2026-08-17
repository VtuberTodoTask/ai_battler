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
  E: 2.97,
  D: 3.9,
  C: 4.61,
  B: 6.11,
  A: 6.13,
  S: 7.24,
}

// Expedition-only encounter budget multiplier. This is applied only when
// generating encounters inside an expedition, so Phase 1 battle balance stays
// untouched.
export const EXPEDITION_ENCOUNTER_THREAT_MULTIPLIER = 0.85

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
export const MORALE_MAX = 100

export const RETREAT_MORALE_THRESHOLD = 30

export const ABILITY_THREAT_COST: Record<AbilityId, number> = {
  flight: 2.413950000000001,
  poisonAttack: 0.05,
  bleedAttack: 0.05,
  areaAttack: 0.11718666666666686,
  revive: 0.4319589535864975,
  regeneration: 2.686831304347829,
  frontDefense: 0.6260731340996166,
  magicResist: 1.866533857923498,
  physicalResist: 0.7886467605633801,
  darknessBoost: 0.10044571428571544,
  corpseExplosion: 0.05,
  summon: 3.2270504761904792,
  taunt: 0.05,
  fear: 3.8844156521739155,
  healBlock: 0.05,
  counter: 0.06459364485981296,
  stealthStart: 0.05,
  swarmCoordination: 1.407858227848102,
}

export const DIFFICULTY_TARGET_WINRATE = {
  easy: { min: 0.8, max: 0.95 },
  normal: { min: 0.55, max: 0.7 },
  hard: { min: 0.3, max: 0.5 },
  deadly: { min: 0.1, max: 0.3 },
}
