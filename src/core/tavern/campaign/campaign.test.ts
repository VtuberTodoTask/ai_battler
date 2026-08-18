import { describe, expect, it } from 'vitest'
import {
  createTavernCampaign,
  resolveCampaignDay,
  advanceCampaignDay,
} from './campaign.ts'
import { offerRequestToParty, getOfferErrors } from '../brokerage.ts'
import { buildTavernDay } from './generators.ts'
import {
  calculateRecoveryDays,
  updateCampaignPartyStats,
} from './partyState.ts'
import { applyQuestSettlement } from '../../economy/finance.ts'
import { getPartyRankWeights, getRequestRankWeights } from './rankWeights.ts'
import { deriveTavernRank } from './reputation.ts'

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

describe('Campaign domain', () => {
  it('creates a new campaign with day 1, zero reputation, 4 parties and 3 requests', () => {
    const campaign = createTavernCampaign('tavern-campaign-test-001')
    expect(campaign.version).toBe(1)
    expect(campaign.dayNumber).toBe(1)
    expect(campaign.reputation.score).toBe(0)
    expect(campaign.reputation.peakScore).toBe(0)
    expect(campaign.reputation.events).toEqual([])
    expect(campaign.parties).toHaveLength(4)
    expect(campaign.currentDay.requests).toHaveLength(3)
    expect(campaign.currentDay.parties).toHaveLength(4)
    expect(campaign.parties.every((p) => p.arrivalDay === 1)).toBe(true)
    expect(campaign.currentDay.status).toBe('planning')
  })

  it('starts at tavern rank 1', () => {
    const campaign = createTavernCampaign('tavern-campaign-tier-001')
    expect(deriveTavernRank(campaign.reputation.peakScore)).toBe(1)
  })

  it('advances party serial and assigns unique ids', () => {
    const campaign = createTavernCampaign('tavern-campaign-serial-001')
    const ids = new Set(campaign.parties.map((p) => p.id))
    expect(ids.size).toBe(4)
    expect(campaign.parties.every((p) => p.id && p.party.id)).toBe(true)
  })

  it('resolves a day with no accepted matches without changing reputation', () => {
    let campaign = createTavernCampaign('tavern-campaign-no-match-001')
    campaign = resolveCampaignDay(campaign)
    expect(campaign.currentDay.status).toBe('resolved')
    expect(campaign.currentDay.results).toHaveLength(3)
    expect(campaign.reputation.score).toBe(0)
    expect(campaign.reputation.events).toEqual([])
    expect(campaign.history).toHaveLength(1)
    expect(campaign.history[0].reputationSummary.delta).toBe(0)
  })

  it('resolves a day with an accepted match and updates party stats and reputation', () => {
    let campaign = createTavernCampaign('tavern-campaign-match-001')
    const pair = findAcceptingPair(campaign)
    expect(pair).not.toBeNull()

    if (pair) {
      campaign = {
        ...campaign,
        currentDay: pair.next,
      }
      const beforeReputation = campaign.reputation.score
      const partyBefore = campaign.parties.find((p) => p.id === pair.partyId)!
      campaign = resolveCampaignDay(campaign)
      const partyAfter = campaign.parties.find((p) => p.id === pair.partyId)!
      expect(partyAfter.stats.totalExpeditions).toBe(
        partyBefore.stats.totalExpeditions + 1,
      )
      expect(campaign.currentDay.status).toBe('resolved')
      expect(Number.isInteger(campaign.reputation.score)).toBe(true)
      expect(campaign.reputation.peakScore).toBeGreaterThanOrEqual(0)
      expect(campaign.history[0].reputationSummary.beforeScore).toBe(
        beforeReputation,
      )
      expect(campaign.reputation.events).toHaveLength(1)
    }
  })

  it('advances to the next day, keeps or refills roster to 4', () => {
    let campaign = createTavernCampaign('tavern-campaign-advance-001')
    campaign = resolveCampaignDay(campaign)
    const beforeIds = campaign.parties.map((p) => p.id)
    campaign = advanceCampaignDay(campaign)
    expect(campaign.dayNumber).toBe(2)
    expect(campaign.currentDay.status).toBe('planning')
    expect(campaign.parties).toHaveLength(4)
    expect(campaign.currentDay.requests).toHaveLength(3)
    const afterIds = campaign.parties.map((p) => p.id)
    expect(afterIds).toHaveLength(4)
    // The same-day advance for short-stay parties may keep the roster identical.
    expect(afterIds.some((id) => beforeIds.includes(id))).toBe(true)
  })

  it('preserves recovering parties in the tavern day as unavailable', () => {
    const campaign = createTavernCampaign('tavern-campaign-recover-001')
    const party = campaign.parties[0]
    party.recoveringThroughDay = 1
    const day = buildTavernDay(
      campaign.currentDay.seed,
      campaign.currentDay.requests,
      campaign.parties,
      campaign.dayNumber,
    )
    const tavernParty = day.parties.find((p) => p.id === party.id)!
    expect(tavernParty.availability).toBe('recovering')
    expect(tavernParty.recoveryDaysRemaining).toBe(1)
    expect(getOfferErrors(day, day.requests[0].id, tavernParty.id)).toContain(
      'このパーティは療養中です',
    )
  })

  it('calculates recovery days based on condition and HP', () => {
    const campaign = createTavernCampaign('tavern-campaign-recovery-001')
    const party = campaign.parties[0]

    // Fully healthy.
    expect(calculateRecoveryDays(party)).toBe(0)

    // Minor injury (any injury stored).
    party.condition.injuries = [
      {
        id: 'inj-1',
        adventurerId: party.party.members[0].id,
        type: 'light',
        cause: 'test',
        hpLoss: 5,
        status: 'active',
      },
    ]
    expect(calculateRecoveryDays(party)).toBe(1)

    // Serious unresolved injury.
    party.condition.injuries = [
      {
        id: 'inj-2',
        adventurerId: party.party.members[0].id,
        type: 'serious',
        cause: 'test',
        hpLoss: 15,
        status: 'active',
      },
    ]
    expect(calculateRecoveryDays(party)).toBe(2)

    party.condition.injuries = []
    party.party.members[0].currentHp = Math.floor(
      party.party.members[0].maxHp * 0.2,
    )
    expect(calculateRecoveryDays(party)).toBe(2)
  })

  it('recovery completion gives minimum 70 morale and avoids double overnight recovery', () => {
    let campaign = createTavernCampaign('tavern-campaign-recovery-morale-001')
    campaign = resolveCampaignDay(campaign)

    const party = campaign.parties[0]
    party.recoveringThroughDay = 1
    for (const member of party.party.members) {
      member.morale = 40
      member.currentHp = 1
      member.currentMp = 1
    }
    party.condition.injuries = [
      {
        id: 'inj-1',
        adventurerId: party.party.members[0].id,
        type: 'light',
        cause: 'test',
        hpLoss: 5,
        status: 'active',
      },
    ]
    party.condition.incapacitatedIds = [party.party.members[1].id]
    party.party.members[1].statusEffects = [
      { type: 'stunned', duration: 1, sourceId: 'test' },
    ]

    campaign = advanceCampaignDay(campaign)

    const recoveredParty = campaign.parties.find((p) => p.id === party.id)!
    expect(recoveredParty).toBeDefined()
    expect(recoveredParty.recoveringThroughDay).toBeUndefined()
    expect(recoveredParty.party.members[0].morale).toBe(70)
    expect(
      recoveredParty.party.members.every((m) => m.currentHp === m.maxHp),
    ).toBe(true)
    expect(
      recoveredParty.party.members.every((m) => m.currentMp === m.maxMp),
    ).toBe(true)
    expect(recoveredParty.condition.injuries).toHaveLength(0)
    expect(recoveredParty.condition.incapacitatedIds).toHaveLength(0)
    expect(recoveredParty.party.members[1].statusEffects).toHaveLength(0)

    const tavernParty = campaign.currentDay.parties.find(
      (p) => p.id === party.id,
    )!
    expect(tavernParty.availability).toBe('available')
  })

  it('prioritizes scheduled departure over recovery completion', () => {
    let campaign = createTavernCampaign(
      'tavern-campaign-departure-over-recovery-001',
    )
    const targetId = campaign.parties[0].id

    campaign = resolveCampaignDay(campaign)
    campaign.parties[0].plannedDepartureDay = 2
    campaign.parties[0].recoveringThroughDay = 2

    campaign = advanceCampaignDay(campaign)
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign)

    expect(campaign.parties.some((p) => p.id === targetId)).toBe(false)
    const day3Events = campaign.currentDay.partyEvents ?? []
    expect(day3Events.some((e) => e.type === 'departedScheduled')).toBe(true)
    expect(day3Events.some((e) => e.type === 'finishedRecovery')).toBe(false)
    expect(
      day3Events.filter((e) => e.partyId === targetId).map((e) => e.type),
    ).toEqual(['departedScheduled'])
  })

  it('orders departure, recovery completion, and overnight recovery correctly', () => {
    let campaign = createTavernCampaign('tavern-campaign-event-order-001')
    campaign = resolveCampaignDay(campaign)

    const [departingParty, recoveringParty, overnightParty] = campaign.parties

    departingParty.plannedDepartureDay = 1

    recoveringParty.recoveringThroughDay = 1
    for (const member of recoveringParty.party.members) {
      member.morale = 40
      member.currentHp = 1
      member.currentMp = 1
    }
    recoveringParty.condition.injuries = [
      {
        id: 'inj-2',
        adventurerId: recoveringParty.party.members[0].id,
        type: 'light',
        cause: 'test',
        hpLoss: 5,
        status: 'active',
      },
    ]

    const beforeOvernightHp = Math.floor(
      overnightParty.party.members[0].maxHp * 0.5,
    )
    for (const member of overnightParty.party.members) {
      member.morale = 40
      member.currentMp = 1
      member.currentHp = beforeOvernightHp
    }

    campaign = advanceCampaignDay(campaign)

    expect(
      campaign.currentDay.partyEvents
        ?.filter((e) => e.partyId === departingParty.id)
        .map((e) => e.type),
    ).toEqual(['departedScheduled'])
    expect(
      campaign.currentDay.partyEvents
        ?.filter((e) => e.partyId === recoveringParty.id)
        .map((e) => e.type),
    ).toEqual(['finishedRecovery'])
    expect(
      campaign.currentDay.partyEvents?.some(
        (e) => e.type === 'arrived' && e.partyId !== departingParty.id,
      ),
    ).toBe(true)

    const updatedRecovering = campaign.parties.find(
      (p) => p.id === recoveringParty.id,
    )!
    expect(updatedRecovering.party.members[0].morale).toBe(70)

    const updatedOvernight = campaign.parties.find(
      (p) => p.id === overnightParty.id,
    )!
    expect(updatedOvernight.party.members[0].currentMp).toBe(
      updatedOvernight.party.members[0].maxMp,
    )
    expect(updatedOvernight.party.members[0].morale).toBe(50)
    expect(updatedOvernight.party.members[0].currentHp).toBeGreaterThan(
      beforeOvernightHp,
    )
  })

  it('counts completeSuccess and success stats exclusively', () => {
    const campaign = createTavernCampaign('tavern-campaign-stats-001')
    const party = campaign.parties[0]

    expect(party.stats.totalExpeditions).toBe(0)

    updateCampaignPartyStats(party, 'completeSuccess')
    expect(party.stats.totalExpeditions).toBe(1)
    expect(party.stats.completeSuccesses).toBe(1)
    expect(party.stats.successes).toBe(0)

    updateCampaignPartyStats(party, 'success')
    expect(party.stats.totalExpeditions).toBe(2)
    expect(party.stats.completeSuccesses).toBe(1)
    expect(party.stats.successes).toBe(1)

    updateCampaignPartyStats(party, 'partialSuccess')
    expect(party.stats.partialSuccesses).toBe(1)

    updateCampaignPartyStats(party, 'failedObjective')
    expect(party.stats.failures).toBe(1)

    updateCampaignPartyStats(party, 'forcedRetreat')
    expect(party.stats.retreats).toBe(1)

    expect(
      party.stats.completeSuccesses +
        party.stats.successes +
        party.stats.partialSuccesses +
        party.stats.failures +
        party.stats.retreats,
    ).toBe(party.stats.totalExpeditions)
  })

  it('returns rank weights hard-capped by tavern rank', () => {
    expect(getPartyRankWeights(1).A).toBe(0)
    expect(getPartyRankWeights(1).C).toBe(0)
    expect(getPartyRankWeights(4).A).toBeGreaterThan(0)
    expect(getPartyRankWeights(4).S).toBe(0)

    expect(getRequestRankWeights(1).S).toBe(0)
    expect(getRequestRankWeights(1).C).toBe(0)
    expect(getRequestRankWeights(5).S).toBeGreaterThan(0)
  })

  it('never excludes lower ranks from the candidate pool, even at tavern rank 5', () => {
    // Raising the rank ceiling must never crowd out E/D/C content.
    const partyWeights5 = getPartyRankWeights(5)
    expect(partyWeights5.E).toBeGreaterThan(0)
    expect(partyWeights5.D).toBeGreaterThan(0)
    expect(partyWeights5.C).toBeGreaterThan(0)
    expect(partyWeights5.B).toBeGreaterThan(0)
    expect(partyWeights5.A).toBeGreaterThan(0)
    expect(partyWeights5.S).toBeGreaterThan(0)

    const requestWeights5 = getRequestRankWeights(5)
    expect(requestWeights5.E).toBeGreaterThan(0)
    expect(requestWeights5.D).toBeGreaterThan(0)
    expect(requestWeights5.C).toBeGreaterThan(0)
    expect(requestWeights5.B).toBeGreaterThan(0)
    expect(requestWeights5.A).toBeGreaterThan(0)
    expect(requestWeights5.S).toBeGreaterThan(0)
  })

  describe('relationship and stay extension', () => {
    it('applies affinity and financial pressure from an expedition outcome', () => {
      let campaign = createTavernCampaign('tavern-relationship-outcome-001')
      const pair = findAcceptingPair(campaign)
      expect(pair).not.toBeNull()
      if (!pair) return

      const partyBefore = campaign.parties.find((p) => p.id === pair.partyId)!
      partyBefore.relationship.financialPressure = 40

      campaign = { ...campaign, currentDay: pair.next }
      campaign = resolveCampaignDay(campaign)

      const partyAfter = campaign.parties.find((p) => p.id === pair.partyId)!
      const affinityEvent = campaign.history[0].relationshipEvents.find(
        (e) => e.type === 'affinityChanged' && e.partyId === pair.partyId,
      )
      const pressureEvent = campaign.history[0].relationshipEvents.find(
        (e) =>
          e.type === 'financialPressureChanged' &&
          e.partyId === pair.partyId &&
          e.source === 'expedition',
      )
      expect(affinityEvent).toBeDefined()
      expect(pressureEvent).toBeDefined()
      expect(partyAfter.relationship.affinity).not.toBe(
        partyBefore.relationship.affinity,
      )
    })

    it('does not apply idle pressure to a dispatched party', () => {
      let campaign = createTavernCampaign('tavern-relationship-idle-001')
      const pair = findAcceptingPair(campaign)
      expect(pair).not.toBeNull()
      if (!pair) return

      const partyId = pair.partyId
      const pressureBefore = campaign.parties.find((p) => p.id === partyId)!
        .relationship.financialPressure

      campaign = { ...campaign, currentDay: pair.next }
      campaign = resolveCampaignDay(campaign)

      const idleEvents = campaign.history[0].relationshipEvents.filter(
        (e) =>
          e.type === 'financialPressureChanged' &&
          e.partyId === partyId &&
          e.source === 'idle',
      )
      expect(idleEvents).toHaveLength(0)

      const dispatched = campaign.currentDay.results.find(
        (r) => r.partyId === partyId,
      )
      if (dispatched && dispatched.status === 'resolved') {
        const expeditionPressure = campaign.history[0].relationshipEvents.find(
          (e) =>
            e.type === 'financialPressureChanged' &&
            e.partyId === partyId &&
            e.source === 'expedition',
        )!
        expect(expeditionPressure?.type).toBe('financialPressureChanged')
        if (expeditionPressure?.type === 'financialPressureChanged') {
          expect(expeditionPressure.before).toBe(pressureBefore)
        }
      }
    })

    it('applies idle pressure only once per day for non-dispatched parties', () => {
      let campaign = createTavernCampaign('tavern-relationship-idle-once-001')
      campaign = resolveCampaignDay(campaign)

      const party = campaign.parties[0]
      const idleEvents = campaign.history[0].relationshipEvents.filter(
        (e) =>
          e.type === 'financialPressureChanged' &&
          e.partyId === party.id &&
          e.source === 'idle',
      )
      expect(idleEvents).toHaveLength(1)
      expect(idleEvents[0].type).toBe('financialPressureChanged')
      if (idleEvents[0].type === 'financialPressureChanged') {
        expect(idleEvents[0].delta).toBe(8)
      }
    })

    it('extends stay when affinity is high and updates history', () => {
      let campaign = createTavernCampaign('tavern-relationship-stay-001')
      const pair = findAcceptingPair(campaign)
      expect(pair).not.toBeNull()
      if (!pair) return

      const party = campaign.parties.find((p) => p.id === pair.partyId)!
      party.relationship.affinity = 50
      party.plannedDepartureDay = campaign.dayNumber

      campaign = { ...campaign, currentDay: pair.next }
      campaign = resolveCampaignDay(campaign)
      campaign = advanceCampaignDay(campaign)

      const extendedParty = campaign.parties.find((p) => p.id === pair.partyId)
      const extensionEvent = campaign.history[0].relationshipEvents.find(
        (e) => e.type === 'stayExtended' && e.partyId === pair.partyId,
      )
      expect(extensionEvent).toBeDefined()
      expect(extendedParty?.plannedDepartureDay).toBeGreaterThan(
        campaign.dayNumber - 1,
      )
      expect(extendedParty?.relationship.stayExtensionDaysUsed).toBeGreaterThan(
        0,
      )
    })

    it('syncs relationship snapshots to the tavern day', () => {
      let campaign = createTavernCampaign('tavern-relationship-sync-001')
      const pair = findAcceptingPair(campaign)
      expect(pair).not.toBeNull()
      if (!pair) return

      campaign = { ...campaign, currentDay: pair.next }
      campaign = resolveCampaignDay(campaign)

      const campaignParty = campaign.parties.find((p) => p.id === pair.partyId)!
      const tavernParty = campaign.currentDay.parties.find(
        (p) => p.id === pair.partyId,
      )!
      expect(tavernParty.relationship).toEqual({
        affinity: campaignParty.relationship.affinity,
        financialPressure: campaignParty.relationship.financialPressure,
        riskTolerance: campaignParty.relationship.riskTolerance,
        stayExtensionDaysUsed: campaignParty.relationship.stayExtensionDaysUsed,
      })
    })

    describe('Campaign finance', () => {
      it('computes settlement when resolving a day with an offer', () => {
        let campaign = createTavernCampaign('tavern-finance-settle-001')
        const pair = findAcceptingPair(campaign)
        expect(pair).not.toBeNull()
        if (!pair) return

        const initialFunds = campaign.finance.funds
        campaign = { ...campaign, currentDay: pair.next }
        campaign = resolveCampaignDay(campaign)

        expect(campaign.currentDay.status).toBe('resolved')
        const result = campaign.currentDay.results[0]
        expect(result).toBeDefined()
        expect(result?.settlement).toBeDefined()
        expect(campaign.finance.funds).toBe(
          initialFunds - 10 + (result?.settlement?.tavernCommission ?? 0),
        )
      })

      it('is idempotent: settlement application does not add duplicate ledger entries', () => {
        let campaign = createTavernCampaign('tavern-finance-idempotent-001')
        const pair = findAcceptingPair(campaign)
        expect(pair).not.toBeNull()
        if (!pair) return

        campaign = { ...campaign, currentDay: pair.next }
        const resolved = resolveCampaignDay(campaign)
        const settlement = resolved.currentDay.results[0]?.settlement
        expect(settlement).toBeDefined()
        const before = resolved.finance
        const after = applyQuestSettlement(
          before,
          settlement!,
          resolved.dayNumber,
          {
            requestId: resolved.currentDay.results[0]!.requestId,
            partyId: resolved.currentDay.results[0]!.partyId,
          },
        )
        expect(after).toBe(before)
      })
    })
  })
})
