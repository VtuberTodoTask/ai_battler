import type { AdventurerRank } from '../models/types.ts'
import type { ExpeditionOutcome } from '../expedition/types.ts'
import type {
  CurrencyAmount,
  QuestRewardTerms,
  QuestSettlement,
  SettlementReason,
} from './types.ts'
import { validateCurrencyAmount } from './currency.ts'

export const BASE_REWARD_BY_RANK: Record<AdventurerRank, number> = {
  E: 100,
  D: 160,
  C: 260,
  B: 420,
  A: 680,
  S: 1100,
}

export const DEFAULT_TAVERN_COMMISSION_BPS = 1000

export function computeQuestRewardTerms(
  rank: AdventurerRank,
): QuestRewardTerms {
  const promisedReward = BASE_REWARD_BY_RANK[rank]
  validateCurrencyAmount(promisedReward)
  return {
    promisedReward,
    tavernCommissionBps: DEFAULT_TAVERN_COMMISSION_BPS,
  }
}

export function computeSuccessCommission(
  rewardTerms: QuestRewardTerms,
): CurrencyAmount {
  return Math.floor(
    (rewardTerms.promisedReward * rewardTerms.tavernCommissionBps) / 10000,
  )
}

const PAYOUT_BPS_BY_OUTCOME = {
  completeSuccess: 10000,
  success: 10000,
  partialSuccess: 5000,
  failedObjective: 0,
  forcedRetreat: 0,
  lostExpedition: 0,
} satisfies Record<ExpeditionOutcome, number>

const SETTLEMENT_REASON_BY_OUTCOME = {
  completeSuccess: 'objective_completed',
  success: 'objective_completed',
  partialSuccess: 'partial_objective',
  failedObjective: 'objective_failed',
  forcedRetreat: 'objective_failed',
  lostExpedition: 'objective_failed',
} satisfies Record<ExpeditionOutcome, SettlementReason>

export function payoutRateBpsFromOutcome(outcome: ExpeditionOutcome): number {
  return PAYOUT_BPS_BY_OUTCOME[outcome]
}

function settlementReasonFromOutcome(
  outcome: ExpeditionOutcome,
): SettlementReason {
  return SETTLEMENT_REASON_BY_OUTCOME[outcome]
}

export function computeQuestSettlement(
  rewardTerms: QuestRewardTerms,
  outcome: ExpeditionOutcome,
): QuestSettlement {
  const payoutRateBps = payoutRateBpsFromOutcome(outcome)
  const paidReward = Math.floor(
    (rewardTerms.promisedReward * payoutRateBps) / 10000,
  )
  const tavernCommission = Math.floor(
    (paidReward * rewardTerms.tavernCommissionBps) / 10000,
  )
  validateCurrencyAmount(paidReward)
  validateCurrencyAmount(tavernCommission)
  return {
    promisedReward: rewardTerms.promisedReward,
    payoutRateBps,
    paidReward,
    tavernCommission,
    settlementReason: settlementReasonFromOutcome(outcome),
  }
}
