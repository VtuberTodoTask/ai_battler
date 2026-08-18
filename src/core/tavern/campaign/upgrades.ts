import { deepClone } from '../../util.ts'
import {
  applyLedgerTransaction,
  buildUpgradePurchaseTransaction,
  validateCurrencyAmount,
} from '../../economy/index.ts'
import { deriveTavernRank } from './reputation.ts'
import type {
  TavernCampaignState,
  TavernRank,
  TavernUpgradeId,
  TavernUpgradeState,
} from './types.ts'

export const TAVERN_UPGRADE_IDS: readonly TavernUpgradeId[] = [
  'quest_board',
  'intel_archive',
  'recovery_room',
]

export const MAX_TAVERN_UPGRADE_LEVEL = 2

export interface TavernUpgradeLevelConfig {
  level: 1 | 2
  cost: number
  requiredTavernRank: TavernRank
}

export const TAVERN_UPGRADE_CONFIG: Record<
  TavernUpgradeId,
  readonly TavernUpgradeLevelConfig[]
> = {
  quest_board: [
    { level: 1, cost: 60, requiredTavernRank: 1 },
    { level: 2, cost: 180, requiredTavernRank: 3 },
  ],
  intel_archive: [
    { level: 1, cost: 90, requiredTavernRank: 2 },
    { level: 2, cost: 220, requiredTavernRank: 4 },
  ],
  recovery_room: [
    { level: 1, cost: 120, requiredTavernRank: 2 },
    { level: 2, cost: 280, requiredTavernRank: 4 },
  ],
}

export function getUpgradeLevelConfig(
  upgradeId: TavernUpgradeId,
  targetLevel: number,
): TavernUpgradeLevelConfig | undefined {
  return TAVERN_UPGRADE_CONFIG[upgradeId].find((c) => c.level === targetLevel)
}

export const TAVERN_UPGRADE_LABELS: Record<TavernUpgradeId, string> = {
  quest_board: '依頼掲示板',
  intel_archive: '調査資料棚',
  recovery_room: '療養室',
}

export function tavernUpgradeLabel(id: TavernUpgradeId): string {
  return TAVERN_UPGRADE_LABELS[id]
}

export function createInitialUpgradeState(): TavernUpgradeState {
  return {
    levels: {
      quest_board: 0,
      intel_archive: 0,
      recovery_room: 0,
    },
  }
}

// --- Derived effects -------------------------------------------------
//
// Only facility *levels* are authoritative state. Every gameplay effect
// below is a pure function of those levels, computed on demand — nothing
// here is stored back onto the campaign.

export function dailyRequestBonusForLevel(level: number): number {
  return level
}

export function getDailyRequestBonus(upgrades: TavernUpgradeState): number {
  return dailyRequestBonusForLevel(upgrades.levels.quest_board)
}

const SAMPLE_MULTIPLIER_BPS_BY_LEVEL: Record<number, number> = {
  0: 10000,
  1: 15000,
  2: 20000,
}

export function predictionSampleMultiplierBpsForLevel(level: number): number {
  return SAMPLE_MULTIPLIER_BPS_BY_LEVEL[level] ?? 10000
}

export function getPredictionSampleMultiplierBps(
  upgrades: TavernUpgradeState,
): number {
  return predictionSampleMultiplierBpsForLevel(upgrades.levels.intel_archive)
}

export function getEffectiveSampleCount(
  baseSampleCount: number,
  upgrades: TavernUpgradeState,
): number {
  const multiplierBps = getPredictionSampleMultiplierBps(upgrades)
  return Math.max(1, Math.floor((baseSampleCount * multiplierBps) / 10000))
}

const RECOVERY_DAY_REDUCTION_BY_LEVEL: Record<number, number> = {
  0: 0,
  1: 1,
  2: 2,
}

export function recoveryDayReductionForLevel(level: number): number {
  return RECOVERY_DAY_REDUCTION_BY_LEVEL[level] ?? 0
}

