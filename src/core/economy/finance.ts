import { deepClone } from '../util.ts'
import type {
  CurrencyAmount,
  QuestSettlement,
  TavernFinanceState,
  TavernLedgerEntry,
} from './types.ts'
import { validateCurrencyAmount } from './currency.ts'

export function createInitialFinanceState(): TavernFinanceState {
  return {
    funds: 0,
    ledgerEntries: [],
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

export function applyQuestSettlement(
  finance: TavernFinanceState,
  settlement: QuestSettlement,
  day: number,
  source: SettlementSource,
): TavernFinanceState {
  const entryId = buildLedgerEntryId(day, source.requestId, source.partyId)
  if (
    settlement.tavernCommission === 0 ||
    finance.ledgerEntries.some((entry) => entry.id === entryId)
  ) {
    return finance
  }

  const next = deepClone(finance)
  const newFunds = validateCurrencyAmount(
    next.funds + settlement.tavernCommission,
  )
  const entry: TavernLedgerEntry = {
    id: entryId,
    day,
    kind: 'quest_commission',
    amount: settlement.tavernCommission,
    source: {
      type: 'expedition',
      requestId: source.requestId,
      partyId: source.partyId,
    },
  }
  next.funds = newFunds
  next.ledgerEntries = [...next.ledgerEntries, entry]
  return next
}

export function ledgerTotal(
  entries: readonly TavernLedgerEntry[],
): CurrencyAmount {
  let total = 0
  for (const entry of entries) {
    total = validateCurrencyAmount(total + entry.amount)
  }
  return total
}

export function financeInvariantHolds(
  finance: TavernFinanceState,
  initialFunds = 0,
): boolean {
  return finance.funds === initialFunds + ledgerTotal(finance.ledgerEntries)
}
