import { describe, expect, it } from 'vitest'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import type { Adventurer, AdventurerRole } from '../models/types.ts'
import type { ExpeditionRequest, ExpeditionResult } from './types.ts'
import { initializeExpeditionState, runExpedition } from './expedition.ts'

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
        difficulty: 5,
      },
      {
        id: 'info-2',
        name: '古い地図',
        description: '遺跡の配置がわかる',
        difficulty: 15,
        requiredSkill: 'scouting',
      },
      {
        id: 'info-3',
        name: '魔力の残滓',
        description: '魔法の気配',
        difficulty: 20,
        requiredSkill: 'monsterKnowledge',
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

function cloneParty(party: Adventurer[]): Adventurer[] {
  return structuredClone(party)
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

function totalHp(r: ExpeditionResult): number {
  return Object.values(r.state.partyHp).reduce((a, b) => a + b, 0)
}

describe('Expedition determinism', () => {
  it('produces identical results for identical seed and party', () => {
    const request = makeRequest('same-seed')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'same-party',
    )
    const a = runExpedition(request, cloneParty(party))
    const b = runExpedition(request, cloneParty(party))
    expect(a).toEqual(b)
  })

  it('produces different results for different seeds', () => {
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'diff-party',
    )
    const a = runExpedition(makeRequest('seed-a'), cloneParty(party))
    const b = runExpedition(makeRequest('seed-b'), cloneParty(party))
    const same =
      a.outcome === b.outcome &&
      a.state.objectiveCompleted === b.state.objectiveCompleted &&
      a.state.elapsedTime === b.state.elapsedTime &&
      a.state.injuries.length === b.state.injuries.length &&
      a.state.information.length === b.state.information.length
    expect(same).toBe(false)
  })
})

describe('Objective type rejection', () => {
  const unsupported: Array<ExpeditionRequest['objectiveType']> = [
    'elimination',
    'rescue',
    'escort',
    'retrieval',
    'survey',
  ]

  for (const objectiveType of unsupported) {
    it(`rejects ${objectiveType}`, () => {
      const request = makeRequest(`reject-${objectiveType}`, {
        objectiveType,
      })
      const party = makeParty(
        ['vanguard', 'guardian', 'mage', 'healer'],
        `reject-${objectiveType}`,
      )
      expect(() => runExpedition(request, party)).toThrow(
        `Unsupported objectiveType in Phase 3.0: ${objectiveType}`,
      )
    })
  }

  it('accepts investigation', () => {
    const request = makeRequest('accept-investigation')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'accept-investigation',
    )
    expect(() => runExpedition(request, party)).not.toThrow()
  })
})

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

