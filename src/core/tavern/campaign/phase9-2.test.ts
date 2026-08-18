import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from './campaign.ts'
import { offerRequestToParty } from '../brokerage.ts'
import {
  computeQuestReputationDelta,
  deriveTavernRank,
  getMaxQuestRank,
} from './reputation.ts'
import {
  serializeGameSave,
  deserializeGameSave,
} from '../../save/serializer.ts'
import { validateGameSave } from '../../save/validation.ts'

function findAcceptingPair(campaign: ReturnType<typeof createTavernCampaign>) {
  for (const request of campaign.currentDay.requests) {
    for (const party of campaign.currentDay.parties) {
      const next = offerRequestToParty(
        campaign.currentDay,
        request.id,
        party.id,
      )
      if (next.matches.some((m) => m.requestId === request.id)) {
        return { requestId: request.id, partyId: party.id, next }
      }
    }
  }
  return null
}

function acceptAllPossible(
  campaign: ReturnType<typeof createTavernCampaign>,
): ReturnType<typeof createTavernCampaign> {
  let state = campaign.currentDay
  const matchedPartyIds = new Set<string>()
  const matchedRequestIds = new Set<string>()

  for (const request of state.requests) {
    if (matchedRequestIds.has(request.id)) continue
    for (const party of state.parties) {
      if (matchedPartyIds.has(party.id)) continue
      if (party.availability === 'recovering') continue
      try {
        const next = offerRequestToParty(state, request.id, party.id)
        if (next.matches.some((m) => m.requestId === request.id)) {
          matchedPartyIds.add(party.id)
          matchedRequestIds.add(request.id)
          state = next
          break
        }
      } catch {
        // continue
      }
    }
  }
  return { ...campaign, currentDay: state }
}