export function getRecoveryDayReduction(upgrades: TavernUpgradeState): number {
  return recoveryDayReductionForLevel(upgrades.levels.recovery_room)
}

/**
 * Applies the recovery room's duration reduction to a newly-starting
 * recovery period only. A baseDays of 0 (no recovery needed) is returned
 * unchanged; otherwise the result never drops below 1 day. Existing,
 * already-running recovery timers are never touched by this function —
 * callers must only use it at the moment a new recovery period begins.
 */
export function applyRecoveryRoomModifier(
  baseDays: number,
  upgrades: TavernUpgradeState,
): number {
  if (baseDays <= 0) return baseDays
  const reduction = getRecoveryDayReduction(upgrades)
  return Math.max(1, baseDays - reduction)
}

// --- Purchase ----------------------------------------------------------

export type TavernUpgradeBlockReason =
  'not_planning' | 'max_level' | 'rank_locked' | 'insufficient_funds'

export interface TavernUpgradePurchaseEvaluation {
  canPurchase: boolean
  blockedReason?: TavernUpgradeBlockReason
  targetLevel?: number
  cost?: number
  requiredRank?: TavernRank
}

/**
 * Pure precondition check shared by the purchase action and the UI
 * projection, so the two never drift apart. requiredRank/cost/targetLevel
 * are populated whenever the next level exists (even when blocked), so
 * the UI can still show what a locked upgrade would cost/require.
 */
export function evaluateTavernUpgradePurchase(
  campaign: TavernCampaignState,
  upgradeId: TavernUpgradeId,
): TavernUpgradePurchaseEvaluation {
  const currentLevel = campaign.upgrades.levels[upgradeId]
  const targetLevel = currentLevel + 1
  const levelConfig = getUpgradeLevelConfig(upgradeId, targetLevel)
  if (!levelConfig) {
    return { canPurchase: false, blockedReason: 'max_level' }
  }

  const base = {
    targetLevel,
    cost: levelConfig.cost,
    requiredRank: levelConfig.requiredTavernRank,
  }

  if (campaign.currentDay.status !== 'planning') {
    return { canPurchase: false, blockedReason: 'not_planning', ...base }
  }

  const tavernRank = deriveTavernRank(campaign.reputation.peakScore)
  if (tavernRank < levelConfig.requiredTavernRank) {
    return { canPurchase: false, blockedReason: 'rank_locked', ...base }
  }

  if (campaign.finance.funds < levelConfig.cost) {
    return { canPurchase: false, blockedReason: 'insufficient_funds', ...base }
  }

  return { canPurchase: true, ...base }
}

export interface PurchaseTavernUpgradeResult {
  ok: boolean
  campaign: TavernCampaignState
  blockedReason?: TavernUpgradeBlockReason
}

/**
 * Purchases exactly the next level of an upgrade. On any blocked
 * precondition, the campaign is returned unchanged (no ledger, no state,
 * no RNG mutation). On success, the level bump and the ledger transaction
 * are applied together against a single cloned campaign.
 */
export function purchaseTavernUpgrade(
  campaign: TavernCampaignState,
  upgradeId: TavernUpgradeId,
): PurchaseTavernUpgradeResult {
  const evaluation = evaluateTavernUpgradePurchase(campaign, upgradeId)
  if (!evaluation.canPurchase || evaluation.targetLevel === undefined) {
    return { ok: false, campaign, blockedReason: evaluation.blockedReason }
  }

  const cost = validateCurrencyAmount(evaluation.cost)
  const nextCampaign = deepClone(campaign)
  const entry = buildUpgradePurchaseTransaction(
    nextCampaign.dayNumber,
    upgradeId,
    evaluation.targetLevel,
    cost,
  )
  nextCampaign.finance = applyLedgerTransaction(nextCampaign.finance, entry)
  nextCampaign.upgrades = {
    levels: {
      ...nextCampaign.upgrades.levels,
      [upgradeId]: evaluation.targetLevel,
    },
  }

  return { ok: true, campaign: nextCampaign }
}
