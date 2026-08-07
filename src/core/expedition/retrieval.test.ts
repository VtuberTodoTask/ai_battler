import { describe, expect, it } from 'vitest'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import { runExpedition } from './expedition.ts'
import { initializeExpeditionState } from './state.ts'
import { SeededRng } from '../rng/seededRng.ts'
import {
  makeEliminationRequest,
  makePairedParty,
  makeParty,
  makeRequest,
  makeRetrievalParty,
  makeRetrievalRequest,
} from './test-utils.ts'
import type {
  Adventurer,
  AdventurerRank,
  AdventurerRole,
  BattleResult,
  SkillSet,
} from '../models/types.ts'
import type {
  ExpeditionBattleRecord,
  ExpeditionBattleResolvedContext,
  ExpeditionExecutionContext,
  ExpeditionOutcome,
  ExpeditionRequest,
  RetrievalObjectiveState,
} from './types.ts'
import {
  applyRetrievalDamage,
  calculateRetrievalProgress,
  determineRetrievalOutcome,
  finalizeRetrievalObjectiveState,
  getRetrievalObjective,
  initializeRetrievalObjectiveState,
  prepareRetrievalExtraction,
  resolveRetrievalBattleExposure,
  retrievalFragilityModifier,
  runRetrievalAccess,
  runRetrievalObjective,
  runRetrievalSearch,
} from './objectives/retrieval.ts'

function retrievalState(
  result: ReturnType<typeof runExpedition>,
): RetrievalObjectiveState {
  const obj = result.state.objectiveState
  expect(obj?.type).toBe('retrieval')
  return obj as RetrievalObjectiveState
}

function makeMaxSkillParty(
  roles: Adventurer['role'][],
  seedBase: string,
  rank: AdventurerRank = 'C',
): Adventurer[] {
  return roles.map((role, i) => {
    const a = generateAdventurer({
      seed: `${seedBase}-${role}-${i}`,
      rank,
      role,
    })
    for (const k of Object.keys(a.skills) as (keyof SkillSet)[]) {
      a.skills[k] = 100
    }
    a.stats = {
      str: 100,
      con: 100,
      dex: 100,
      int: 100,
      per: 100,
      wil: 100,
      soc: 100,
    }
    a.maxHp = 1000
    a.currentHp = 1000
    a.maxMp = 1000
    a.currentMp = 1000
    a.morale = 100
    return a
  })
}

function makeRetrievalContext(
  request: ExpeditionRequest,
  party: Adventurer[],
): ExpeditionExecutionContext {
  const state = initializeExpeditionState(request, party)
  state.metadata = {
    difficulty: request.difficulty,
    requestFeatures: request.features,
    threatFeatures: request.features,
    ...state.metadata,
  }
  state.objectiveState = initializeRetrievalObjectiveState(request)
  return {
    request,
    party,
    state,
    rng: new SeededRng(request.seed),
  }
}

const DEFAULT_ROLES: Array<Adventurer['role']> = [
  'vanguard',
  'guardian',
  'mage',
  'healer',
]

describe('Retrieval request validation', () => {
  it('rejects retrieval without retrieval config', () => {
    const request = makeRequest('retrieval-no-config', {
      objectiveType: 'retrieval',
    })
    const party = makeRetrievalParty('retrieval-no-config', 'C')
    expect(() => runExpedition(request, party)).toThrow(
      'Retrieval request requires retrieval configuration',
    )
  })

  it('rejects empty target id or name', () => {
    const requestWithId = makeRetrievalRequest('empty-id', 'C', { id: '' })
    const party = makeRetrievalParty('empty-id', 'C')
    expect(() => runExpedition(requestWithId, party)).toThrow(
      'Retrieval target id must not be empty',
    )

    const requestWithName = makeRetrievalRequest('empty-name', 'C', {
      name: '',
    })
    const party2 = makeRetrievalParty('empty-name', 'C')
    expect(() => runExpedition(requestWithName, party2)).toThrow(
      'Retrieval target name must not be empty',
    )
  })

  it('rejects invalid integrity bounds', () => {
    const requestLow = makeRetrievalRequest('bad-init-low', 'C', {
      initialIntegrity: 0,
    })
    const party = makeRetrievalParty('bad-init-low', 'C')
    expect(() => runExpedition(requestLow, party)).toThrow('initialIntegrity')

    const requestHigh = makeRetrievalRequest('bad-init-high', 'C', {
      initialIntegrity: 101,
    })
    const party2 = makeRetrievalParty('bad-init-high', 'C')
    expect(() => runExpedition(requestHigh, party2)).toThrow('initialIntegrity')

    const requestMinHigh = makeRetrievalRequest('bad-min-high', 'C', {
      initialIntegrity: 50,
      minimumAcceptableIntegrity: 60,
    })
    const party3 = makeRetrievalParty('bad-min-high', 'C')
    expect(() => runExpedition(requestMinHigh, party3)).toThrow(
      'minimumAcceptableIntegrity must not exceed initialIntegrity',
    )
  })

  it('rejects negative difficulty', () => {
    const request = makeRetrievalRequest('bad-diff', 'C', {
      discoveryDifficulty: -1,
    })
    const party = makeRetrievalParty('bad-diff', 'C')
    expect(() => runExpedition(request, party)).toThrow(
      'difficulties must be finite non-negative',
    )
  })

  it('works without battle', () => {
    const request = makeRetrievalRequest('no-battle', 'C', undefined, false)
    const party = makeRetrievalParty('no-battle', 'C')
    expect(() => runExpedition(request, party)).not.toThrow()
  })

  it('does not require retrieval config for investigation or elimination', () => {
    const investigation = makeRequest('investigation-no-retrieval')
    const party = makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'investigation-no-retrieval',
    )
    expect(() => runExpedition(investigation, party)).not.toThrow()

    const elimination = makeEliminationRequest(
      'elimination-no-retrieval',
      'C',
      false,
    )
    const party2 = makeRetrievalParty('elimination-no-retrieval', 'C')
    expect(() => runExpedition(elimination, party2)).not.toThrow()
  })
})

