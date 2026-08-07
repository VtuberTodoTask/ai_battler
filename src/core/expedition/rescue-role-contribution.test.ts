import { describe, expect, it, afterAll } from 'vitest'
import { writeFileSync } from 'node:fs'
import { initializeExpeditionState } from './state.ts'
import {
  initializeRescueObjectiveState,
  resolveRescueBattleExposure,
} from './objectives/rescue.ts'
import { runExpedition } from './expedition.ts'
import { makePairedParty, makeRescueRequest } from './test-utils.ts'
import { SeededRng } from '../rng/seededRng.ts'
import type {
  Adventurer,
  AdventurerRole,
  BattleResult,
} from '../models/types.ts'
import type {
  ExpeditionExecutionContext,
  ExpeditionRequest,
  ExpeditionResult,
  RescueObjectiveState,
} from './types.ts'

const TRIALS = 1000

interface RoleReport {
  role: string
  metric: string
  withRole: number
  withoutRole: number
  pairedDelta: number
  trials: number
}

const reports: RoleReport[] = []

function rescueState(result: ExpeditionResult): RescueObjectiveState {
  const obj = result.state.objectiveState
  expect(obj?.type).toBe('rescue')
  return obj as RescueObjectiveState
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function delta(withRole: number, withoutRole: number): number {
  return withRole - withoutRole
}

function makeRequestForTrial(
  role: string,
  i: number,
  targetOverrides?: Parameters<typeof makeRescueRequest>[2],
  requestOverrides?: Parameters<typeof makeRescueRequest>[4],
): ExpeditionRequest {
  return makeRescueRequest(
    `${role}-${i}`,
    'C',
    targetOverrides,
    false,
    requestOverrides,
  )
}

function swapRole(
  roles: AdventurerRole[],
  slot: number,
  newRole: AdventurerRole,
): AdventurerRole[] {
  return roles.map((r, i) => (i === slot ? newRole : r))
}

function runWithParties(
  request: ExpeditionRequest,
  baseParty: Adventurer[],
  variantParty: Adventurer[],
  metric: (result: ExpeditionResult) => number,
): { withValue: number; withoutValue: number } {
  const withResult = runExpedition(request, baseParty)
  const withoutResult = runExpedition(request, variantParty)
  return {
    withValue: metric(withResult),
    withoutValue: metric(withoutResult),
  }
}

describe('Rescue paired self-verification', () => {
  it('produces identical outcomes for identical role composition', () => {
    const baseRoles: AdventurerRole[] = [
      'scout',
      'healer',
      'guardian',
      'vanguard',
    ]
    for (let i = 0; i < TRIALS; i++) {
      const request1 = makeRequestForTrial('self', i, {
        locationKnown: false,
        discoveryDifficulty: 15,
        accessDifficulty: 15,
        stabilizationDifficulty: 15,
        evacuationDifficulty: 15,
      })
      const request2 = makeRequestForTrial('self', i, {
        locationKnown: false,
        discoveryDifficulty: 15,
        accessDifficulty: 15,
        stabilizationDifficulty: 15,
        evacuationDifficulty: 15,
      })
      const party = makePairedParty(baseRoles, `self-${i}`, 'C')
      const result1 = runExpedition(request1, party)
      const result2 = runExpedition(
        request2,
        makePairedParty(baseRoles, `self-${i}`, 'C'),
      )
      expect(result2.outcome).toBe(result1.outcome)
      expect(result2.state.objectiveState).toEqual(result1.state.objectiveState)
      expect(result2.state.logs).toEqual(result1.state.logs)
    }
  })
})

describe('Rescue role contribution statistics', () => {
  it('Scout improves discovery rate over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = [
      'scout',
      'healer',
      'guardian',
      'vanguard',
    ]
    const variantRoles = swapRole(baseRoles, 0, 'mage')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRequestForTrial('scout', i, {
        locationKnown: false,
        discoveryDifficulty: 15,
        accessDifficulty: 15,
        stabilizationDifficulty: 15,
        evacuationDifficulty: 15,
      })
      const baseParty = makePairedParty(baseRoles, `scout-${i}`, 'C')
      const variantParty = makePairedParty(variantRoles, `scout-${i}`, 'C')
      const { withValue, withoutValue } = runWithParties(
        request,
        baseParty,
        variantParty,
        (r) => (rescueState(r).located ? 1 : 0),
      )
      withValues.push(withValue)
      withoutValues.push(withoutValue)
    }
    const withAvg = average(withValues)
    const withoutAvg = average(withoutValues)
    reports.push({
      role: 'Scout',
      metric: '発見率',
      withRole: withAvg,
      withoutRole: withoutAvg,
      pairedDelta: delta(withAvg, withoutAvg),
      trials: TRIALS,
    })
    expect(withAvg).toBeGreaterThan(withoutAvg)
  })

  it('Healer improves stabilization rate over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = [
      'ranger',
      'healer',
      'guardian',
      'vanguard',
    ]
    const variantRoles = swapRole(baseRoles, 1, 'vanguard')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRequestForTrial('healer', i, {
        locationKnown: true,
        accessDifficulty: 0,
        stabilizationDifficulty: 15,
        evacuationDifficulty: 15,
      })
      const baseParty = makePairedParty(baseRoles, `healer-${i}`, 'C')
      const variantParty = makePairedParty(variantRoles, `healer-${i}`, 'C')
      const { withValue, withoutValue } = runWithParties(
        request,
        baseParty,
        variantParty,
        (r) => (rescueState(r).stabilized ? 1 : 0),
      )
      withValues.push(withValue)
      withoutValues.push(withoutValue)
    }
    const withAvg = average(withValues)
    const withoutAvg = average(withoutValues)
    reports.push({
      role: 'Healer',
      metric: '安定化率',
      withRole: withAvg,
      withoutRole: withoutAvg,
      pairedDelta: delta(withAvg, withoutAvg),
      trials: TRIALS,
    })
    expect(withAvg).toBeGreaterThan(withoutAvg)
  })

  it('Guardian reduces battle exposure damage over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = [
      'scout',
      'ranger',
      'healer',
      'guardian',
    ]
    const variantRoles = swapRole(baseRoles, 3, 'mage')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRequestForTrial('guardian', i, {
        locationKnown: true,
        accessDifficulty: 0,
        stabilizationDifficulty: 0,
        evacuationDifficulty: 0,
        maxHp: 100,
        initialHp: 100,
      })
      const baseParty = makePairedParty(baseRoles, `guardian-${i}`, 'C')
      const variantParty = makePairedParty(variantRoles, `guardian-${i}`, 'C')
      const withDamage = runGuardianTrial(request, baseParty)
      const withoutDamage = runGuardianTrial(request, variantParty)
      withValues.push(withDamage)
      withoutValues.push(withoutDamage)
    }
    const withAvg = average(withValues)
    const withoutAvg = average(withoutValues)
    reports.push({
      role: 'Guardian',
      metric: '戦闘被害平均',
      withRole: withAvg,
      withoutRole: withoutAvg,
      pairedDelta: delta(withAvg, withoutAvg),
      trials: TRIALS,
    })
    expect(withAvg).toBeLessThan(withoutAvg)
  })

  function runGuardianTrial(
    request: ExpeditionRequest,
    party: Adventurer[],
  ): number {
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
    return objective.battleExposureDamage
  }

  it('Ranger improves mobile target approach over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = [
      'ranger',
      'healer',
      'guardian',
      'vanguard',
    ]
    const variantRoles = swapRole(baseRoles, 0, 'mage')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRequestForTrial('ranger', i, {
        locationKnown: true,
        accessDifficulty: 15,
        stabilizationDifficulty: 0,
        evacuationDifficulty: 0,
        mobility: 'mobile',
      })
      const baseParty = makePairedParty(baseRoles, `ranger-${i}`, 'C')
      const variantParty = makePairedParty(variantRoles, `ranger-${i}`, 'C')
      const { withValue, withoutValue } = runWithParties(
        request,
        baseParty,
        variantParty,
        (r) => (rescueState(r).reached ? 1 : 0),
      )
      withValues.push(withValue)
      withoutValues.push(withoutValue)
    }
    const withAvg = average(withValues)
    const withoutAvg = average(withoutValues)
    reports.push({
      role: 'Ranger',
      metric: 'mobile到達率',
      withRole: withAvg,
      withoutRole: withoutAvg,
      pairedDelta: delta(withAvg, withoutAvg),
      trials: TRIALS,
    })
    expect(withAvg).toBeGreaterThan(withoutAvg)
  })

  it('Vanguard improves immobile target evacuation over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = ['ranger', 'healer', 'mage', 'vanguard']
    const variantRoles = swapRole(baseRoles, 3, 'scout')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRequestForTrial('vanguard', i, {
        locationKnown: true,
        accessDifficulty: 0,
        stabilizationDifficulty: 0,
        evacuationDifficulty: 15,
        mobility: 'immobile',
      })
      const baseParty = makePairedParty(baseRoles, `vanguard-${i}`, 'C')
      const variantParty = makePairedParty(variantRoles, `vanguard-${i}`, 'C')
      const { withValue, withoutValue } = runWithParties(
        request,
        baseParty,
        variantParty,
        (r) => (rescueState(r).evacuated ? 1 : 0),
      )
      withValues.push(withValue)
      withoutValues.push(withoutValue)
    }
    const withAvg = average(withValues)
    const withoutAvg = average(withoutValues)
    reports.push({
      role: 'Vanguard',
      metric: 'immobile搬出率',
      withRole: withAvg,
      withoutRole: withoutAvg,
      pairedDelta: delta(withAvg, withoutAvg),
      trials: TRIALS,
    })
    expect(withAvg).toBeGreaterThan(withoutAvg)
  })

  it('Support improves assisted target evacuation over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = [
      'ranger',
      'healer',
      'guardian',
      'support',
    ]
    const variantRoles = swapRole(baseRoles, 3, 'scout')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRequestForTrial('support', i, {
        locationKnown: true,
        accessDifficulty: 0,
        stabilizationDifficulty: 0,
        evacuationDifficulty: 15,
        mobility: 'assisted',
      })
      const baseParty = makePairedParty(baseRoles, `support-${i}`, 'C')
      const variantParty = makePairedParty(variantRoles, `support-${i}`, 'C')
      const { withValue, withoutValue } = runWithParties(
        request,
        baseParty,
        variantParty,
        (r) => (rescueState(r).evacuated ? 1 : 0),
      )
      withValues.push(withValue)
      withoutValues.push(withoutValue)
    }
    const withAvg = average(withValues)
    const withoutAvg = average(withoutValues)
    reports.push({
      role: 'Support',
      metric: 'assisted搬出率',
      withRole: withAvg,
      withoutRole: withoutAvg,
      pairedDelta: delta(withAvg, withoutAvg),
      trials: TRIALS,
    })
    expect(withAvg).toBeGreaterThan(withoutAvg)
  })

  it('Mage improves magical environment access over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = ['ranger', 'healer', 'guardian', 'mage']
    const variantRoles = swapRole(baseRoles, 3, 'vanguard')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRequestForTrial(
        'mage',
        i,
        {
          locationKnown: true,
          accessDifficulty: 15,
          stabilizationDifficulty: 0,
          evacuationDifficulty: 0,
        },
        { environment: 'magical' },
      )
      const baseParty = makePairedParty(baseRoles, `mage-${i}`, 'C')
      const variantParty = makePairedParty(variantRoles, `mage-${i}`, 'C')
      const { withValue, withoutValue } = runWithParties(
        request,
        baseParty,
        variantParty,
        (r) => (rescueState(r).reached ? 1 : 0),
      )
      withValues.push(withValue)
      withoutValues.push(withoutValue)
    }
    const withAvg = average(withValues)
    const withoutAvg = average(withoutValues)
    reports.push({
      role: 'Mage',
      metric: 'magical環境到達率',
      withRole: withAvg,
      withoutRole: withoutAvg,
      pairedDelta: delta(withAvg, withoutAvg),
      trials: TRIALS,
    })
    expect(withAvg).toBeGreaterThan(withoutAvg)
  })

  afterAll(() => {
    if (reports.length === 0) return
    const lines: string[] = [
      '# Phase 3.3.1 救出役割寄与レポート',
      '',
      '各役割の有無を比較した paired 実験結果（各 1000 試行）。',
      '',
      '| 役割 | 指標 | withRole | withoutRole | pairedDelta | 試行数 |',
      '|------|------|----------|-------------|-------------|--------|',
    ]
    for (const r of reports) {
      const withVal = r.withRole.toFixed(4)
      const withoutVal = r.withoutRole.toFixed(4)
      const d = r.pairedDelta.toFixed(4)
      lines.push(
        `| ${r.role} | ${r.metric} | ${withVal} | ${withoutVal} | ${d} | ${r.trials} |`,
      )
    }
    lines.push('')
    writeFileSync('PHASE3_3_REPORT.md', lines.join('\n'), 'utf-8')
  })
})
