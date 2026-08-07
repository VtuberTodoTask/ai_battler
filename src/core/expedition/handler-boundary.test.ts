import { describe, expect, it, vi } from 'vitest'
import { initializeExpeditionState } from './state.ts'
import { runExpedition } from './expedition.ts'
import {
  battleConfig,
  emptyBattleEntrySnapshot,
  makeEliminationParty,
  makeEliminationRequest,
  makeParty,
  makeRequest,
} from './test-utils.ts'
import { expeditionTestInternals } from './test-internals.ts'
import {
  eliminationHandler,
  initializeEliminationObjectiveState,
} from './objectives/elimination.ts'
import { investigationHandler } from './objectives/investigation.ts'
import type {
  EliminationObjectiveState,
  ExpeditionObjectiveHandler,
} from './types.ts'

describe('Handler boundary', () => {
  it('does not run elimination target resolution during investigation', () => {
    const request = makeRequest('no-elim-in-investigation')
    const party = makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'no-elim-in-investigation',
    )
    const result = runExpedition(request, party)
    expect(
      result.state.logs.some((l) => l.type === 'eliminationTargetsAssigned'),
    ).toBe(false)
    expect(result.state.objectiveState?.type).toBe('investigation')
  })

  it('calls elimination target resolution exactly once after battle', () => {
    const request = makeEliminationRequest('elim-once', 'S', false)
    const party = makeEliminationParty('elim-once', 'S')
    const result = runExpedition(request, party)
    const assignLogs = result.state.logs.filter(
      (l) => l.type === 'eliminationTargetsAssigned',
    )
    expect(assignLogs).toHaveLength(1)
    const obj = result.state.objectiveState
    expect(obj?.type).toBe('elimination')
  })

  it('does not mutate objectiveState in battleIntegration', () => {
    const request = makeEliminationRequest('battle-generic', 'S', false)
    const party = makeEliminationParty('battle-generic', 'S')
    const state = initializeExpeditionState(request, party)
    state.objectiveState = initializeEliminationObjectiveState(request)
    const eliminationState = state.objectiveState as EliminationObjectiveState
    eliminationState.requiredTargetIds = ['dummy-target']
    state.battleEntrySnapshot = emptyBattleEntrySnapshot()
    expeditionTestInternals.runExpeditionBattle(request, party, state)
    expect(eliminationState.requiredTargetIds).toEqual(['dummy-target'])
  })

  it('supports a dummy handler without battleIntegration changes', () => {
    const request = makeRequest('dummy-handler', {
      battle: battleConfig(),
    })
    const party = makeParty(['vanguard', 'guardian', 'mage', 'healer'], 'dummy')
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = emptyBattleEntrySnapshot()
    const dummyHandler: ExpeditionObjectiveHandler = {
      flow: {
        preparation: true,
        approach: true,
        exploration: true,
        battle: 'required',
        objective: true,
        return: true,
        aftermath: true,
      },
      validateRequest() {},
      initializeObjectiveState() {
        return { type: 'investigation' }
      },
      runObjective() {},
      finalizeObjectiveState() {
        return { objectiveCompleted: false, progressFact: '' }
      },
      determineOutcome() {
        return 'failedObjective'
      },
    }
    const execution = expeditionTestInternals.runExpeditionBattle(
      request,
      party,
      state,
    )
    expect(execution.battleId).toMatch(/^battle-/)
    expect(execution.battleResult).toBeDefined()
    expect(execution.battleRecord).toBeDefined()
    expect(dummyHandler.flow.battle).toBe('required')
  })

  it('uses handler flow in the orchestrator', () => {
    expect(investigationHandler.flow.battle).toBe('optional')
    expect(eliminationHandler.flow.battle).toBe('required')
  })
})

describe('State initialization', () => {
  it('leaves objectiveState undefined after initializeExpeditionState', () => {
    const request = makeRequest('init-undefined')
    const party = makeParty(['scout', 'ranger', 'mage', 'healer'], 'init')
    const state = initializeExpeditionState(request, party)
    expect(state.objectiveState).toBeUndefined()
  })

  it('creates investigation objectiveState via handler after runExpedition', () => {
    const request = makeRequest('init-investigation')
    const party = makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'init-investigation',
    )
    const result = runExpedition(request, party)
    expect(result.state.objectiveState?.type).toBe('investigation')
  })

  it('creates elimination objectiveState via handler after runExpedition', () => {
    const request = makeEliminationRequest('init-elimination', 'S', false)
    const party = makeEliminationParty('init-elimination', 'S')
    const result = runExpedition(request, party)
    expect(result.state.objectiveState?.type).toBe('elimination')
  })

  it('initializes objectiveState exactly once per expedition', () => {
    const spy = vi.spyOn(investigationHandler, 'initializeObjectiveState')
    const request = makeRequest('init-once')
    const party = makeParty(['scout', 'ranger', 'mage', 'healer'], 'init-once')
    runExpedition(request, party)
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })
})

describe('Outcome dispatch', () => {
  it('rejects unimplemented objective types instead of treating them as investigation', () => {
    const request = makeRequest('unimplemented-survey', {
      objectiveType: 'survey',
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'unimplemented',
    )
    expect(() => runExpedition(request, party)).toThrow(
      'Unsupported objectiveType',
    )
  })

  it('derives the final outcome from the handler determineOutcome', () => {
    const spy = vi.spyOn(investigationHandler, 'determineOutcome')
    const request = makeRequest('outcome-from-handler')
    const party = makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'outcome-from-handler',
    )
    runExpedition(request, party)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
