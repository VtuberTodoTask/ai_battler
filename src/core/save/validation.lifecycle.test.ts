import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { PARTY_LIFECYCLE_CONFIG } from '../tavern/campaign/lifecycle.ts'
import { purchaseTavernUpgrade } from '../tavern/campaign/upgrades.ts'
import { deriveTavernRank } from '../tavern/campaign/reputation.ts'
import { offerRequestToParty } from '../tavern/brokerage.ts'
import { serializeGameSave } from './serializer.ts'
import { validateGameSave } from './validation.ts'
import type { TavernCampaignState } from '../tavern/campaign/types.ts'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

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
  campaign: ReturnType<typeof createTavernCampaign>,
  n: number,
): ReturnType<typeof createTavernCampaign> {
  let c = campaign
  for (let i = 0; i < n; i++) {
    c = resolveCampaignDay(c)
    c = advanceCampaignDay(c)
  }
  return c
}

/**
 * A campaign advanced a few days without accepting anything, so
 * campaign.dayNumber >= 2 and every party's arrivalDay/lifecycle fields are
 * well-formed — a base to forge lifecycle scenarios onto directly (bypassing
 * the real departure/return state machine, exactly like validation.upgrades
 * tests forge ledger entries directly).
 */
function baseSave(seed: string) {
  const campaign = advanceDaysWithoutQuests(createTavernCampaign(seed), 2)
  return clone(serializeGameSave({ campaign }))
}

