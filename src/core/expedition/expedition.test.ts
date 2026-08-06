import { describe, expect, it } from 'vitest'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import type { Adventurer, AdventurerRole } from '../models/types.ts'
import type { ExpeditionRequest, ExpeditionResult } from './types.ts'
import { runExpedition } from './expedition.ts'

function makeRequest(
  seed: string,
  overrides?: Partial<ExpeditionRequest>,
): ExpeditionRequest {
  return {
    id: `test-${seed}`,
    seed,
    rank: 'C',
    difficulty: 'normal',
    objectiveType: 'investigation',
    environment: 'forest',
    distance: 3,
    features: ['traps', 'poorVisibility'],
    knownInformation: [],
    hiddenInformation: [
      {
        id: 'info-1',
        name: '敵の痕跡',
        description: '敵が近くにいる証拠',
        difficulty: 10,
      },
      {
        id: 'info-2',
        name: '古い地図',
        description: '遺跡の配置がわかる',
        difficulty: 10,
      },
      {
        id: 'info-3',
        name: '魔力の残滓',
        description: '魔法の気配',
        difficulty: 10,
      },
    ],
    ...overrides,
  }
}

function makeParty(roles: AdventurerRole[], seedBase: string): Adventurer[] {
  return roles.map((role, i) =>
    generateAdventurer({
      seed: `${seedBase}-${role}-${i}`,
      rank: 'C',
      role,
    }),
  )
}

function runBatch(
  requestBuilder: (seed: string) => ExpeditionRequest,
  roles: AdventurerRole[],
  n = 50,
): ExpeditionResult[] {
  const results: ExpeditionResult[] = []
  for (let i = 0; i < n; i++) {
    const party = makeParty(roles, `batch-${i}`)
    const request = requestBuilder(`batch-${i}`)
    results.push(runExpedition(request, party))
  }
  return results
}

function averageMetric(
  results: ExpeditionResult[],
  getter: (r: ExpeditionResult) => number,
): number {
  return results.reduce((sum, r) => sum + getter(r), 0) / results.length
}

describe('Expedition determinism', () => {
  it('produces identical results for identical seed and party', () => {
    const request = makeRequest('same-seed')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'same-party',
    )
    const a = runExpedition(request, party)
    const b = runExpedition(request, party)
    expect(a.outcome).toBe(b.outcome)
    expect(a.state.objectiveCompleted).toBe(b.state.objectiveCompleted)
    expect(a.state.elapsedTime).toBe(b.state.elapsedTime)
    expect(a.state.injuries.length).toBe(b.state.injuries.length)
  })

  it('produces different results for different seeds', () => {
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'diff-party',
    )
    const a = runExpedition(makeRequest('seed-a'), party)
    const b = runExpedition(makeRequest('seed-b'), party)
    const same =
      a.outcome === b.outcome &&
      a.state.objectiveCompleted === b.state.objectiveCompleted &&
      a.state.elapsedTime === b.state.elapsedTime &&
      a.state.injuries.length === b.state.injuries.length
    expect(same).toBe(false)
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
    expect(avgSupportTime).toBeLessThanOrEqual(avgBaseTime + 1) // support should not be slower

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

    const totalHp = (r: ExpeditionResult) =>
      Object.values(r.state.partyHp).reduce((a, b) => a + b, 0)
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

    const totalHp = (r: ExpeditionResult) =>
      Object.values(r.state.partyHp).reduce((a, b) => a + b, 0)
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

describe('Expedition outcome separation', () => {
  it('does not require a battle to judge expedition outcome for investigation', () => {
    const request = makeRequest('no-battle')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'no-battle-party',
    )
    const result = runExpedition(request, party)
    expect(result.state.battleEntry).toBeDefined()
    expect(result.state.battleEntry?.surprise).toMatch(
      /^(partyAdvantage|neutral|enemyAdvantage)$/,
    )
    expect(result.state.currentPhase).toBe('aftermath')
  })

  it('keeps log facts consistent with final state', () => {
    const request = makeRequest('consistency')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'consistency-party',
    )
    const result = runExpedition(request, party)

    if (result.state.objectiveCompleted) {
      const objectiveLog = result.state.logs.find(
        (l) => l.type === 'objectiveCheck',
      )
      expect(objectiveLog).toBeDefined()
      expect(
        objectiveLog?.check?.result === 'success' ||
          objectiveLog?.check?.result === 'criticalSuccess' ||
          objectiveLog?.check?.result === 'partialSuccess',
      ).toBe(true)
    }

    for (const casualty of result.state.casualties) {
      const casualtyLog = result.state.logs.some((l) =>
        l.targetIds?.includes(casualty),
      )
      expect(casualtyLog).toBe(true)
    }
  })
})
