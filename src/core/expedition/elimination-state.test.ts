import { describe, expect, it } from 'vitest'
import { makeEliminationParty, makeEliminationRequest } from './test-utils.ts'
import type { BattleResult } from '../models/types.ts'
import type { EliminationObjectiveState, ExpeditionState } from './types.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { runExpedition } from './expedition.ts'
import { initializeExpeditionState } from './state.ts'
import { expeditionTestInternals } from './test-internals.ts'

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
