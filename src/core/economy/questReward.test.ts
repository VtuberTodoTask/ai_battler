import { describe, expect, it } from 'vitest'
import {
  BASE_REWARD_BY_RANK,
  computeQuestRewardTerms,
  computeQuestSettlement,
  computeSuccessCommission,
  payoutRateBpsFromOutcome,
} from './questReward.ts'

describe('questReward', () => {
  it('A: base reward table matches Phase 9.0 balance', () => {
    expect(BASE_REWARD_BY_RANK).toEqual({
      E: 100,
      D: 160,
      C: 260,
      B: 420,
      A: 680,
      S: 1100,
    })
  })

  it('B: computeQuestRewardTerms returns promised reward and 10% commission bps', () => {
    const terms = computeQuestRewardTerms('A')
    expect(terms.promisedReward).toBe(680)
    expect(terms.tavernCommissionBps).toBe(1000)
  })

  it('C: success commission is floor(promised * 1000 / 10000)', () => {
    expect(computeSuccessCommission(computeQuestRewardTerms('E'))).toBe(10)
    expect(computeSuccessCommission(computeQuestRewardTerms('D'))).toBe(16)
    expect(computeSuccessCommission(computeQuestRewardTerms('C'))).toBe(26)
    expect(computeSuccessCommission(computeQuestRewardTerms('B'))).toBe(42)
    expect(computeSuccessCommission(computeQuestRewardTerms('A'))).toBe(68)
    expect(computeSuccessCommission(computeQuestRewardTerms('S'))).toBe(110)
  })

  it('D: complete/success outcomes pay 100% reward', () => {
    const terms = computeQuestRewardTerms('C')
    expect(payoutRateBpsFromOutcome('completeSuccess')).toBe(10000)
    expect(payoutRateBpsFromOutcome('success')).toBe(10000)
    expect(computeQuestSettlement(terms, 'success').paidReward).toBe(260)
    expect(computeQuestSettlement(terms, 'success').tavernCommission).toBe(26)
  })

  it('E: partial success pays 50% reward', () => {
    const terms = computeQuestRewardTerms('C')
    expect(payoutRateBpsFromOutcome('partialSuccess')).toBe(5000)
    const settlement = computeQuestSettlement(terms, 'partialSuccess')
    expect(settlement.paidReward).toBe(130)
    expect(settlement.tavernCommission).toBe(13)
    expect(settlement.settlementReason).toBe('partial_objective')
  })

  it('F: failed outcomes pay 0 reward and 0 commission', () => {
    const terms = computeQuestRewardTerms('C')
    for (const outcome of [
      'failedObjective',
      'forcedRetreat',
      'lostExpedition',
    ] as const) {
      const settlement = computeQuestSettlement(terms, outcome)
      expect(settlement.paidReward).toBe(0)
      expect(settlement.tavernCommission).toBe(0)
      expect(settlement.settlementReason).toBe('objective_failed')
    }
  })

  it('G: settlement uses floor rounding for paid reward and commission', () => {
    const terms = computeQuestRewardTerms('D')
    const partial = computeQuestSettlement(terms, 'partialSuccess')
    expect(partial.paidReward).toBe(80)
    expect(partial.tavernCommission).toBe(8)
  })

  it('H: default commission is 1000 bps and never deducted from reward formula', () => {
    const settlement = computeQuestSettlement(
      computeQuestRewardTerms('S'),
      'success',
    )
    expect(settlement.promisedReward).toBe(1100)
    expect(settlement.paidReward).toBe(1100)
    expect(settlement.tavernCommission).toBe(110)
  })

  it('I: outcome mapping is exhaustive for all ExpeditionOutcome values', () => {
    const terms = computeQuestRewardTerms('C')
    const outcomes = [
      'completeSuccess',
      'success',
      'partialSuccess',
      'failedObjective',
      'forcedRetreat',
      'lostExpedition',
    ] as const
    for (const outcome of outcomes) {
      const settlement = computeQuestSettlement(terms, outcome)
      expect(settlement.promisedReward).toBe(260)
      expect([0, 5000, 10000]).toContain(settlement.payoutRateBps)
      expect(settlement.paidReward).toBe(
        Math.floor((terms.promisedReward * settlement.payoutRateBps) / 10000),
      )
      expect(settlement.tavernCommission).toBe(
        Math.floor((settlement.paidReward * 1000) / 10000),
      )
    }
  })
})
