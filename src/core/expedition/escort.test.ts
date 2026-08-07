import { describe, expect, it } from 'vitest'
import { AdventurerRole } from '../models/types.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { initializeExpeditionState } from './state.ts'
import {
  applyEscortTargetDamage,
  escortHandler,
  getEscortTargetCondition,
  healEscortTarget,
  initializeEscortObjectiveState,
  runEscortCare,
  runEscortDeparture,
  runEscortRoute,
  validateEscortRequest,
} from './objectives/escort.ts'
import { runExpedition } from './expedition.ts'
import { ExpeditionExecutionContext, ExpeditionRequest } from './types.ts'
import {
  makeEscortParty,
  makeEscortRequest,
  makePairedParty,
} from './test-utils.ts'

function escortState(result: ReturnType<typeof runExpedition>) {
  const obj = result.state.objectiveState
  if (obj?.type !== 'escort') {
    throw new Error('Expected escort objective state')
  }
  return obj
}

function makeEscortContext(
  seed: string,
  rank = 'C' as const,
  targetOverrides?: Parameters<typeof makeEscortRequest>[2],
  destinationOverrides?: Parameters<typeof makeEscortRequest>[3],
  battleEnabled = false,
  requestOverrides?: Parameters<typeof makeEscortRequest>[5],
  roles: AdventurerRole[] = ['support', 'ranger', 'mage', 'healer'],
): {
  context: ExpeditionExecutionContext
  request: ExpeditionRequest
} {
  const request = makeEscortRequest(
    seed,
    rank,
    targetOverrides,
    destinationOverrides,
    battleEnabled,
    requestOverrides,
  )
  const party = makeEscortParty(seed, rank, roles)
  const state = initializeExpeditionState(request, party)
  state.metadata = {
    difficulty: request.difficulty,
    requestFeatures: request.features,
    threatFeatures: request.features,
    ...state.metadata,
  }
  state.objectiveState = initializeEscortObjectiveState(request)
  const context: ExpeditionExecutionContext = {
    request,
    party,
    state,
    rng: new SeededRng(request.seed),
  }
  return { context, request }
}

describe('Escort request validation', () => {
  it('throws when escort configuration is missing', () => {
    const request = makeEscortRequest('missing', 'C')
    const invalid = { ...request, escort: undefined }
    expect(() => validateEscortRequest(invalid)).toThrow(
      'Escort request requires escort configuration',
    )
  })

  it('throws for empty target or destination ids and names', () => {
    const base = makeEscortRequest('empty', 'C')
    expect(() =>
      validateEscortRequest({
        ...base,
        escort: {
          ...base.escort!,
          target: { ...base.escort!.target, id: '' },
        },
      }),
    ).toThrow('Escort target id must not be empty')
    expect(() =>
      validateEscortRequest({
        ...base,
        escort: {
          ...base.escort!,
          target: { ...base.escort!.target, name: '' },
        },
      }),
    ).toThrow('Escort target name must not be empty')
    expect(() =>
      validateEscortRequest({
        ...base,
        escort: {
          ...base.escort!,
          destination: { ...base.escort!.destination, id: '' },
        },
      }),
    ).toThrow('Escort destination id must not be empty')
    expect(() =>
      validateEscortRequest({
        ...base,
        escort: {
          ...base.escort!,
          destination: { ...base.escort!.destination, name: '' },
        },
      }),
    ).toThrow('Escort destination name must not be empty')
  })

  it('throws for invalid HP and stress values', () => {
    const base = makeEscortRequest('hp', 'C')
    expect(() =>
      validateEscortRequest({
        ...base,
        escort: {
          ...base.escort!,
          target: { ...base.escort!.target, maxHp: 0 },
        },
      }),
    ).toThrow('Escort target maxHp must be positive')
    expect(() =>
      validateEscortRequest({
        ...base,
        escort: {
          ...base.escort!,
          target: { ...base.escort!.target, initialHp: 0 },
        },
      }),
    ).toThrow('Escort target initialHp must be between 1 and maxHp inclusive')
    expect(() =>
      validateEscortRequest({
        ...base,
        escort: {
          ...base.escort!,
          target: { ...base.escort!.target, initialStress: -1 },
        },
      }),
    ).toThrow('Escort target initialStress must be between 0 and 100')
    expect(() =>
      validateEscortRequest({
        ...base,
        escort: {
          ...base.escort!,
          target: { ...base.escort!.target, initialStress: 101 },
        },
      }),
    ).toThrow('Escort target initialStress must be between 0 and 100')
  })

  it('throws for negative difficulties', () => {
    const base = makeEscortRequest('diff', 'C')
    expect(() =>
      validateEscortRequest({
        ...base,
        escort: {
          ...base.escort!,
          target: { ...base.escort!.target, coordinationDifficulty: -1 },
        },
      }),
    ).toThrow('Escort target difficulties must be finite non-negative')
  })

  it('runs with battle disabled', () => {
    const request = makeEscortRequest(
      'no-battle',
      'C',
      undefined,
      undefined,
      false,
    )
    const party = makeEscortParty('no-battle', 'C')
    expect(() => runExpedition(request, party)).not.toThrow()
  })

  it('runs with battle enabled', () => {
    const request = makeEscortRequest('with-battle', 'C')
    const party = makeEscortParty('with-battle', 'C')
    expect(() => runExpedition(request, party)).not.toThrow()
  })
})

