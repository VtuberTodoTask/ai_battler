export type CurrencyAmount = number
export type SignedCurrencyAmount = number

export interface QuestRewardTerms {
  promisedReward: CurrencyAmount
  tavernCommissionBps: number
}

export type SettlementReason =
  'objective_completed' | 'partial_objective' | 'objective_failed'

export interface QuestSettlement {
  promisedReward: CurrencyAmount
  payoutRateBps: number
  paidReward: CurrencyAmount
  tavernCommission: CurrencyAmount
  settlementReason: SettlementReason
}

export interface TavernLedgerBase {
  id: string
  day: number
  amount: SignedCurrencyAmount
}

export interface OpeningBalanceLedgerEntry extends TavernLedgerBase {
  kind: 'opening_balance'
  source: { type: 'campaign_start' }
}

export interface QuestCommissionLedgerEntry extends TavernLedgerBase {
  kind: 'quest_commission'
  source: {
    type: 'expedition'
    requestId: string
    partyId?: string
  }
}

export interface DailyOperatingCostLedgerEntry extends TavernLedgerBase {
  kind: 'daily_operating_cost'
  source: { type: 'daily_operating_cost' }
}

export type TavernLedgerEntry =
  | OpeningBalanceLedgerEntry
  | QuestCommissionLedgerEntry
  | DailyOperatingCostLedgerEntry

export interface TavernFinanceState {
  funds: SignedCurrencyAmount
  ledgerEntries: TavernLedgerEntry[]
}
