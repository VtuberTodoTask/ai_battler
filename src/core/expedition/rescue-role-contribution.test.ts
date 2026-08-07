import { describe, expect, it } from 'vitest'
import { makeParty, makeRescueRequest } from './test-utils.ts'
import { initializeExpeditionState } from './state.ts'
import {
  initializeRescueObjectiveState,
  resolveRescueBattleExposure,
} from './objectives/rescue.ts'
import { runExpedition } from './expedition.ts'
import { SeededRng } from '../rng/seededRng.ts'
import type {
  ExpeditionExecutionContext,
  RescueObjectiveState,
} from './types.ts'
import type { BattleResult } from '../models/types.ts'

function rescueState(
  result: ReturnType<typeof runExpedition>,
): RescueObjectiveState {
  const obj = result.state.objectiveState
  expect(obj?.type).toBe('rescue')
  return obj as RescueObjectiveState
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

describe('Rescue role contribution statistics', () => {
  it('Scout improves discovery rate over 1000 trials', () => {
    const withRole: number[] = []
    const withoutRole: number[] = []
    for (let i = 0; i < 1000; i++) {
      const request = makeRescueRequest(
        `scout-${i}`,
        'C',
        {
          locationKnown: false,
          discoveryDifficulty: 15,
          accessDifficulty: 15,
          stabilizationDifficulty: 15,
          evacuationDifficulty: 15,
        },
        false,
        { features: [] },
      )
      const withParty = makeParty(
        ['scout', 'healer', 'guardian', 'vanguard'],
        `scout-${i}`,
        'C',
      )
      const withoutParty = makeParty(
        ['mage', 'healer', 'guardian', 'vanguard'],
        `scout-${i}`,
        'C',
      )
      withRole.push(
        rescueState(runExpedition(request, withParty)).located ? 1 : 0,
      )
      withoutRole.push(
        rescueState(runExpedition(request, withoutParty)).located ? 1 : 0,
      )
    }
    expect(average(withRole)).toBeGreaterThan(average(withoutRole))
  })

  it('Healer improves stabilization rate over 1000 trials', () => {
    const withRole: number[] = []
    const withoutRole: number[] = []
    for (let i = 0; i < 1000; i++) {
      const request = makeRescueRequest(
        `healer-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          initialHp: 10,
          maxHp: 40,
          stabilizationDifficulty: 15,
          evacuationDifficulty: 15,
        },
        false,
        { features: [] },
      )
      const withParty = makeParty(
        ['ranger', 'scout', 'healer', 'guardian'],
        `healer-${i}`,
        'C',
      )
      const withoutParty = makeParty(
        ['ranger', 'scout', 'vanguard', 'guardian'],
        `healer-${i}`,
        'C',
      )
      withRole.push(
        rescueState(runExpedition(request, withParty)).stabilized ? 1 : 0,
      )
      withoutRole.push(
        rescueState(runExpedition(request, withoutParty)).stabilized ? 1 : 0,
      )
    }
    expect(average(withRole)).toBeGreaterThan(average(withoutRole))
  })

  it('Guardian reduces battle exposure damage over 1000 trials', () => {
    const withRole: number[] = []
    const withoutRole: number[] = []
    for (let i = 0; i < 1000; i++) {
      const request = makeRescueRequest(
        `guardian-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          stabilizationDifficulty: 0,
          evacuationDifficulty: 0,
          maxHp: 100,
          initialHp: 100,
        },
        false,
        { features: [] },
      )
      const withParty = makeParty(
        ['scout', 'ranger', 'healer', 'guardian'],
        `guardian-${i}`,
        'C',
      )
      const withoutParty = makeParty(
        ['scout', 'ranger', 'healer', 'mage'],
        `guardian-${i}`,
        'C',
      )
      for (const [party, values] of [
        [withParty, withRole],
        [withoutParty, withoutRole],
      ] as const) {
        const state = initializeExpeditionState(request, party)
        state.objectiveState = initializeRescueObjectiveState(request)
        const objective = state.objectiveState as RescueObjectiveState
        objective.located = true
        objective.reached = true
        const context = {
          request,
          party,
          state,
          rng: new SeededRng(request.seed),
          battleId: 'b1',
        } as unknown as ExpeditionExecutionContext
        resolveRescueBattleExposure(context, {
          outcome: 'costlyVictory',
          rounds: 12,
        } as BattleResult)
        values.push(objective.battleExposureDamage)
      }
    }
    expect(average(withRole)).toBeLessThan(average(withoutRole))
  })

  it('Ranger improves mobile target approach over 1000 trials', () => {
    const withRole: number[] = []
    const withoutRole: number[] = []
    for (let i = 0; i < 1000; i++) {
      const request = makeRescueRequest(
        `ranger-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 15,
          stabilizationDifficulty: 0,
          evacuationDifficulty: 0,
          mobility: 'mobile',
        },
        false,
        { features: [] },
      )
      const withParty = makeParty(
        ['ranger', 'healer', 'support', 'mage'],
        `ranger-${i}`,
        'C',
      )
      const withoutParty = makeParty(
        ['vanguard', 'healer', 'support', 'mage'],
        `ranger-${i}`,
        'C',
      )
      withRole.push(
        rescueState(runExpedition(request, withParty)).reached ? 1 : 0,
      )
      withoutRole.push(
        rescueState(runExpedition(request, withoutParty)).reached ? 1 : 0,
      )
    }
    expect(average(withRole)).toBeGreaterThan(average(withoutRole))
  })

  it('Vanguard improves immobile target evacuation over 1000 trials', () => {
    const withRole: number[] = []
    const withoutRole: number[] = []
    for (let i = 0; i < 1000; i++) {
      const request = makeRescueRequest(
        `vanguard-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          stabilizationDifficulty: 0,
          evacuationDifficulty: 15,
          mobility: 'immobile',
        },
        false,
        { features: [] },
      )
      const withParty = makeParty(
        ['ranger', 'healer', 'mage', 'vanguard'],
        `vanguard-${i}`,
        'C',
      )
      const withoutParty = makeParty(
        ['ranger', 'healer', 'mage', 'scout'],
        `vanguard-${i}`,
        'C',
      )
      withRole.push(
        rescueState(runExpedition(request, withParty)).evacuated ? 1 : 0,
      )
      withoutRole.push(
        rescueState(runExpedition(request, withoutParty)).evacuated ? 1 : 0,
      )
    }
    expect(average(withRole)).toBeGreaterThan(average(withoutRole))
  })

  it('Support improves assisted/immobile evacuation over 1000 trials', () => {
    const withRole: number[] = []
    const withoutRole: number[] = []
    for (let i = 0; i < 1000; i++) {
      const request = makeRescueRequest(
        `support-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          stabilizationDifficulty: 0,
          evacuationDifficulty: 15,
          mobility: 'assisted',
        },
        false,
        { features: [] },
      )
      const withParty = makeParty(
        ['ranger', 'healer', 'guardian', 'support'],
        `support-${i}`,
        'C',
      )
      const withoutParty = makeParty(
        ['ranger', 'healer', 'guardian', 'scout'],
        `support-${i}`,
        'C',
      )
      withRole.push(
        rescueState(runExpedition(request, withParty)).evacuated ? 1 : 0,
      )
      withoutRole.push(
        rescueState(runExpedition(request, withoutParty)).evacuated ? 1 : 0,
      )
    }
    expect(average(withRole)).toBeGreaterThan(average(withoutRole))
  })

  it('Mage improves magical environment access over 1000 trials', () => {
    const withRole: number[] = []
    const withoutRole: number[] = []
    for (let i = 0; i < 1000; i++) {
      const request = makeRescueRequest(
        `mage-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 15,
          stabilizationDifficulty: 0,
          evacuationDifficulty: 0,
        },
        false,
        { features: [], environment: 'magical' },
      )
      const withParty = makeParty(
        ['ranger', 'healer', 'guardian', 'mage'],
        `mage-${i}`,
        'C',
      )
      const withoutParty = makeParty(
        ['ranger', 'healer', 'guardian', 'vanguard'],
        `mage-${i}`,
        'C',
      )
      withRole.push(
        rescueState(runExpedition(request, withParty)).reached ? 1 : 0,
      )
      withoutRole.push(
        rescueState(runExpedition(request, withoutParty)).reached ? 1 : 0,
      )
    }
    expect(average(withRole)).toBeGreaterThan(average(withoutRole))
  })
})
