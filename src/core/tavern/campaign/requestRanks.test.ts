import { describe, expect, it } from 'vitest'
import type { AdventurerRank } from '../../models/types.ts'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from './campaign.ts'
import {
  generateTavernRequestsForDay,
  planRequestRanksForDay,
  RANKS,
} from './generators.ts'

function rankValue(rank: AdventurerRank): number {
  return RANKS.indexOf(rank)
}

function isServiceable(
  requestRank: AdventurerRank,
  availableRanks: AdventurerRank[],
): boolean {
  return availableRanks.some((r) => rankValue(requestRank) <= rankValue(r))
}

describe('planRequestRanksForDay', () => {
  it('is deterministic for identical inputs', () => {
    const ranks: AdventurerRank[] = ['E', 'E', 'D', 'D']
    const plan1 = planRequestRanksForDay('det-001', 1, ranks)
    const plan2 = planRequestRanksForDay('det-001', 1, ranks)
    expect(plan2).toEqual(plan1)
  })

  it('is independent of array order for the same rank multiset', () => {
    const plan1 = planRequestRanksForDay('order-001', 1, ['E', 'D', 'C', 'E'])
    const plan2 = planRequestRanksForDay('order-001', 1, ['C', 'E', 'E', 'D'])
    expect(plan2).toEqual(plan1)
  })

  it('E-only roster produces at least 2 E ranks and no C/B/A/S', () => {
    const ranks: AdventurerRank[] = ['E', 'E', 'E', 'E']
    for (let i = 0; i < 100; i++) {
      const plan = planRequestRanksForDay(`e-only-${i}`, 1, ranks)
      const requestRanks = [plan.serviceableA, plan.serviceableB, plan.open]
      const dCount = requestRanks.filter((r) => r === 'D').length
      expect(requestRanks.every((r) => rankValue(r) <= rankValue('D'))).toBe(
        true,
      )
      expect(dCount).toBeLessThanOrEqual(1)
      const serviceableCount = requestRanks.filter((r) => r === 'E').length
      expect(serviceableCount).toBeGreaterThanOrEqual(2)
    }
  })

  it('D-only roster produces at least 2 <= D ranks and no B/A/S', () => {
    const ranks: AdventurerRank[] = ['D', 'D', 'D', 'D']
    for (let i = 0; i < 100; i++) {
      const plan = planRequestRanksForDay(`d-only-${i}`, 1, ranks)
      const requestRanks = [plan.serviceableA, plan.serviceableB, plan.open]
      expect(requestRanks.every((r) => rankValue(r) <= rankValue('C'))).toBe(
        true,
      )
      expect(requestRanks.filter((r) => r === 'C').length).toBeLessThanOrEqual(
        1,
      )
      const serviceableCount = requestRanks.filter(
        (r) => rankValue(r) <= rankValue('D'),
      ).length
      expect(serviceableCount).toBeGreaterThanOrEqual(2)
    }
  })

  it('mixed E/E/D/D roster keeps requests <= C with at least 2 <= D', () => {
    const ranks: AdventurerRank[] = ['E', 'E', 'D', 'D']
    for (let i = 0; i < 100; i++) {
      const plan = planRequestRanksForDay(`mixed-${i}`, 1, ranks)
      const requestRanks = [plan.serviceableA, plan.serviceableB, plan.open]
      expect(requestRanks.every((r) => rankValue(r) <= rankValue('C'))).toBe(
        true,
      )
      const serviceableCount = requestRanks.filter(
        (r) => rankValue(r) <= rankValue('D'),
      ).length
      expect(serviceableCount).toBeGreaterThanOrEqual(2)
    }
  })

  it('S-only roster never exceeds the S challenge cap', () => {
    const ranks: AdventurerRank[] = ['S', 'S', 'S', 'S']
    for (let i = 0; i < 100; i++) {
      const plan = planRequestRanksForDay(`s-only-${i}`, 5, ranks)
      const requestRanks = [plan.serviceableA, plan.serviceableB, plan.open]
      expect(requestRanks.every((r) => rankValue(r) <= rankValue('S'))).toBe(
        true,
      )
      expect(Math.max(...requestRanks.map(rankValue))).toBeLessThanOrEqual(
        rankValue('S'),
      )
    }
  })

  it('high tavern rank with weak C roster keeps serviceable slots at or below C', () => {
    const ranks: AdventurerRank[] = ['C', 'C', 'C', 'C']
    for (let i = 0; i < 100; i++) {
      const plan = planRequestRanksForDay(`weak-c-${i}`, 5, ranks)
      const requestRanks = [plan.serviceableA, plan.serviceableB, plan.open]
      // Serviceable slots are anchored to the C-only roster, so they must
      // stay at or below C even though the tavern rank allows up to S.
      const serviceableCount = [plan.serviceableA, plan.serviceableB].filter(
        (r) => rankValue(r) <= rankValue('C'),
      ).length
      expect(serviceableCount).toBe(2)
      expect(requestRanks.every((r) => rankValue(r) <= rankValue('B'))).toBe(
        true,
      )
    }
  })

  it('falls back to tavern-rank-only generation when no parties are available', () => {
    const requests = generateTavernRequestsForDay('empty-001', 1, [])
    expect(requests).toHaveLength(3)
    for (const request of requests) {
      expect(RANKS).toContain(request.rank)
    }
  })
})

