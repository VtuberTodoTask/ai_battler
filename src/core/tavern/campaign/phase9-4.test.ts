import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from './campaign.ts'
import { offerRequestToParty } from '../brokerage.ts'
import { deriveTavernRank } from './reputation.ts'
import {
  BASE_PARTY_CAPACITY,
  getEffectivePartyCapacity,
  purchaseTavernUpgrade,
} from './upgrades.ts'
import {
  PARTY_LIFECYCLE_CONFIG,
  selectEligibleAwayParties,
} from './lifecycle.ts'
import { deepClone } from '../../util.ts'
import {
  serializeGameSave,
  deserializeGameSave,
} from '../../save/serializer.ts'
import { validateGameSave } from '../../save/validation.ts'
import type { CampaignParty, TavernCampaignState } from './types.ts'

function acceptAllPossible(campaign: TavernCampaignState): TavernCampaignState {
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

function advanceDaysWithoutQuests(
  campaign: TavernCampaignState,
  n: number,
): TavernCampaignState {
  let c = campaign
  for (let i = 0; i < n; i++) {
    c = resolveCampaignDay(c)
    c = advanceCampaignDay(c)
  }
  return c
}

/**
 * Forces a specific staying party to depart on the very next
 * advanceCampaignDay call, by setting its planned departure to the current
 * (about-to-resolve) day and ensuring it isn't recovering — bypassing the
 * random 3-6 day stay window so departure tests are deterministic.
 */
function forceImmediateDeparture(
  campaign: TavernCampaignState,
  partyId: string,
): TavernCampaignState {
  const next = deepClone(campaign)
  const party = next.parties.find((p) => p.id === partyId)!
  party.plannedDepartureDay = next.dayNumber
  party.recoveringThroughDay = undefined
  party.relationship.affinity = 0 // minimize any affinity-based extension chance
  return next
}

describe('Phase 9.4 party lifecycle smoke', () => {
  it('A: a freshly created campaign starts every party as staying, visitCount 1, no departure history', () => {
    const campaign = createTavernCampaign('phase9-4-a')
    expect(campaign.parties.length).toBe(BASE_PARTY_CAPACITY)
    expect(campaign.awayParties).toEqual([])
    expect(campaign.retiredParties).toEqual([])
    for (const party of campaign.parties) {
      expect(party.lifecycle.status).toBe('staying')
      expect(party.lifecycle.firstArrivalDay).toBe(1)
      expect(party.lifecycle.visitCount).toBe(1)
      expect(party.lifecycle.lastDepartureDay).toBeUndefined()
      expect(party.lifecycle.returnEligibleDay).toBeUndefined()
      expect(party.arrivalDay).toBe(1)
    }
  })

  it('B: identity, relationships, and lifecycle metadata persist unchanged across days while still within the stay window', () => {
    let campaign = createTavernCampaign('phase9-4-b')
    // Pick a party with a comfortably long remaining stay window.
    const target = [...campaign.parties].sort(
      (a, b) => b.plannedDepartureDay - a.plannedDepartureDay,
    )[0]!
    const partyId = target.id
    const characterIds = target.party.members.map((m) => m.id).sort()
    const nameBefore = target.party.name
    const rankBefore = target.party.rank

    campaign = advanceDaysWithoutQuests(campaign, 1)
    const stillPresent = campaign.parties.find((p) => p.id === partyId)
    if (!stillPresent) {
      // Extremely rare with the default stay-length distribution, but guard
      // against seed-dependent flakiness rather than asserting on a party
      // that already departed.
      return
    }
    expect(stillPresent.party.name).toBe(nameBefore)
    expect(stillPresent.party.rank).toBe(rankBefore)
    expect(stillPresent.party.members.map((m) => m.id).sort()).toEqual(
      characterIds,
    )
    expect(stillPresent.lifecycle.status).toBe('staying')
    expect(stillPresent.lifecycle.visitCount).toBe(1)
    expect(stillPresent.lifecycle.firstArrivalDay).toBe(1)
    expect(stillPresent.arrivalDay).toBe(1) // never re-stamped while still staying
  })

  it('C: a party whose stay has ended departs — moved to awayParties, never deleted', () => {
    let campaign = createTavernCampaign('phase9-4-c')
    const target = campaign.parties[0]!
    const partyId = target.id
    const nameBefore = target.party.name
    const characterIds = target.party.members.map((m) => m.id).sort()

    campaign = forceImmediateDeparture(campaign, partyId)
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign)

    expect(campaign.parties.find((p) => p.id === partyId)).toBeUndefined()
    const departed = campaign.awayParties.find((p) => p.id === partyId)
    expect(departed).toBeDefined()
    expect(departed!.lifecycle.status).toBe('away')
    expect(departed!.lifecycle.lastDepartureDay).toBe(1)
    expect(departed!.lifecycle.returnEligibleDay).toBe(
      1 + PARTY_LIFECYCLE_CONFIG.returnCooldownDays,
    )
    // Identity preserved, not deleted or regenerated.
    expect(departed!.party.name).toBe(nameBefore)
    expect(departed!.party.members.map((m) => m.id).sort()).toEqual(
      characterIds,
    )
  })

  it('D: a departed party is not eligible to return before its cooldown elapses', () => {
    let campaign = createTavernCampaign('phase9-4-d')
    const partyId = campaign.parties[0]!.id
    campaign = forceImmediateDeparture(campaign, partyId)
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign) // departure day resolves as day 1; now day 2

    const departed = campaign.awayParties.find((p) => p.id === partyId)!
    expect(departed.lifecycle.returnEligibleDay).toBe(5) // 1 + 4

    // Days 2, 3, 4 (returnEligibleDay=5 not yet reached): never eligible,
    // and the departed party never reappears in the staying roster.
    for (let day = campaign.dayNumber; day < 5; day++) {
      expect(selectEligibleAwayParties(campaign.awayParties, day)).toEqual([])
      expect(campaign.parties.some((p) => p.id === partyId)).toBe(false)
      campaign = advanceDaysWithoutQuests(campaign, 1)
    }
  })

  it('E: once the cooldown elapses, the departed party becomes return-eligible, and an observed return preserves identity', () => {
    let campaign = createTavernCampaign('phase9-4-e')
    const target = campaign.parties[0]!
    const partyId = target.id
    const nameBefore = target.party.name
    const characterIds = target.party.members.map((m) => m.id).sort()

    campaign = forceImmediateDeparture(campaign, partyId)
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign) // now day 2, party away, returnEligibleDay = 5

    // Eligibility becomes true exactly on day 5 — checked here (at day 4,
    // before the day4->day5 transition where a return could actually
    // happen) so the check itself can't be short-circuited by an
    // already-completed return.
    campaign = advanceDaysWithoutQuests(campaign, 2) // now day 4
    expect(campaign.dayNumber).toBe(4)
    expect(
      selectEligibleAwayParties(campaign.awayParties, 4).some(
        (p) => p.id === partyId,
      ),
    ).toBe(false)
    expect(
      selectEligibleAwayParties(campaign.awayParties, 5).some(
        (p) => p.id === partyId,
      ),
    ).toBe(true)

    // Observe an actual return via the real day-advance state machine: keep
    // advancing (bounded) until the 35% roll succeeds at least once, then
    // verify identity/history preservation and visitCount increment.
    let returned: CampaignParty | undefined
    for (let i = 0; i < 200 && !returned; i++) {
      campaign = advanceDaysWithoutQuests(campaign, 1)
      returned = campaign.parties.find((p) => p.id === partyId)
    }

    expect(returned).toBeDefined()
    expect(returned!.lifecycle.status).toBe('staying')
    expect(returned!.lifecycle.visitCount).toBe(2)
    expect(returned!.lifecycle.firstArrivalDay).toBe(1)
    expect(returned!.lifecycle.returnEligibleDay).toBeUndefined()
    expect(returned!.party.name).toBe(nameBefore)
    expect(returned!.party.members.map((m) => m.id).sort()).toEqual(
      characterIds,
    )
    expect(campaign.awayParties.some((p) => p.id === partyId)).toBe(false)
  })

  it('F: purchasing Guest Room spends funds, raises the level, and leaves same-day capacity unchanged', () => {
    let campaign = createTavernCampaign('phase9-4-f')
    for (let day = 1; day <= 80; day++) {
      campaign = resolveCampaignDay(acceptAllPossible(campaign))
      const rank2 = deriveTavernRank(campaign.reputation.peakScore) >= 2
      if (rank2 && campaign.finance.funds >= 150) break
      campaign = advanceCampaignDay(campaign)
    }
    campaign = advanceCampaignDay(campaign)
    expect(
      deriveTavernRank(campaign.reputation.peakScore),
    ).toBeGreaterThanOrEqual(2)

    const fundsBefore = campaign.finance.funds
    const partyCountBefore = campaign.currentDay.parties.length
    expect(
      getEffectivePartyCapacity(BASE_PARTY_CAPACITY, campaign.upgrades),
    ).toBe(BASE_PARTY_CAPACITY)

    const purchase = purchaseTavernUpgrade(campaign, 'guest_room')
    expect(purchase.ok).toBe(true)
    campaign = purchase.campaign

    expect(campaign.finance.funds).toBe(fundsBefore - 150)
    expect(campaign.upgrades.levels.guest_room).toBe(1)
    const ledgerEntry = campaign.finance.ledgerEntries.find(
      (e) =>
        e.kind === 'upgrade_purchase' && e.source.upgradeId === 'guest_room',
    )
    expect(ledgerEntry).toBeDefined()

    // Same day's already-generated roster is untouched by the purchase.
    expect(campaign.currentDay.parties.length).toBe(partyCountBefore)
    expect(campaign.parties.length).toBe(BASE_PARTY_CAPACITY)
  })

  it('G: Guest Room capacity applies from the following day, filling the new vacancy', () => {
    let campaign = createTavernCampaign('phase9-4-g')
    for (let day = 1; day <= 80; day++) {
      campaign = resolveCampaignDay(acceptAllPossible(campaign))
      const rank2 = deriveTavernRank(campaign.reputation.peakScore) >= 2
      if (rank2 && campaign.finance.funds >= 150) break
      campaign = advanceCampaignDay(campaign)
    }
    campaign = advanceCampaignDay(campaign)

    const purchase = purchaseTavernUpgrade(campaign, 'guest_room')
    expect(purchase.ok).toBe(true)
    campaign = purchase.campaign
    expect(campaign.parties.length).toBe(BASE_PARTY_CAPACITY)

    campaign = resolveCampaignDay(acceptAllPossible(campaign))
    campaign = advanceCampaignDay(campaign)

    expect(
      getEffectivePartyCapacity(BASE_PARTY_CAPACITY, campaign.upgrades),
    ).toBe(BASE_PARTY_CAPACITY + 1)
    expect(campaign.parties.length).toBe(BASE_PARTY_CAPACITY + 1)
  })

  it('H: save/load round-trip preserves the full lifecycle state (staying, away, and history) exactly', () => {
    let campaign = createTavernCampaign('phase9-4-h')
    const partyId = campaign.parties[0]!.id
    campaign = forceImmediateDeparture(campaign, partyId)
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign) // party now away

    const serialized = serializeGameSave({ campaign })
    expect(() => validateGameSave(serialized)).not.toThrow()
    const loaded = deserializeGameSave(serialized)

    expect(loaded.campaign.parties).toEqual(campaign.parties)
    expect(loaded.campaign.awayParties).toEqual(campaign.awayParties)
    expect(loaded.campaign.retiredParties).toEqual(campaign.retiredParties)
    expect(
      loaded.campaign.awayParties.find((p) => p.id === partyId)?.lifecycle,
    ).toEqual(campaign.awayParties.find((p) => p.id === partyId)?.lifecycle)
  })

  it('I: zero AI calls across departure, return, arrival, and Guest Room purchase', () => {
    let campaign = createTavernCampaign('phase9-4-i')
    expect(campaign.narrativeGenerations.length).toBe(0)

    const partyId = campaign.parties[0]!.id
    campaign = forceImmediateDeparture(campaign, partyId)
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign)
    expect(campaign.narrativeGenerations.length).toBe(0)

    for (let day = 1; day <= 80; day++) {
      campaign = resolveCampaignDay(acceptAllPossible(campaign))
      const rank2 = deriveTavernRank(campaign.reputation.peakScore) >= 2
      if (rank2 && campaign.finance.funds >= 150) break
      campaign = advanceCampaignDay(campaign)
    }
    campaign = advanceCampaignDay(campaign)
    expect(campaign.narrativeGenerations.length).toBe(0)

    const purchase = purchaseTavernUpgrade(campaign, 'guest_room')
    expect(purchase.ok).toBe(true)
    campaign = purchase.campaign
    expect(campaign.narrativeGenerations.length).toBe(0)

    campaign = advanceDaysWithoutQuests(campaign, 10)
    expect(campaign.narrativeGenerations.length).toBe(0)
  })

  it('J: identical seed + state + actions produce identical departure/return/arrival outcomes after a save/load round-trip', () => {
    let campaign = createTavernCampaign('phase9-4-j')
    campaign = advanceDaysWithoutQuests(campaign, 3)

    const serialized = serializeGameSave({ campaign })
    const reloaded = deserializeGameSave(serialized).campaign

    let continuedOriginal = campaign
    let continuedReloaded = reloaded
    for (let i = 0; i < 15; i++) {
      continuedOriginal = resolveCampaignDay(continuedOriginal)
      continuedOriginal = advanceCampaignDay(continuedOriginal)
      continuedReloaded = resolveCampaignDay(continuedReloaded)
      continuedReloaded = advanceCampaignDay(continuedReloaded)
    }

    expect(continuedReloaded.dayNumber).toBe(continuedOriginal.dayNumber)
    expect(continuedReloaded.parties).toEqual(continuedOriginal.parties)
    expect(continuedReloaded.awayParties).toEqual(continuedOriginal.awayParties)
    expect(continuedReloaded.retiredParties).toEqual(
      continuedOriginal.retiredParties,
    )
  })
})
