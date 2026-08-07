import { describe, expect, it } from 'vitest'
import {
  averageMetric,
  cloneParty,
  makeParty,
  makeRequest,
  runBatch,
  totalHp,
} from './test-utils.ts'
import type { AdventurerRole } from '../models/types.ts'
import type { ExpeditionResult } from './types.ts'
import { runExpedition } from './expedition.ts'

describe('Rank penalty', () => {
  it('E-rank average progress is at least S-rank average progress', () => {
    const roles: AdventurerRole[] = ['vanguard', 'guardian', 'mage', 'healer']
    const eProgress: number[] = []
    const sProgress: number[] = []
    for (let i = 0; i < 80; i++) {
      const party = makeParty(roles, `rank-${i}`)
      const e = runExpedition(
        makeRequest(`rank-e-${i}`, { rank: 'E' }),
        cloneParty(party),
      )
      const s = runExpedition(
        makeRequest(`rank-s-${i}`, { rank: 'S' }),
        cloneParty(party),
      )
      eProgress.push(e.state.objectiveProgress)
      sProgress.push(s.state.objectiveProgress)
    }
    const avgE = eProgress.reduce((a, b) => a + b, 0) / eProgress.length
    const avgS = sProgress.reduce((a, b) => a + b, 0) / sProgress.length
    expect(avgE).toBeGreaterThanOrEqual(avgS)
  })

  it('S-rank expedition still completes', () => {
    const results = runBatch(
      (seed) => makeRequest(seed, { rank: 'S' }),
      ['vanguard', 'guardian', 'mage', 'healer'],
      50,
    )
    for (const r of results) {
      expect(r.state.logs.length).toBeGreaterThan(0)
      expect(r.outcome).toBeDefined()
    }
  })

  it('reflects request.rank in check effective values', () => {
    const eChecks: number[] = []
    const sChecks: number[] = []
    for (let i = 0; i < 50; i++) {
      const party = makeParty(
        ['vanguard', 'guardian', 'mage', 'healer'],
        `rank-check-${i}`,
      )
      const e = runExpedition(
        makeRequest(`rank-check-e-${i}`, { rank: 'E', features: [] }),
        cloneParty(party),
      )
      const s = runExpedition(
        makeRequest(`rank-check-s-${i}`, { rank: 'S', features: [] }),
        cloneParty(party),
      )
      eChecks.push(...e.state.logs.map((l) => l.check?.effectiveValue ?? 0))
      sChecks.push(...s.state.logs.map((l) => l.check?.effectiveValue ?? 0))
    }
    const avgE = eChecks.reduce((a, b) => a + b, 0) / eChecks.length
    const avgS = sChecks.reduce((a, b) => a + b, 0) / sChecks.length
    expect(avgS).toBeLessThanOrEqual(avgE)
  })
})

