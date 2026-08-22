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

export interface TavernUpgradePurchaseLedgerEntry extends TavernLedgerBase {
  kind: 'upgrade_purchase'
  source: {
    type: 'tavern_upgrade'
    upgradeId: string
    targetLevel: number
  }
}

/**
 * Phase 9.8 Main Quest. Unlike a Quest Commission (paid TO the tavern by
 * an outside requester's settlement), this is the tavern owner personally
 * paying a familiar Party's fee to accompany them — a negative Ledger
 * entry charged at Dispatch confirmation time, not at day settlement.
 */
export interface MainQuestPaymentLedgerEntry extends TavernLedgerBase {
  kind: 'main_quest_payment'
  source: {
    type: 'main_quest'
    threatId: string
    attemptId: string
    partyId: string
  }
}

export type TavernLedgerEntry =
  | OpeningBalanceLedgerEntry
  | QuestCommissionLedgerEntry
  | DailyOperatingCostLedgerEntry
  | TavernUpgradePurchaseLedgerEntry
  | MainQuestPaymentLedgerEntry

export interface TavernFinanceState {
  funds: SignedCurrencyAmount
  ledgerEntries: TavernLedgerEntry[]
}
