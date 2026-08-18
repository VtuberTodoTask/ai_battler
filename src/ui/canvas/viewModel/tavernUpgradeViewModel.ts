import type {
  TavernCampaignState,
  TavernUpgradeId,
} from '../../../core/tavern/campaign/types.ts'
import { deriveTavernRank } from '../../../core/tavern/campaign/reputation.ts'
import {
  MAX_TAVERN_UPGRADE_LEVEL,
  TAVERN_UPGRADE_IDS,
  dailyRequestBonusForLevel,
  evaluateTavernUpgradePurchase,
  getUpgradeLevelConfig,
  predictionSampleMultiplierBpsForLevel,
  recoveryDayReductionForLevel,
  tavernUpgradeLabel,
  type TavernUpgradeBlockReason,
} from '../../../core/tavern/campaign/upgrades.ts'
import { formatSignedCurrencyAmount } from '../../../core/economy/index.ts'

export interface TavernUpgradeReturnTarget {
  sceneId: string
  selectedPartyId?: string
  selectedQuestId?: string
}

export interface TavernUpgradeSceneInput {
  returnTarget: TavernUpgradeReturnTarget
}

export interface TavernUpgradeEntryViewModel {
  id: TavernUpgradeId
  title: string
  description: string
  currentLevel: number
  maxLevel: number
  currentEffectText: string
  nextLevel?: number
  nextEffectText?: string
  cost?: number
  requiredRank?: number
  canPurchase: boolean
  blockedReason?: TavernUpgradeBlockReason
  timingNote: string
}

export interface TavernUpgradeSceneViewModel {
  dayLabel: string
  tavernRankLabel: string
  fundsLabel: string
  entries: TavernUpgradeEntryViewModel[]
  returnTarget: TavernUpgradeReturnTarget
}

const UPGRADE_DESCRIPTIONS: Record<TavernUpgradeId, string> = {
  quest_board:
    'より多くの依頼を掲示できるようになります。翌日以降の依頼候補が増加します。',
  intel_archive:
    '地図や過去の遠征記録を整理し、依頼予測に利用できる資料を増やします。',
  recovery_room:
    '負傷した冒険者を休ませるための設備を整えます。今後新たに始まる回復期間が短縮されます。',
}

const UPGRADE_TIMING_NOTES: Record<TavernUpgradeId, string> = {
  quest_board: '効果は翌日から反映されます。',
  intel_archive: '効果はすぐに反映されます。',
  recovery_room: '現在療養中の冒険者には遡って適用されません。',
}

function questBoardEffectText(level: number): string {
  const bonus = dailyRequestBonusForLevel(level)
  return bonus === 0
    ? '追加の依頼候補はありません'
    : `翌日以降の依頼候補 +${bonus}`
}

function intelArchiveEffectText(level: number): string {
  const bps = predictionSampleMultiplierBpsForLevel(level)
  return `予測試行数 ×${(bps / 10000).toFixed(1)}`
}

function recoveryRoomEffectText(level: number): string {
  const reduction = recoveryDayReductionForLevel(level)
  return reduction === 0
    ? '回復期間の短縮はありません'
    : `新たに開始する回復期間 -${reduction}日`
}

function effectTextForLevel(id: TavernUpgradeId, level: number): string {
  switch (id) {
    case 'quest_board':
      return questBoardEffectText(level)
    case 'intel_archive':
      return intelArchiveEffectText(level)
    case 'recovery_room':
      return recoveryRoomEffectText(level)
  }
}

function buildUpgradeEntry(
  campaign: TavernCampaignState,
  id: TavernUpgradeId,
): TavernUpgradeEntryViewModel {
  const currentLevel = campaign.upgrades.levels[id]
  const evaluation = evaluateTavernUpgradePurchase(campaign, id)
  const nextLevel = evaluation.targetLevel
  const nextConfig =
    nextLevel !== undefined ? getUpgradeLevelConfig(id, nextLevel) : undefined

  return {
    id,
    title: tavernUpgradeLabel(id),
    description: UPGRADE_DESCRIPTIONS[id],
    currentLevel,
    maxLevel: MAX_TAVERN_UPGRADE_LEVEL,
    currentEffectText: effectTextForLevel(id, currentLevel),
    nextLevel,
    nextEffectText:
      nextLevel !== undefined ? effectTextForLevel(id, nextLevel) : undefined,
    cost: nextConfig?.cost,
    requiredRank: nextConfig?.requiredTavernRank,
    canPurchase: evaluation.canPurchase,
    blockedReason: evaluation.blockedReason,
    timingNote: UPGRADE_TIMING_NOTES[id],
  }
}

export function buildTavernUpgradeSceneViewModel(
  campaign: TavernCampaignState,
  returnTarget: TavernUpgradeReturnTarget,
): TavernUpgradeSceneViewModel {
  const tavernRank = deriveTavernRank(campaign.reputation.peakScore)
  const funds = campaign.finance.funds

  return {
    dayLabel: `DAY ${campaign.dayNumber}`,
    tavernRankLabel: `酒場ランク ${tavernRank}`,
    fundsLabel:
      funds < 0
        ? `資金 ${formatSignedCurrencyAmount(funds)} / 資金不足`
        : `資金 ${formatSignedCurrencyAmount(funds)}`,
    entries: TAVERN_UPGRADE_IDS.map((id) => buildUpgradeEntry(campaign, id)),
    returnTarget,
  }
}

export function createTavernUpgradeSceneInput(
  returnTarget: TavernUpgradeReturnTarget,
): TavernUpgradeSceneInput {
  return { returnTarget }
}

export function tavernUpgradeBlockReasonText(
  reason: TavernUpgradeBlockReason | undefined,
): string | undefined {
  switch (reason) {
    case 'max_level':
      return undefined // handled separately as "整備済み" state, not an error
    case 'rank_locked':
      return '酒場ランクが不足しています。'
    case 'insufficient_funds':
      return '資金が足りません。'
    case 'not_planning':
      return '本日の依頼が確定済みのため、翌日以降にお試しください。'
    case undefined:
      return undefined
  }
}
