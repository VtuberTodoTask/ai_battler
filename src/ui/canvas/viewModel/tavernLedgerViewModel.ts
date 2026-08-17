import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import {
  formatCurrencyAmount,
  type TavernLedgerEntry,
} from '../../../core/economy/index.ts'

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
  const title = findRequestTitle(campaign, entry.source.requestId)
  return {
    id: entry.id,
    day: entry.day,
    title: title ?? `依頼 ${entry.source.requestId}`,
    subtitle: `DAY ${entry.day} / 仲介手数料`,
    amountLabel: `+${formatCurrencyAmount(entry.amount)}`,
  }
}

export function buildTavernLedgerViewModel(
  campaign: TavernCampaignState,
  returnTarget: TavernLedgerReturnTarget,
): TavernLedgerViewModel {
  const funds = campaign.finance?.funds ?? 0
  const entries = [...(campaign.finance?.ledgerEntries ?? [])].reverse()
  return {
    fundsLabel: `資金 ${formatCurrencyAmount(funds)}`,
    rows: entries.map((entry) => buildRow(entry, campaign)),
    returnTarget,
  }
}

export function createTavernLedgerSceneInput(
  returnTarget: TavernLedgerReturnTarget,
): TavernLedgerSceneInput {
  return { returnTarget }
}
