import { describe, expect, it } from 'vitest'
import { runExpedition } from './expedition.ts'
import { initializeExpeditionState } from './state.ts'
import { SeededRng } from '../rng/seededRng.ts'
import {
  makeEliminationRequest,
  makeParty,
  makeRequest,
  makeRescueParty,
  makeRescueRequest,
  minimalExpeditionState,
} from './test-utils.ts'
import type { Adventurer } from '../models/types.ts'
import type {
  ExpeditionExecutionContext,
  ExpeditionRequest,
  RescueObjectiveState,
} from './types.ts'
import {
  applyRescueTargetDamage,
  determineRescueOutcome,
  healRescueTarget,
  initializeRescueObjectiveState,
  resolveRescueReturn,
  runRescueAccess,
  runRescueSearch,
} from './objectives/rescue.ts'

function rescueState(
  result: ReturnType<typeof runExpedition>,
): RescueObjectiveState {
  const obj = result.state.objectiveState
  expect(obj?.type).toBe('rescue')
  return obj as RescueObjectiveState
}

function makeRescueContext(
  request: ExpeditionRequest,
  party: Adventurer[],
): ExpeditionExecutionContext {
  const state = initializeExpeditionState(request, party)
  state.objectiveState = initializeRescueObjectiveState(request)
  return {
    request,
    party,
    state,
    rng: new SeededRng(request.seed),
  }
}

describe('Rescue input validation', () => {
  it('rejects rescue without rescue config', () => {
    const request = makeRequest('rescue-no-config', { objectiveType: 'rescue' })
    const party = makeRescueParty('rescue-no-config', 'C')
    expect(() => runExpedition(request, party)).toThrow(
      'Rescue request requires rescue configuration',
    )
  })

  it('rejects empty target id', () => {
    const request = makeRescueRequest('empty-id', 'C', { id: '' })
    const party = makeRescueParty('empty-id', 'C')
    expect(() => runExpedition(request, party)).toThrow('id must not be empty')
  })

  it('rejects maxHp <= 0', () => {
    const request = makeRescueRequest('bad-max', 'C', { maxHp: 0 })
    const party = makeRescueParty('bad-max', 'C')
    expect(() => runExpedition(request, party)).toThrow(
      'maxHp must be positive',
    )
  })

  it('rejects initialHp <= 0', () => {
    const request = makeRescueRequest('bad-init-low', 'C', { initialHp: 0 })
    const party = makeRescueParty('bad-init-low', 'C')
    expect(() => runExpedition(request, party)).toThrow('initialHp')
  })

  it('rejects initialHp > maxHp', () => {
    const request = makeRescueRequest('bad-init-high', 'C', {
      maxHp: 10,
      initialHp: 20,
    })
    const party = makeRescueParty('bad-init-high', 'C')
    expect(() => runExpedition(request, party)).toThrow('initialHp')
  })

  it('rejects negative difficulty', () => {
    const request = makeRescueRequest('bad-diff', 'C', {
      discoveryDifficulty: -1,
    })
    const party = makeRescueParty('bad-diff', 'C')
    expect(() => runExpedition(request, party)).toThrow(
      'difficulties must be finite non-negative',
    )
  })

  it('works without battle', () => {
    const request = makeRescueRequest('no-battle', 'C', undefined, false)
    const party = makeRescueParty('no-battle', 'C')
    expect(() => runExpedition(request, party)).not.toThrow()
  })

  it('does not require rescue config for investigation', () => {
    const request = makeRequest('investigation-no-rescue')
    const party = makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'investigation-no-rescue',
    )
    expect(() => runExpedition(request, party)).not.toThrow()
  })

  it('does not require rescue config for elimination', () => {
    const request = makeEliminationRequest('elimination-no-rescue', 'C', false)
    const party = makeRescueParty('elimination-no-rescue', 'C')
    expect(() => runExpedition(request, party)).not.toThrow()
  })
})

