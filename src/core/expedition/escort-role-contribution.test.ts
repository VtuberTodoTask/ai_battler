import { describe, expect, it, afterAll } from 'vitest'
import { writeFileSync } from 'node:fs'
import * as prettier from 'prettier'
import { initializeExpeditionState } from './state.ts'
import {
  assignEscortProtector,
  resolveEscortBattleExposure,
  runEscortCare,
  runEscortDeparture,
  runEscortHandoff,
  runEscortRoute,
  initializeEscortObjectiveState,
} from './objectives/escort.ts'
import { runExpedition } from './expedition.ts'
import { makeEscortRequest, makePairedParty } from './test-utils.ts'
import { SeededRng } from '../rng/seededRng.ts'
import type {
  Adventurer,
  AdventurerRole,
  BattleResult,
} from '../models/types.ts'
import type {
  EscortObjectiveState,
  ExpeditionBattleRecord,
  ExpeditionBattleResolvedContext,
  ExpeditionExecutionContext,
  ExpeditionRequest,
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

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function delta(withRole: number, withoutRole: number): number {
  return withRole - withoutRole
}

function swapRole(
  roles: AdventurerRole[],
  slot: number,
  newRole: AdventurerRole,
): AdventurerRole[] {
  return roles.map((r, i) => (i === slot ? newRole : r))
}

function makeEscortContextForTrial(
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
  state.objectiveState = initializeEscortObjectiveState(request)
  return {
    request,
    party,
    state,
    rng: new SeededRng(request.seed),
  }
}

function runDeliveryTrial(
  request: ExpeditionRequest,
  party: Adventurer[],
): boolean {
  const context = makeEscortContextForTrial(request, party)
  runEscortDeparture(context)
  const objective = context.state.objectiveState as EscortObjectiveState
  if (objective.currentHp <= 0) return false
  runEscortRoute(context, 1)
  if (objective.currentHp <= 0) return false
  runEscortRoute(context, 2)
  if (objective.currentHp <= 0) return false
  if (objective.routeProgress >= 100) {
    objective.destinationReached = true
    runEscortHandoff(context)
  }
  return objective.delivered
}

function runCareTrial(request: ExpeditionRequest, party: Adventurer[]): number {
  const context = makeEscortContextForTrial(request, party)
  const objective = context.state.objectiveState as EscortObjectiveState
  objective.currentHp = 10
  objective.statusEffects = [
    { type: 'bleeding', duration: 3, sourceId: 'test' },
  ]
  runEscortCare(context)
  return objective.currentHp
}

function runBattleExposureTrial(
  request: ExpeditionRequest,
  party: Adventurer[],
): number {
  const baseContext = makeEscortContextForTrial(request, party)
  const objective = baseContext.state.objectiveState as EscortObjectiveState
  objective.accompanying = true
  objective.currentHp = objective.maxHp
  baseContext.state.battles.push({
    id: 'b1',
  } as ExpeditionBattleRecord)
  assignEscortProtector(baseContext)
  const resolvedContext = {
    ...baseContext,
    battleId: 'b1',
    battleResult: {
      outcome: 'costlyVictory',
      rounds: 12,
    } as unknown as BattleResult,
    battleRecord: baseContext.state.battles[0],
    initialEnemyIds: [] as string[],
  }
  resolveEscortBattleExposure(
    resolvedContext as ExpeditionBattleResolvedContext,
  )
  return objective.battleExposureDamage
}

function runHandoffTrial(
  request: ExpeditionRequest,
  party: Adventurer[],
): boolean {
  const context = makeEscortContextForTrial(request, party)
  const objective = context.state.objectiveState as EscortObjectiveState
  objective.destinationReached = true
  runEscortDeparture(context)
  runEscortHandoff(context)
  return objective.delivered
}

describe('Escort paired self-verification', () => {
  it('produces identical outcomes for identical role composition', () => {
    const baseRoles: AdventurerRole[] = ['support', 'ranger', 'mage', 'healer']
    for (let i = 0; i < TRIALS; i++) {
      const request = makeEscortRequest(
        `self-${i}`,
        'C',
        {
          routeDifficulty: 15,
          coordinationDifficulty: 15,
          careDifficulty: 15,
        },
        { handoffRequirement: 'standard', handoffDifficulty: 15 },
        false,
        { environment: 'forest', features: [] },
      )
      const party = makePairedParty(baseRoles, `self-${i}`, 'C')
      const result1 = runExpedition(request, party)
      const result2 = runExpedition(
        request,
        makePairedParty(baseRoles, `self-${i}`, 'C'),
      )
      expect(result2.outcome).toBe(result1.outcome)
      expect(result2.state.objectiveState).toEqual(result1.state.objectiveState)
      expect(result2.state.logs).toEqual(result1.state.logs)
    }
  })
})

describe('Escort role contribution statistics', () => {
  it('Scout improves cave route delivery over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = [
      'support',
      'healer',
      'guardian',
      'mage',
    ]
    const withRoles = swapRole(baseRoles, 3, 'scout')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeEscortRequest(
        `scout-${i}`,
        'C',
        {
          routeDifficulty: 20,
          coordinationDifficulty: 5,
          careDifficulty: 15,
        },
        { handoffRequirement: 'none', handoffDifficulty: 0 },
        false,
        { environment: 'cave', features: [] },
      )
      const withoutParty = makePairedParty(baseRoles, `scout-${i}`, 'C')
      const withParty = makePairedParty(withRoles, `scout-${i}`, 'C')
      withValues.push(runDeliveryTrial(request, withParty) ? 1 : 0)
      withoutValues.push(runDeliveryTrial(request, withoutParty) ? 1 : 0)
    }
    const withAvg = average(withValues)
    const withoutAvg = average(withoutValues)
    reports.push({
      role: 'Scout',
      metric: 'cave到達率',
      withRole: withAvg,
      withoutRole: withoutAvg,
      pairedDelta: delta(withAvg, withoutAvg),
      trials: TRIALS,
    })
    expect(withAvg).toBeGreaterThan(withoutAvg)
  })

  it('Ranger improves forest route delivery over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = [
      'support',
      'healer',
      'guardian',
      'mage',
    ]
    const withRoles = swapRole(baseRoles, 3, 'ranger')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeEscortRequest(
        `ranger-${i}`,
        'C',
        {
          routeDifficulty: 20,
          coordinationDifficulty: 5,
          careDifficulty: 15,
        },
        { handoffRequirement: 'none', handoffDifficulty: 0 },
        false,
        { environment: 'forest', features: [] },
      )
      const withoutParty = makePairedParty(baseRoles, `ranger-${i}`, 'C')
      const withParty = makePairedParty(withRoles, `ranger-${i}`, 'C')
      withValues.push(runDeliveryTrial(request, withParty) ? 1 : 0)
      withoutValues.push(runDeliveryTrial(request, withoutParty) ? 1 : 0)
    }
    const withAvg = average(withValues)
    const withoutAvg = average(withoutValues)
    reports.push({
      role: 'Ranger',
      metric: 'forest到達率',
      withRole: withAvg,
      withoutRole: withoutAvg,
      pairedDelta: delta(withAvg, withoutAvg),
      trials: TRIALS,
    })
    expect(withAvg).toBeGreaterThan(withoutAvg)
  })

  it('Mage improves magical route delivery over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = [
      'support',
      'healer',
      'guardian',
      'vanguard',
    ]
    const withRoles = swapRole(baseRoles, 3, 'mage')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeEscortRequest(
        `mage-${i}`,
        'C',
        {
          routeDifficulty: 20,
          coordinationDifficulty: 5,
          careDifficulty: 15,
        },
        { handoffRequirement: 'none', handoffDifficulty: 0 },
        false,
        { environment: 'magical', features: [] },
      )
      const withoutParty = makePairedParty(baseRoles, `mage-${i}`, 'C')
      const withParty = makePairedParty(withRoles, `mage-${i}`, 'C')
      withValues.push(runDeliveryTrial(request, withParty) ? 1 : 0)
      withoutValues.push(runDeliveryTrial(request, withoutParty) ? 1 : 0)
    }
    const withAvg = average(withValues)
    const withoutAvg = average(withoutValues)
    reports.push({
      role: 'Mage',
      metric: 'magical到達率',
      withRole: withAvg,
      withoutRole: withoutAvg,
      pairedDelta: delta(withAvg, withoutAvg),
      trials: TRIALS,
    })
    expect(withAvg).toBeGreaterThan(withoutAvg)
  })

  it('Vanguard improves immobile route delivery over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = ['support', 'ranger', 'healer', 'mage']
    const withRoles = swapRole(baseRoles, 3, 'vanguard')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeEscortRequest(
        `vanguard-${i}`,
        'C',
        {
          routeDifficulty: 25,
          coordinationDifficulty: 5,
          careDifficulty: 15,
          mobility: 'immobile',
        },
        { handoffRequirement: 'none', handoffDifficulty: 0 },
        false,
        { environment: 'forest', features: [] },
      )
      const withoutParty = makePairedParty(baseRoles, `vanguard-${i}`, 'C')
      const withParty = makePairedParty(withRoles, `vanguard-${i}`, 'C')
      withValues.push(runDeliveryTrial(request, withParty) ? 1 : 0)
      withoutValues.push(runDeliveryTrial(request, withoutParty) ? 1 : 0)
    }
    const withAvg = average(withValues)
    const withoutAvg = average(withoutValues)
    reports.push({
      role: 'Vanguard',
      metric: 'immobile到達率',
      withRole: withAvg,
      withoutRole: withoutAvg,
      pairedDelta: delta(withAvg, withoutAvg),
      trials: TRIALS,
    })
    expect(withAvg).toBeGreaterThan(withoutAvg)
  })

  it('Support improves handoff success over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = [
      'ranger',
      'scout',
      'healer',
      'guardian',
    ]
    const withRoles = swapRole(baseRoles, 0, 'support')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeEscortRequest(
        `support-${i}`,
        'C',
        {
          routeDifficulty: 1,
          coordinationDifficulty: 1,
          careDifficulty: 15,
        },
        { handoffRequirement: 'standard', handoffDifficulty: 15 },
        false,
        { features: [] },
      )
      const withoutParty = makePairedParty(baseRoles, `support-${i}`, 'C')
      const withParty = makePairedParty(withRoles, `support-${i}`, 'C')
      withValues.push(runHandoffTrial(request, withParty) ? 1 : 0)
      withoutValues.push(runHandoffTrial(request, withoutParty) ? 1 : 0)
    }
    const withAvg = average(withValues)
    const withoutAvg = average(withoutValues)
    reports.push({
      role: 'Support',
      metric: '引き渡し成功率',
      withRole: withAvg,
      withoutRole: withoutAvg,
      pairedDelta: delta(withAvg, withoutAvg),
      trials: TRIALS,
    })
    expect(withAvg).toBeGreaterThan(withoutAvg)
  })

  it('Guardian reduces escort battle exposure damage over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = ['support', 'ranger', 'healer', 'mage']
    const withRoles = swapRole(baseRoles, 0, 'guardian')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeEscortRequest(
        `guardian-${i}`,
        'C',
        {
          routeDifficulty: 15,
          coordinationDifficulty: 15,
          protectionDifficulty: 15,
          careDifficulty: 15,
          maxHp: 100,
          initialHp: 100,
        },
        { handoffRequirement: 'none', handoffDifficulty: 0 },
        true,
        { features: [] },
      )
      const withoutParty = makePairedParty(baseRoles, `guardian-${i}`, 'C')
      const withParty = makePairedParty(withRoles, `guardian-${i}`, 'C')
      withValues.push(runBattleExposureTrial(request, withParty))
      withoutValues.push(runBattleExposureTrial(request, withoutParty))
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

  it('Healer improves care recovery over 1000 trials', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    const baseRoles: AdventurerRole[] = [
      'ranger',
      'guardian',
      'vanguard',
      'mage',
    ]
    const withRoles = swapRole(baseRoles, 0, 'healer')
    for (let i = 0; i < TRIALS; i++) {
      const request = makeEscortRequest(
        `healer-${i}`,
        'C',
        {
          routeDifficulty: 15,
          coordinationDifficulty: 15,
          careDifficulty: 15,
        },
        { handoffRequirement: 'none', handoffDifficulty: 0 },
        false,
        { features: [] },
      )
      const withoutParty = makePairedParty(baseRoles, `healer-${i}`, 'C')
      const withParty = makePairedParty(withRoles, `healer-${i}`, 'C')
      withValues.push(runCareTrial(request, withParty))
      withoutValues.push(runCareTrial(request, withoutParty))
    }
    const withAvg = average(withValues)
    const withoutAvg = average(withoutValues)
    reports.push({
      role: 'Healer',
      metric: '治療回復量平均',
      withRole: withAvg,
      withoutRole: withoutAvg,
      pairedDelta: delta(withAvg, withoutAvg),
      trials: TRIALS,
    })
    expect(withAvg).toBeGreaterThan(withoutAvg)
  })

  afterAll(async () => {
    if (reports.length === 0) return
    const lines: string[] = [
      '# Phase 3.4 護衛役割寄与レポート',
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
    const config = await prettier.resolveConfig('PHASE3_4_ROLE_CONTRIBUTION.md')
    const formatted = await prettier.format(lines.join('\n'), {
      ...config,
      parser: 'markdown',
    })
    writeFileSync('PHASE3_4_ROLE_CONTRIBUTION.md', formatted, 'utf-8')
  })
})