describe('generateTavernRequestsForDay', () => {
  it('generates 3 requests that satisfy roster-aware invariants', () => {
    const availableRanks: AdventurerRank[] = ['E', 'E', 'D', 'D']
    for (let i = 0; i < 100; i++) {
      const requests = generateTavernRequestsForDay(
        `gen-invariant-${i}`,
        1,
        availableRanks,
      )
      expect(requests).toHaveLength(3)
      const serviceableCount = requests.filter((r) =>
        isServiceable(r.rank, availableRanks),
      ).length
      expect(serviceableCount).toBeGreaterThanOrEqual(2)
      const maxRequest = Math.max(...requests.map((r) => rankValue(r.rank)))
      const maxParty = Math.max(...availableRanks.map((r) => rankValue(r)))
      expect(maxRequest).toBeLessThanOrEqual(maxParty + 1)
    }
  })
})

describe('Campaign roster-aware request generation', () => {
  it('creates day 1 requests consistent with the initial parties', () => {
    const campaign = createTavernCampaign('roster-day1-001')
    const availableRanks = campaign.currentDay.parties
      .filter((p) => p.availability !== 'recovering')
      .map((p) => p.party.rank)
    const requests = campaign.currentDay.requests
    const serviceableCount = requests.filter((r) =>
      isServiceable(r.rank, availableRanks),
    ).length
    expect(serviceableCount).toBeGreaterThanOrEqual(2)
  })

  it('maintains at least 2 serviceable requests and a sane challenge cap for 30 days', () => {
    let campaign = createTavernCampaign('roster-smoke-001')

    for (let day = 1; day <= 30; day++) {
      const availableRanks = campaign.currentDay.parties
        .filter((p) => p.availability !== 'recovering')
        .map((p) => p.party.rank)

      if (availableRanks.length > 0) {
        const requests = campaign.currentDay.requests
        const serviceableCount = requests.filter((r) =>
          isServiceable(r.rank, availableRanks),
        ).length
        expect(serviceableCount).toBeGreaterThanOrEqual(2)

        const maxRequest = Math.max(...requests.map((r) => rankValue(r.rank)))
        const maxParty = Math.max(...availableRanks.map((r) => rankValue(r)))
        expect(maxRequest).toBeLessThanOrEqual(maxParty + 1)
      }

      campaign = resolveCampaignDay(campaign)
      if (day < 30) {
        campaign = advanceCampaignDay(campaign)
      }
    }
  })
})