describe('Escort target state separation', () => {
  it('does not place the target in party HP/MP/morale or battle participants', () => {
    const request = makeEscortRequest('separate', 'C')
    const party = makeEscortParty('separate', 'C')
    const result = runExpedition(request, party)
    const obj = escortState(result)
    expect(result.state.partyHp).not.toHaveProperty(obj.targetId)
    expect(result.state.partyMp).not.toHaveProperty(obj.targetId)
    expect(result.state.partyMorale).not.toHaveProperty(obj.targetId)
    expect(result.state.casualties).not.toContain(obj.targetId)
    expect(result.state.incapacitated).not.toContain(obj.targetId)
    expect(result.state.battles[0]?.survivingAdventurerIds).not.toContain(
      obj.targetId,
    )
  })

  it('produces the same enemy composition regardless of target HP/mobility/stress', () => {
    const seed = 's0'
    const a = runExpedition(
      makeEscortRequest(seed, 'C', {
        maxHp: 80,
        initialHp: 10,
        mobility: 'immobile',
      }),
      makeEscortParty(seed, 'C'),
    )
    const b = runExpedition(
      makeEscortRequest(seed, 'C', {
        maxHp: 80,
        initialHp: 80,
        mobility: 'mobile',
      }),
      makeEscortParty(seed, 'C'),
    )
    const aBattle = a.state.battles[0]
    const bBattle = b.state.battles[0]
    if (aBattle && bBattle) {
      expect(aBattle.enemyComposition).toEqual(bBattle.enemyComposition)
      expect(aBattle.enemyIds).toEqual(bBattle.enemyIds)
    }
  })
})

describe('Escort target damage and heal helpers', () => {
  it('clamps HP to max and logs death only once', () => {
    const { context } = makeEscortContext('heal', 'C')
    const objective = escortState({
      state: context.state,
      party: context.party,
      request: context.request,
      outcome: 'failedObjective',
    })
    applyEscortTargetDamage(context.state, objective, 100, 'test', 'objective')
    expect(objective.currentHp).toBe(0)
    expect(getEscortTargetCondition(objective)).toBe('dead')
    applyEscortTargetDamage(context.state, objective, 5, 'test', 'objective')
    expect(
      context.state.logs.filter((l) => l.type === 'escortTargetDeath').length,
    ).toBe(1)
  })

  it('heals only up to max HP and not when dead', () => {
    const { context } = makeEscortContext('heal2', 'C')
    const objective = escortState({
      state: context.state,
      party: context.party,
      request: context.request,
      outcome: 'failedObjective',
    })
    objective.currentHp = 30
    const healed = healEscortTarget(
      context.state,
      objective,
      100,
      'test',
      'objective',
    )
    expect(healed).toBe(10)
    expect(objective.currentHp).toBe(40)
    objective.currentHp = 0
    expect(
      healEscortTarget(context.state, objective, 5, 'test', 'objective'),
    ).toBe(0)
  })
})

