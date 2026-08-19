import { SeededRng } from '../../rng/seededRng.ts'
import type { CampaignParty, PartyLifecycleState } from './types.ts'

/**
 * Party Lifecycle balance constants (Phase 9.4). A departed party becomes
 * eligible to return only after `returnCooldownDays`; on any day with at
 * least one eligible away party, a single roll (`returnChanceBps`) decides
 * whether a return happens at all, and at most
 * `maxReturningPartiesPerDay` parties return that day.
 */
export const PARTY_LIFECYCLE_CONFIG = {
  returnCooldownDays: 4,
  returnChanceBps: 3500,
  maxReturningPartiesPerDay: 1,
} as const

export function createInitialLifecycleState(
  arrivalDay: number,
): PartyLifecycleState {
  return {
    status: 'staying',
    firstArrivalDay: arrivalDay,
    visitCount: 1,
  }
}

/**
 * Marks a party as having just left the tavern. Scheduled departures
 * become 'away' (eligible to return after the cooldown); casualty
 * departures become 'retired' (permanent — Phase 9.4 does not add any
 * other automatic retirement trigger). `resolvedDay` is the day whose
 * resolution/transition produced this departure (i.e. campaign.dayNumber
 * before it is advanced to the next day), matching the day the party is
 * last seen in the active roster.
 */
export function applyDeparture(
  party: CampaignParty,
  resolvedDay: number,
  casualty: boolean,
): void {
  party.lifecycle.lastDepartureDay = resolvedDay
  if (casualty) {
    party.lifecycle.status = 'retired'
    party.lifecycle.returnEligibleDay = undefined
    return
  }
  party.lifecycle.status = 'away'
  party.lifecycle.returnEligibleDay =
    resolvedDay + PARTY_LIFECYCLE_CONFIG.returnCooldownDays
}

/**
 * Restores an away party to active duty on arrivalDay, preserving its
 * identity, relationships, memories, arcs, milestones, and expedition
 * history untouched. Only lifecycle bookkeeping and this new stay's
 * arrival/departure window are updated — the party is never regenerated.
 */
export function applyReturn(
  party: CampaignParty,
  campaignSeed: string,
  arrivalDay: number,
): void {
  party.lifecycle.status = 'staying'
  party.lifecycle.visitCount += 1
  party.lifecycle.returnEligibleDay = undefined
  party.arrivalDay = arrivalDay

  const stayRng = new SeededRng(
    `${campaignSeed}:return:${party.id}:${arrivalDay}:stay`,
  )
  const stayLength = stayRng.integer(3, 6)
  party.plannedDepartureDay = arrivalDay + stayLength - 1
  // Each stay gets its own extension budget; the prior stay's is spent.
  party.relationship.stayExtensionDaysUsed = 0
}

/**
 * Away parties whose cooldown has elapsed by targetDay, stable-sorted by
 * partyId so the return roll's candidate pool never depends on array
 * insertion order.
 */
export function selectEligibleAwayParties(
  awayParties: readonly CampaignParty[],
  targetDay: number,
): CampaignParty[] {
  return awayParties
    .filter(
      (p) =>
        p.lifecycle.status === 'away' &&
        p.lifecycle.returnEligibleDay !== undefined &&
        p.lifecycle.returnEligibleDay <= targetDay,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Rolls whether a party returns today and, if so, selects exactly one
 * from the (already-eligible, already-sorted) candidate pool. The 35%
 * roll always happens whenever the pool is non-empty, even with a single
 * candidate — but selecting among a single candidate consumes no
 * additional RNG draw, keeping the RNG sequence's length dependent only
 * on how many genuine choices existed.
 */
export function attemptPartyReturn(
  rng: SeededRng,
  eligibleParties: readonly CampaignParty[],
): CampaignParty | undefined {
  if (eligibleParties.length === 0) return undefined
  const succeeded = rng.chance(PARTY_LIFECYCLE_CONFIG.returnChanceBps / 100)
  if (!succeeded) return undefined
  if (eligibleParties.length === 1) return eligibleParties[0]
  return rng.pick(eligibleParties)
}
