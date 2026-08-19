import { describe, expect, it } from 'vitest'
import { SeededRng } from '../../rng/seededRng.ts'
import {
  PARTY_LIFECYCLE_CONFIG,
  applyDeparture,
  applyReturn,
  attemptPartyReturn,
  createInitialLifecycleState,
  selectEligibleAwayParties,
} from './lifecycle.ts'
import { createTavernCampaign } from './campaign.ts'
import type { CampaignParty } from './types.ts'

function makeParty(id: string, overrides: Partial<CampaignParty> = {}) {
  const base = createTavernCampaign(`lifecycle-unit-${id}`).parties[0]
  return {
    ...base,
    id,
    party: { ...base.party, name: `party-${id}` },
    lifecycle: createInitialLifecycleState(1),
    ...overrides,
  } as CampaignParty
}

describe('createInitialLifecycleState', () => {
  it('starts a brand-new party as staying with visitCount 1 and no departure history', () => {
    const state = createInitialLifecycleState(7)
    expect(state).toEqual({
      status: 'staying',
      firstArrivalDay: 7,
      visitCount: 1,
    })
  })
})

describe('applyDeparture', () => {
  it('moves a scheduled (non-casualty) departure to away, with returnEligibleDay = resolvedDay + cooldown', () => {
    const party = makeParty('a')
    applyDeparture(party, 5, false)
    expect(party.lifecycle.status).toBe('away')
    expect(party.lifecycle.lastDepartureDay).toBe(5)
    expect(party.lifecycle.returnEligibleDay).toBe(
      5 + PARTY_LIFECYCLE_CONFIG.returnCooldownDays,
    )
  })

  it('moves a casualty departure to retired, with no returnEligibleDay', () => {
    const party = makeParty('b')
    applyDeparture(party, 5, true)
    expect(party.lifecycle.status).toBe('retired')
    expect(party.lifecycle.lastDepartureDay).toBe(5)
    expect(party.lifecycle.returnEligibleDay).toBeUndefined()
  })
})

describe('return eligibility by day', () => {
  it('departure on day 5 is not eligible on day 8 but is eligible on day 9 (cooldown = 4)', () => {
    const party = makeParty('c')
    applyDeparture(party, 5, false)
    expect(party.lifecycle.returnEligibleDay).toBe(9)

    expect(selectEligibleAwayParties([party], 8)).toEqual([])
    expect(selectEligibleAwayParties([party], 9)).toEqual([party])
  })

  it('excludes retired parties even if a returnEligibleDay were somehow present', () => {
    const party = makeParty('d')
    applyDeparture(party, 5, true)
    // Retired parties never carry a returnEligibleDay, so they are excluded
    // by both the status filter and the undefined check.
    expect(selectEligibleAwayParties([party], 100)).toEqual([])
  })

  it('stable-sorts the eligible pool by partyId ascending', () => {
    const partyB = makeParty('b')
    const partyA = makeParty('a')
    const partyC = makeParty('c')
    for (const p of [partyB, partyA, partyC]) applyDeparture(p, 1, false)
    const eligible = selectEligibleAwayParties([partyB, partyA, partyC], 10)
    expect(eligible.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('applyReturn', () => {
  it('preserves identity while resetting lifecycle to staying and incrementing visitCount', () => {
    const party = makeParty('e')
    party.relationship.affinity = 77
    party.relationship.stayExtensionDaysUsed = 3
    applyDeparture(party, 5, false)

    const partyIdBefore = party.id
    const characterIdsBefore = party.party.members.map((m) => m.id)
    const nameBefore = party.party.name
    const affinityBefore = party.relationship.affinity

    applyReturn(party, 'seed-e', 9)

    expect(party.id).toBe(partyIdBefore)
    expect(party.party.members.map((m) => m.id)).toEqual(characterIdsBefore)
    expect(party.party.name).toBe(nameBefore)
    expect(party.relationship.affinity).toBe(affinityBefore)

    expect(party.lifecycle.status).toBe('staying')
    expect(party.lifecycle.visitCount).toBe(2)
    expect(party.lifecycle.returnEligibleDay).toBeUndefined()
    expect(party.arrivalDay).toBe(9)
    expect(party.lifecycle.firstArrivalDay).toBe(1) // untouched
  })

  it('gives the new stay its own extension budget (reset to 0)', () => {
    const party = makeParty('f')
    party.relationship.stayExtensionDaysUsed = 5
    applyDeparture(party, 5, false)
    applyReturn(party, 'seed-f', 9)
    expect(party.relationship.stayExtensionDaysUsed).toBe(0)
  })

  it('never regenerates the party (visitCount can increment repeatedly across multiple returns)', () => {
    const party = makeParty('g')
    applyDeparture(party, 5, false)
    applyReturn(party, 'seed-g', 9)
    applyDeparture(party, 12, false)
    applyReturn(party, 'seed-g', 17)
    expect(party.lifecycle.visitCount).toBe(3)
    expect(party.id).toBe('g')
  })
})

describe('attemptPartyReturn', () => {
  it('returns undefined when the eligible pool is empty', () => {
    const rng = new SeededRng('empty-pool')
    expect(attemptPartyReturn(rng, [])).toBeUndefined()
  })

  it('with a single eligible candidate, a successful roll returns it without an extra RNG draw', () => {
    const party = makeParty('h')
    // Find a seed where the 35% roll succeeds on the first draw.
    let seed = ''
    for (let i = 0; i < 200; i++) {
      const candidate = `single-candidate-search-${i}`
      const probe = new SeededRng(candidate)
      if (probe.chance(PARTY_LIFECYCLE_CONFIG.returnChanceBps / 100)) {
        seed = candidate
        break
      }
    }
    expect(seed).not.toBe('')

    const rng = new SeededRng(seed)
    const result = attemptPartyReturn(rng, [party])
    expect(result).toBe(party)
    // Exactly one RNG draw (the chance roll) — no additional draw for
    // "selecting" among a single candidate.
    expect(rng.getCallCount()).toBe(1)
  })

  it('with multiple eligible candidates, a successful roll consumes an additional selection draw', () => {
    const partyA = makeParty('i')
    const partyB = makeParty('j')
    let seed = ''
    for (let i = 0; i < 200; i++) {
      const candidate = `multi-candidate-search-${i}`
      const probe = new SeededRng(candidate)
      if (probe.chance(PARTY_LIFECYCLE_CONFIG.returnChanceBps / 100)) {
        seed = candidate
        break
      }
    }
    expect(seed).not.toBe('')

    const rng = new SeededRng(seed)
    const result = attemptPartyReturn(rng, [partyA, partyB])
    expect([partyA, partyB]).toContain(result)
    expect(rng.getCallCount()).toBe(2)
  })

  it('is deterministic: the same seed and pool always produce the same outcome', () => {
    const party = makeParty('k')
    const results = new Set<string | undefined>()
    for (let i = 0; i < 5; i++) {
      const rng = new SeededRng('determinism-check')
      results.add(attemptPartyReturn(rng, [party])?.id)
    }
    expect(results.size).toBe(1)
  })

  it('over many trials, roughly 35% of rolls succeed (statistical sanity check)', () => {
    const party = makeParty('l')
    let successes = 0
    const trials = 2000
    for (let i = 0; i < trials; i++) {
      const rng = new SeededRng(`trial-${i}`)
      if (attemptPartyReturn(rng, [party])) successes++
    }
    const rate = successes / trials
    expect(rate).toBeGreaterThan(0.3)
    expect(rate).toBeLessThan(0.4)
  })
})