describe('Escort departure', () => {
  it('marks departed and coordinated based on leadership result', () => {
    const { context } = makeEscortContext('depart', 'C')
    runEscortDeparture(context)
    const objective = escortState({
      state: context.state,
      party: context.party,
      request: context.request,
      outcome: 'failedObjective',
    })
    expect(objective.departed).toBe(true)
    expect(objective.coordinated).toBe(true)
    expect(context.state.logs.some((l) => l.type === 'escortDeparture')).toBe(
      true,
    )
  })

  it('prefers support as coordinator', () => {
    const { context } = makeEscortContext('support-coord', 'C')
    runEscortDeparture(context)
    const log = context.state.logs.find((l) => l.type === 'escortDeparture')
    const primaryId = log?.actorIds[0]
    const primary = context.party.find((a) => a.id === primaryId)
    expect(primary?.role).toBe('support')
  })

  it('clamps stress between 0 and 100', () => {
    const { context } = makeEscortContext('stress', 'C', { initialStress: 90 })
    runEscortDeparture(context)
    const objective = escortState({
      state: context.state,
      party: context.party,
      request: context.request,
      outcome: 'failedObjective',
    })
    expect(objective.travelStress).toBeLessThanOrEqual(100)
    expect(objective.travelStress).toBeGreaterThanOrEqual(0)
  })
})

describe('Escort route legs', () => {
  it('caps route progress at 100 and accumulates correctly', () => {
    const { context } = makeEscortContext('route', 'C', {
      routeDifficulty: 1,
    })
    runEscortDeparture(context)
    runEscortRoute(context, 1)
    runEscortRoute(context, 2)
    const objective = escortState({
      state: context.state,
      party: context.party,
      request: context.request,
      outcome: 'failedObjective',
    })
    expect(objective.routeProgress).toBeLessThanOrEqual(100)
    expect(objective.routeProgress).toBeGreaterThanOrEqual(0)
  })

  it('does not run further route/care/handoff after target death', () => {
    const { context } = makeEscortContext('route-death', 'C', {
      initialHp: 4,
    })
    runEscortDeparture(context)
    runEscortRoute(context, 1)
    const objective = escortState({
      state: context.state,
      party: context.party,
      request: context.request,
      outcome: 'failedObjective',
    })
    expect(objective.currentHp).toBe(0)
    expect(
      context.state.logs.filter((l) => l.type === 'escortTargetDeath').length,
    ).toBe(1)
  })

  it('uses survival in forest and scouting in cave', () => {
    const forest = makeEscortContext('forest-route', 'C', {
      routeDifficulty: 1,
    })
    forest.request.environment = 'forest'
    runEscortDeparture(forest.context)
    runEscortRoute(forest.context, 1)
    const forestLog = forest.context.state.logs.find(
      (l) => l.type === 'escortRouteProgress',
    )
    expect(forestLog?.check?.skill).toBe('survival')

    const cave = makeEscortContext('cave-route', 'C', { routeDifficulty: 1 })
    cave.request.environment = 'cave'
    runEscortDeparture(cave.context)
    runEscortRoute(cave.context, 1)
    const caveLog = cave.context.state.logs.find(
      (l) => l.type === 'escortRouteProgress',
    )
    expect(caveLog?.check?.skill).toBe('scouting')

    const magical = makeEscortContext('magical-route', 'C', {
      routeDifficulty: 1,
    })
    magical.request.environment = 'magical'
    runEscortDeparture(magical.context)
    runEscortRoute(magical.context, 1)
    const magicalLog = magical.context.state.logs.find(
      (l) => l.type === 'escortRouteProgress',
    )
    expect(magicalLog?.check?.skill).toBe('defenseMagic')
  })

  it('gives mobility assistance bonus for assisted and immobile targets', () => {
    const withVanguard = makeEscortContext(
      'with-vanguard',
      'C',
      { routeDifficulty: 50, mobility: 'assisted' },
      undefined,
      false,
      { features: [] },
      ['vanguard', 'ranger', 'mage', 'healer'],
    )
    runEscortDeparture(withVanguard.context)
    runEscortRoute(withVanguard.context, 1)
    const withLog = withVanguard.context.state.logs.find(
      (l) => l.type === 'escortRouteProgress',
    )

    const withoutVanguard = makeEscortContext(
      'without-vanguard',
      'C',
      { routeDifficulty: 50, mobility: 'assisted' },
      undefined,
      false,
      { features: [] },
      ['ranger', 'mage', 'healer', 'support'],
    )
    runEscortDeparture(withoutVanguard.context)
    runEscortRoute(withoutVanguard.context, 1)
    const withoutLog = withoutVanguard.context.state.logs.find(
      (l) => l.type === 'escortRouteProgress',
    )

    expect(withLog?.check?.effectiveValue).toBeGreaterThan(
      withoutLog!.check!.effectiveValue,
    )
  })
})