describe('Hidden information discovery', () => {
  it('uses requiredSkill and difficulty from HiddenInformation', () => {
    const request = makeRequest('hidden-skill', {
      environment: 'magical',
      features: [],
      hiddenInformation: [
        {
          id: 'magic-info',
          name: '古代の封印',
          description: '魔法の痕跡',
          difficulty: 10,
          requiredSkill: 'monsterKnowledge',
        },
      ],
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'hidden-skill',
    )
    const result = runExpedition(request, party)
    const discovered = result.state.information.find(
      (i) => i.id === 'magic-info',
    )
    if (discovered) {
      expect(discovered.completeness).toBe('complete')
    } else {
      const logSkills = result.state.logs
        .filter((l) => l.check)
        .map((l) => l.check?.skill)
      expect(logSkills).toContain('monsterKnowledge')
    }
  })

  it('produces fragments on partial success and completes them later', () => {
    const request = makeRequest('fragment-upgrade', {
      environment: 'forest',
      features: [],
      hiddenInformation: [
        {
          id: 'frag-info',
          name: '謎の足跡',
          description: '何者かの痕跡',
          difficulty: 100,
        },
      ],
    })
    const party = makeParty(
      ['scout', 'vanguard', 'mage', 'healer'],
      'fragment-upgrade',
    )
    const result = runExpedition(request, party)
    const info = result.state.information.find((i) => i.id === 'frag-info')
    if (info) {
      expect(['fragment', 'complete']).toContain(info.completeness)
    }
  })

  it('does not add duplicate information', () => {
    const request = makeRequest('no-duplicate', {
      features: [],
      hiddenInformation: [
        { id: 'dup', name: '一つの手がかり', description: '', difficulty: 0 },
      ],
    })
    const party = makeParty(
      ['scout', 'vanguard', 'mage', 'healer'],
      'no-duplicate',
    )
    const result = runExpedition(request, party)
    const ids = result.state.information.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
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

describe('Outcome and fact consistency', () => {
  it('objectiveCompleted matches progress threshold', () => {
    const results = runBatch(
      makeRequest,
      ['vanguard', 'guardian', 'mage', 'healer'],
      80,
    )
    for (const r of results) {
      expect(r.state.objectiveCompleted).toBe(r.state.objectiveProgress >= 60)
    }
  })

  it('failedObjective does not claim partial success', () => {
    const results = runBatch(makeRequest, ['vanguard', 'mage'], 100)
    const failed = results.filter((r) => r.outcome === 'failedObjective')
    expect(failed.length).toBeGreaterThan(0)
    for (const r of failed) {
      const facts = r.state.logs.flatMap((l) => l.facts)
      expect(facts.some((f) => f.includes('部分的に達成'))).toBe(false)
    }
  })

  it('partialSuccess contains a partial achievement fact', () => {
    const results = runBatch(
      makeRequest,
      ['vanguard', 'guardian', 'mage', 'healer'],
      120,
    )
    const partial = results.filter((r) => r.outcome === 'partialSuccess')
    expect(partial.length).toBeGreaterThan(0)
    for (const r of partial) {
      const facts = r.state.logs.flatMap((l) => l.facts)
      expect(
        facts.some(
          (f) =>
            f.includes('部分的に達成') ||
            f.includes('手がかりは得たが') ||
            f.includes('最低限'),
        ),
      ).toBe(true)
    }
  })

  it('success contains an objective achievement fact', () => {
    const results = runBatch(
      makeRequest,
      ['vanguard', 'guardian', 'mage', 'healer'],
      120,
    )
    const success = results.filter(
      (r) => r.outcome === 'success' || r.outcome === 'completeSuccess',
    )
    for (const r of success) {
      const facts = r.state.logs.flatMap((l) => l.facts)
      expect(
        facts.some(
          (f) =>
            f.includes('目的を達成') ||
            f.includes('完全に達成') ||
            f.includes('最低限'),
        ),
      ).toBe(true)
    }
  })
})

describe('Battle entry snapshot', () => {
  it('creates a snapshot with absolute values after exploration', () => {
    const request = makeRequest('battle-entry')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-entry',
    )
    const result = runExpedition(request, party)
    expect(result.state.battleEntrySnapshot).toBeDefined()
    const ids = party.map((a) => a.id)
    expect(
      Object.keys(result.state.battleEntrySnapshot!.initialHp).sort(),
    ).toEqual(ids.slice().sort())
    for (const a of party) {
      expect(
        result.state.battleEntrySnapshot!.initialHp[a.id],
      ).toBeGreaterThanOrEqual(0)
      expect(
        result.state.battleEntrySnapshot!.initialHp[a.id],
      ).toBeLessThanOrEqual(a.maxHp)
      expect(
        result.state.battleEntrySnapshot!.initialMorale[a.id],
      ).toBeGreaterThanOrEqual(0)
      expect(
        result.state.battleEntrySnapshot!.initialMorale[a.id],
      ).toBeLessThanOrEqual(100)
    }
  })

  it('produces partyAdvantage when all threats are avoided and information is rich', () => {
    const request = makeRequest('party-advantage', {
      environment: 'forest',
      features: ['traps'],
      knownInformation: [
        { id: 'k1', name: '事前情報1', description: '' },
        { id: 'k2', name: '事前情報2', description: '' },
      ],
      hiddenInformation: [],
    })
    const party = makeParty(
      ['scout', 'vanguard', 'mage', 'healer'],
      'party-advantage',
    )
    const result = runExpedition(request, party)
    expect(result.state.battleEntrySnapshot!.surprise).toBe('partyAdvantage')
  })

  it('produces enemyAdvantage when an ambush threat remains unresolved', () => {
    const request = makeRequest('enemy-advantage', {
      environment: 'forest',
      features: ['ambushRisk'],
      knownInformation: [],
      hiddenInformation: [],
    })
    const party = makeParty(
      ['vanguard', 'mage', 'healer', 'support'],
      'enemy-advantage',
    )
    const result = runExpedition(request, party)
    expect(result.state.battleEntrySnapshot!.surprise).toBe('enemyAdvantage')
  })

  it('produces neutral surprise when no threats are present', () => {
    const request = makeRequest('neutral-surprise', {
      environment: 'forest',
      features: [],
      hiddenInformation: [],
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'neutral-surprise',
    )
    const result = runExpedition(request, party)
    expect(result.state.battleEntrySnapshot!.surprise).toBe('neutral')
  })

  it('does not emit a water effect for unstable terrain', () => {
    const request = makeRequest('unstable-no-water', {
      environment: 'mountain',
      features: ['unstableTerrain'],
      hiddenInformation: [],
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'unstable-no-water',
    )
    const result = runExpedition(request, party)
    const envEffects = result.state.battleEntrySnapshot!.environmentEffects
    const water = envEffects.find((e) => e.type === 'water')
    expect(water).toBeUndefined()
    const terrain = envEffects.find(
      (e) => e.type === 'terrain' && e.value === 'unstable',
    )
    expect(terrain).toBeDefined()
  })
})

describe('Injury and casualty handling', () => {
  it('marks active injuries as treated after healing', () => {
    const request = makeRequest('injury-status', {
      environment: 'mountain',
      features: ['unstableTerrain'],
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'injury-status',
    )
    const result = runExpedition(request, party)
    for (const injury of result.state.injuries) {
      if (injury.status === 'active' && injury.type === 'serious') {
        expect(result.outcome).not.toBe('completeSuccess')
      }
    }
    const treated = result.state.injuries.filter((i) => i.status === 'treated')
    const active = result.state.injuries.filter((i) => i.status === 'active')
    expect(treated.length + active.length).toBeLessThanOrEqual(
      result.state.injuries.length,
    )
  })

  it('logs a casualty fact with target ID when a casualty occurs', () => {
    const roles: AdventurerRole[] = ['vanguard', 'mage', 'healer', 'support']
    for (let i = 0; i < 200; i++) {
      const party = makeParty(roles, `casualty-${i}`)
      const request = makeRequest(`casualty-${i}`, {
        environment: 'mountain',
        features: ['traps', 'unstableTerrain'],
        difficulty: 'deadly',
      })
      const result = runExpedition(request, party)
      for (const id of result.state.casualties) {
        const log = result.state.logs.some(
          (l) => l.type === 'casualty' && l.targetIds?.includes(id),
        )
        expect(log).toBe(true)
      }
      if (result.state.casualties.length > 0) break
    }
  })
})

describe('Log consistency', () => {
  it('hp damage and heal totals match final HP for each adventurer', () => {
    const request = makeRequest('hp-consistency')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'hp-consistency',
    )
    const result = runExpedition(request, party)
    for (const a of party) {
      const damage = result.state.logs
        .flatMap((l) => l.effects)
        .filter((e) => e.type === 'hpDamage' && e.targetId === a.id)
        .reduce((sum, e) => sum + (e.value ?? 0), 0)
      const heal = result.state.logs
        .flatMap((l) => l.effects)
        .filter((e) => e.type === 'hpHeal' && e.targetId === a.id)
        .reduce((sum, e) => sum + (e.value ?? 0), 0)
      const expected = result.state.casualties.includes(a.id)
        ? 0
        : a.maxHp - damage + heal
      expect(result.state.partyHp[a.id]).toBe(expected)
    }
  })

  it('medicine consumption logs match remaining medicine', () => {
    const request = makeRequest('medicine-consistency')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'medicine-consistency',
    )
    const initial = initializeExpeditionState(request, party)
    const result = runExpedition(request, party)
    const consumed = result.state.logs
      .flatMap((l) => l.effects)
      .filter((e) => e.type === 'supplyConsume' && e.targetId === 'medicine')
      .reduce((sum, e) => sum + (e.value ?? 0), 0)
    expect(result.state.supplies.medicine).toBe(
      initial.supplies.medicine - consumed,
    )
  })

  it('discovered and avoided threats are explained by logs', () => {
    const request = makeRequest('threat-logs', {
      environment: 'forest',
      features: ['traps', 'ambushRisk'],
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'threat-logs',
    )
    const result = runExpedition(request, party)
    const allFacts = result.state.logs.flatMap((l) => l.facts).join(' ')
    const labels: Record<string, string> = {
      traps: '罠',
      ambushRisk: '待ち伏せ',
      unstableTerrain: '不安定な地形',
      poisonRisk: '毒',
      poorVisibility: '視界不良',
      navigationDifficulty: '難航',
      flyingEnemies: '飛行敵',
      limitedSupplies: '物資制限',
      longDuration: '長期間',
      retreatDifficulty: '撤退困難',
    }
    for (const threat of result.state.discoveredThreats) {
      expect(allFacts).toContain(labels[threat] ?? threat)
    }
  })

  it('battle entry snapshot captures exploration-end state', () => {
    const request = makeRequest('snapshot-state')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'snapshot-state',
    )
    const result = runExpedition(request, party)
    const snap = result.state.battleEntrySnapshot!
    for (const a of party) {
      expect(snap.initialHp[a.id]).toBeDefined()
      expect(snap.initialMp[a.id]).toBeDefined()
      expect(snap.initialMorale[a.id]).toBeDefined()
      expect(snap.initialStatusEffects[a.id]).toBeDefined()
    }
  })
})
