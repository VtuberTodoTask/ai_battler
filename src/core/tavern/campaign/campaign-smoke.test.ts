import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from './campaign.ts'
import { offerRequestToParty } from '../brokerage.ts'

function findAnyAcceptingOffer(
  campaign: ReturnType<typeof createTavernCampaign>,
) {
  for (const request of campaign.currentDay.requests) {
    for (const party of campaign.currentDay.parties) {
      if (party.availability === 'recovering') continue
      const next = offerRequestToParty(
        campaign.currentDay,
        request.id,
        party.id,
      )
      if (next.matches.length > 0) {
        return { requestId: request.id, partyId: party.id, next }
      }
    }
  }
  return null
}

function resolveWithOptionalOffer(
  campaign: ReturnType<typeof createTavernCampaign>,
) {
  const offer = findAnyAcceptingOffer(campaign)
  if (offer) {
    campaign = { ...campaign, currentDay: offer.next }
  }
  return resolveCampaignDay(campaign)
}

describe('Campaign 30-day smoke', () => {
  it('runs 30 days without crashing and maintains invariants', () => {
    const seeds = [
      'tavern-smoke-001',
      'tavern-smoke-002',
      'tavern-smoke-003',
      'tavern-smoke-004',
      'tavern-smoke-005',
    ]

    for (const seed of seeds) {
      let campaign = createTavernCampaign(seed)
      const seenMemberIds = new Map<number, Set<string>>()

      for (let day = 1; day <= 30; day++) {
        expect(campaign.dayNumber).toBe(day)
        expect(campaign.reputation).toBeGreaterThanOrEqual(0)
        expect(campaign.reputation).toBeLessThanOrEqual(100)
        expect(campaign.parties).toHaveLength(4)
        expect(campaign.currentDay.requests).toHaveLength(3)
        expect(campaign.currentDay.status).toBe('planning')

        const memberIds = new Set(
          campaign.parties.flatMap((p) => p.party.members.map((m) => m.id)),
        )
        expect(memberIds.size).toBe(16)
        seenMemberIds.set(day, memberIds)

        campaign = resolveWithOptionalOffer(campaign)
        expect(campaign.currentDay.status).toBe('resolved')

        if (day < 30) {
          campaign = advanceCampaignDay(campaign)
        }
      }

      expect(campaign.dayNumber).toBe(30)
      expect(campaign.history).toHaveLength(30)
    }
  })
})