describe('Retrieval state separation', () => {
  it('does not add retrieval target to partyHp/Mp/Morale/casualties/incapacitated', () => {
    const request = makeRetrievalRequest('separation', 'C')
    const party = makeRetrievalParty('separation', 'C')
    const result = runExpedition(request, party)
    const targetId = result.request.retrieval!.target.id
    expect(result.state.partyHp[targetId]).toBeUndefined()
    expect(result.state.partyMp[targetId]).toBeUndefined()
    expect(result.state.partyMorale[targetId]).toBeUndefined()
    expect(result.state.casualties).not.toContain(targetId)
    expect(result.state.incapacitated).not.toContain(targetId)
  })

  it('does not include retrieval target in battle final adventurer states', () => {
    const request = makeRetrievalRequest('battle-separation', 'C')
    const party = makeRetrievalParty('battle-separation', 'C')
    const result = runExpedition(request, party)
    if (result.state.battles.length > 0) {
      const record = result.state.battles[0]
      const targetId = result.request.retrieval!.target.id
      expect(
        record.result.finalAdventurerStates.some((m) => m.id === targetId),
      ).toBe(false)
    }
  })

  it('keeps retrieval state in objectiveState only', () => {
    const request = makeRetrievalRequest('objective-only', 'C')
    const party = makeRetrievalParty('objective-only', 'C')
    const state = initializeExpeditionState(request, party)
    expect(state.objectiveState).toBeUndefined()
    const result = runExpedition(request, party)
    expect(result.state.objectiveState?.type).toBe('retrieval')
  })

  it('produces deterministic results for the same retrieval seed', () => {
    const request = makeRetrievalRequest('deterministic', 'C')
    const partyA = makeRetrievalParty('deterministic', 'C')
    const partyB = makeRetrievalParty('deterministic', 'C')
    const resultA = runExpedition(request, partyA)
    const resultB = runExpedition(request, partyB)
    expect(resultA.outcome).toBe(resultB.outcome)
    expect(resultA.state.objectiveState).toEqual(resultB.state.objectiveState)
    expect(resultA.state.logs).toEqual(resultB.state.logs)
  })
})

describe('Retrieval fragility modifier', () => {
  it('returns the specified modifiers', () => {
    expect(retrievalFragilityModifier('rugged')).toBe(-5)
    expect(retrievalFragilityModifier('standard')).toBe(0)
    expect(retrievalFragilityModifier('fragile')).toBe(10)
  })
})

