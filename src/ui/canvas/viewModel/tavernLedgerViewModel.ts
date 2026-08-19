import type {
  TavernCampaignState,
  TavernUpgradeId,
} from '../../../core/tavern/campaign/types.ts'
import {
  formatLedgerAmount,
  formatSignedCurrencyAmount,
  type TavernLedgerEntry,
} from '../../../core/economy/index.ts'
import { tavernUpgradeLabel } from '../../../core/tavern/campaign/upgrades.ts'

export interface TavernLedgerRowViewModel {
  id: string
  day: number
  title: string
  subtitle: string
  amountLabel: string
}

export interface TavernLedgerReturnTarget {
  sceneId: string
  selectedPartyId?: string
  selectedQuestId?: string
}

export interface TavernLedgerSceneInput {
  returnTarget: TavernLedgerReturnTarget
}

export interface TavernLedgerViewModel {
  fundsLabel: string
  rows: TavernLedgerRowViewModel[]
  returnTarget: TavernLedgerReturnTarget
}

function findRequestTitle(
  campaign: TavernCampaignState,
  requestId: string,
): string | undefined {
  const current = campaign.currentDay.requests.find((r) => r.id === requestId)
  if (current) return current.title

  for (const result of campaign.currentDay.results) {
    if (result.requestId === requestId && result.request) {
      return result.request.title
    }
  }

  for (const record of campaign.history) {
    for (const result of record.results) {
      if (result.requestId === requestId && result.request) {
        return result.request.title
      }
    }
  }

  return undefined
}

function buildRow(
  entry: TavernLedgerEntry,
  campaign: TavernCampaignState,
): TavernLedgerRowViewModel {
  switch (entry.kind) {
    case 'opening_balance':
      return {
        id: entry.id,
        day: entry.day,
        title: '開業資金',
        subtitle: '開業時',
        amountLabel: formatLedgerAmount(entry.amount),
      }
    case 'daily_operating_cost':
      return {
        id: entry.id,
        day: entry.day,
        title: '営業費',
        subtitle: `DAY ${entry.day}`,
        amountLabel: formatLedgerAmount(entry.amount),
      }
    case 'quest_commission': {
      const title = findRequestTitle(campaign, entry.source.requestId)
      return {
        id: entry.id,
        day: entry.day,
        title: title ?? '名称不明の依頼',
        subtitle: `DAY ${entry.day} / 依頼仲介`,
        amountLabel: formatLedgerAmount(entry.amount),
      }
    }
    case 'upgrade_purchase': {
      const label = tavernUpgradeLabel(
        entry.source.upgradeId as TavernUpgradeId,
      )
      return {
        id: entry.id,
        day: entry.day,
        title: `設備購入：${label} Lv${entry.source.targetLevel}`,
        subtitle: `DAY ${entry.day} / 設備投資`,
        amountLabel: formatLedgerAmount(entry.amount),
      }
    }
  }
}

export function buildTavernLedgerViewModel(
  campaign: TavernCampaignState,
  returnTarget: TavernLedgerReturnTarget,
): TavernLedgerViewModel {
  const funds = campaign.finance.funds
  const fundsLabel =
    funds < 0
      ? `資金 ${formatSignedCurrencyAmount(funds)} / 資金不足`
      : `資金 ${formatSignedCurrencyAmount(funds)}`
  const entries = [...campaign.finance.ledgerEntries].reverse()
  return {
    fundsLabel,
    rows: entries.map((entry) => buildRow(entry, campaign)),
    returnTarget,
  }
}

export function createTavernLedgerSceneInput(
  returnTarget: TavernLedgerReturnTarget,
): TavernLedgerSceneInput {
  return { returnTarget }
}
