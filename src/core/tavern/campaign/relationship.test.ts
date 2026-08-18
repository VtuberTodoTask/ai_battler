import { describe, expect, it } from 'vitest'
import { generateCampaignParty } from './generators.ts'
import {
  AFFINITY_DELTA,
  applyAffinityFromOutcome,
  applyFinancialPressureFromOutcome,
  applyIdleFinancialPressure,
  applyRecoveryFinancialPressure,
  createInitialRelationship,
  getMaxStayExtensionDays,
  getRiskToleranceFromLeader,
  tryExtendStay,
} from './relationship.ts'
import type { Adventurer } from '../../models/types.ts'
import type { CampaignParty } from './types.ts'

function fakeLeader(
  personality: Partial<Adventurer['personality']>,
): Adventurer {
  return {
    personality: {
      bravery: 0,
      caution: 0,
      cooperation: 0,
      discipline: 0,
      altruism: 0,
      greed: 0,
      ...personality,
    },
  } as Adventurer
}

describe('relationship', () => {
  it('initializes with fixed affinity and seeded financial pressure', () => {
    const party = generateCampaignParty('seed-a', 0, 1, 1)
    expect(party.relationship.affinity).toBe(10)
    expect(party.relationship.financialPressure).toBeGreaterThanOrEqual(20)
    expect(party.relationship.financialPressure).toBeLessThanOrEqual(60)
    expect(party.relationship.stayExtensionDaysUsed).toBe(0)
  })

  it('produces deterministic financial pressure and risk tolerance', () => {
    const p1 = generateCampaignParty('seed-b', 1, 1, 1)
    const p2 = generateCampaignParty('seed-b', 1, 1, 1)
    expect(p1.relationship).toEqual(p2.relationship)
  })

  it('does not disturb existing party generation rng streams', () => {
    const p1 = generateCampaignParty('seed-c', 0, 1, 1)
    const p2 = generateCampaignParty('seed-c', 1, 1, 1)
    expect(p1.relationship).not.toEqual(p2.relationship)
    expect(p1.party.id).not.toBe(p2.party.id)
  })

  it('createInitialRelationship returns the same shape as generated parties', () => {
    const leader = fakeLeader({ bravery: 1, caution: 0, greed: 0 })
    const rel = createInitialRelationship('seed-shape', 0, leader)
    expect(rel.affinity).toBe(10)
    expect(rel.financialPressure).toBeGreaterThanOrEqual(20)
    expect(rel.financialPressure).toBeLessThanOrEqual(60)
    expect(rel.riskTolerance).toBe('balanced')
    expect(rel.stayExtensionDaysUsed).toBe(0)
  })

  describe('getRiskToleranceFromLeader', () => {
    it('is cautious when bravery-caution+round(greed/2) <= -2', () => {
      expect(
        getRiskToleranceFromLeader(
          fakeLeader({ bravery: -3, caution: 3, greed: -3 }),
        ),
      ).toBe('cautious')
      expect(
        getRiskToleranceFromLeader(
          fakeLeader({ bravery: -2, caution: 0, greed: 0 }),
        ),
      ).toBe('cautious')
    })

    it('is bold when signal >= 2', () => {
      expect(
        getRiskToleranceFromLeader(
          fakeLeader({ bravery: 3, caution: -3, greed: 3 }),
        ),
      ).toBe('bold')
      expect(
        getRiskToleranceFromLeader(
          fakeLeader({ bravery: 2, caution: 0, greed: 0 }),
        ),
      ).toBe('bold')
    })

    it('is balanced otherwise', () => {
      expect(
        getRiskToleranceFromLeader(fakeLeader({ bravery: 0, caution: 0 })),
      ).toBe('balanced')
      expect(
        getRiskToleranceFromLeader(
          fakeLeader({ bravery: 1, caution: 0, greed: 0 }),
        ),
      ).toBe('balanced')
    })
  })

  describe('affinity updates by outcome', () => {
    it('uses fixed deltas', () => {
      expect(AFFINITY_DELTA.completeSuccess).toBe(12)
      expect(AFFINITY_DELTA.success).toBe(8)
      expect(AFFINITY_DELTA.partialSuccess).toBe(3)
      expect(AFFINITY_DELTA.failedObjective).toBe(-5)
      expect(AFFINITY_DELTA.forcedRetreat).toBe(-8)
      expect(AFFINITY_DELTA.lostExpedition).toBe(-12)
    })

    it('updates affinity from outcome', () => {
      const party = generateCampaignParty('seed-d', 0, 1, 1)
      party.relationship.affinity = 50
      const event = applyAffinityFromOutcome(party, 'success', 1)
      expect(event.type).toBe('affinityChanged')
      if (event.type === 'affinityChanged') {
        expect(event.before).toBe(50)
        expect(event.after).toBe(58)
        expect(event.delta).toBe(8)
      }
      expect(party.relationship.affinity).toBe(58)
    })

    it('clamps affinity to 0..100', () => {
      const party = generateCampaignParty('seed-e', 0, 1, 1)
      party.relationship.affinity = 5
      applyAffinityFromOutcome(party, 'forcedRetreat', 1)
      expect(party.relationship.affinity).toBe(0)
      party.relationship.affinity = 95
      applyAffinityFromOutcome(party, 'completeSuccess', 1)
      expect(party.relationship.affinity).toBe(100)
    })
  })

  describe('financial pressure updates', () => {
    it('updates pressure from outcome', () => {
      const party = generateCampaignParty('seed-f', 0, 1, 1)
      party.relationship.financialPressure = 40
      const event = applyFinancialPressureFromOutcome(party, 'success', 1)
      expect(event.type).toBe('financialPressureChanged')
      if (event.type === 'financialPressureChanged') {
        expect(event.after).toBe(20)
        expect(event.source).toBe('expedition')
      }
    })

    it('applies idle pressure', () => {
      const party = generateCampaignParty('seed-g', 0, 1, 1)
      party.relationship.financialPressure = 10
      const event = applyIdleFinancialPressure(party, 1)
      if (event.type === 'financialPressureChanged') {
        expect(event.after).toBe(18)
        expect(event.source).toBe('idle')
      }
    })

    it('applies recovery pressure', () => {
      const party = generateCampaignParty('seed-h', 0, 1, 1)
      party.relationship.financialPressure = 10
      const event = applyRecoveryFinancialPressure(party, 1)
      if (event.type === 'financialPressureChanged') {
        expect(event.after).toBe(14)
        expect(event.source).toBe('recovery')
      }
    })

    it('clamps financial pressure to 0..100', () => {
      const party = generateCampaignParty('seed-i', 0, 1, 1)
      party.relationship.financialPressure = 95
      applyIdleFinancialPressure(party, 1)
      expect(party.relationship.financialPressure).toBe(100)
      party.relationship.financialPressure = 5
      applyFinancialPressureFromOutcome(party, 'completeSuccess', 1)
      expect(party.relationship.financialPressure).toBe(0)
    })
  })

  describe('stay extension', () => {
    function makePartyForStay(
      overrides: Partial<CampaignParty['relationship']> & {
        plannedDepartureDay?: number
        casualty?: boolean
      } = {},
    ): CampaignParty {
      const party = generateCampaignParty('stay-seed', 0, 1, 1)
      party.relationship = {
        ...party.relationship,
        ...overrides,
      }
      if (overrides.plannedDepartureDay !== undefined) {
        party.plannedDepartureDay = overrides.plannedDepartureDay
      }
      if (overrides.casualty) {
        party.departingCasualty = true
      }
      return party
    }

    it('getMaxStayExtensionDays is tiered by affinity', () => {
      expect(getMaxStayExtensionDays(0)).toBe(0)
      expect(getMaxStayExtensionDays(20)).toBe(2)
      expect(getMaxStayExtensionDays(40)).toBe(4)
      expect(getMaxStayExtensionDays(60)).toBe(6)
      expect(getMaxStayExtensionDays(80)).toBe(8)
      expect(getMaxStayExtensionDays(100)).toBe(8)
    })

    it('extends stay using remaining budget when departure is reached', () => {
      const party = makePartyForStay({
        affinity: 50,
        stayExtensionDaysUsed: 0,
        plannedDepartureDay: 5,
      })
      const event = tryExtendStay(party, 6, 6)
      expect(event).not.toBeNull()
      if (event && event.type === 'stayExtended') {
        expect(event.extensionDays).toBe(4)
        expect(event.previousDepartureDay).toBe(5)
        expect(event.newDepartureDay).toBe(9)
      }
      expect(party.plannedDepartureDay).toBe(9)
      expect(party.relationship.stayExtensionDaysUsed).toBe(4)
    })

    it('accumulates only up to the affinity budget cap', () => {
      const party = makePartyForStay({
        affinity: 50,
        stayExtensionDaysUsed: 2,
        plannedDepartureDay: 5,
      })
      const event = tryExtendStay(party, 6, 6)
      if (event && event.type === 'stayExtended') {
        expect(event.extensionDays).toBe(2)
      }
      expect(party.relationship.stayExtensionDaysUsed).toBe(4)
    })

    it('caps additional stay at 8 days', () => {
      const party = makePartyForStay({
        affinity: 100,
        stayExtensionDaysUsed: 0,
        plannedDepartureDay: 5,
      })
      const event = tryExtendStay(party, 6, 6)
      if (event && event.type === 'stayExtended') {
        expect(event.extensionDays).toBe(8)
      }
      expect(party.relationship.stayExtensionDaysUsed).toBe(8)
      expect(party.plannedDepartureDay).toBe(13)
    })

    it('does not extend casualty parties', () => {
      const party = makePartyForStay({
        affinity: 100,
        plannedDepartureDay: 5,
        casualty: true,
      })
      expect(tryExtendStay(party, 6, 6)).toBeNull()
    })

    it('does not extend before planned departure day', () => {
      const party = makePartyForStay({
        affinity: 100,
        plannedDepartureDay: 6,
      })
      expect(tryExtendStay(party, 6, 6)).toBeNull()
    })

    it('does not extend when budget is exhausted', () => {
      const party = makePartyForStay({
        affinity: 50,
        stayExtensionDaysUsed: 4,
        plannedDepartureDay: 5,
      })
      expect(tryExtendStay(party, 6, 6)).toBeNull()
    })
  })
})
