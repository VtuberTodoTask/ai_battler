import { describe, expect, it } from 'vitest'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import { SeededRng } from '../rng/seededRng.ts'
import type {
  Adventurer,
  AdventurerRank,
  AdventurerRole,
  BattleOutcome,
  BattleResult,
  Enemy,
  StatusEffect,
} from '../models/types.ts'
import type {
  BattleIntel,
  EliminationObjectiveState,
  ExpeditionRequest,
  ExpeditionResult,
  ExpeditionState,
} from './types.ts'
import {
  applyExpeditionDamage,
  expeditionTestInternals,
  initializeExpeditionState,
  isUnresolvedInjury,
  isUnresolvedSeriousInjury,
  runExpedition,
} from './expedition.ts'

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

function makeParty(
  roles: AdventurerRole[],
  seedBase: string,
  rank: AdventurerRank = 'C',
): Adventurer[] {
  return roles.map((role, i) =>
    generateAdventurer({
      seed: `${seedBase}-${role}-${i}`,
      rank,
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
        `Unsupported objectiveType in Phase 3.2: ${objectiveType}`,
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

  it('accepts elimination with battle enabled', () => {
    const request = makeRequest('accept-elimination', {
      objectiveType: 'elimination',
      battle: {
        enabled: true,
        seed: 'elimination-battle',
        triggerPhase: 'afterExploration',
      },
      elimination: { mode: 'allEnemies', confirmationRequired: false },
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'accept-elimination',
    )
    expect(() => runExpedition(request, party)).not.toThrow()
  })

  it('rejects elimination without elimination config', () => {
    const request = makeRequest('reject-elimination-no-config', {
      objectiveType: 'elimination',
      battle: {
        enabled: true,
        seed: 'elimination-battle',
        triggerPhase: 'afterExploration',
      },
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'reject-elimination-no-config',
    )
    expect(() => runExpedition(request, party)).toThrow(
      'Elimination request requires elimination configuration',
    )
  })

  it('rejects elimination without battle config', () => {
    const request = makeRequest('reject-elimination-no-battle', {
      objectiveType: 'elimination',
      elimination: { mode: 'allEnemies', confirmationRequired: false },
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'reject-elimination-no-battle',
    )
    expect(() => runExpedition(request, party)).toThrow(
      'Elimination request requires battle configuration',
    )
  })

  it('rejects elimination with battle disabled', () => {
    const request = makeRequest('reject-elimination-disabled', {
      objectiveType: 'elimination',
      battle: {
        enabled: false,
        seed: 'elimination-battle',
        triggerPhase: 'afterExploration',
      },
      elimination: { mode: 'allEnemies', confirmationRequired: false },
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'reject-elimination-disabled',
    )
    expect(() => runExpedition(request, party)).toThrow(
      'Elimination request requires battle.enabled === true',
    )
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

function minimalAdventurer(id = 'a', name = 'Test'): Adventurer {
  return { id, name } as unknown as Adventurer
}

function minimalExpeditionState(hp = 5): ExpeditionState {
  return {
    currentPhase: 'exploration',
    elapsedTime: 0,
    partyHp: { a: hp },
    partyMp: { a: 10 },
    partyMorale: { a: 50 },
    partyStatusEffects: { a: [] },
    supplies: { food: 10, medicine: 10, tools: 10 },
    information: [],
    injuries: [],
    casualties: [],
    incapacitated: [],
    objectiveProgress: 0,
    objectiveCompleted: false,
    discoveredThreats: [],
    avoidedThreats: [],
    logs: [],
    battles: [],
  }
}

describe('applyExpeditionDamage', () => {
  it('kills target and logs casualty when allowFatal reduces HP to 0', () => {
    const state = minimalExpeditionState(5)
    const target = minimalAdventurer()
    const rng = new SeededRng('test')
    const effect = applyExpeditionDamage(
      state,
      [target],
      target,
      5,
      'test-hazard',
      true,
      rng,
    )
    expect(state.partyHp.a).toBe(0)
    expect(effect.value).toBe(5)
    expect(state.casualties).toContain('a')
    const casualtyLog = state.logs.find((l) => l.type === 'casualty')
    expect(casualtyLog).toBeDefined()
    expect(casualtyLog?.targetIds).toContain('a')
    expect(casualtyLog?.effects[0].value).toBe(5)
  })

  it('clamps HP at 1 when allowFatal is false', () => {
    const state = minimalExpeditionState(5)
    const target = minimalAdventurer()
    const rng = new SeededRng('test')
    const effect = applyExpeditionDamage(
      state,
      [target],
      target,
      10,
      'test-hazard',
      false,
      rng,
    )
    expect(state.partyHp.a).toBe(1)
    expect(effect.value).toBe(4)
    expect(state.casualties).toHaveLength(0)
    expect(state.injuries[0].type).toBe('light')
  })

  it('does not add duplicate casualty IDs', () => {
    const state = minimalExpeditionState(5)
    const target = minimalAdventurer()
    const rng = new SeededRng('test')
    applyExpeditionDamage(state, [target], target, 5, 'test', true, rng)
    applyExpeditionDamage(state, [target], target, 5, 'test', true, rng)
    applyExpeditionDamage(state, [target], target, 5, 'test', true, rng)
    expect(state.casualties).toEqual(['a'])
    const casualtyLogs = state.logs.filter((l) => l.type === 'casualty')
    expect(casualtyLogs).toHaveLength(1)
  })
})

describe('Injury state helpers', () => {
  function makeInjury(
    status: 'active' | 'treated' | 'worsened',
    type: 'light' | 'serious',
  ) {
    return {
      id: 'i-1',
      adventurerId: 'a',
      type,
      cause: 'test',
      hpLoss: 10,
      status,
    }
  }

  it('counts active and worsened serious injuries as unresolved', () => {
    expect(isUnresolvedSeriousInjury(makeInjury('active', 'serious'))).toBe(
      true,
    )
    expect(isUnresolvedSeriousInjury(makeInjury('worsened', 'serious'))).toBe(
      true,
    )
    expect(isUnresolvedSeriousInjury(makeInjury('treated', 'serious'))).toBe(
      false,
    )
    expect(isUnresolvedSeriousInjury(makeInjury('active', 'light'))).toBe(false)
  })

  it('counts active and worsened as unresolved regardless of severity', () => {
    expect(isUnresolvedInjury(makeInjury('active', 'light'))).toBe(true)
    expect(isUnresolvedInjury(makeInjury('worsened', 'light'))).toBe(true)
    expect(isUnresolvedInjury(makeInjury('treated', 'light'))).toBe(false)
  })
})

describe('Outcome injury handling', () => {
  function outcomeWithInjuries(
    injuryStatus: 'active' | 'worsened' | 'treated',
    type: 'light' | 'serious',
  ) {
    const request = makeRequest('injury-outcome')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'injury-outcome',
    )
    const state = initializeExpeditionState(request, party)
    state.objectiveProgress = 100
    state.partyMorale = {
      [party[0].id]: 80,
      [party[1].id]: 80,
      [party[2].id]: 80,
      [party[3].id]: 80,
    }
    state.injuries.push({
      id: 'i-1',
      adventurerId: party[0].id,
      type,
      cause: 'test',
      hpLoss: 12,
      status: injuryStatus,
    })
    return expeditionTestInternals.determineOutcome(request, state, party)
  }

  it('prevents completeSuccess when a serious injury is active', () => {
    expect(outcomeWithInjuries('active', 'serious')).not.toBe('completeSuccess')
  })

  it('prevents completeSuccess when a serious injury is worsened', () => {
    expect(outcomeWithInjuries('worsened', 'serious')).not.toBe(
      'completeSuccess',
    )
  })

  it('allows completeSuccess when a serious injury is treated', () => {
    expect(outcomeWithInjuries('treated', 'serious')).toBe('completeSuccess')
  })

  it('does not downgrade completeSuccess for active light injuries', () => {
    expect(outcomeWithInjuries('active', 'light')).toBe('completeSuccess')
  })

  it('worsened light injury is still unresolved but not serious', () => {
    const request = makeRequest('worsened-light')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'worsened-light',
    )
    const state = initializeExpeditionState(request, party)
    state.objectiveProgress = 100
    state.partyMorale = {
      [party[0].id]: 80,
      [party[1].id]: 80,
      [party[2].id]: 80,
      [party[3].id]: 80,
    }
    state.injuries.push({
      id: 'i-1',
      adventurerId: party[0].id,
      type: 'light',
      cause: 'test',
      hpLoss: 3,
      status: 'worsened',
    })
    expect(
      expeditionTestInternals.determineOutcome(request, state, party),
    ).toBe('completeSuccess')
  })

  it('worsening from active to worsened does not improve outcome', () => {
    const request = makeRequest('active-vs-worsened')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'active-vs-worsened',
    )
    const active = initializeExpeditionState(request, party)
    active.objectiveProgress = 100
    active.partyMorale = {
      [party[0].id]: 80,
      [party[1].id]: 80,
      [party[2].id]: 80,
      [party[3].id]: 80,
    }
    active.injuries.push({
      id: 'i-1',
      adventurerId: party[0].id,
      type: 'serious',
      cause: 'test',
      hpLoss: 12,
      status: 'active',
    })
    const worsened = initializeExpeditionState(request, party)
    worsened.objectiveProgress = 100
    worsened.partyMorale = {
      [party[0].id]: 80,
      [party[1].id]: 80,
      [party[2].id]: 80,
      [party[3].id]: 80,
    }
    worsened.injuries.push({
      id: 'i-1',
      adventurerId: party[0].id,
      type: 'serious',
      cause: 'test',
      hpLoss: 12,
      status: 'worsened',
    })
    const activeOutcome = expeditionTestInternals.determineOutcome(
      request,
      active,
      party,
    )
    const worsenedOutcome = expeditionTestInternals.determineOutcome(
      request,
      worsened,
      party,
    )
    expect(activeOutcome).not.toBe('completeSuccess')
    expect(worsenedOutcome).not.toBe('completeSuccess')
    expect(activeOutcome).toBe(worsenedOutcome)
  })
})

describe('Healer injury treatment', () => {
  it('treats active injuries and stabilizes worsened injuries on normal success', () => {
    const request = makeRequest('heal-normal', { features: [] })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'heal-normal',
    )
    const result = runExpedition(request, party)
    // worsened は存在しない or 治療後 active/treated のいずれか
    for (const injury of result.state.injuries) {
      if (injury.status === 'worsened') {
        expect(injury.type).not.toBe('serious')
      }
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

function battleConfig(
  overrides?: Partial<NonNullable<ExpeditionRequest['battle']>>,
): NonNullable<ExpeditionRequest['battle']> {
  return {
    enabled: true,
    seed: 'battle-seed',
    triggerPhase: 'afterExploration',
    ...overrides,
  }
}

function findBattleLog(result: ExpeditionResult): boolean {
  return result.state.logs.some((l) => l.type === 'battleSummary')
}

describe('Expedition battle integration', () => {
  it('runs a battle when battle.enabled is true', () => {
    const request = makeRequest('battle-enabled', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-enabled',
      'S',
    )
    const result = runExpedition(request, party)
    expect(result.state.battles).toHaveLength(1)
    expect(result.state.battleEntrySnapshot).toBeDefined()
    expect(findBattleLog(result)).toBe(true)
  })

  it('skips battle when battle.enabled is false', () => {
    const request = makeRequest('battle-disabled', {
      battle: { enabled: false, seed: 'x', triggerPhase: 'afterExploration' },
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-disabled',
    )
    const result = runExpedition(request, party)
    expect(result.state.battles).toHaveLength(0)
    expect(findBattleLog(result)).toBe(false)
  })

  it('produces identical results with the same seed and party', () => {
    const request = makeRequest('battle-determinism', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-determinism',
      'S',
    )
    const a = runExpedition(request, cloneParty(party))
    const b = runExpedition(request, cloneParty(party))
    expect(a).toEqual(b)
  })

  it('produces different results with different battle seeds', () => {
    const requestA = makeRequest('battle-seed-a', {
      battle: battleConfig({ seed: 'battle-seed-a' }),
    })
    const requestB = makeRequest('battle-seed-b', {
      battle: battleConfig({ seed: 'battle-seed-b' }),
    })
    const partyA = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-seed-a',
      'S',
    )
    const partyB = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-seed-b',
      'S',
    )
    const resultA = runExpedition(requestA, partyA)
    const resultB = runExpedition(requestB, partyB)
    expect(resultA.state.battles[0].enemyIds).not.toEqual(
      resultB.state.battles[0].enemyIds,
    )
  })

  it('uses the same enemy composition for E and S parties with the same request rank', () => {
    const request = makeRequest('battle-rank-test', {
      rank: 'C',
      battle: battleConfig(),
    })
    const partyE = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'e-party',
      'E',
    )
    const partyS = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      's-party',
      'S',
    )
    const resultE = runExpedition(request, partyE)
    const resultS = runExpedition(request, partyS)
    expect(resultE.state.battles[0].enemyIds).toEqual(
      resultS.state.battles[0].enemyIds,
    )
  })

  it('does not weaken enemy composition when a party member is injured before battle', () => {
    const request = makeRequest('battle-injured-direct', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'injured-party',
      'C',
    )

    const healthyState = initializeExpeditionState(request, party)
    healthyState.battleEntrySnapshot = emptyBattleEntrySnapshot()
    expeditionTestInternals.runExpeditionBattle(request, party, healthyState)

    const injuredState = initializeExpeditionState(request, party)
    injuredState.partyHp[party[0].id] = 1
    injuredState.battleEntrySnapshot = emptyBattleEntrySnapshot()
    expeditionTestInternals.runExpeditionBattle(request, party, injuredState)

    // 同じ依頼シードなら、戦闘前の負傷状態に関わらず敵編成は同一
    expect(new Set(healthyState.battles[0].enemyIds)).toEqual(
      new Set(injuredState.battles[0].enemyIds),
    )
  })

  it('does not weaken enemy composition when a party member is dead before battle', () => {
    const request = makeRequest('battle-dead-direct', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'dead-party',
      'C',
    )

    const healthyState = initializeExpeditionState(request, party)
    healthyState.battleEntrySnapshot = emptyBattleEntrySnapshot()
    expeditionTestInternals.runExpeditionBattle(request, party, healthyState)

    const deadState = initializeExpeditionState(request, party)
    deadState.casualties.push(party[0].id)
    deadState.battleEntrySnapshot = emptyBattleEntrySnapshot()
    expeditionTestInternals.runExpeditionBattle(request, party, deadState)

    expect(deadState.casualties).toContain(party[0].id)
    expect(new Set(healthyState.battles[0].enemyIds)).toEqual(
      new Set(deadState.battles[0].enemyIds),
    )
  })

  it('returns final adventurer states from the battle', () => {
    const request = makeRequest('battle-final-states', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-final-states',
      'S',
    )
    const result = runExpedition(request, party)
    const record = result.state.battles[0]
    expect(record.result.finalAdventurerStates).toHaveLength(party.length)
    for (const final of record.result.finalAdventurerStates) {
      expect(final.id).toBeDefined()
      expect(typeof final.alive).toBe('boolean')
      expect(typeof final.dead).toBe('boolean')
      expect(typeof final.incapacitated).toBe('boolean')
      expect(final.currentHp).toBeGreaterThanOrEqual(0)
      expect(final.currentMp).toBeGreaterThanOrEqual(0)
      expect(final.morale).toBeGreaterThanOrEqual(0)
      expect(final.morale).toBeLessThanOrEqual(100)
      expect(final.statusEffects).toBeDefined()
    }
  })
})

describe('Battle state carryover', () => {
  it('buildBattleParty excludes casualties and uses current expedition stats', () => {
    const request = makeRequest('carryover-party')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'carryover',
    )
    const state = initializeExpeditionState(request, party)
    state.partyHp[party[0].id] = 10
    state.partyMp[party[0].id] = 5
    state.partyMorale[party[0].id] = 30
    state.partyStatusEffects[party[0].id] = [
      { type: 'poisoned', duration: 2, sourceId: 'test' },
    ]
    state.casualties.push(party[1].id)

    const battleParty = expeditionTestInternals.buildBattleParty(party, state)
    expect(battleParty.some((a) => a.id === party[1].id)).toBe(false)
    const lead = battleParty.find((a) => a.id === party[0].id)!
    expect(lead.currentHp).toBe(10)
    expect(lead.currentMp).toBe(5)
    expect(lead.morale).toBe(30)
    expect(lead.statusEffects).toEqual([
      { type: 'poisoned', duration: 2, sourceId: 'test' },
    ])
  })

  it('applyBattleResultToExpedition updates hp/mp/morale/status and casualties', () => {
    const request = makeRequest('carryover-apply')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'carryover',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = {
      surprise: 'neutral',
      initialHp: {},
      initialMp: {},
      initialMorale: {},
      initialStatusEffects: {},
      knownEnemyWeaknesses: [],
      knownEnemyAbilities: [],
      environmentEffects: [],
    }

    const status: StatusEffect = {
      type: 'weakened',
      duration: 2,
      sourceId: 'x',
    }
    const result = {
      seed: 's',
      outcome: 'victory' as BattleOutcome,
      rounds: 5,
      survivingAdventurers: [party[0].id, party[1].id],
      incapacitatedAdventurers: [],
      deadAdventurers: [party[2].id],
      finalAdventurerStates: party.map((a, i) => ({
        id: a.id,
        currentHp: i === 2 ? 0 : a.maxHp - i,
        currentMp: a.maxMp - i,
        morale: 50 - i,
        statusEffects: i === 0 ? [status] : [],
        alive: i !== 2,
        incapacitated: false,
        dead: i === 2,
      })),
      survivingEnemies: [],
      defeatedEnemies: ['e1'],
      escapedEnemies: [],
      injuries: [
        {
          adventurerId: party[2].id,
          name: 'x',
          severity: 30,
          survivalRoll: 50,
          survivalChance: 80,
          category: 'dead' as const,
        },
      ],
      discoveredWeaknesses: [],
      partyDamageDealt: 10,
      enemyDamageDealt: 5,
      abilityUsage: {},
      contactResult: {
        type: 'success' as const,
        partyScouting: 0,
        enemyStealth: 0,
        successChance: 100,
        roll: 0,
        effects: {},
      },
      logs: [],
      adventurerActionCount: 1,
      enemyActionCount: 1,
    } satisfies BattleResult

    expeditionTestInternals.applyBattleResultToExpedition(
      state,
      result,
      request,
      'b-0',
      'encounter-seed',
      'combat-seed',
      state.battleEntrySnapshot!.knownEnemyWeaknesses,
      state.battleEntrySnapshot!.knownEnemyAbilities,
      [],
      [],
      [],
      [],
    )

    expect(state.partyHp[party[0].id]).toBe(party[0].maxHp)
    expect(state.partyHp[party[2].id]).toBe(0)
    expect(state.partyMp[party[1].id]).toBe(party[1].maxMp - 1)
    expect(state.partyMorale[party[0].id]).toBe(50)
    expect(state.casualties).toContain(party[2].id)
    expect(state.partyStatusEffects[party[0].id]).toEqual([status])
    expect(state.battles).toHaveLength(1)
    expect(state.battles[0].deadAdventurerIds).toContain(party[2].id)
  })
})

function emptyBattleEntrySnapshot(
  surprise: 'partyAdvantage' | 'neutral' | 'enemyAdvantage' = 'neutral',
) {
  return {
    surprise,
    initialHp: {},
    initialMp: {},
    initialMorale: {},
    initialStatusEffects: {},
    knownEnemyWeaknesses: [],
    knownEnemyAbilities: [],
    environmentEffects: [],
  }
}

describe('Surprise and contact', () => {
  it('partyAdvantage forces contact success', () => {
    const request = makeRequest('surprise-advantage', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'surprise-advantage',
      'S',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = emptyBattleEntrySnapshot('partyAdvantage')
    expeditionTestInternals.runExpeditionBattle(request, party, state)
    expect(state.battles[0].entrySnapshot.surprise).toBe('partyAdvantage')
    expect(state.battles[0].result.contactResult.type).toBe('success')
  })

  it('enemyAdvantage forces contact failure', () => {
    const request = makeRequest('surprise-disadvantage', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'surprise-disadvantage',
      'S',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = emptyBattleEntrySnapshot('enemyAdvantage')
    expeditionTestInternals.runExpeditionBattle(request, party, state)
    expect(state.battles[0].entrySnapshot.surprise).toBe('enemyAdvantage')
    expect(state.battles[0].result.contactResult.type).toBe('failure')
  })

  it('neutral does not force contact type option', () => {
    const request = makeRequest('surprise-neutral', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'surprise-neutral',
      'S',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = emptyBattleEntrySnapshot('neutral')
    expeditionTestInternals.runExpeditionBattle(request, party, state)
    expect(state.battles[0].entrySnapshot.surprise).toBe('neutral')
    // neutral では forcedContactType が undefined なので、既存の接敵判定が実行される
    expect(['greatSuccess', 'success', 'failure', 'greatFailure']).toContain(
      state.battles[0].result.contactResult.type,
    )
  })
})

describe('Known enemy weaknesses', () => {
  it('sets known flag for matching weakness id or name on all enemies', () => {
    const enemies = [
      {
        id: 'e1',
        species: 'humanoid',
        name: 'Goblin',
        weaknesses: [
          { weaknessId: 'fire', name: '火弱点', known: false },
          { weaknessId: 'ice', name: '氷弱点', known: false },
        ],
      },
      {
        id: 'e2',
        species: 'humanoid',
        name: 'Goblin Archer',
        weaknesses: [{ weaknessId: 'fire', name: '火弱点', known: false }],
      },
      {
        id: 'e3',
        species: 'undead',
        name: 'Skeleton',
        weaknesses: [{ weaknessId: 'light', name: '光弱点', known: false }],
      },
    ] as unknown as Enemy[]
    const known: BattleIntel[] = [
      { kind: 'weakness', id: 'fire', name: '火弱点' },
      { kind: 'weakness', id: 'light', name: '光弱点' },
    ]
    const state = minimalExpeditionState()
    const { matched, unmatched } =
      expeditionTestInternals.applyKnownEnemyWeaknesses(
        enemies,
        known,
        state,
        'b-0',
      )
    expect(enemies[0].weaknesses[0].known).toBe(true)
    expect(enemies[0].weaknesses[1].known).toBe(false)
    expect(enemies[1].weaknesses[0].known).toBe(true)
    expect(enemies[2].weaknesses[0].known).toBe(true)
    expect(matched.length).toBe(2)
    expect(unmatched.length).toBe(0)
  })

  it('respects targetSpecies when applying known weaknesses', () => {
    const enemies = [
      {
        id: 'e1',
        species: 'beast',
        name: 'Wolf',
        weaknesses: [{ weaknessId: 'fire', name: '火弱点', known: false }],
      },
      {
        id: 'e2',
        species: 'undead',
        name: 'Skeleton',
        weaknesses: [{ weaknessId: 'fire', name: '火弱点', known: false }],
      },
    ] as unknown as Enemy[]
    const known: BattleIntel[] = [
      {
        kind: 'weakness',
        id: 'fire',
        name: '火弱点',
        targetSpecies: 'undead',
      },
    ]
    const state = minimalExpeditionState()
    expeditionTestInternals.applyKnownEnemyWeaknesses(
      enemies,
      known,
      state,
      'b-0',
    )
    expect(enemies[0].weaknesses[0].known).toBe(false)
    expect(enemies[1].weaknesses[0].known).toBe(true)
  })

  it('logs a diagnostic for unknown weakness references', () => {
    const enemies = [
      {
        id: 'e1',
        species: 'beast',
        name: 'Wolf',
        weaknesses: [],
      },
    ] as unknown as Enemy[]
    const known: BattleIntel[] = [
      { kind: 'weakness', id: 'nonexistent', name: 'nonexistent' },
    ]
    const state = minimalExpeditionState()
    expeditionTestInternals.applyKnownEnemyWeaknesses(
      enemies,
      known,
      state,
      'b-0',
    )
    const diag = state.logs.find(
      (l) => l.type === 'diagnostic' && l.phase === 'battle',
    )
    expect(diag).toBeDefined()
    expect(diag?.facts[0]).toContain('nonexistent')
  })
})

describe('Known enemy abilities', () => {
  it('matches ability intel when an enemy has the ability', () => {
    const enemies = [
      {
        species: 'beast',
        abilities: [{ abilityId: 'poisonAttack', name: '毒攻撃' }],
      },
    ] as unknown as Enemy[]
    const known: BattleIntel[] = [
      { kind: 'ability', id: 'poisonAttack', name: '毒攻撃' },
    ]
    const state = minimalExpeditionState()
    const { matched, unmatched } =
      expeditionTestInternals.matchKnownEnemyAbilities(
        enemies,
        known,
        state,
        'b-0',
      )
    expect(matched.length).toBe(1)
    expect(unmatched.length).toBe(0)
  })

  it('unmatched ability intel when no enemy has the ability', () => {
    const enemies = [{ species: 'beast', abilities: [] }] as unknown as Enemy[]
    const known: BattleIntel[] = [
      { kind: 'ability', id: 'flight', name: '飛行' },
    ]
    const state = minimalExpeditionState()
    const { matched, unmatched } =
      expeditionTestInternals.matchKnownEnemyAbilities(
        enemies,
        known,
        state,
        'b-0',
      )
    expect(matched.length).toBe(0)
    expect(unmatched.length).toBe(1)
    const diag = state.logs.find(
      (l) => l.type === 'diagnostic' && l.phase === 'battle',
    )
    expect(diag).toBeDefined()
    expect(diag?.facts[0]).toContain('飛行')
  })

  it('matches when any enemy of the target species has the ability', () => {
    const enemies = [
      { species: 'undead', abilities: [] },
      {
        species: 'undead',
        abilities: [{ abilityId: 'poisonAttack', name: '毒攻撃' }],
      },
    ] as unknown as Enemy[]
    const known: BattleIntel[] = [
      { kind: 'ability', id: 'poisonAttack', name: '毒攻撃' },
    ]
    const state = minimalExpeditionState()
    const { matched } = expeditionTestInternals.matchKnownEnemyAbilities(
      enemies,
      known,
      state,
      'b-0',
    )
    expect(matched.length).toBe(1)
  })

  it('does not match ability intel when targetSpecies differs', () => {
    const enemies = [
      {
        species: 'undead',
        abilities: [{ abilityId: 'poisonAttack', name: '毒攻撃' }],
      },
    ] as unknown as Enemy[]
    const known: BattleIntel[] = [
      {
        kind: 'ability',
        id: 'poisonAttack',
        name: '毒攻撃',
        targetSpecies: 'beast',
      },
    ]
    const state = minimalExpeditionState()
    const { matched, unmatched } =
      expeditionTestInternals.matchKnownEnemyAbilities(
        enemies,
        known,
        state,
        'b-0',
      )
    expect(matched.length).toBe(0)
    expect(unmatched.length).toBe(1)
  })

  it('stores matched and unmatched abilities in the battle record', () => {
    const request = makeRequest('ability-record')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'ability-record',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = emptyBattleEntrySnapshot()

    const result = {
      seed: 's',
      outcome: 'victory' as const,
      rounds: 3,
      survivingAdventurers: party.map((a) => a.id),
      incapacitatedAdventurers: [],
      deadAdventurers: [],
      finalAdventurerStates: party.map((a) => ({
        id: a.id,
        currentHp: a.maxHp,
        currentMp: a.maxMp,
        morale: 50,
        statusEffects: [],
        alive: true,
        incapacitated: false,
        dead: false,
      })),
      survivingEnemies: [],
      defeatedEnemies: ['e1'],
      escapedEnemies: [],
      injuries: [],
      discoveredWeaknesses: [],
      partyDamageDealt: 10,
      enemyDamageDealt: 5,
      abilityUsage: {},
      contactResult: {
        type: 'success' as const,
        partyScouting: 0,
        enemyStealth: 0,
        successChance: 100,
        roll: 0,
        effects: {},
      },
      logs: [],
      adventurerActionCount: 1,
      enemyActionCount: 1,
    } satisfies BattleResult

    const matched: BattleIntel[] = [
      { kind: 'ability', id: 'poisonAttack', name: '毒攻撃' },
    ]
    const unmatched: BattleIntel[] = [
      { kind: 'ability', id: 'flight', name: '飛行' },
    ]

    expeditionTestInternals.applyBattleResultToExpedition(
      state,
      result,
      request,
      'b-0',
      'enc',
      'comb',
      [],
      [...matched, ...unmatched],
      [],
      [],
      matched,
      unmatched,
    )

    expect(state.battles[0].matchedAbilityIntel).toEqual(matched)
    expect(state.battles[0].unmatchedAbilityIntel).toEqual(unmatched)

    const summary = state.logs.find((l) => l.type === 'battleSummary')
    expect(summary).toBeDefined()
    expect(summary?.facts.some((f) => f.includes('毒攻撃'))).toBe(true)
    expect(summary?.facts.some((f) => f.includes('飛行'))).toBe(true)
  })

  it('distinguishes matched and unmatched abilities in the battle summary', () => {
    const request = makeRequest('ability-summary')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'ability-summary',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = emptyBattleEntrySnapshot()

    const result = {
      seed: 's',
      outcome: 'victory' as const,
      rounds: 3,
      survivingAdventurers: party.map((a) => a.id),
      incapacitatedAdventurers: [],
      deadAdventurers: [],
      finalAdventurerStates: party.map((a) => ({
        id: a.id,
        currentHp: a.maxHp,
        currentMp: a.maxMp,
        morale: 50,
        statusEffects: [],
        alive: true,
        incapacitated: false,
        dead: false,
      })),
      survivingEnemies: [],
      defeatedEnemies: ['e1'],
      escapedEnemies: [],
      injuries: [],
      discoveredWeaknesses: [],
      partyDamageDealt: 10,
      enemyDamageDealt: 5,
      abilityUsage: {},
      contactResult: {
        type: 'success' as const,
        partyScouting: 0,
        enemyStealth: 0,
        successChance: 100,
        roll: 0,
        effects: {},
      },
      logs: [],
      adventurerActionCount: 1,
      enemyActionCount: 1,
    } satisfies BattleResult

    const matched: BattleIntel[] = [
      { kind: 'ability', id: 'regenerate', name: '再生' },
    ]
    const unmatched: BattleIntel[] = [
      { kind: 'ability', id: 'flight', name: '飛行' },
    ]

    expeditionTestInternals.applyBattleResultToExpedition(
      state,
      result,
      request,
      'b-0',
      'enc',
      'comb',
      [],
      [...matched, ...unmatched],
      [],
      [],
      matched,
      unmatched,
    )

    const summary = state.logs.find((l) => l.type === 'battleSummary')!
    const matchedLine = summary.facts.find((f) =>
      f.includes('一致した能力情報'),
    )
    const unmatchedLine = summary.facts.find((f) =>
      f.includes('確認できなかった能力情報'),
    )
    expect(matchedLine).toContain('再生')
    expect(unmatchedLine).toContain('飛行')
  })
})

describe('Outcome separation', () => {
  function outcomeWith(
    battleOutcome: BattleOutcome | undefined,
    progress: number,
    casualties: string[] = [],
  ) {
    const request = makeRequest('outcome-separation')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'outcome',
    )
    const state = initializeExpeditionState(request, party)
    state.objectiveProgress = progress
    state.casualties = casualties
    state.battleOutcome = battleOutcome
    return expeditionTestInternals.determineOutcome(request, state, party)
  }

  it('victory with full progress and no losses is completeSuccess', () => {
    expect(outcomeWith('victory', 100)).toBe('completeSuccess')
  })

  it('victory with low progress is failedObjective', () => {
    expect(outcomeWith('victory', 10)).toBe('failedObjective')
  })

  it('retreat with progress 40 or more is partialSuccess', () => {
    expect(outcomeWith('retreat', 40)).toBe('partialSuccess')
    expect(outcomeWith('retreat', 60)).toBe('success')
  })

  it('retreat with low progress is forcedRetreat', () => {
    expect(outcomeWith('retreat', 10)).toBe('forcedRetreat')
  })

  it('defeat is treated as forcedRetreat when progress is low', () => {
    expect(outcomeWith('defeat', 0)).toBe('forcedRetreat')
  })

  it('total loss with all casualties is lostExpedition', () => {
    const request = makeRequest('outcome-total')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'outcome-total',
    )
    const state = initializeExpeditionState(request, party)
    state.battleOutcome = 'totalLoss'
    state.casualties = party.map((a) => a.id)
    expect(
      expeditionTestInternals.determineOutcome(request, state, party),
    ).toBe('lostExpedition')
  })
})

describe('Incapacitated adventurer handling', () => {
  it('getActiveParty excludes casualties, incapacitated and HP 0 members', () => {
    const request = makeRequest('active-party')
    const party = makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'active-party',
    )
    const state = initializeExpeditionState(request, party)
    state.casualties.push(party[0].id)
    state.incapacitated.push(party[1].id)
    state.partyHp[party[2].id] = 0

    const active = expeditionTestInternals.getActiveParty(party, state)
    expect(active.map((a) => a.id)).toEqual([party[3].id])

    const nonDead = expeditionTestInternals.getNonDeadParty(party, state)
    expect(nonDead.map((a) => a.id)).toEqual([
      party[1].id,
      party[2].id,
      party[3].id,
    ])
  })

  it('resolveSkillCheck does not select incapacitated members as primary or assistants', () => {
    const request = makeRequest('incap-primary')
    const party = makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'incap-primary',
    )
    const state = initializeExpeditionState(request, party)
    state.incapacitated.push(party[0].id)

    const rng = new SeededRng('test')
    const { primary, assistants } = expeditionTestInternals.resolveSkillCheck(
      rng,
      party,
      state,
      'exploration',
      'scouting',
      'scout',
      0,
      0,
    )

    expect(primary.id).not.toBe(party[0].id)
    expect(assistants.some((a) => a.id === party[0].id)).toBe(false)
  })

  it('incapacitated healer cannot perform firstAid check', () => {
    const request = makeRequest('incap-healer')
    const party = makeParty(
      ['healer', 'support', 'ranger', 'scout'],
      'incap-healer',
    )
    const state = initializeExpeditionState(request, party)
    state.incapacitated.push(party[0].id)

    const rng = new SeededRng('test')
    const { primary } = expeditionTestInternals.resolveSkillCheck(
      rng,
      party,
      state,
      'return',
      'firstAid',
      'healer',
      0,
      0,
    )

    expect(primary.role).not.toBe('healer')
  })

  it('incapacitated support is not counted for morale support', () => {
    const request = makeRequest('incap-support')
    const party = makeParty(
      ['support', 'ranger', 'scout', 'healer'],
      'incap-support',
    )
    const state = initializeExpeditionState(request, party)
    state.incapacitated.push(party[0].id)

    const active = expeditionTestInternals.getActiveParty(party, state)
    expect(active.some((a) => a.role === 'support')).toBe(false)
  })

  it('treatMember removes incapacitated and raises HP to at least 1', () => {
    const state = minimalExpeditionState(0)
    state.incapacitated = ['a']
    state.injuries.push({
      id: 'i1',
      adventurerId: 'a',
      type: 'light',
      cause: 'x',
      hpLoss: 5,
      status: 'active',
    })

    expeditionTestInternals.treatMember(state, 'a', false)

    expect(state.incapacitated).not.toContain('a')
    expect(state.partyHp.a).toBeGreaterThanOrEqual(1)
    expect(state.injuries[0].status).toBe('treated')
  })

  it('treatMember treats active serious injuries on non-critical success', () => {
    const state = minimalExpeditionState(0)
    state.incapacitated = ['a']
    state.injuries.push({
      id: 'i1',
      adventurerId: 'a',
      type: 'serious',
      cause: 'x',
      hpLoss: 15,
      status: 'active',
    })

    expeditionTestInternals.treatMember(state, 'a', false)

    expect(state.incapacitated).not.toContain('a')
    expect(state.partyHp.a).toBeGreaterThanOrEqual(1)
    expect(state.injuries[0].status).toBe('treated')
  })

  it('treatMember treats serious injuries on critical success', () => {
    const state = minimalExpeditionState(0)
    state.incapacitated = ['a']
    state.injuries.push({
      id: 'i1',
      adventurerId: 'a',
      type: 'serious',
      cause: 'x',
      hpLoss: 15,
      status: 'active',
    })

    expeditionTestInternals.treatMember(state, 'a', true)

    expect(state.injuries[0].status).toBe('treated')
  })

  it('lostExpedition when all living members are incapacitated', () => {
    const request = makeRequest('all-incap')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'all-incap',
    )
    const state = initializeExpeditionState(request, party)
    for (const a of party) {
      state.partyHp[a.id] = 0
      state.incapacitated.push(a.id)
    }

    expect(
      expeditionTestInternals.determineOutcome(request, state, party),
    ).toBe('lostExpedition')
  })

  it('some incapacitated members do not force lostExpedition when active members remain', () => {
    const request = makeRequest('some-incap')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'some-incap',
    )
    const state = initializeExpeditionState(request, party)
    state.incapacitated.push(party[0].id, party[1].id)
    state.objectiveProgress = 40

    expect(
      expeditionTestInternals.determineOutcome(request, state, party),
    ).not.toBe('lostExpedition')
  })

  it('applyBattleResultToExpedition keeps dead and incapacitated in separate arrays', () => {
    const request = makeRequest('separation')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'separation',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = emptyBattleEntrySnapshot()

    const result = {
      seed: 's',
      outcome: 'defeat' as const,
      rounds: 3,
      survivingAdventurers: [party[2].id, party[3].id],
      incapacitatedAdventurers: [party[1].id],
      deadAdventurers: [party[0].id],
      finalAdventurerStates: party.map((a, i) => ({
        id: a.id,
        currentHp: i === 0 ? 0 : i === 1 ? 0 : a.maxHp,
        currentMp: a.maxMp,
        morale: 50,
        statusEffects: [],
        alive: i !== 0,
        incapacitated: i === 1,
        dead: i === 0,
      })),
      survivingEnemies: [],
      defeatedEnemies: [],
      escapedEnemies: [],
      injuries: [],
      discoveredWeaknesses: [],
      partyDamageDealt: 10,
      enemyDamageDealt: 5,
      abilityUsage: {},
      contactResult: {
        type: 'failure' as const,
        partyScouting: 0,
        enemyStealth: 0,
        successChance: 100,
        roll: 0,
        effects: {},
      },
      logs: [],
      adventurerActionCount: 1,
      enemyActionCount: 1,
    } satisfies BattleResult

    expeditionTestInternals.applyBattleResultToExpedition(
      state,
      result,
      request,
      'b-0',
      'enc',
      'comb',
      state.battleEntrySnapshot.knownEnemyWeaknesses,
      state.battleEntrySnapshot.knownEnemyAbilities,
      [],
      [],
      [],
      [],
    )

    expect(state.casualties).toEqual([party[0].id])
    expect(state.incapacitated).toEqual([party[1].id])
  })
})

describe('Battle intel conversion', () => {
  it('does not convert normal monsterKnowledge information into enemy weaknesses', () => {
    const request = makeRequest('no-auto-weakness', {
      environment: 'magical',
      features: [],
      hiddenInformation: [
        {
          id: 'magic',
          name: '魔力の残滓',
          description: '魔法の気配',
          difficulty: 5,
          requiredSkill: 'monsterKnowledge',
        },
      ],
    })
    const party = makeParty(['mage', 'scout', 'ranger', 'healer'], 'no-auto')
    const result = runExpedition(request, party)
    expect(result.state.battleEntrySnapshot?.knownEnemyWeaknesses.length).toBe(
      0,
    )
  })

  it('does not apply fragment battle intel as weaknesses', () => {
    const request = makeRequest('fragment-intel')
    const party = makeParty(
      ['mage', 'scout', 'ranger', 'healer'],
      'fragment-intel',
    )
    const state = initializeExpeditionState(request, party)
    state.information.push({
      id: 'frag-weak',
      name: '断片化した弱点情報',
      description: 'x',
      source: 'monsterKnowledge',
      completeness: 'fragment',
      battleIntel: { kind: 'weakness', id: 'fire', name: '火弱点' },
    })

    const snapshot = expeditionTestInternals.buildBattleEntrySnapshot(
      request,
      party,
      state,
    )
    expect(snapshot.knownEnemyWeaknesses.length).toBe(0)
  })

  it('only applies complete battle intel with battleIntel field', () => {
    const request = makeRequest('complete-intel', {
      knownInformation: [
        {
          id: 'weak',
          name: '敵の弱点',
          description: 'x',
          battleIntel: { kind: 'weakness', id: 'fire', name: '火弱点' },
        },
        {
          id: 'abi',
          name: '敵の能力',
          description: 'x',
          battleIntel: { kind: 'ability', id: 'flight', name: '飛行' },
        },
      ],
    })
    const party = makeParty(['mage', 'scout', 'ranger', 'healer'], 'complete')
    const result = runExpedition(request, party)
    expect(result.state.battleEntrySnapshot?.knownEnemyWeaknesses.length).toBe(
      1,
    )
    expect(result.state.battleEntrySnapshot?.knownEnemyWeaknesses[0].id).toBe(
      'fire',
    )
    expect(result.state.battleEntrySnapshot?.knownEnemyAbilities.length).toBe(1)
    expect(result.state.battleEntrySnapshot?.knownEnemyAbilities[0].id).toBe(
      'flight',
    )
  })

  it('stores known abilities in the battle record and summary', () => {
    const request = makeRequest('ability-record', {
      knownInformation: [
        {
          id: 'abi',
          name: '敵の能力',
          description: 'x',
          battleIntel: { kind: 'ability', id: 'poisonAttack', name: '毒攻撃' },
        },
      ],
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'ability-record',
      'S',
    )
    const result = runExpedition(request, party)
    const record = result.state.battles[0]
    expect(record.knownEnemyAbilities.length).toBe(1)
    expect(record.knownEnemyAbilities[0].id).toBe('poisonAttack')
    const summary = result.state.logs.find((l) => l.type === 'battleSummary')
    expect(summary).toBeDefined()
    expect(summary?.facts.some((f) => f.includes('毒攻撃'))).toBe(true)
  })
})

describe('Battle seed handling', () => {
  it('same battle seed produces identical enemy composition despite different request seeds', () => {
    const battle = battleConfig({ seed: 'shared-battle-seed' })
    const requestA = makeRequest('req-a', { battle })
    const requestB = makeRequest('req-b', { battle })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'seed-party',
      'C',
    )
    const resultA = runExpedition(requestA, cloneParty(party))
    const resultB = runExpedition(requestB, cloneParty(party))
    expect(resultA.state.battles[0].enemyIds).toEqual(
      resultB.state.battles[0].enemyIds,
    )
  })

  it('same battle seed produces identical combat result despite different request seeds', () => {
    const battle = battleConfig({ seed: 'shared-combat-seed' })
    const requestA = makeRequest('req-c', { battle })
    const requestB = makeRequest('req-d', { battle })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'combat-party',
      'C',
    )
    const resultA = runExpedition(requestA, cloneParty(party))
    const resultB = runExpedition(requestB, cloneParty(party))
    expect(resultA.state.battles[0].result.outcome).toBe(
      resultB.state.battles[0].result.outcome,
    )
    expect(resultA.state.battles[0].result.rounds).toBe(
      resultB.state.battles[0].result.rounds,
    )
  })

  it('records encounterSeed and combatSeed in the battle record', () => {
    const request = makeRequest('seed-record', {
      battle: battleConfig({ seed: 'record-seed' }),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'seed-record',
      'C',
    )
    const result = runExpedition(request, party)
    const record = result.state.battles[0]
    expect(record.encounterSeed).toBe('record-seed:encounter')
    expect(record.combatSeed).toBe('record-seed:combat')
  })

  it('different battle seeds produce different enemy or combat results', () => {
    const requestA = makeRequest('diff-a', {
      battle: battleConfig({ seed: 'diff-a' }),
    })
    const requestB = makeRequest('diff-b', {
      battle: battleConfig({ seed: 'diff-b' }),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'diff-party',
      'C',
    )
    const resultA = runExpedition(requestA, cloneParty(party))
    const resultB = runExpedition(requestB, cloneParty(party))
    const differentEnemies =
      resultA.state.battles[0].enemyIds.join(',') !==
      resultB.state.battles[0].enemyIds.join(',')
    const differentOutcome =
      resultA.state.battles[0].result.outcome !==
      resultB.state.battles[0].result.outcome
    expect(differentEnemies || differentOutcome).toBe(true)
  })

  it('changing expedition events before battle does not change enemy composition when battle seed is fixed', () => {
    // 戦闘シードが固定するのは乱数系列。戦闘前のHP/MP/士気/状態異常/surprise/環境条件が異なれば、
    // 同じcombatSeedでも戦闘結果は変わり得るが、敵編成は同一になる。
    const battle = battleConfig({ seed: 'fixed-battle-seed' })
    const requestA = makeRequest('pre-a', {
      battle,
      features: ['traps'],
    })
    const requestB = makeRequest('pre-b', {
      battle,
      features: ['traps', 'poorVisibility'],
    })
    const partyA = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'pre-a',
      'C',
    )
    const partyB = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'pre-b',
      'C',
    )
    const resultA = runExpedition(requestA, partyA)
    const resultB = runExpedition(requestB, partyB)
    expect(resultA.state.battles[0].enemyComposition).toBe(
      resultB.state.battles[0].enemyComposition,
    )
  })
})

function makeEliminationRequest(
  seed: string,
  rank: AdventurerRank = 'C',
  confirmationRequired = false,
  shape: 'standard' | 'swarm' | 'eliteGroup' | 'boss' = 'standard',
): ExpeditionRequest {
  return makeRequest(seed, {
    objectiveType: 'elimination',
    rank,
    hiddenInformation: [],
    battle: battleConfig({
      seed: `${seed}:battle:0`,
      shape,
    }),
    elimination: { mode: 'allEnemies', confirmationRequired },
  })
}

function makeEliminationParty(
  seedBase: string,
  rank: AdventurerRank,
): Adventurer[] {
  return makeParty(['vanguard', 'guardian', 'mage', 'healer'], seedBase, rank)
}

describe('Elimination request validation', () => {
  it('throws when elimination configuration is missing', () => {
    const request = makeRequest('elim-no-config', {
      objectiveType: 'elimination',
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'elim-no-config',
    )
    expect(() => runExpedition(request, party)).toThrow(
      'Elimination request requires elimination configuration',
    )
  })

  it('throws when battle configuration is missing', () => {
    const request = makeRequest('elim-no-battle', {
      objectiveType: 'elimination',
      elimination: { mode: 'allEnemies', confirmationRequired: false },
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'elim-no-battle',
    )
    expect(() => runExpedition(request, party)).toThrow(
      'Elimination request requires battle configuration',
    )
  })

  it('throws when battle.enabled is false', () => {
    const request = makeRequest('elim-disabled-battle', {
      objectiveType: 'elimination',
      battle: battleConfig({ enabled: false }),
      elimination: { mode: 'allEnemies', confirmationRequired: false },
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'elim-disabled-battle',
    )
    expect(() => runExpedition(request, party)).toThrow(
      'Elimination request requires battle.enabled === true',
    )
  })

  it('accepts investigation without elimination configuration', () => {
    const request = makeRequest('investigation-no-elim')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'investigation-no-elim',
    )
    expect(() => runExpedition(request, party)).not.toThrow()
  })
})

describe('Elimination target fixation', () => {
  it('sets requiredTargetIds to all enemy IDs at battle start', () => {
    const request = makeEliminationRequest('target-fix', 'S')
    const party = makeEliminationParty('target-fix', 'S')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    const record = result.state.battles[0]
    expect(record).toBeDefined()
    expect(new Set(obj.requiredTargetIds)).toEqual(new Set(record.enemyIds))
  })

  it('does not add summoned enemies to requiredTargetIds', () => {
    const request = makeEliminationRequest('summon-test', 'S')
    const state = initializeExpeditionState(
      request,
      makeEliminationParty('summon-test', 'S'),
    )
    const requiredIds = ['e-0', 'e-1', 'e-2', 'e-3']
    const obj = state.objectiveState as EliminationObjectiveState
    obj.requiredTargetIds = [...requiredIds]
    const result = {
      survivingEnemies: ['e-0', 'summon-1'],
      defeatedEnemies: ['e-1', 'e-2'],
      escapedEnemies: ['e-3'],
    } as unknown as BattleResult
    expeditionTestInternals.resolveEliminationTargets(
      state,
      result,
      request,
      'b-0',
    )
    expect(obj.requiredTargetIds).toEqual(requiredIds)
    expect(obj.defeatedTargetIds).toEqual(['e-1', 'e-2'])
    expect(obj.escapedTargetIds).toEqual(['e-3'])
    expect(obj.survivingTargetIds).toEqual(['e-0'])
    expect(obj.defeatedTargetIds).not.toContain('summon-1')
  })

  it('produces identical target IDs for the same request seed', () => {
    const request = makeEliminationRequest('same-target-seed', 'C')
    const partyA = makeEliminationParty('same-target-a', 'C')
    const partyB = makeEliminationParty('same-target-b', 'C')
    const resultA = runExpedition(request, partyA)
    const resultB = runExpedition(request, partyB)
    const idsA = (resultA.state.objectiveState as EliminationObjectiveState)
      .requiredTargetIds
    const idsB = (resultB.state.objectiveState as EliminationObjectiveState)
      .requiredTargetIds
    expect(idsA).toEqual(idsB)
  })

  it('does not change enemy composition when dispatching a different party', () => {
    const request = makeEliminationRequest('shared-enemy-seed', 'S')
    const partyA = makeEliminationParty('party-a', 'S')
    const partyB = makeEliminationParty('party-b', 'S')
    const resultA = runExpedition(request, partyA)
    const resultB = runExpedition(request, partyB)
    expect(resultA.state.battles[0].enemyComposition).toBe(
      resultB.state.battles[0].enemyComposition,
    )
    const idsA = (resultA.state.objectiveState as EliminationObjectiveState)
      .requiredTargetIds
    const idsB = (resultB.state.objectiveState as EliminationObjectiveState)
      .requiredTargetIds
    expect(idsA).toEqual(idsB)
  })
})

describe('Elimination progress', () => {
  function runResolve(
    defeated: string[],
    escaped: string[],
    surviving: string[],
  ): EliminationObjectiveState {
    const request = makeEliminationRequest('progress-test', 'S')
    const state = initializeExpeditionState(
      request,
      makeEliminationParty('progress-test', 'S'),
    )
    const obj = state.objectiveState as EliminationObjectiveState
    obj.requiredTargetIds = ['e-0', 'e-1', 'e-2', 'e-3']
    const result = {
      survivingEnemies: surviving,
      defeatedEnemies: defeated,
      escapedEnemies: escaped,
    } as unknown as BattleResult
    expeditionTestInternals.resolveEliminationTargets(
      state,
      result,
      request,
      'b-0',
    )
    return obj
  }

  it('calculates 100% progress when all 4 targets are defeated', () => {
    const obj = runResolve(['e-0', 'e-1', 'e-2', 'e-3'], [], [])
    expect(obj.progress).toBe(100)
  })

  it('calculates 75% progress when 3 of 4 targets are defeated', () => {
    const obj = runResolve(['e-0', 'e-1', 'e-2'], [], ['e-3'])
    expect(obj.progress).toBe(75)
  })

  it('calculates 50% progress when 2 of 4 targets are defeated', () => {
    const obj = runResolve(['e-0', 'e-1'], ['e-3'], ['e-2'])
    expect(obj.progress).toBe(50)
  })

  it('calculates 0% progress when no targets are defeated', () => {
    const obj = runResolve([], [], ['e-0', 'e-1', 'e-2', 'e-3'])
    expect(obj.progress).toBe(0)
  })

  it('does not count escaped enemies as defeated', () => {
    const obj = runResolve(['e-0', 'e-1'], ['e-2', 'e-3'], [])
    expect(obj.defeatedTargetIds).toEqual(['e-0', 'e-1'])
    expect(obj.escapedTargetIds).toEqual(['e-2', 'e-3'])
    expect(obj.progress).toBe(50)
  })

  it('does not count surviving enemies as defeated', () => {
    const obj = runResolve(['e-0', 'e-1'], [], ['e-2', 'e-3'])
    expect(obj.survivingTargetIds).toEqual(['e-2', 'e-3'])
    expect(obj.progress).toBe(50)
  })

  it('does not implicitly resolve targets with unknown final state', () => {
    const obj = runResolve(['e-1'], ['e-2'], ['e-0'])
    expect(obj.defeatedTargetIds).toEqual(['e-1'])
    expect(obj.escapedTargetIds).toEqual(['e-2'])
    expect(obj.survivingTargetIds).toEqual(['e-0'])
    expect(obj.defeatedTargetIds).not.toContain('e-3')
    expect(obj.escapedTargetIds).not.toContain('e-3')
    expect(obj.survivingTargetIds).not.toContain('e-3')
    expect(obj.progress).toBe(25)
  })
})

describe('Elimination confirmation', () => {
  it('auto-confirms defeated targets when confirmationRequired is false', () => {
    const request = makeEliminationRequest('auto-confirm', 'S', false)
    const party = makeEliminationParty('auto-confirm', 'S')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    expect(obj.confirmedTargetIds).toEqual(obj.defeatedTargetIds)
  })

  it('confirms all defeated targets on a successful confirmation check', () => {
    const request = makeEliminationRequest('s37', 'S', true)
    const party = makeEliminationParty('s37', 'S')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    const confirmLog = result.state.logs.find(
      (l) => l.type === 'eliminationConfirmation',
    )
    expect(confirmLog?.check?.result).toBe('success')
    expect(obj.type).toBe('elimination')
    expect(obj.confirmedTargetIds.length).toBe(obj.defeatedTargetIds.length)
    expect(obj.confirmedTargetIds).toEqual(obj.defeatedTargetIds)
  })

  it('confirms only some defeated targets on a partial success confirmation check', () => {
    const request = makeEliminationRequest('s325', 'C', true)
    const party = makeEliminationParty('s325', 'C')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    const confirmLog = result.state.logs.find(
      (l) => l.type === 'eliminationConfirmation',
    )
    expect(confirmLog?.check?.result).toBe('partialSuccess')
    expect(obj.type).toBe('elimination')
    expect(obj!.confirmedTargetIds.length).toBeGreaterThan(0)
    expect(obj!.confirmedTargetIds.length).toBeLessThan(
      obj!.defeatedTargetIds.length,
    )
  })

  it('separates defeated count from confirmed count on confirmation failure', () => {
    const request = makeEliminationRequest('s45', 'S', true)
    const party = makeEliminationParty('s45', 'S')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    const confirmLog = result.state.logs.find(
      (l) => l.type === 'eliminationConfirmation',
    )
    expect(confirmLog?.check?.result).toBe('failure')
    expect(obj.type).toBe('elimination')
    expect(obj.defeatedTargetIds.length).toBeGreaterThan(0)
    expect(obj.confirmedTargetIds.length).toBe(0)
  })

  it('marks completed false when any target is unconfirmed', () => {
    const request = makeEliminationRequest('s45', 'S', true)
    const party = makeEliminationParty('s45', 'S')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    expect(obj.defeatedTargetIds.length).toBe(obj.requiredTargetIds.length)
    expect(obj.confirmedTargetIds.length).toBeLessThan(
      obj!.requiredTargetIds.length,
    )
    expect(obj.completed).toBe(false)
  })
})

describe('Elimination final outcomes', () => {
  it('completeSuccess when all targets defeated, confirmed, no major damage, and returned safely', () => {
    const request = makeEliminationRequest('s37', 'S', false)
    const party = makeEliminationParty('s37', 'S')
    const result = runExpedition(request, party)
    expect(result.outcome).toBe('completeSuccess')
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    expect(obj.defeatedTargetIds.length).toBe(obj.requiredTargetIds.length)
    expect(obj.completed).toBe(true)
    expect(result.state.casualties.length).toBe(0)
  })

  it('success when all targets defeated and confirmed but major damage remains', () => {
    const request = makeEliminationRequest('s325', 'C', false)
    const party = makeEliminationParty('s325', 'C')
    const result = runExpedition(request, party)
    expect(result.outcome).toBe('success')
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    expect(obj.defeatedTargetIds.length).toBe(obj.requiredTargetIds.length)
    expect(obj.completed).toBe(true)
    const hasMajorDamage =
      result.state.casualties.length > 0 ||
      result.state.incapacitated.length > 0 ||
      result.state.injuries.some((i) => i.type === 'serious')
    expect(hasMajorDamage).toBe(true)
  })

  it('partialSuccess when half of the targets are defeated and survivors return', () => {
    const request = makeEliminationRequest('s1', 'C', false)
    const party = makeEliminationParty('s1', 'C')
    const result = runExpedition(request, party)
    expect(result.outcome).toBe('partialSuccess')
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    expect(obj.progress).toBeGreaterThanOrEqual(40)
    expect(obj.defeatedTargetIds.length).toBeLessThan(
      obj!.requiredTargetIds.length,
    )
  })

  it('forcedRetreat when only one target is defeated and the party retreats', () => {
    const request = makeEliminationRequest('s17', 'E', false)
    const party = makeEliminationParty('s17', 'E')
    const result = runExpedition(request, party)
    expect(result.outcome).toBe('forcedRetreat')
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    expect(obj.defeatedTargetIds.length).toBe(1)
    expect(obj.progress).toBeLessThan(40)
  })

  it('failedObjective when battle is won but most targets escaped', () => {
    const request = makeEliminationRequest('s12', 'D', false)
    const party = makeEliminationParty('s12', 'D')
    const result = runExpedition(request, party)
    expect(result.outcome).toBe('failedObjective')
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    expect(result.state.battles[0]?.outcome).toMatch(/victory|costlyVictory/)
    expect(obj.progress).toBeLessThan(40)
  })

  it('lostExpedition when party is wiped out even if all targets were defeated', () => {
    const request = makeEliminationRequest('lost-after-victory', 'S', false)
    const party = makeEliminationParty('lost-after-victory', 'S')
    const state = initializeExpeditionState(request, party)
    state.casualties = party.map((a) => a.id)
    state.objectiveState = {
      type: 'elimination',
      mode: 'allEnemies',
      confirmationRequired: false,
      requiredTargetIds: ['e-0', 'e-1', 'e-2', 'e-3'],
      defeatedTargetIds: ['e-0', 'e-1', 'e-2', 'e-3'],
      escapedTargetIds: [],
      survivingTargetIds: [],
      unknownTargetIds: [],
      confirmedTargetIds: ['e-0', 'e-1', 'e-2', 'e-3'],
      progress: 100,
      completed: true,
    }
    const outcome = expeditionTestInternals.determineOutcome(
      request,
      state,
      party,
    )
    expect(outcome).toBe('lostExpedition')
  })

  it('does not auto-succeed just because the battle was won', () => {
    const request = makeEliminationRequest('s45', 'S', true)
    const party = makeEliminationParty('s45', 'S')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    expect(result.state.battles[0]?.outcome).toBe('victory')
    expect(result.outcome).toBe('failedObjective')
  })
})

describe('Elimination state consistency', () => {
  it('has no duplicate requiredTargetIds', () => {
    const request = makeEliminationRequest('no-dup-targets', 'S')
    const party = makeEliminationParty('no-dup-targets', 'S')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    expect(new Set(obj.requiredTargetIds).size).toBe(
      obj.requiredTargetIds.length,
    )
  })

  it('keeps defeated, escaped, surviving, and unknown target IDs mutually exclusive', () => {
    const request = makeEliminationRequest('exclusive-targets', 'S')
    const party = makeEliminationParty('exclusive-targets', 'S')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    const allIds = [
      ...obj.defeatedTargetIds,
      ...obj.escapedTargetIds,
      ...obj.survivingTargetIds,
      ...obj.unknownTargetIds,
    ]
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('sum of defeated, escaped, surviving, and unknown equals required target count', () => {
    const request = makeEliminationRequest('sum-targets', 'S')
    const party = makeEliminationParty('sum-targets', 'S')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    const total =
      obj.defeatedTargetIds.length +
      obj.escapedTargetIds.length +
      obj.survivingTargetIds.length +
      obj.unknownTargetIds.length
    expect(total).toBe(obj.requiredTargetIds.length)
  })

  it('confirmedTargetIds is a subset of defeatedTargetIds', () => {
    const request = makeEliminationRequest('confirmed-subset', 'S', true)
    const party = makeEliminationParty('confirmed-subset', 'S')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    for (const id of obj!.confirmedTargetIds) {
      expect(obj!.defeatedTargetIds).toContain(id)
    }
  })

  it('objectiveProgress matches the defeat ratio', () => {
    const request = makeEliminationRequest('progress-match', 'S')
    const party = makeEliminationParty('progress-match', 'S')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    const expected = Math.round(
      (obj!.defeatedTargetIds.length / obj!.requiredTargetIds.length) * 100,
    )
    expect(obj!.progress).toBe(expected)
    expect(result.state.objectiveProgress).toBe(expected)
  })

  it('objectiveCompleted matches full defeat and full confirmation', () => {
    const request = makeEliminationRequest('completed-match', 'S', true)
    const party = makeEliminationParty('completed-match', 'S')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    const expected =
      obj!.defeatedTargetIds.length === obj!.requiredTargetIds.length &&
      obj!.confirmedTargetIds.length === obj!.requiredTargetIds.length
    expect(obj!.completed).toBe(expected)
    expect(result.state.objectiveCompleted).toBe(expected)
  })

  it('logs and objectiveState agree on target counts', () => {
    const request = makeEliminationRequest('logs-agree', 'S')
    const party = makeEliminationParty('logs-agree', 'S')
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as EliminationObjectiveState
    expect(obj.type).toBe('elimination')
    const assignLog = result.state.logs.find(
      (l) => l.type === 'eliminationTargetsAssigned',
    )
    expect(
      assignLog?.facts.some((f) =>
        f.includes(`対象として${obj!.requiredTargetIds.length}体`),
      ),
    ).toBe(true)
    expect(
      assignLog?.facts.some((f) =>
        f.includes(`戦闘で${obj!.defeatedTargetIds.length}体を撃破`),
      ),
    ).toBe(true)
    const progressEffect = assignLog?.effects.find(
      (e) => e.type === 'eliminationProgress',
    )
    expect(progressEffect?.value).toBe(obj!.progress)
  })
})

describe('Elimination unknown targets', () => {
  function runUnknownResolve(
    defeated: string[],
    escaped: string[],
    surviving: string[],
  ): EliminationObjectiveState {
    const request = makeEliminationRequest('unknown-resolve', 'S')
    const state = initializeExpeditionState(
      request,
      makeEliminationParty('unknown-resolve', 'S'),
    )
    const obj = state.objectiveState as EliminationObjectiveState
    obj.requiredTargetIds = ['e-0', 'e-1', 'e-2', 'e-3']
    const result = {
      survivingEnemies: surviving,
      defeatedEnemies: defeated,
      escapedEnemies: escaped,
    } as unknown as BattleResult
    expeditionTestInternals.resolveEliminationTargets(
      state,
      result,
      request,
      'b-0',
    )
    return obj
  }

  it('stores target IDs with unknown final state in unknownTargetIds', () => {
    const obj = runUnknownResolve(['e-0'], ['e-1'], ['e-2'])
    expect(obj.unknownTargetIds).toEqual(['e-3'])
    expect(obj.defeatedTargetIds).toEqual(['e-0'])
    expect(obj.escapedTargetIds).toEqual(['e-1'])
    expect(obj.survivingTargetIds).toEqual(['e-2'])
  })

  it('keeps the four target classifications mutually exclusive', () => {
    const obj = runUnknownResolve(['e-0'], ['e-1'], ['e-2'])
    const allIds = [
      ...obj.defeatedTargetIds,
      ...obj.escapedTargetIds,
      ...obj.survivingTargetIds,
      ...obj.unknownTargetIds,
    ]
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('sums the four target classifications to the required count', () => {
    const obj = runUnknownResolve(['e-0'], ['e-1'], ['e-2'])
    const total =
      obj.defeatedTargetIds.length +
      obj.escapedTargetIds.length +
      obj.survivingTargetIds.length +
      obj.unknownTargetIds.length
    expect(total).toBe(obj.requiredTargetIds.length)
  })

  it('marks completed false when any target is unknown', () => {
    const obj = runUnknownResolve(['e-0', 'e-1', 'e-2', 'e-3'], [], [])
    expect(obj.unknownTargetIds.length).toBe(0)
    expect(obj.completed).toBe(true)

    const objUnknown = runUnknownResolve(['e-0', 'e-1'], ['e-2'], [])
    expect(objUnknown.unknownTargetIds.length).toBeGreaterThan(0)
    expect(objUnknown.completed).toBe(false)
  })

  it('does not yield completeSuccess or success when unknown targets remain', () => {
    const request = makeEliminationRequest('unknown-outcome', 'S', true)
    const party = makeEliminationParty('unknown-outcome', 'S')
    const state = initializeExpeditionState(request, party)
    const obj = state.objectiveState as EliminationObjectiveState
    obj.requiredTargetIds = ['e-0', 'e-1']
    obj.defeatedTargetIds = ['e-0']
    obj.escapedTargetIds = []
    obj.survivingTargetIds = []
    obj.unknownTargetIds = ['e-1']
    obj.confirmedTargetIds = ['e-0']
    obj.progress = 50
    obj.completed = false
    state.battleOutcome = 'victory'
    const outcome = expeditionTestInternals.determineOutcome(
      request,
      state,
      party,
    )
    expect(outcome).not.toBe('completeSuccess')
    expect(outcome).not.toBe('success')
  })

  it('records unknown target count in structured facts and effects', () => {
    const request = makeEliminationRequest('unknown-logs', 'S')
    const state = initializeExpeditionState(
      request,
      makeEliminationParty('unknown-logs', 'S'),
    )
    const obj = state.objectiveState as EliminationObjectiveState
    obj.requiredTargetIds = ['e-0', 'e-1', 'e-2', 'e-3']
    const result = {
      survivingEnemies: ['e-0'],
      defeatedEnemies: ['e-1'],
      escapedEnemies: ['e-2'],
    } as unknown as BattleResult
    expeditionTestInternals.resolveEliminationTargets(
      state,
      result,
      request,
      'b-0',
    )
    const assignLog = state.logs.find(
      (l) => l.type === 'eliminationTargetsAssigned',
    )
    expect(
      assignLog?.facts.some((f) =>
        f.includes(
          `${obj.unknownTargetIds.length}体の最終状態を確認できなかった`,
        ),
      ),
    ).toBe(true)
    const unknownEffect = assignLog?.effects.find(
      (e) => e.type === 'eliminationUnknown',
    )
    expect(unknownEffect?.value).toBe(obj.unknownTargetIds.length)
  })
})

describe('Elimination zero defeated targets', () => {
  function setupZeroDefeatedState(
    confirmationRequired: boolean,
  ): ExpeditionState {
    const request = makeEliminationRequest(
      'zero-defeated',
      'S',
      confirmationRequired,
    )
    const state = initializeExpeditionState(
      request,
      makeEliminationParty('zero-defeated', 'S'),
    )
    const obj = state.objectiveState as EliminationObjectiveState
    obj.requiredTargetIds = ['e-0', 'e-1']
    obj.defeatedTargetIds = []
    obj.escapedTargetIds = []
    obj.survivingTargetIds = ['e-0', 'e-1']
    obj.unknownTargetIds = []
    obj.confirmedTargetIds = []
    obj.progress = 0
    obj.completed = false
    obj.confirmationRequired = confirmationRequired
    state.battleOutcome = 'victory'
    return state
  }

  it('skips the confirmation skill check when no targets were defeated', () => {
    const state = setupZeroDefeatedState(true)
    const party = makeEliminationParty('zero-defeated', 'S')
    const request = makeEliminationRequest('zero-defeated', 'S', true)
    const rng = new SeededRng('zero-check')
    expeditionTestInternals.runEliminationObjective(request, party, state, rng)
    const log = state.logs.find((l) => l.type === 'eliminationConfirmation')
    expect(
      log?.facts.some((f) =>
        f.includes('撃破対象が存在しないため、討伐確認は行われなかった'),
      ),
    ).toBe(true)
    expect(log?.check).toBeUndefined()
  })

  it('leaves confirmedTargetIds empty when no targets were defeated', () => {
    const state = setupZeroDefeatedState(false)
    const party = makeEliminationParty('zero-defeated', 'S')
    const request = makeEliminationRequest('zero-defeated', 'S', false)
    const rng = new SeededRng('zero-confirm')
    expeditionTestInternals.runEliminationObjective(request, party, state, rng)
    const obj = state.objectiveState as EliminationObjectiveState
    expect(obj.confirmedTargetIds).toEqual([])
    expect(obj.completed).toBe(false)
  })

  it('does not generate a "1 out of 0" confirmation fact', () => {
    const state = setupZeroDefeatedState(true)
    const party = makeEliminationParty('zero-defeated', 'S')
    const request = makeEliminationRequest('zero-defeated', 'S', true)
    const rng = new SeededRng('zero-no-bad-fact')
    expeditionTestInternals.runEliminationObjective(request, party, state, rng)
    const log = state.logs.find((l) => l.type === 'eliminationConfirmation')
    expect(
      log?.facts.some((f) => f.includes('0体のうち') || f.includes('うち1体')),
    ).toBe(false)
  })

  it('does not auto-succeed when no targets were defeated', () => {
    const state = setupZeroDefeatedState(false)
    const party = makeEliminationParty('zero-defeated', 'S')
    const request = makeEliminationRequest('zero-defeated', 'S', false)
    const rng = new SeededRng('zero-no-success')
    expeditionTestInternals.runEliminationObjective(request, party, state, rng)
    const obj = state.objectiveState as EliminationObjectiveState
    expect(obj.completed).toBe(false)
  })
})

describe('Elimination confirmation on retreat', () => {
  function setupRetreatState(confirmationRequired: boolean): ExpeditionState {
    const request = makeEliminationRequest(
      'retreat-confirm',
      'S',
      confirmationRequired,
    )
    const state = initializeExpeditionState(
      request,
      makeEliminationParty('retreat-confirm', 'S'),
    )
    const obj = state.objectiveState as EliminationObjectiveState
    obj.requiredTargetIds = ['e-0', 'e-1']
    obj.defeatedTargetIds = ['e-0']
    obj.escapedTargetIds = ['e-1']
    obj.survivingTargetIds = []
    obj.unknownTargetIds = []
    obj.confirmedTargetIds = []
    obj.progress = 50
    obj.completed = false
    obj.confirmationRequired = confirmationRequired
    state.battleOutcome = 'retreat'
    return state
  }

  it('auto-confirms defeated targets on retreat when confirmationRequired is false', () => {
    const state = setupRetreatState(false)
    const party = makeEliminationParty('retreat-confirm', 'S')
    const request = makeEliminationRequest('retreat-confirm', 'S', false)
    const rng = new SeededRng('retreat-auto')
    expeditionTestInternals.runEliminationObjective(request, party, state, rng)
    const obj = state.objectiveState as EliminationObjectiveState
    expect(obj.confirmedTargetIds).toEqual(['e-0'])
    const log = state.logs.find((l) => l.type === 'eliminationConfirmation')
    expect(
      log?.facts.some((f) => f.includes('撃破した1体の討伐を自動確認した')),
    ).toBe(true)
    const confirmedEffect = log?.effects.find(
      (e) => e.type === 'eliminationConfirmed',
    )
    expect(confirmedEffect?.value).toBe(1)
  })

  it('records confirmation as not performed when retreating and confirmationRequired is true', () => {
    const state = setupRetreatState(true)
    const party = makeEliminationParty('retreat-confirm', 'S')
    const request = makeEliminationRequest('retreat-confirm', 'S', true)
    const rng = new SeededRng('retreat-not-done')
    expeditionTestInternals.runEliminationObjective(request, party, state, rng)
    const obj = state.objectiveState as EliminationObjectiveState
    const log = state.logs.find((l) => l.type === 'eliminationConfirmation')
    expect(
      log?.facts.some((f) =>
        f.includes('撤退または戦闘継続不能のため、討伐確認を実施できなかった'),
      ),
    ).toBe(true)
    expect(obj.confirmedTargetIds).toEqual([])
    const confirmedEffect = log?.effects.find(
      (e) => e.type === 'eliminationConfirmed',
    )
    expect(confirmedEffect?.value).toBe(0)
    const completedEffect = log?.effects.find(
      (e) => e.type === 'eliminationCompleted',
    )
    expect(completedEffect?.value).toBe(0)
    expect(log?.check).toBeUndefined()
  })

  it('does not describe a skipped confirmation as a failure', () => {
    const state = setupRetreatState(true)
    const party = makeEliminationParty('retreat-confirm', 'S')
    const request = makeEliminationRequest('retreat-confirm', 'S', true)
    const rng = new SeededRng('retreat-not-failure')
    expeditionTestInternals.runEliminationObjective(request, party, state, rng)
    const log = state.logs.find((l) => l.type === 'eliminationConfirmation')
    expect(
      log?.facts.some(
        (f) =>
          f.includes('討伐確認に失敗した') ||
          f.includes('討伐証明品を紛失・誤認した'),
      ),
    ).toBe(false)
  })

  it('reconstructs the same confirmed count from objectiveState and logs', () => {
    const state = setupRetreatState(true)
    const party = makeEliminationParty('retreat-confirm', 'S')
    const request = makeEliminationRequest('retreat-confirm', 'S', true)
    const rng = new SeededRng('retreat-reconstruct')
    expeditionTestInternals.runEliminationObjective(request, party, state, rng)
    const obj = state.objectiveState as EliminationObjectiveState
    const log = state.logs.find((l) => l.type === 'eliminationConfirmation')
    const confirmedEffect = log?.effects.find(
      (e) => e.type === 'eliminationConfirmed',
    )
    expect(confirmedEffect?.value).toBe(obj.confirmedTargetIds.length)
  })
})