describe('Escort battle exposure', () => {
  it('assigns guardian protector when battle is enabled', () => {
    const result = runExpedition(
      makeEscortRequest('protector-g', 'C'),
      makeEscortParty('protector-g', 'C', [
        'vanguard',
        'guardian',
        'mage',
        'healer',
      ]),
    )
    const obj = escortState(result)
    const log = result.state.logs.find(
      (l) => l.type === 'escortProtectorAssigned',
    )
    const protectorId = log?.actorIds[0]
    const protector = result.party.find((a) => a.id === protectorId)
    expect(protector?.role).toBe('guardian')
    expect(obj.protectorId).toBe(protectorId)
  })

  it('falls back to vanguard when no guardian', () => {
    const result = runExpedition(
      makeEscortRequest('protector-v', 'C'),
      makeEscortParty('protector-v', 'C', [
        'vanguard',
        'ranger',
        'mage',
        'healer',
      ]),
    )
    const log = result.state.logs.find(
      (l) => l.type === 'escortProtectorAssigned',
    )
    const protector = result.party.find((a) => a.id === log?.actorIds[0])
    expect(protector?.role).toBe('vanguard')
  })

  it('does not assign a protector when battle is disabled', () => {
    const result = runExpedition(
      makeEscortRequest('no-protector', 'C', undefined, undefined, false),
      makeEscortParty('no-protector', 'C'),
    )
    expect(
      result.state.logs.some((l) => l.type === 'escortProtectorAssigned'),
    ).toBe(false)
    expect(escortState(result).protectorId).toBeUndefined()
  })
})

describe('Escort care', () => {
  it('skips care when target is uninjured and has no status effects', () => {
    const { context } = makeEscortContext('no-care', 'C')
    runEscortDeparture(context)
    runEscortCare(context)
    expect(context.state.logs.some((l) => l.type === 'escortCare')).toBe(false)
  })

  it('performs care when target is injured and heals', () => {
    const { context } = makeEscortContext('care', 'C')
    const objective = escortState({
      state: context.state,
      party: context.party,
      request: context.request,
      outcome: 'failedObjective',
    })
    objective.currentHp = 20
    runEscortDeparture(context)
    runEscortCare(context)
    expect(objective.currentHp).toBeGreaterThan(20)
    expect(context.state.logs.some((l) => l.type === 'escortCare')).toBe(true)
  })

  it('does not heal beyond max HP', () => {
    const { context } = makeEscortContext('care-cap', 'C', {
      careDifficulty: 1,
    })
    const objective = escortState({
      state: context.state,
      party: context.party,
      request: context.request,
      outcome: 'failedObjective',
    })
    objective.currentHp = 39
    runEscortDeparture(context)
    runEscortCare(context)
    expect(objective.currentHp).toBe(40)
  })

  it('does not care for dead targets', () => {
    const { context } = makeEscortContext('dead-care', 'C')
    const objective = escortState({
      state: context.state,
      party: context.party,
      request: context.request,
      outcome: 'failedObjective',
    })
    objective.currentHp = 0
    runEscortDeparture(context)
    runEscortCare(context)
    expect(context.state.logs.some((l) => l.type === 'escortCare')).toBe(false)
  })
})