describe('Role-specific expedition contributions', () => {
  it('Scout presence increases trap discovery rate', () => {
    const base = runBatch(
      (seed) =>
        makeRequest(seed, { environment: 'forest', features: ['traps'] }),
      ['vanguard', 'mage', 'healer', 'support'],
      80,
    )
    const scout = runBatch(
      (seed) =>
        makeRequest(seed, { environment: 'forest', features: ['traps'] }),
      ['vanguard', 'mage', 'healer', 'scout'],
      80,
    )

    const trapAvoided = (r: ExpeditionResult) =>
      r.state.avoidedThreats.includes('traps') ? 1 : 0
    const baseRate = averageMetric(base, trapAvoided)
    const scoutRate = averageMetric(scout, trapAvoided)
    expect(scoutRate).toBeGreaterThan(baseRate)
  })

  it('Support presence improves morale and reduces travel time', () => {
    const base = runBatch(
      (seed) =>
        makeRequest(seed, {
          environment: 'forest',
          features: ['navigationDifficulty'],
        }),
      ['vanguard', 'guardian', 'mage', 'healer'],
      80,
    )
    const support = runBatch(
      (seed) =>
        makeRequest(seed, {
          environment: 'forest',
          features: ['navigationDifficulty'],
        }),
      ['vanguard', 'guardian', 'mage', 'support'],
      80,
    )

    const avgBaseTime = averageMetric(base, (r) => r.state.elapsedTime)
    const avgSupportTime = averageMetric(support, (r) => r.state.elapsedTime)
    expect(avgSupportTime).toBeLessThanOrEqual(avgBaseTime + 1)

    const avgBaseMorale = averageMetric(base, (r) => {
      const vals = Object.values(r.state.partyMorale)
      return vals.reduce((a, b) => a + b, 0) / vals.length
    })
    const avgSupportMorale = averageMetric(support, (r) => {
      const vals = Object.values(r.state.partyMorale)
      return vals.reduce((a, b) => a + b, 0) / vals.length
    })
    expect(avgSupportMorale).toBeGreaterThan(avgBaseMorale)
  })

  it('Healer presence leaves party with more HP after expedition', () => {
    const base = runBatch(
      (seed) =>
        makeRequest(seed, {
          environment: 'mountain',
          features: ['traps', 'unstableTerrain'],
        }),
      ['vanguard', 'guardian', 'mage', 'support'],
      80,
    )
    const healer = runBatch(
      (seed) =>
        makeRequest(seed, {
          environment: 'mountain',
          features: ['traps', 'unstableTerrain'],
        }),
      ['vanguard', 'guardian', 'mage', 'healer'],
      80,
    )

    const avgBase = averageMetric(base, totalHp)
    const avgHealer = averageMetric(healer, totalHp)
    expect(avgHealer).toBeGreaterThanOrEqual(avgBase)
  })

  it('Guardian presence reduces accident damage', () => {
    const base = runBatch(
      (seed) =>
        makeRequest(seed, {
          environment: 'mountain',
          features: ['unstableTerrain'],
        }),
      ['vanguard', 'mage', 'healer', 'support'],
      80,
    )
    const guardian = runBatch(
      (seed) =>
        makeRequest(seed, {
          environment: 'mountain',
          features: ['unstableTerrain'],
        }),
      ['vanguard', 'mage', 'healer', 'guardian'],
      80,
    )

    const avgBase = averageMetric(base, totalHp)
    const avgGuardian = averageMetric(guardian, totalHp)
    expect(avgGuardian).toBeGreaterThanOrEqual(avgBase)
  })

  it('Ranger presence reduces travel time or supply consumption', () => {
    const base = runBatch(
      (seed) =>
        makeRequest(seed, {
          environment: 'forest',
          features: ['navigationDifficulty'],
        }),
      ['vanguard', 'guardian', 'mage', 'healer'],
      80,
    )
    const ranger = runBatch(
      (seed) =>
        makeRequest(seed, {
          environment: 'forest',
          features: ['navigationDifficulty'],
        }),
      ['vanguard', 'guardian', 'mage', 'ranger'],
      80,
    )

    const avgBaseTime = averageMetric(base, (r) => r.state.elapsedTime)
    const avgRangerTime = averageMetric(ranger, (r) => r.state.elapsedTime)
    expect(avgRangerTime).toBeLessThanOrEqual(avgBaseTime)

    const foodLeft = (r: ExpeditionResult) => r.state.supplies.food
    const avgBaseFood = averageMetric(base, foodLeft)
    const avgRangerFood = averageMetric(ranger, foodLeft)
    expect(avgRangerFood).toBeGreaterThanOrEqual(avgBaseFood)
  })

  it('Mage presence improves investigation success in magical environment', () => {
    const base = runBatch(
      (seed) =>
        makeRequest(seed, {
          environment: 'ruins',
          features: ['poorVisibility'],
        }),
      ['vanguard', 'guardian', 'healer', 'support'],
      80,
    )
    const mage = runBatch(
      (seed) =>
        makeRequest(seed, {
          environment: 'ruins',
          features: ['poorVisibility'],
        }),
      ['vanguard', 'guardian', 'healer', 'mage'],
      80,
    )

    const progress = (r: ExpeditionResult) => r.state.objectiveProgress
    const avgBase = averageMetric(base, progress)
    const avgMage = averageMetric(mage, progress)
    expect(avgMage).toBeGreaterThan(avgBase)
  })

  it('Vanguard presence improves physical obstacle success', () => {
    const base = runBatch(
      (seed) =>
        makeRequest(seed, {
          environment: 'mountain',
          features: ['unstableTerrain'],
        }),
      ['scout', 'mage', 'healer', 'support'],
      80,
    )
    const vanguard = runBatch(
      (seed) =>
        makeRequest(seed, {
          environment: 'mountain',
          features: ['unstableTerrain'],
        }),
      ['vanguard', 'mage', 'healer', 'support'],
      80,
    )

    const avoided = (r: ExpeditionResult) =>
      r.state.avoidedThreats.includes('unstableTerrain') ? 1 : 0
    const baseRate = averageMetric(base, avoided)
    const vanguardRate = averageMetric(vanguard, avoided)
    expect(vanguardRate).toBeGreaterThan(baseRate)
  })

  it('expedition completes even when a key role is missing', () => {
    const rolesList: AdventurerRole[][] = [
      ['vanguard', 'mage', 'healer'],
      ['vanguard', 'guardian', 'mage'],
      ['ranger', 'scout', 'healer'],
      ['vanguard', 'mage'],
    ]
    for (const roles of rolesList) {
      const request = makeRequest(`missing-${roles.join('-')}`)
      const party = makeParty(roles, `missing-${roles.join('-')}`)
      const result = runExpedition(request, party)
      expect([
        'completeSuccess',
        'success',
        'partialSuccess',
        'failedObjective',
        'forcedRetreat',
        'lostExpedition',
      ]).toContain(result.outcome)
    }
  })
})