describe('Phase 9.2 tavern reputation & rank smoke', () => {
  it('A: new campaign starts with score 0, peak 0, and tavern rank 1', () => {
    const campaign = createTavernCampaign('phase9-2-a')
    expect(campaign.reputation.score).toBe(0)
    expect(campaign.reputation.peakScore).toBe(0)
    expect(campaign.reputation.events).toEqual([])
    expect(deriveTavernRank(campaign.reputation.peakScore)).toBe(1)
  })

  it('B: resolved expedition creates the exact reputation event for its rank and outcome', () => {
    const campaign = createTavernCampaign('phase9-2-b')
    const pair = findAcceptingPair(campaign)
    expect(pair).not.toBeNull()
    if (!pair) return

    const resolved = resolveCampaignDay({
      ...campaign,
      currentDay: pair.next,
    })
    const result = resolved.currentDay.results.find(
      (r) => r.requestId === pair.requestId,
    )
    expect(result).toBeDefined()
    expect(result?.status).toBe('resolved')
    if (!result || result.status !== 'resolved' || !result.result) return

    const expectedDelta = computeQuestReputationDelta(
      result.request.rank,
      result.result.outcome,
    )

    const matchingEvents = resolved.reputation.events.filter(
      (e) => e.source.requestId === pair.requestId,
    )
    expect(matchingEvents).toHaveLength(1)
    expect(matchingEvents[0]!.delta).toBe(expectedDelta)
    // Day 1 has no prior reputation, so score reflects this single event.
    expect(resolved.reputation.score).toBe(expectedDelta)
  })

  it('C: no dispatched expedition creates no reputation event', () => {
    let campaign = createTavernCampaign('phase9-2-c')
    campaign = resolveCampaignDay(campaign)
    // No matches accepted -> no reputation events -> no change.
    expect(campaign.reputation.score).toBe(0)
    expect(campaign.reputation.events).toEqual([])
  })

  it('D: long-running campaign preserves valid reputation invariants', () => {
    let campaign = createTavernCampaign('phase9-2-d')
    for (let day = 1; day <= 15; day++) {
      const prepared = acceptAllPossible(campaign)
      campaign = resolveCampaignDay(prepared)
      if (day < 15) {
        campaign = advanceCampaignDay(campaign)
      }
    }
    // Whatever the sign, the campaign must remain structurally valid:
    // score is a safe integer, peak is non-negative, and peak >= score
    // (negative scores are separately proven allowed in reputation.test.ts).
    expect(Number.isSafeInteger(campaign.reputation.score)).toBe(true)
    expect(campaign.reputation.peakScore).toBeGreaterThanOrEqual(0)
    expect(campaign.reputation.peakScore).toBeGreaterThanOrEqual(
      campaign.reputation.score,
    )
    expect(campaign.currentDay.requests.length).toBeGreaterThan(0)
  })

  it('E: crossing a peak threshold promotes the tavern rank', () => {
    let campaign = createTavernCampaign('phase9-2-e')
    let promoted = false
    for (let day = 1; day <= 30 && !promoted; day++) {
      const prepared = acceptAllPossible(campaign)
      campaign = resolveCampaignDay(prepared)
      const record = campaign.history[campaign.history.length - 1]!
      if (record.reputationSummary.promoted) {
        promoted = true
        expect(record.reputationSummary.afterRank).toBeGreaterThan(
          record.reputationSummary.beforeRank,
        )
        break
      }
      campaign = advanceCampaignDay(campaign)
    }
    expect(promoted).toBe(true)
  })

  it('F: tavern rank never falls after a later reputation drop', () => {
    let campaign = createTavernCampaign('phase9-2-f')
    let reachedRank2 = false

    for (let day = 1; day <= 40; day++) {
      const prepared = acceptAllPossible(campaign)
      campaign = resolveCampaignDay(prepared)
      const rank = deriveTavernRank(campaign.reputation.peakScore)
      if (rank >= 2) reachedRank2 = true
      if (reachedRank2) {
        // Once rank 2 is reached, it must never regress even if the
        // current score subsequently falls (including below zero).
        expect(
          deriveTavernRank(campaign.reputation.peakScore),
        ).toBeGreaterThanOrEqual(2)
      }
      campaign = advanceCampaignDay(campaign)
    }

    expect(reachedRank2).toBe(true)
  })

  it('G: the generated max quest rank tracks the derived tavern rank', () => {
    let campaign = createTavernCampaign('phase9-2-g')
    for (let day = 1; day <= 20; day++) {
      const tavernRank = deriveTavernRank(campaign.reputation.peakScore)
      const maxAllowed = getMaxQuestRank(tavernRank)
      const order = ['E', 'D', 'C', 'B', 'A', 'S']
      for (const request of campaign.currentDay.requests) {
        expect(order.indexOf(request.rank)).toBeLessThanOrEqual(
          order.indexOf(maxAllowed),
        )
      }
      const prepared = acceptAllPossible(campaign)
      campaign = resolveCampaignDay(prepared)
      if (day < 20) {
        campaign = advanceCampaignDay(campaign)
      }
    }
  })

  it('G2: newly arriving party ranks track the derived tavern rank ceiling', () => {
    let campaign = createTavernCampaign('phase9-2-g2')
    const order = ['E', 'D', 'C', 'B', 'A', 'S']
    for (let day = 1; day <= 20; day++) {
      const tavernRank = deriveTavernRank(campaign.reputation.peakScore)
      const maxAllowed = getMaxQuestRank(tavernRank)
      for (const party of campaign.parties) {
        expect(order.indexOf(party.party.rank)).toBeLessThanOrEqual(
          order.indexOf(maxAllowed),
        )
      }
      const prepared = acceptAllPossible(campaign)
      campaign = resolveCampaignDay(prepared)
      if (day < 20) {
        campaign = advanceCampaignDay(campaign)
      }
    }
  })

  it('H: save/load preserves score, peak, events and derived rank exactly', () => {
    let campaign = createTavernCampaign('phase9-2-h')
    for (let day = 1; day <= 5; day++) {
      const prepared = acceptAllPossible(campaign)
      campaign = resolveCampaignDay(prepared)
      if (day < 5) {
        campaign = advanceCampaignDay(campaign)
      }
    }
    campaign = advanceCampaignDay(campaign)

    const serialized = serializeGameSave({ campaign })
    expect(() => validateGameSave(serialized)).not.toThrow()
    const loaded = deserializeGameSave(serialized)

    expect(loaded.campaign.reputation.score).toBe(campaign.reputation.score)
    expect(loaded.campaign.reputation.peakScore).toBe(
      campaign.reputation.peakScore,
    )
    expect(loaded.campaign.reputation.events).toEqual(
      campaign.reputation.events,
    )
    expect(deriveTavernRank(loaded.campaign.reputation.peakScore)).toBe(
      deriveTavernRank(campaign.reputation.peakScore),
    )
  })

  it('I: reputation resolution creates no narrative generations (AI calls = 0)', () => {
    const campaign = createTavernCampaign('phase9-2-i')
    const generationsBefore = campaign.narrativeGenerations.length
    const prepared = acceptAllPossible(campaign)
    const resolved = resolveCampaignDay(prepared)
    expect(resolved.narrativeGenerations.length).toBe(generationsBefore)
  })

  it('J: reputation computation is a pure function of (day, requests, outcomes) with no RNG input', () => {
    // Two campaigns that reach an identical brokered state via the same
    // seed must produce byte-identical reputation events and totals -
    // the reputation module never draws from the RNG stream itself.
    const a = resolveCampaignDay(
      acceptAllPossible(createTavernCampaign('phase9-2-j')),
    )
    const b = resolveCampaignDay(
      acceptAllPossible(createTavernCampaign('phase9-2-j')),
    )
    expect(a.reputation).toEqual(b.reputation)
  })
})