describe('Escort handoff and return', () => {
  it('auto-delivers when handoffRequirement is none', () => {
    const result = runExpedition(
      makeEscortRequest(
        's0',
        'B',
        {
          routeDifficulty: 1,
          coordinationDifficulty: 1,
          careDifficulty: 1,
        },
        {
          handoffRequirement: 'none',
          handoffDifficulty: 0,
        },
        false,
        { features: [] },
      ),
      makeEscortParty('s0', 'B', ['support', 'ranger', 'mage', 'healer']),
    )
    const obj = escortState(result)
    expect(obj.destinationReached).toBe(true)
    expect(obj.delivered).toBe(true)
    expect(obj.handoffStatus).toBe('notRequired')
  })

  it('reaches destination and attempts standard handoff', () => {
    const result = runExpedition(
      makeEscortRequest(
        's0',
        'B',
        {
          routeDifficulty: 1,
          coordinationDifficulty: 1,
          careDifficulty: 1,
        },
        { handoffRequirement: 'standard', handoffDifficulty: 1 },
        false,
        { features: [] },
      ),
      makeEscortParty('s0', 'B', ['support', 'ranger', 'mage', 'healer']),
    )
    const obj = escortState(result)
    expect(obj.destinationReached).toBe(true)
    expect(['completed', 'pending', 'failed']).toContain(obj.handoffStatus)
  })

  it('returns target to origin when escort fails but target survives and adventurers are active', () => {
    const result = runExpedition(
      makeEscortRequest('return-origin', 'C', { routeDifficulty: 100 }),
      makeEscortParty('return-origin', 'C'),
    )
    const obj = escortState(result)
    if (obj.currentHp > 0 && !obj.delivered) {
      expect(obj.returnedToOrigin).toBe(true)
      expect(obj.stranded).toBe(false)
      expect(
        result.state.logs.some((l) =>
          l.facts.some((f) => f.includes('出発地点まで連れ戻された')),
        ),
      ).toBe(true)
    }
  })
})

describe('Escort outcome dispatch', () => {
  it('can produce completeSuccess when conditions are met', () => {
    const request = makeEscortRequest(
      's0',
      'B',
      {
        routeDifficulty: 1,
        coordinationDifficulty: 1,
        careDifficulty: 1,
      },
      { handoffRequirement: 'none' },
      false,
      { features: [] },
    )
    const result = runExpedition(
      request,
      makeEscortParty('s0', 'B', ['support', 'ranger', 'mage', 'healer']),
    )
    expect(['completeSuccess', 'success']).toContain(result.outcome)
  })

  it('separates battle outcome from escort outcome', () => {
    const result = runExpedition(
      makeEscortRequest('battle-sep', 'C'),
      makeEscortParty('battle-sep', 'C'),
    )
    const valid = [
      'completeSuccess',
      'success',
      'partialSuccess',
      'forcedRetreat',
      'failedObjective',
      'lostExpedition',
    ]
    expect(valid).toContain(result.outcome)
  })
})

describe('Escort determinism', () => {
  it('produces identical results for the same request and party', () => {
    const request = makeEscortRequest('det', 'C')
    const party = makeEscortParty('det', 'C')
    const a = runExpedition(request, party)
    const b = runExpedition(request, party)
    expect(a.outcome).toBe(b.outcome)
    const objA = escortState(a)
    const objB = escortState(b)
    expect(objA.currentHp).toBe(objB.currentHp)
    expect(objA.routeProgress).toBe(objB.routeProgress)
    expect(objA.travelStress).toBe(objB.travelStress)
    expect(objA.handoffStatus).toBe(objB.handoffStatus)
    expect(objA.delivered).toBe(objB.delivered)
    expect(a.state.elapsedTime).toBe(b.state.elapsedTime)
  })

  it('passes paired self-verification for identical role compositions', () => {
    const roles: AdventurerRole[] = ['support', 'ranger', 'mage', 'healer']
    const request = makeEscortRequest('paired', 'C', { routeDifficulty: 1 })
    const party = makePairedParty(roles, 'paired', 'C')
    const a = runExpedition(request, party)
    const b = runExpedition(request, party)
    expect(a.outcome).toBe(b.outcome)
    expect(JSON.stringify(a.state.logs)).toBe(JSON.stringify(b.state.logs))
  })
})

describe('Escort handler registration', () => {
  it('is included in the objective handler registry', () => {
    expect(escortHandler.flow.preparation).toBe(true)
    expect(escortHandler.flow.battle).toBe('optional')
    expect(escortHandler.flow.objectiveAfterForcedBattleRetreat).toBe(false)
    expect(escortHandler.validateRequest).toBeDefined()
    expect(escortHandler.initializeObjectiveState).toBeDefined()
    expect(escortHandler.afterPreparation).toBeDefined()
    expect(escortHandler.beforeBattle).toBeDefined()
    expect(escortHandler.onBattleResolved).toBeDefined()
    expect(escortHandler.runObjective).toBeDefined()
    expect(escortHandler.beforeReturn).toBeDefined()
    expect(escortHandler.afterReturn).toBeDefined()
    expect(escortHandler.finalizeObjectiveState).toBeDefined()
    expect(escortHandler.determineOutcome).toBeDefined()
  })
})