describe('Retrieval search and access', () => {
  it('logs retrievalTargetAssigned exactly once before approach', () => {
    const request = makeRetrievalRequest('assigned', 'C', undefined, false)
    const party = makeRetrievalParty('assigned', 'C')
    const result = runExpedition(request, party)
    const assigned = result.state.logs.filter(
      (l) => l.type === 'retrievalTargetAssigned',
    )
    expect(assigned).toHaveLength(1)
    const assignedIndex = result.state.logs.findIndex(
      (l) => l.type === 'retrievalTargetAssigned',
    )
    const firstTravelIndex = result.state.logs.findIndex(
      (l) => l.type === 'travel',
    )
    expect(assignedIndex).toBeLessThan(firstTravelIndex)

    const effect = assigned[0].effects.find(
      (e) => e.type === 'retrievalTargetAssigned',
    )
    expect(effect).toBeDefined()
    expect(effect?.targetId).toBe(request.retrieval!.target.id)
    expect(effect?.metadata).toMatchObject({
      targetId: request.retrieval!.target.id,
      targetName: request.retrieval!.target.name,
      bulk: request.retrieval!.target.bulk,
      handling: request.retrieval!.target.handling,
      fragility: request.retrieval!.target.fragility,
      initialIntegrity: request.retrieval!.target.initialIntegrity,
      minimumAcceptableIntegrity:
        request.retrieval!.target.minimumAcceptableIntegrity,
    })
    expect(assigned[0].targetIds).toEqual([request.retrieval!.target.id])
  })

  it('uses known location when locationKnown is true', () => {
    const request = makeRetrievalRequest(
      'known',
      'C',
      { locationKnown: true },
      false,
    )
    const party = makeRetrievalParty('known', 'C')
    const result = runExpedition(request, party)
    const state = retrievalState(result)
    expect(state.located).toBe(true)
    const locatedLogs = result.state.logs.filter(
      (l) => l.type === 'retrievalTargetLocated',
    )
    expect(locatedLogs.length).toBeGreaterThanOrEqual(1)
  })

  it('runs initial search when locationKnown is false', () => {
    const request = makeRetrievalRequest(
      'search',
      'C',
      { locationKnown: false },
      false,
    )
    const party = makeRetrievalParty('search', 'C')
    const result = runExpedition(request, party)
    const searchLogs = result.state.logs.filter(
      (l) => l.type === 'retrievalSearch',
    )
    expect(searchLogs.length).toBeGreaterThanOrEqual(1)
    expect(searchLogs[0].check?.skill).toBe('scouting')
  })

  it('uses survival/ranger for forest access', () => {
    const request = makeRetrievalRequest(
      'forest-access',
      'C',
      { locationKnown: true },
      false,
    )
    const party = makeRetrievalParty('forest-access', 'C')
    const result = runExpedition(request, party)
    const accessLogs = result.state.logs.filter(
      (l) => l.type === 'retrievalAccess',
    )
    expect(accessLogs.length).toBeGreaterThanOrEqual(1)
    expect(accessLogs[0].check?.skill).toBe('survival')
  })

  it('uses scouting/scout for cave access', () => {
    const request = makeRetrievalRequest(
      'cave-access',
      'C',
      { locationKnown: true },
      false,
      { environment: 'cave' },
    )
    const party = makeRetrievalParty('cave-access', 'C')
    const result = runExpedition(request, party)
    const accessLogs = result.state.logs.filter(
      (l) => l.type === 'retrievalAccess',
    )
    expect(accessLogs.length).toBeGreaterThanOrEqual(1)
    expect(accessLogs[0].check?.skill).toBe('scouting')
  })

  it('uses defenseMagic/mage for magical access', () => {
    const request = makeRetrievalRequest(
      'magical-access',
      'C',
      { locationKnown: true },
      false,
      { environment: 'magical' },
    )
    const party = makeRetrievalParty('magical-access', 'C')
    const result = runExpedition(request, party)
    const accessLogs = result.state.logs.filter(
      (l) => l.type === 'retrievalAccess',
    )
    expect(accessLogs.length).toBeGreaterThanOrEqual(1)
    expect(accessLogs[0].check?.skill).toBe('defenseMagic')
  })

  it('applies search bonus to effective value', () => {
    const request = makeRetrievalRequest('search-bonus', 'C', undefined, false)
    const party = makeRetrievalParty('search-bonus', 'C')
    const context = makeRetrievalContext(request, party)
    runRetrievalSearch(context, 'final-search', 0)
    const valueNoBonus =
      context.state.logs.find((l) => l.type === 'retrievalSearch')?.check
        ?.effectiveValue ?? 0

    const request2 = makeRetrievalRequest(
      'search-bonus2',
      'C',
      undefined,
      false,
    )
    const party2 = makeRetrievalParty('search-bonus2', 'C')
    const context2 = makeRetrievalContext(request2, party2)
    runRetrievalSearch(context2, 'final-search', 10)
    const valueWithBonus =
      context2.state.logs.find((l) => l.type === 'retrievalSearch')?.check
        ?.effectiveValue ?? 0

    expect(valueWithBonus - valueNoBonus).toBeGreaterThanOrEqual(10)
  })

  it('reaches target with max skill party and zero access difficulty', () => {
    const request = makeRetrievalRequest(
      'easy-access',
      'C',
      { locationKnown: true, accessDifficulty: 0 },
      false,
      { features: [], difficulty: 'easy' },
    )
    const party = makeMaxSkillParty(DEFAULT_ROLES, 'easy-access')
    const result = runExpedition(request, party)
    const state = retrievalState(result)
    expect(state.located).toBe(true)
    expect(state.reached).toBe(true)
  })
})

