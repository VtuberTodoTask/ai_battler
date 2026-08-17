export type CurrencyAmount = number

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

export interface TavernLedgerEntry {
  id: string
  day: number
  kind: 'quest_commission'
  amount: CurrencyAmount
  source: {
    type: 'expedition'
    requestId: string
    partyId?: string
  }
}

export interface TavernFinanceState {
  funds: CurrencyAmount
  ledgerEntries: TavernLedgerEntry[]
}
