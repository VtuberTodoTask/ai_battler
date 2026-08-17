import type { AdventurerRank } from '../models/types.ts'
import type { ExpeditionOutcome } from '../expedition/types.ts'
import type { TavernRequestOffer } from '../tavern/types.ts'
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

export function getOrComputeRewardTerms(
  request: TavernRequestOffer,
): QuestRewardTerms {
  if (request.rewardTerms) {
    return request.rewardTerms
  }
  return computeQuestRewardTerms(request.rank)
}

export function payoutRateBpsFromOutcome(outcome: ExpeditionOutcome): number {
  switch (outcome) {
    case 'completeSuccess':
    case 'success':
      return 10000
    case 'partialSuccess':
      return 5000
    case 'failedObjective':
    case 'forcedRetreat':
    case 'lostExpedition':
      return 0
    default:
      return 0
  }
}

function settlementReasonFromOutcome(
  outcome: ExpeditionOutcome,
): SettlementReason {
  switch (outcome) {
    case 'completeSuccess':
    case 'success':
      return 'objective_completed'
    case 'partialSuccess':
      return 'partial_objective'
    case 'failedObjective':
    case 'forcedRetreat':
    case 'lostExpedition':
      return 'objective_failed'
    default:
      return 'objective_failed'
  }
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
