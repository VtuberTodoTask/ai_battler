import { describe, expect, it } from 'vitest'
import {
  battleConfig,
  makeEliminationParty,
  makeEliminationRequest,
  makeParty,
  makeRequest,
} from './test-utils.ts'
import type { BattleOutcome, BattleResult } from '../models/types.ts'
import type { EliminationObjectiveState } from './types.ts'
import { runExpedition } from './expedition.ts'
import { initializeExpeditionState } from './state.ts'
import { expeditionTestInternals } from './test-internals.ts'

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
