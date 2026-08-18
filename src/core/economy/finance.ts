import { deepClone } from '../util.ts'
import { TAVERN_ECONOMY_CONFIG } from './economyConfig.ts'
import {
  validateCurrencyAmount,
  validateSignedCurrencyAmount,
} from './currency.ts'
import type {
  CurrencyAmount,
  QuestSettlement,
  SignedCurrencyAmount,
  TavernFinanceState,
  TavernLedgerEntry,
} from './types.ts'

export function createInitialFinanceState(): TavernFinanceState {
  return {
    funds: 0,
    ledgerEntries: [],
  }
}

export function buildOpeningBalanceTransaction(): TavernLedgerEntry {
  return {
    id: 'opening-balance',
    day: 0,
    kind: 'opening_balance',
    amount: TAVERN_ECONOMY_CONFIG.initialFunds,
    source: { type: 'campaign_start' },
  }
}

export function buildDailyOperatingCostEntryId(day: number): string {
  return `daily-operating-cost:${day}`
}

export function buildDailyOperatingCostTransaction(
  day: number,
): TavernLedgerEntry {
  return {
    id: buildDailyOperatingCostEntryId(day),
    day,
    kind: 'daily_operating_cost',
    amount: -TAVERN_ECONOMY_CONFIG.dailyOperatingCost,
    source: { type: 'daily_operating_cost' },
  }
}

export interface SettlementSource {
  requestId: string
  partyId?: string
}

export function buildLedgerEntryId(
  day: number,
  requestId: string,
  partyId: string | undefined,
): string {
  return `quest-commission:${day}:${requestId}:${partyId ?? 'none'}`
}

export function buildQuestCommissionTransaction(
  day: number,
  source: SettlementSource,
  amount: CurrencyAmount,
): TavernLedgerEntry {
  validateCurrencyAmount(amount)
  return {
    id: buildLedgerEntryId(day, source.requestId, source.partyId),
    day,
    kind: 'quest_commission',
    amount,
    source: {
      type: 'expedition',
      requestId: source.requestId,
      partyId: source.partyId,
    },
  }
}

export function buildUpgradePurchaseEntryId(
  upgradeId: string,
  targetLevel: number,
): string {
  return `upgrade-purchase:${upgradeId}:${targetLevel}`
}

export function buildUpgradePurchaseTransaction(
  day: number,
  upgradeId: string,
  targetLevel: number,
  cost: CurrencyAmount,
): TavernLedgerEntry {
  validateCurrencyAmount(cost)
  return {
    id: buildUpgradePurchaseEntryId(upgradeId, targetLevel),
    day,
    kind: 'upgrade_purchase',
    amount: -cost,
    source: { type: 'tavern_upgrade', upgradeId, targetLevel },
  }
}

export function applyLedgerTransaction(
  finance: TavernFinanceState,
  entry: TavernLedgerEntry,
): TavernFinanceState {
  if (finance.ledgerEntries.some((existing) => existing.id === entry.id)) {
    return finance
  }

  const next = deepClone(finance)
  next.funds = validateSignedCurrencyAmount(next.funds + entry.amount)
  next.ledgerEntries = [...next.ledgerEntries, entry]
  return next
}

export function applyQuestSettlement(
  finance: TavernFinanceState,
  settlement: QuestSettlement,
  day: number,
  source: SettlementSource,
): TavernFinanceState {
  if (settlement.tavernCommission === 0) {
    return finance
  }

  const entry = buildQuestCommissionTransaction(
    day,
    source,
    settlement.tavernCommission,
  )
  return applyLedgerTransaction(finance, entry)
}

export function ledgerTotal(
  entries: readonly TavernLedgerEntry[],
): SignedCurrencyAmount {
  let total = 0
  for (const entry of entries) {
    total = validateSignedCurrencyAmount(total + entry.amount)
  }
  return total
}

export function financeInvariantHolds(finance: TavernFinanceState): boolean {
  return finance.funds === ledgerTotal(finance.ledgerEntries)
}