describe('Retrieval final search and reaccess', () => {
  it('runs final search after battle when initial search failed', () => {
    const request = makeRetrievalRequest(
      'final-search',
      'C',
      { locationKnown: false, discoveryDifficulty: 100 },
      false,
      { features: [], difficulty: 'easy' },
    )
    const party = makeMaxSkillParty(DEFAULT_ROLES, 'final-search')
    const result = runExpedition(request, party)
    const searchLogs = result.state.logs.filter(
      (l) => l.type === 'retrievalSearch',
    )
    expect(searchLogs.length).toBeGreaterThanOrEqual(1)
  })

  it('applies battle victory bonus to final search', () => {
    const request = makeRetrievalRequest(
      'final-search-bonus',
      'C',
      undefined,
      false,
    )
    const party = makeMaxSkillParty(DEFAULT_ROLES, 'final-search-bonus')
    const context = makeRetrievalContext(request, party)
    context.state.battleOutcome = 'victory'
    runRetrievalObjective(context)
    const searchLogs = context.state.logs.filter(
      (l) => l.type === 'retrievalSearch',
    )
    expect(searchLogs.length).toBeGreaterThanOrEqual(1)
  })

  it('applies search access bonus and battle bonus to reaccess', () => {
    const request = makeRetrievalRequest(
      'reaccess-bonus',
      'C',
      { locationKnown: true },
      false,
    )
    const party = makeMaxSkillParty(DEFAULT_ROLES, 'reaccess-bonus')
    const context = makeRetrievalContext(request, party)
    context.state.metadata = { retrievalSearchAccessBonus: 10 }
    context.state.battleOutcome = 'victory'
    runRetrievalAccess(context, 'reaccess', 15)
    const accessLogs = context.state.logs.filter(
      (l) => l.type === 'retrievalAccess',
    )
    expect(accessLogs.length).toBeGreaterThanOrEqual(1)
  })
})