describe('save validation: party lifecycle (Phase 9.4)', () => {
  it('accepts a freshly created campaign save', () => {
    const save = clone(
      serializeGameSave({ campaign: createTavernCampaign('lifecycle-fresh') }),
    )
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('accepts a save after a few days with no lifecycle changes', () => {
    const save = baseSave('lifecycle-multi-day')
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('rejects a partyId duplicated across parties and awayParties', () => {
    const save = baseSave('lifecycle-dup-id')
    const dayNumber = save.campaign.dayNumber as number
    const party = clone(save.campaign.parties[0])
    party.lifecycle = {
      status: 'away',
      firstArrivalDay: party.lifecycle.firstArrivalDay,
      visitCount: party.lifecycle.visitCount,
      lastDepartureDay: dayNumber - 1,
      returnEligibleDay:
        dayNumber - 1 + PARTY_LIFECYCLE_CONFIG.returnCooldownDays,
    }
    save.campaign.awayParties.push(party)
    expect(() => validateGameSave(save)).toThrow()
  })

  it('rejects an away party missing lastDepartureDay', () => {
    const save = baseSave('lifecycle-away-missing-departure')
    const dayNumber = save.campaign.dayNumber as number
    const away = clone(save.campaign.parties.pop()!)
    away.lifecycle = {
      status: 'away',
      firstArrivalDay: away.lifecycle.firstArrivalDay,
      visitCount: away.lifecycle.visitCount,
    }
    save.campaign.awayParties.push(away)
    void dayNumber
    expect(() => validateGameSave(save)).toThrow()
  })

  it('rejects an away party whose returnEligibleDay does not match the cooldown formula', () => {
    const save = baseSave('lifecycle-away-bad-cooldown')
    const dayNumber = save.campaign.dayNumber as number
    const away = clone(save.campaign.parties.pop()!)
    away.lifecycle = {
      status: 'away',
      firstArrivalDay: away.lifecycle.firstArrivalDay,
      visitCount: away.lifecycle.visitCount,
      lastDepartureDay: dayNumber - 1,
      returnEligibleDay: dayNumber + 100, // wrong: should be lastDepartureDay + 4
    }
    save.campaign.awayParties.push(away)
    expect(() => validateGameSave(save)).toThrow()
  })

  it('rejects a staying party that carries a returnEligibleDay', () => {
    const save = baseSave('lifecycle-staying-with-return-day')
    const party = save.campaign.parties[0]
    party.lifecycle.returnEligibleDay = party.arrivalDay + 10
    expect(() => validateGameSave(save)).toThrow()
  })

  it('rejects a retired party that carries a returnEligibleDay', () => {
    const save = baseSave('lifecycle-retired-with-return-day')
    const dayNumber = save.campaign.dayNumber as number
    const retired = clone(save.campaign.parties.pop()!)
    retired.lifecycle = {
      status: 'retired',
      firstArrivalDay: retired.lifecycle.firstArrivalDay,
      visitCount: retired.lifecycle.visitCount,
      lastDepartureDay: dayNumber - 1,
      returnEligibleDay:
        dayNumber - 1 + PARTY_LIFECYCLE_CONFIG.returnCooldownDays,
    }
    save.campaign.retiredParties.push(retired)
    expect(() => validateGameSave(save)).toThrow()
  })

  it('rejects a retired party missing lastDepartureDay', () => {
    const save = baseSave('lifecycle-retired-missing-departure')
    const retired = clone(save.campaign.parties.pop()!)
    retired.lifecycle = {
      status: 'retired',
      firstArrivalDay: retired.lifecycle.firstArrivalDay,
      visitCount: retired.lifecycle.visitCount,
    }
    save.campaign.retiredParties.push(retired)
    expect(() => validateGameSave(save)).toThrow()
  })

  it('rejects a party with an arrivalDay in the future', () => {
    const save = baseSave('lifecycle-future-arrival')
    const party = save.campaign.parties[0]
    party.arrivalDay = (save.campaign.dayNumber as number) + 5
    expect(() => validateGameSave(save)).toThrow()
  })

  it('rejects an away party whose lastDepartureDay is in the future (not <= currentDay - 1)', () => {
    const save = baseSave('lifecycle-future-departure')
    const dayNumber = save.campaign.dayNumber as number
    const away = clone(save.campaign.parties.pop()!)
    away.lifecycle = {
      status: 'away',
      firstArrivalDay: away.lifecycle.firstArrivalDay,
      visitCount: away.lifecycle.visitCount,
      lastDepartureDay: dayNumber, // must be <= dayNumber - 1
      returnEligibleDay: dayNumber + PARTY_LIFECYCLE_CONFIG.returnCooldownDays,
    }
    save.campaign.awayParties.push(away)
    expect(() => validateGameSave(save)).toThrow()
  })

  it('allows a returnEligibleDay in the future for an away party (that alone is not a violation)', () => {
    const save = baseSave('lifecycle-future-return-eligible-ok')
    const dayNumber = save.campaign.dayNumber as number
    const away = clone(save.campaign.parties.pop()!)
    away.lifecycle = {
      status: 'away',
      firstArrivalDay: away.lifecycle.firstArrivalDay,
      visitCount: away.lifecycle.visitCount,
      lastDepartureDay: dayNumber - 1,
      returnEligibleDay:
        dayNumber - 1 + PARTY_LIFECYCLE_CONFIG.returnCooldownDays,
    }
    save.campaign.awayParties.push(away)
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('rejects visitCount === 1 whose firstArrivalDay does not equal arrivalDay', () => {
    const save = baseSave('lifecycle-visitcount-mismatch-1')
    const dayNumber = save.campaign.dayNumber as number
    const party = save.campaign.parties[0]
    party.arrivalDay = dayNumber
    party.lifecycle.visitCount = 1
    party.lifecycle.firstArrivalDay = Math.max(1, dayNumber - 1)
    expect(() => validateGameSave(save)).toThrow()
  })

  it('rejects visitCount >= 2 whose firstArrivalDay is not before arrivalDay', () => {
    const save = baseSave('lifecycle-visitcount-mismatch-2')
    const dayNumber = save.campaign.dayNumber as number
    const party = save.campaign.parties[0]
    party.arrivalDay = dayNumber
    party.lifecycle.visitCount = 2
    party.lifecycle.firstArrivalDay = dayNumber
    expect(() => validateGameSave(save)).toThrow()
  })

  it('rejects a staying-party roster larger than the effective (Guest Room derived) capacity', () => {
    const save = baseSave('lifecycle-capacity-exceeded')
    const extra = clone(save.campaign.parties[0])
    extra.id = `${extra.id}-clone`
    for (const member of extra.party.members) {
      member.id = `${member.id}-clone`
    }
    save.campaign.parties.push(extra)
    expect(() => validateGameSave(save)).toThrow()
  })

  it('accepts a staying roster up to (but not exceeding) capacity increased by Guest Room level', () => {
    // Reach tavern rank 2 (required for guest_room level 1) and enough
    // funds, then purchase it for real so the upgrade level, ledger entry,
    // and rank-at-purchase are all mutually consistent.
    let campaign = createTavernCampaign('lifecycle-capacity-guest-room')
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

    const purchase = purchaseTavernUpgrade(campaign, 'guest_room')
    expect(purchase.ok).toBe(true)
    campaign = purchase.campaign

    const save = clone(serializeGameSave({ campaign }))
    const extra = clone(save.campaign.parties[0])
    extra.id = `${extra.id}-clone`
    for (const member of extra.party.members) {
      member.id = `${member.id}-clone`
    }
    save.campaign.parties.push(extra)
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('rejects a lifecycle status value outside staying/away/retired', () => {
    const save = baseSave('lifecycle-bad-status')
    const party = save.campaign.parties[0]
    party.lifecycle.status = 'wandering' as never
    expect(() => validateGameSave(save)).toThrow()
  })

  it('rejects a non-integer visitCount', () => {
    const save = baseSave('lifecycle-noninteger-visitcount')
    const party = save.campaign.parties[0]
    party.lifecycle.visitCount = 1.5
    expect(() => validateGameSave(save)).toThrow()
  })
})