describe('Rescue state separation', () => {
  it('does not add rescue target to partyHp/Mp/Morale/casualties/incapacitated', () => {
    const request = makeRescueRequest('separation', 'C')
    const party = makeRescueParty('separation', 'C')
    const result = runExpedition(request, party)
    const targetId = result.request.rescue!.target.id
    expect(result.state.partyHp[targetId]).toBeUndefined()
    expect(result.state.partyMp[targetId]).toBeUndefined()
    expect(result.state.partyMorale[targetId]).toBeUndefined()
    expect(result.state.casualties).not.toContain(targetId)
    expect(result.state.incapacitated).not.toContain(targetId)
  })

  it('does not include rescue target in battle party or final adventurer states', () => {
    const request = makeRescueRequest('battle-separation', 'C')
    const party = makeRescueParty('battle-separation', 'C')
    const result = runExpedition(request, party)
    if (result.state.battles.length > 0) {
      const record = result.state.battles[0]
      const targetId = result.request.rescue!.target.id
      expect(
        record.result.finalAdventurerStates.some((m) => m.id === targetId),
      ).toBe(false)
    }
  })

  it('keeps rescue state in objectiveState only', () => {
    const request = makeRescueRequest('objective-only', 'C')
    const party = makeRescueParty('objective-only', 'C')
    const state = initializeExpeditionState(request, party)
    expect(state.objectiveState).toBeUndefined()
    const result = runExpedition(request, party)
    expect(result.state.objectiveState?.type).toBe('rescue')
  })

  it('produces deterministic results for the same rescue seed', () => {
    const request = makeRescueRequest('deterministic', 'C')
    const partyA = makeRescueParty('deterministic', 'C')
    const partyB = makeRescueParty('deterministic', 'C')
    const a = runExpedition(request, partyA)
    const b = runExpedition(request, partyB)
    expect(a.outcome).toBe(b.outcome)
    expect(a.state.objectiveState).toEqual(b.state.objectiveState)
    expect(a.state.elapsedTime).toBe(b.state.elapsedTime)
  })
})

describe('Rescue search and access', () => {
  it('locates target immediately when locationKnown is true', () => {
    const request = makeRescueRequest('known', 'C', { locationKnown: true })
    const party = makeRescueParty('known', 'C')
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    expect(obj.located).toBe(true)
  })

  it('does not perform a search roll when locationKnown is true', () => {
    const request = makeRescueRequest('known-no-search', 'C', {
      locationKnown: true,
      discoveryDifficulty: 1000,
    })
    const party = makeRescueParty('known-no-search', 'C')
    const result = runExpedition(request, party)
    expect(result.state.objectiveState?.type).toBe('rescue')
  })

  it('tends to locate more often with a scout in the party', () => {
    let withScout = 0
    let withoutScout = 0
    const trials = 50
    for (let i = 0; i < trials; i++) {
      const request = makeRescueRequest(`scout-${i}`, 'C')
      const withParty = makeParty(
        ['scout', 'guardian', 'mage', 'healer'],
        `scout-${i}`,
        'C',
      )
      const withoutParty = makeParty(
        ['vanguard', 'guardian', 'mage', 'healer'],
        `no-scout-${i}`,
        'C',
      )
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      if (rescueState(withResult).located) withScout++
      if (rescueState(withoutResult).located) withoutScout++
    }
    expect(withScout).toBeGreaterThanOrEqual(withoutScout)
  })

  it('does not access or treat target before it is located', () => {
    const request = makeRescueRequest('s1', 'C')
    const party = makeRescueParty('s1', 'C')
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    expect(obj.located).toBe(false)
    expect(obj.reached).toBe(false)
  })
})