describe('Retrieval protector and battle exposure', () => {
  it('assigns protector when battle is enabled and target reached', () => {
    const request = makeRetrievalRequest(
      'protector-enabled',
      'C',
      { locationKnown: true, accessDifficulty: 0 },
      true,
      { features: [], difficulty: 'easy' },
    )
    const party = makeMaxSkillParty(DEFAULT_ROLES, 'protector-enabled')
    const result = runExpedition(request, party)
    const state = retrievalState(result)
    const protectorLogs = result.state.logs.filter(
      (l) => l.type === 'retrievalProtectorAssigned',
    )
    if (state.reached) {
      expect(protectorLogs.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('does not assign protector when battle is disabled', () => {
    const request = makeRetrievalRequest(
      'protector-disabled',
      'C',
      { locationKnown: true },
      false,
    )
    const party = makeRetrievalParty('protector-disabled', 'C')
    const result = runExpedition(request, party)
    const protectorLogs = result.state.logs.filter(
      (l) => l.type === 'retrievalProtectorAssigned',
    )
    const exposureLogs = result.state.logs.filter(
      (l) => l.type === 'retrievalBattleExposure',
    )
    expect(protectorLogs).toHaveLength(0)
    expect(exposureLogs).toHaveLength(0)
  })

  it('does not run battle exposure when target not reached', () => {
    const request = makeRetrievalRequest(
      'no-reach-no-exposure',
      'C',
      { locationKnown: true },
      true,
    )
    const party = makeRetrievalParty('no-reach-no-exposure', 'C')
    const context = makeRetrievalContext(request, party)
    const objective = getRetrievalObjective(context.state)
    objective.reached = false
    const resolvedContext: ExpeditionBattleResolvedContext = {
      ...context,
      battleId: 'b1',
      battleResult: {
        outcome: 'victory',
        rounds: 3,
      } as BattleResult,
      battleRecord: { id: 'b1' } as unknown as ExpeditionBattleRecord,
      initialEnemyIds: [],
    }
    resolveRetrievalBattleExposure(resolvedContext)
    const exposureLogs = context.state.logs.filter(
      (l) => l.type === 'retrievalBattleExposure',
    )
    expect(exposureLogs).toHaveLength(0)
  })

  it('actual damage is bounded by current integrity', () => {
    const request = makeRetrievalRequest('bounded-damage', 'C', {
      initialIntegrity: 5,
      minimumAcceptableIntegrity: 1,
    })
    const party = makeRetrievalParty('bounded-damage', 'C')
    const context = makeRetrievalContext(request, party)
    const objective = getRetrievalObjective(context.state)
    const actual = applyRetrievalDamage(
      context.state,
      objective,
      100,
      'test',
      'objective',
      'securing',
    )
    expect(actual).toBe(5)
    expect(objective.currentIntegrity).toBe(0)
    expect(objective.securingDamage).toBe(5)
  })
})

describe('Retrieval securing', () => {
  it('secures target with max skill party and zero securing difficulty', () => {
    const request = makeRetrievalRequest(
      'easy-securing',
      'C',
      {
        locationKnown: true,
        accessDifficulty: 0,
        securingDifficulty: 0,
      },
      false,
      { features: [], difficulty: 'easy' },
    )
    const party = makeMaxSkillParty(DEFAULT_ROLES, 'easy-securing')
    const result = runExpedition(request, party)
    const state = retrievalState(result)
    expect(state.secured).toBe(true)
  })

  it('consumes tools on success/partial/critical securing', () => {
    const request = makeRetrievalRequest(
      'tools-securing',
      'C',
      {
        locationKnown: true,
        accessDifficulty: 0,
        securingDifficulty: 0,
      },
      false,
      { features: [], difficulty: 'easy' },
    )
    const party = makeMaxSkillParty(DEFAULT_ROLES, 'tools-securing')
    const result = runExpedition(request, party)
    const state = retrievalState(result)
    expect(state.secured).toBe(true)
    expect(result.state.supplies.tools).toBeLessThan(4)
  })

  it('handles standard, delicate and arcane securing', () => {
    for (const handling of ['standard', 'delicate', 'arcane'] as const) {
      const request = makeRetrievalRequest(
        `securing-${handling}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 0,
          handling,
        },
        false,
        { features: [], difficulty: 'easy' },
      )
      const party = makeMaxSkillParty(DEFAULT_ROLES, `securing-${handling}`)
      const result = runExpedition(request, party)
      const state = retrievalState(result)
      expect(state.secured).toBe(true)
    }
  })
})

describe('Retrieval carrier and extraction', () => {
  it('requires the correct number of carriers by bulk', () => {
    for (const bulk of ['portable', 'bulky', 'heavy'] as const) {
      const request = makeRetrievalRequest(
        `bulk-${bulk}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 0,
          bulk,
        },
        false,
        { features: [], difficulty: 'easy' },
      )
      const party = makeMaxSkillParty(
        bulk === 'heavy'
          ? ['vanguard', 'guardian', 'support', 'ranger']
          : DEFAULT_ROLES,
        `bulk-${bulk}`,
      )
      const result = runExpedition(request, party)
      const state = retrievalState(result)
      expect(state.extracted).toBe(true)
      const expected = bulk === 'portable' ? 1 : bulk === 'bulky' ? 2 : 3
      expect(state.carrierIds.length).toBe(expected)
    }
  })

  it('logs retrievalCarriersAssigned with carrierIds metadata', () => {
    const request = makeRetrievalRequest(
      'carrier-log',
      'C',
      {
        locationKnown: true,
        accessDifficulty: 0,
        securingDifficulty: 0,
        extractionDifficulty: 0,
        bulk: 'bulky',
      },
      false,
      { features: [], difficulty: 'easy' },
    )
    const party = makeMaxSkillParty(DEFAULT_ROLES, 'carrier-log')
    const result = runExpedition(request, party)
    const logs = result.state.logs.filter(
      (l) => l.type === 'retrievalCarriersAssigned',
    )
    expect(logs.length).toBeGreaterThanOrEqual(1)
    const effect = logs[0].effects.find(
      (e) => e.type === 'retrievalCarrierCount',
    )
    expect(effect).toBeDefined()
    expect(effect?.metadata).toMatchObject({
      carrierIds: expect.any(Array),
      requiredCarrierCount: 2,
    })
    expect(effect?.targetId).toBe(request.retrieval!.target.id)
    expect(logs[0].targetIds).toEqual([request.retrieval!.target.id])
  })

  it('fails extraction when active party is smaller than required carriers', () => {
    const request = makeRetrievalRequest(
      'insufficient-carriers',
      'C',
      {
        locationKnown: true,
        accessDifficulty: 0,
        securingDifficulty: 0,
        bulk: 'heavy',
      },
      false,
      { features: [], difficulty: 'easy' },
    )
    const party = makeMaxSkillParty(
      ['vanguard', 'guardian'],
      'insufficient-carriers',
    )
    const result = runExpedition(request, party)
    const state = retrievalState(result)
    expect(state.secured).toBe(true)
    expect(state.extracted).toBe(false)
  })

  it('extracted=false when extraction damage destroys the target', () => {
    let found = false
    for (let i = 0; i < 200; i++) {
      const request = makeRetrievalRequest(
        `destroy-extract-${i}`,
        'E',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 0,
          initialIntegrity: 4,
          minimumAcceptableIntegrity: 1,
          bulk: 'portable',
          extractionDifficulty: 0,
        },
        false,
      )
      const party = makeParty(
        ['vanguard', 'guardian', 'mage', 'healer'],
        `destroy-extract-${i}`,
        'E',
      )
      const context = makeRetrievalContext(request, party)
      const objective = getRetrievalObjective(context.state)
      objective.located = true
      objective.reached = true
      objective.secured = true
      prepareRetrievalExtraction(context)
      if (objective.currentIntegrity === 0 && !objective.extracted) {
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })
})

describe('Retrieval return and outcome', () => {
  it('returns extracted target when active adventurers remain', () => {
    const request = makeRetrievalRequest(
      'return-success',
      'C',
      {
        locationKnown: true,
        accessDifficulty: 0,
        securingDifficulty: 0,
        extractionDifficulty: 0,
      },
      false,
      { features: [], difficulty: 'easy' },
    )
    const party = makeMaxSkillParty(DEFAULT_ROLES, 'return-success')
    const result = runExpedition(request, party)
    const state = retrievalState(result)
    expect(state.extracted).toBe(true)
    expect(state.returned).toBe(true)
  })

  it('marks target abandoned when secured but not extracted', () => {
    const request = makeRetrievalRequest(
      'abandoned',
      'C',
      {
        locationKnown: true,
        accessDifficulty: 0,
        securingDifficulty: 0,
        extractionDifficulty: 1000,
      },
      false,
      { features: [], difficulty: 'easy' },
    )
    const party = makeMaxSkillParty(DEFAULT_ROLES, 'abandoned')
    const result = runExpedition(request, party)
    const state = retrievalState(result)
    if (state.secured && !state.extracted && state.currentIntegrity > 0) {
      expect(state.abandoned).toBe(true)
    }
  })

  it('outcome priority from determineRetrievalOutcome', () => {
    function makeOutcomeContext(stateOverrides: {
      casualties: string[]
      currentIntegrity: number
      returned: boolean
      battleOutcome?: ReturnType<typeof runExpedition>['state']['battleOutcome']
    }): ExpeditionOutcome {
      const request = makeRetrievalRequest(
        'priority',
        'C',
        {
          locationKnown: true,
          initialIntegrity: 100,
          minimumAcceptableIntegrity: 60,
        },
        false,
      )
      const party = makeMaxSkillParty(DEFAULT_ROLES, 'priority')
      const context = makeRetrievalContext(request, party)
      const state = context.state
      const objective = getRetrievalObjective(state)
      state.casualties = stateOverrides.casualties
      objective.currentIntegrity = stateOverrides.currentIntegrity
      objective.returned = stateOverrides.returned
      state.battleOutcome = stateOverrides.battleOutcome
      finalizeRetrievalObjectiveState(context)
      return determineRetrievalOutcome(context)
    }

    expect(
      makeOutcomeContext({
        casualties: ['a', 'b', 'c', 'd'],
        currentIntegrity: 100,
        returned: true,
      }),
    ).toBe('lostExpedition')

    expect(
      makeOutcomeContext({
        casualties: [],
        currentIntegrity: 0,
        returned: false,
      }),
    ).toBe('failedObjective')

    expect(
      makeOutcomeContext({
        casualties: [],
        currentIntegrity: 100,
        returned: true,
      }),
    ).toBe('completeSuccess')

    expect(
      makeOutcomeContext({
        casualties: [],
        currentIntegrity: 70,
        returned: true,
        battleOutcome: 'retreat',
      }),
    ).toBe('success')

    expect(
      makeOutcomeContext({
        casualties: [],
        currentIntegrity: 70,
        returned: false,
        battleOutcome: 'retreat',
      }),
    ).toBe('forcedRetreat')

    expect(
      makeOutcomeContext({
        casualties: [],
        currentIntegrity: 70,
        returned: false,
        battleOutcome: 'victory',
      }),
    ).toBe('failedObjective')
  })
})

describe('Retrieval damage accounting and structured logs', () => {
  it('maintains integrity accounting invariant', () => {
    const request = makeRetrievalRequest('accounting', 'C')
    const party = makeRetrievalParty('accounting', 'C')
    const result = runExpedition(request, party)
    const state = retrievalState(result)
    const expected =
      state.initialIntegrity -
      state.battleExposureDamage -
      state.securingDamage -
      state.extractionDamage
    expect(state.currentIntegrity).toBe(expected)
  })

  it('logs exactly one retrievalTargetDestroyed when target is destroyed', () => {
    const request = makeRetrievalRequest('destroy-once', 'C', {
      initialIntegrity: 10,
      minimumAcceptableIntegrity: 1,
    })
    const party = makeRetrievalParty('destroy-once', 'C')
    const context = makeRetrievalContext(request, party)
    const objective = getRetrievalObjective(context.state)
    applyRetrievalDamage(
      context.state,
      objective,
      10,
      'test destruction',
      'objective',
      'securing',
    )
    const destructionLogs = context.state.logs.filter(
      (l) => l.type === 'retrievalTargetDestroyed',
    )
    expect(destructionLogs).toHaveLength(1)
    expect(destructionLogs[0].targetIds).toEqual([request.retrieval!.target.id])
  })

  it('logs no retrievalTargetDestroyed when target is not destroyed', () => {
    const request = makeRetrievalRequest('no-destroy', 'C', {
      initialIntegrity: 100,
      minimumAcceptableIntegrity: 1,
    })
    const party = makeRetrievalParty('no-destroy', 'C')
    const context = makeRetrievalContext(request, party)
    const destructionLogs = context.state.logs.filter(
      (l) => l.type === 'retrievalTargetDestroyed',
    )
    expect(destructionLogs).toHaveLength(0)
  })

  it('keeps retrievalTargetDestroyed at one when further damage is applied', () => {
    const request = makeRetrievalRequest('destroy-once-further', 'C', {
      initialIntegrity: 5,
      minimumAcceptableIntegrity: 1,
    })
    const party = makeRetrievalParty('destroy-once-further', 'C')
    const context = makeRetrievalContext(request, party)
    const objective = getRetrievalObjective(context.state)
    applyRetrievalDamage(
      context.state,
      objective,
      10,
      'test',
      'objective',
      'securing',
    )
    applyRetrievalDamage(
      context.state,
      objective,
      10,
      'test',
      'objective',
      'securing',
    )
    const destructionLogs = context.state.logs.filter(
      (l) => l.type === 'retrievalTargetDestroyed',
    )
    expect(destructionLogs).toHaveLength(1)
    expect(objective.currentIntegrity).toBe(0)
  })

  it('uses actual damage bounded by current integrity', () => {
    const request = makeRetrievalRequest('actual-damage', 'C', {
      initialIntegrity: 3,
      minimumAcceptableIntegrity: 1,
    })
    const party = makeRetrievalParty('actual-damage', 'C')
    const context = makeRetrievalContext(request, party)
    const objective = getRetrievalObjective(context.state)
    const actual = applyRetrievalDamage(
      context.state,
      objective,
      10,
      'test',
      'objective',
      'securing',
    )
    expect(actual).toBe(3)
    expect(objective.securingDamage).toBe(3)
    expect(objective.currentIntegrity).toBe(0)
  })

  it('reconstructs full state from structured logs', () => {
    const request = makeRetrievalRequest('reconstruct', 'C')
    const party = makeRetrievalParty('reconstruct', 'C')
    const result = runExpedition(request, party)
    const state = retrievalState(result)
    const logs = result.state.logs

    const assignedLog = logs.find((l) => l.type === 'retrievalTargetAssigned')!
    const assignedEffect = assignedLog.effects.find(
      (e) => e.type === 'retrievalTargetAssigned',
    )!

    const getLast = (type: string): number | undefined =>
      getLastEffectValue(logs, type)

    const getMetadata = (
      logType: string,
      effectType: string,
    ): Record<string, unknown> | undefined => {
      const log = logs.find((l) => l.type === logType)
      return log?.effects.find((e) => e.type === effectType)?.metadata
    }

    const protectorMeta = getMetadata(
      'retrievalProtectorAssigned',
      'retrievalProtector',
    ) as { protectorId?: string } | undefined
    const carrierMeta = getMetadata(
      'retrievalCarriersAssigned',
      'retrievalCarrierCount',
    ) as { carrierIds?: string[] } | undefined

    const finalIntegrity = getLast('retrievalIntegrity') ?? 0
    const reconstructed = {
      targetId: assignedEffect.targetId,
      targetName: assignedEffect.metadata?.targetName,
      initialIntegrity: assignedEffect.metadata?.initialIntegrity,
      finalIntegrity,
      minimumAcceptableIntegrity:
        assignedEffect.metadata?.minimumAcceptableIntegrity,
      bulk: assignedEffect.metadata?.bulk,
      handling: assignedEffect.metadata?.handling,
      fragility: assignedEffect.metadata?.fragility,
      located: Boolean(getLast('retrievalLocated')),
      reached: Boolean(getLast('retrievalReached')),
      secured: Boolean(getLast('retrievalSecured')),
      protectedForTransport: Boolean(getLast('retrievalProtectedForTransport')),
      protectorId: protectorMeta?.protectorId,
      carrierIds: carrierMeta?.carrierIds ?? [],
      battleExposureDamage: getLast('retrievalBattleExposureDamage') ?? 0,
      securingDamage: getLast('retrievalSecuringDamage') ?? 0,
      extractionDamage: getLast('retrievalExtractionDamage') ?? 0,
      extracted: Boolean(getLast('retrievalExtracted')),
      returned: Boolean(getLast('retrievalReturned')),
      abandoned: Boolean(getLast('retrievalAbandoned')),
      lostDuringReturn: Boolean(getLast('retrievalLostDuringReturn')),
      progress: getLast('retrievalProgress') ?? 0,
      completed:
        Boolean(getLast('retrievalReturned')) &&
        !getLast('retrievalDestroyed') &&
        finalIntegrity >=
          (assignedEffect.metadata?.minimumAcceptableIntegrity as number),
    }

    expect(reconstructed).toEqual({
      targetId: state.targetId,
      targetName: state.targetName,
      initialIntegrity: state.initialIntegrity,
      finalIntegrity: state.currentIntegrity,
      minimumAcceptableIntegrity: state.minimumAcceptableIntegrity,
      bulk: state.bulk,
      handling: state.handling,
      fragility: state.fragility,
      located: state.located,
      reached: state.reached,
      secured: state.secured,
      protectedForTransport: state.protectedForTransport,
      protectorId: state.protectorId,
      carrierIds: state.carrierIds,
      battleExposureDamage: state.battleExposureDamage,
      securingDamage: state.securingDamage,
      extractionDamage: state.extractionDamage,
      extracted: state.extracted,
      returned: state.returned,
      abandoned: state.abandoned,
      lostDuringReturn: state.lostDuringReturn,
      progress: state.progress,
      completed: state.completed,
    })
  })

  it('calculates progress from milestones', () => {
    const objective: RetrievalObjectiveState = {
      type: 'retrieval',
      targetId: 't',
      targetName: 'T',
      initialIntegrity: 100,
      minimumAcceptableIntegrity: 80,
      currentIntegrity: 100,
      bulk: 'portable',
      handling: 'standard',
      fragility: 'standard',
      located: true,
      reached: true,
      secured: true,
      protectedForTransport: true,
      extracted: true,
      returned: true,
      abandoned: false,
      lostDuringReturn: false,
      carrierIds: [],
      battleExposureDamage: 0,
      securingDamage: 0,
      extractionDamage: 0,
      progress: 0,
      completed: false,
    }
    expect(calculateRetrievalProgress(objective)).toBe(100)
  })
})

describe('Healer negative control', () => {
  function makeControlledParty(
    targetRole: AdventurerRole,
    seedBase: string,
  ): Adventurer[] {
    const roles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'ranger',
      targetRole,
    ]
    const party = makePairedParty(roles, seedBase, 'C')
    const maxStats = {
      str: 100,
      con: 100,
      dex: 100,
      int: 100,
      per: 100,
      wil: 100,
      soc: 100,
    }
    const maxSkills: SkillSet = {
      melee: 100,
      ranged: 100,
      defense: 100,
      tactics: 100,
      attackMagic: 100,
      defenseMagic: 100,
      healing: 100,
      scouting: 100,
      stealth: 100,
      trapDetection: 100,
      trapDisarm: 100,
      survival: 100,
      monsterKnowledge: 100,
      firstAid: 100,
      leadership: 100,
    }
    for (const a of party) {
      a.stats = { ...maxStats }
      a.skills = { ...maxSkills }
      a.maxHp = 1000
      a.currentHp = 1000
      a.maxMp = 1000
      a.currentMp = 1000
      a.morale = 100
    }
    return party
  }

  it('Healer has no retrieval-specific bonus in search/access/securing/extraction', () => {
    const contexts = [
      {
        environment: 'forest' as const,
        handling: 'standard' as const,
        bulk: 'heavy' as const,
      },
      {
        environment: 'cave' as const,
        handling: 'delicate' as const,
        bulk: 'portable' as const,
      },
      {
        environment: 'magical' as const,
        handling: 'arcane' as const,
        bulk: 'bulky' as const,
      },
    ] as const
    for (const ctx of contexts) {
      const seedBase = `healer-control-${ctx.environment}-${ctx.handling}`
      const request = makeRetrievalRequest(
        seedBase,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 20,
          securingDifficulty: 20,
          extractionDifficulty: 20,
          handling: ctx.handling,
          bulk: ctx.bulk,
        },
        false,
        {
          environment: ctx.environment,
          features: [],
          difficulty: 'easy',
        },
      )
      const healerResult = runExpedition(
        request,
        makeControlledParty('healer', seedBase),
      )
      const vanguardResult = runExpedition(
        request,
        makeControlledParty('vanguard', seedBase),
      )
      expect(healerResult.outcome).toBe(vanguardResult.outcome)
      const healerState = retrievalState(healerResult)
      const vanguardState = retrievalState(vanguardResult)
      expect(healerState.located).toBe(vanguardState.located)
      expect(healerState.reached).toBe(vanguardState.reached)
      expect(healerState.secured).toBe(vanguardState.secured)
      expect(healerState.extracted).toBe(vanguardState.extracted)
      expect(healerState.currentIntegrity).toBe(vanguardState.currentIntegrity)
    }
  })

  it('Healer has no retrieval-specific bonus in battle protection', () => {
    const seedBase = 'healer-battle-protection'
    const request = makeRetrievalRequest(
      seedBase,
      'C',
      {
        locationKnown: true,
        accessDifficulty: 0,
        securingDifficulty: 0,
        protectionDifficulty: 15,
      },
      false,
      { features: [], difficulty: 'easy' },
    )
    const healerContext = makeRetrievalContext(
      request,
      makeControlledParty('healer', seedBase),
    )
    const vanguardContext = makeRetrievalContext(
      request,
      makeControlledParty('vanguard', seedBase),
    )
    const healerObj = getRetrievalObjective(healerContext.state)
    const vanguardObj = getRetrievalObjective(vanguardContext.state)
    healerObj.located = true
    healerObj.reached = true
    vanguardObj.located = true
    vanguardObj.reached = true
    const battleResult = {
      outcome: 'costlyVictory',
      rounds: 8,
    } as BattleResult
    resolveRetrievalBattleExposure({
      ...healerContext,
      battleId: 'b1',
      battleResult,
      battleRecord: { id: 'b1' } as unknown as ExpeditionBattleRecord,
      initialEnemyIds: [],
    })
    resolveRetrievalBattleExposure({
      ...vanguardContext,
      battleId: 'b1',
      battleResult,
      battleRecord: { id: 'b1' } as unknown as ExpeditionBattleRecord,
      initialEnemyIds: [],
    })
    expect(healerObj.battleExposureDamage).toBe(
      vanguardObj.battleExposureDamage,
    )
  })
})

function getLastEffectValue(
  logs: ReturnType<typeof runExpedition>['state']['logs'],
  type: string,
): number | undefined {
  let last: number | undefined
  for (const log of logs) {
    for (const effect of log.effects) {
      if (effect.type === type) last = effect.value
    }
  }
  return last
}