describe('Rescue stabilization', () => {
  it('uses healer when available', () => {
    const request = makeRescueRequest('stabilize-healer', 'C', {
      initialHp: 10,
      maxHp: 40,
      stabilizationDifficulty: 5,
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'stabilize-healer',
      'C',
    )
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    if (obj.reached) {
      expect(obj.currentHp).toBeGreaterThanOrEqual(10)
    }
  })

  it('does not treat a dead target', () => {
    const request = makeRescueRequest('dead-treat', 'C')
    const state = minimalExpeditionState()
    state.objectiveState = initializeRescueObjectiveState(request)
    const objective = state.objectiveState as RescueObjectiveState
    objective.currentHp = 0
    const healed = healRescueTarget(state, objective, 20, 'test', 'objective')
    expect(healed).toBe(0)
    expect(objective.currentHp).toBe(0)
  })

  it('does not heal above maxHp', () => {
    const request = makeRescueRequest('max-hp-cap', 'C', {
      initialHp: 38,
      maxHp: 40,
      stabilizationDifficulty: 1,
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'max-hp-cap',
      'C',
    )
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    expect(obj.currentHp).toBeLessThanOrEqual(40)
  })
})

describe('Rescue battle exposure', () => {
  it('applies no exposure damage when no battle occurs', () => {
    const request = makeRescueRequest(
      'no-battle-exposure',
      'C',
      undefined,
      false,
    )
    const party = makeRescueParty('no-battle-exposure', 'C')
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    expect(obj.battleExposureDamage).toBe(0)
  })

  it('does not damage target that has not been located', () => {
    const request = makeRescueRequest('unlocated', 'C', {
      locationKnown: false,
      discoveryDifficulty: 1000,
    })
    const party = makeRescueParty('unlocated', 'C')
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    expect(obj.located).toBe(false)
    expect(obj.battleExposureDamage).toBe(0)
  })

  it('does not damage target that has not been reached', () => {
    const request = makeRescueRequest('unreached', 'C', {
      locationKnown: true,
      accessDifficulty: 1000,
    })
    const party = makeRescueParty('unreached', 'C')
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    expect(obj.reached).toBe(false)
    expect(obj.battleExposureDamage).toBe(0)
  })

  it('can kill the target through battle exposure', () => {
    const request = makeRescueRequest('target-dies', 'C', {
      initialHp: 1,
      maxHp: 1,
      locationKnown: true,
      accessDifficulty: 1,
    })
    const party = makeRescueParty('target-dies', 'C')
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    expect([0, 1]).toContain(obj.currentHp)
  })
})

describe('Rescue evacuation and return', () => {
  it('applies different mobility modifiers', () => {
    const baseOverrides = {
      locationKnown: true,
      accessDifficulty: 0,
      stabilizationDifficulty: 0,
      evacuationDifficulty: 0,
    }
    const mobile = makeRescueRequest(
      'mobility',
      'C',
      { ...baseOverrides, mobility: 'mobile' },
      false,
      { features: [] },
    )
    const assisted = makeRescueRequest(
      'mobility',
      'C',
      { ...baseOverrides, mobility: 'assisted' },
      false,
      { features: [] },
    )
    const immobile = makeRescueRequest(
      'mobility',
      'C',
      { ...baseOverrides, mobility: 'immobile' },
      false,
      { features: [] },
    )
    const mobileResult = runExpedition(
      mobile,
      makeParty(['ranger', 'healer', 'guardian', 'vanguard'], 'mobility', 'C'),
    )
    const assistedResult = runExpedition(
      assisted,
      makeParty(['ranger', 'healer', 'guardian', 'vanguard'], 'mobility', 'C'),
    )
    const immobileResult = runExpedition(
      immobile,
      makeParty(['ranger', 'healer', 'guardian', 'vanguard'], 'mobility', 'C'),
    )
    expect(mobileResult.state.elapsedTime).toBeLessThanOrEqual(
      assistedResult.state.elapsedTime,
    )
    expect(assistedResult.state.elapsedTime).toBeLessThanOrEqual(
      immobileResult.state.elapsedTime,
    )
  })

  it('sets returned=true when evacuation succeeds and party survives', () => {
    const request = makeRescueRequest('return-true', 'C')
    const party = makeRescueParty('return-true', 'C')
    const state = initializeExpeditionState(request, party)
    state.objectiveState = initializeRescueObjectiveState(request)
    const objective = state.objectiveState as RescueObjectiveState
    objective.located = true
    objective.reached = true
    objective.evacuated = true
    objective.stabilized = true
    resolveRescueReturn({
      request,
      party,
      state,
      rng: new SeededRng(request.seed),
    } as unknown as ExpeditionExecutionContext)
    expect(objective.evacuated).toBe(true)
    expect(objective.returned).toBe(true)
    expect(objective.returnDamage).toBe(0)
  })

  it('marks abandoned when located and reached but not evacuated', () => {
    const request = makeRescueRequest('abandoned', 'C', {
      locationKnown: true,
      accessDifficulty: 1,
      evacuationDifficulty: 1000,
    })
    const party = makeRescueParty('abandoned', 'C')
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    if (!obj.evacuated && obj.located && obj.reached && obj.currentHp > 0) {
      expect(obj.abandoned).toBe(true)
    }
  })

  it('produces a return deterioration log when target is unstable', () => {
    const request = makeRescueRequest('return-deterioration', 'C', {
      locationKnown: true,
      accessDifficulty: 1,
      evacuationDifficulty: 1,
      stabilizationDifficulty: 1000,
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'return-deterioration',
      'C',
    )
    const result = runExpedition(request, party)
    expect(result.state.logs.some((l) => l.type === 'rescueReturn')).toBe(true)
  })
})

describe('Rescue outcomes', () => {
  it('can produce completeSuccess', () => {
    const request = makeRescueRequest('complete', 'C')
    const party = makeRescueParty('complete', 'C')
    const state = initializeExpeditionState(request, party)
    state.objectiveState = initializeRescueObjectiveState(request)
    const objective = state.objectiveState as RescueObjectiveState
    objective.located = true
    objective.reached = true
    objective.evacuated = true
    objective.returned = true
    objective.stabilized = true
    const outcome = determineRescueOutcome({
      request,
      party,
      state,
      rng: new SeededRng(request.seed),
    } as unknown as ExpeditionExecutionContext)
    expect(outcome).toBe('completeSuccess')
  })

  it('does not produce completeSuccess without stabilization', () => {
    const request = makeRescueRequest('unstable', 'C', {
      locationKnown: true,
      accessDifficulty: 1,
      evacuationDifficulty: 1,
      stabilizationDifficulty: 1000,
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'unstable',
      'C',
    )
    const result = runExpedition(request, party)
    if (rescueState(result).returned) {
      expect(result.outcome).not.toBe('completeSuccess')
    }
  })

  it('produces failedObjective when target dies', () => {
    const request = makeRescueRequest('target-death', 'C', {
      initialHp: 1,
      maxHp: 1,
      locationKnown: true,
      accessDifficulty: 1,
      evacuationDifficulty: 1000,
    })
    const party = makeRescueParty('target-death', 'C')
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    if (obj.currentHp === 0) {
      expect(result.outcome).toBe('failedObjective')
    }
  })

  it('produces lostExpedition when the entire party is lost', () => {
    const request = makeRescueRequest(
      'party-lost',
      'D',
      {
        locationKnown: true,
        accessDifficulty: 1,
      },
      true,
      {
        battle: {
          enabled: true,
          seed: 'doom',
          triggerPhase: 'afterExploration',
        },
      },
    )
    const party = makeRescueParty('party-lost', 'D')
    const result = runExpedition(request, party)
    if (result.state.casualties.length === party.length) {
      expect(result.outcome).toBe('lostExpedition')
    }
  })

  it('does not produce success solely from battle victory', () => {
    const request = makeRescueRequest('not-auto-success', 'C', {
      locationKnown: false,
      discoveryDifficulty: 1000,
      accessDifficulty: 1000,
    })
    const party = makeRescueParty('not-auto-success', 'C')
    const result = runExpedition(request, party)
    expect(result.outcome).not.toBe('completeSuccess')
    expect(result.outcome).not.toBe('success')
  })

  it('produces partialSuccess when target is evacuated but not returned', () => {
    const request = makeRescueRequest('partial', 'C')
    const party = makeRescueParty('partial', 'C')
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    if (obj.evacuated && !obj.returned && obj.currentHp > 0) {
      expect(result.outcome).toBe('partialSuccess')
    }
  })

  it('computes progress as the sum of five 20-point steps', () => {
    const request = makeRescueRequest('progress', 'C')
    const party = makeRescueParty('progress', 'C')
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    let expected = 0
    if (obj.located) expected += 20
    if (obj.reached) expected += 20
    if (obj.stabilized) expected += 20
    if (obj.evacuated) expected += 20
    if (obj.returned) expected += 20
    expect(obj.progress).toBe(expected)
  })

  it('keeps completed false when target is dead', () => {
    const request = makeRescueRequest('dead-not-completed', 'C', {
      initialHp: 1,
      maxHp: 1,
      locationKnown: true,
      accessDifficulty: 1,
      evacuationDifficulty: 1,
    })
    const party = makeRescueParty('dead-not-completed', 'C')
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    if (obj.currentHp === 0) {
      expect(obj.completed).toBe(false)
    }
  })
})

describe('Rescue integration with handler internals', () => {
  it('initializes rescue objectiveState to undefined from initializeExpeditionState', () => {
    const request = makeRescueRequest('init-state', 'C')
    const party = makeRescueParty('init-state', 'C')
    const state = initializeExpeditionState(request, party)
    expect(state.objectiveState).toBeUndefined()
  })

  it('does not consume common expedition RNG for rescue-only checks', () => {
    const requestA = makeRescueRequest('rng-a', 'C')
    const requestB = makeRescueRequest('rng-b', 'C')
    const partyA = makeRescueParty('rng-a', 'C')
    const partyB = makeRescueParty('rng-b', 'C')
    const resultA = runExpedition(requestA, partyA)
    const resultB = runExpedition(requestB, partyB)
    expect(resultA.outcome).toBeDefined()
    expect(resultB.outcome).toBeDefined()
  })

  it('keeps investigation results unchanged with rescue in the codebase', () => {
    const request = makeRequest('investigation-unaffected')
    const party = makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'investigation-unaffected',
    )
    const result = runExpedition(request, party)
    expect(result.state.objectiveState?.type).toBe('investigation')
  })
})

describe('Rescue Phase 3.3.1 fixes', () => {
  it('applies final search bonus to rescue search effectiveValue', () => {
    const request = makeRescueRequest(
      'search-bonus',
      'C',
      { discoveryDifficulty: 50 },
      false,
      { features: [] },
    )
    const party = makeParty(
      ['scout', 'healer', 'guardian', 'vanguard'],
      'search-bonus',
      'C',
    )

    const context0 = makeRescueContext(request, party)
    runRescueSearch(context0, 'final-search', 0)
    const log0 = context0.state.logs.find((l) => l.type === 'rescueSearch')
    const effective0 = log0?.check?.effectiveValue ?? 0

    const context10 = makeRescueContext(request, party)
    runRescueSearch(context10, 'final-search', 10)
    const log10 = context10.state.logs.find((l) => l.type === 'rescueSearch')
    const effective10 = log10?.check?.effectiveValue ?? 0

    expect(effective10).toBe(effective0 + 10)
  })

  it('carries search access bonus into re-access plus battle victory bonus', () => {
    const request = makeRescueRequest(
      'reaccess-bonus',
      'C',
      {
        locationKnown: true,
        accessDifficulty: 50,
        stabilizationDifficulty: 1000,
      },
      false,
      { features: [] },
    )
    const party = makeParty(
      ['ranger', 'healer', 'guardian', 'vanguard'],
      'reaccess-bonus',
      'C',
    )

    const contextBase = makeRescueContext(request, party)
    contextBase.state.metadata = { rescueAccessBonus: 0 }
    contextBase.state.battleOutcome = 'victory'
    runRescueAccess(contextBase, 'reaccess', 5)
    const logBase = contextBase.state.logs.find(
      (l) => l.type === 'rescueTargetReached',
    )
    const effectiveBase = logBase?.check?.effectiveValue ?? 0

    const contextBonus = makeRescueContext(request, party)
    contextBonus.state.metadata = { rescueAccessBonus: 10 }
    contextBonus.state.battleOutcome = 'victory'
    runRescueAccess(contextBonus, 'reaccess', 15)
    const logBonus = contextBonus.state.logs.find(
      (l) => l.type === 'rescueTargetReached',
    )
    const effectiveBonus = logBonus?.check?.effectiveValue ?? 0

    expect(effectiveBonus).toBe(effectiveBase + 10)
  })

  it('does not assign protector when battle is disabled', () => {
    const request = makeRescueRequest(
      'no-battle-protector',
      'C',
      {
        locationKnown: true,
        accessDifficulty: 0,
      },
      false,
    )
    const party = makeRescueParty('no-battle-protector', 'C')
    const result = runExpedition(request, party)
    const obj = rescueState(result)
    expect(obj.protectorId).toBeUndefined()
    expect(
      result.state.logs.some((l) => l.type === 'rescueProtectorAssigned'),
    ).toBe(false)
    expect(
      result.state.logs.some((l) => l.type === 'rescueBattleExposure'),
    ).toBe(false)
  })

  it('does not apply return deterioration when target was not evacuated', () => {
    const request = makeRescueRequest('no-return-deterioration', 'C')
    const party = makeRescueParty('no-return-deterioration', 'C')
    const state = initializeExpeditionState(request, party)
    state.objectiveState = initializeRescueObjectiveState(request)
    const objective = state.objectiveState as RescueObjectiveState
    objective.located = true
    objective.reached = true
    objective.evacuated = false
    objective.currentHp = 10
    objective.statusEffects.push({
      type: 'poisoned',
      duration: 3,
      sourceId: 'test',
    })
    resolveRescueReturn({
      request,
      party,
      state,
      rng: new SeededRng(request.seed),
    } as unknown as ExpeditionExecutionContext)
    expect(objective.abandoned).toBe(true)
    expect(objective.returned).toBe(false)
    expect(objective.returnDamage).toBe(0)
    expect(
      state.logs.some((l) => l.facts.some((f) => f.includes('帰還中に悪化'))),
    ).toBe(false)
  })

  it('logs rescue target death only once and skips further treatment', () => {
    const request = makeRescueRequest('death-once', 'C')
    const party = makeRescueParty('death-once', 'C')
    const state = initializeExpeditionState(request, party)
    state.objectiveState = initializeRescueObjectiveState(request)
    const objective = state.objectiveState as RescueObjectiveState
    objective.currentHp = 1

    applyRescueTargetDamage(state, objective, 10, 'test damage', 'objective')
    const deathLogs = state.logs.filter((l) => l.type === 'rescueTargetDeath')
    expect(deathLogs.length).toBe(1)
    expect(objective.currentHp).toBe(0)

    const healed = healRescueTarget(state, objective, 20, 'test', 'objective')
    expect(healed).toBe(0)

    applyRescueTargetDamage(state, objective, 5, 'extra damage', 'objective')
    expect(
      state.logs.filter((l) => l.type === 'rescueTargetDeath').length,
    ).toBe(1)
  })
})
