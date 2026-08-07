import { afterAll, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import * as prettier from 'prettier'
import { runExpedition } from './expedition.ts'
import { initializeExpeditionState } from './state.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { makePairedParty, makeRetrievalRequest } from './test-utils.ts'
import type {
  Adventurer,
  AdventurerRole,
  BattleResult,
} from '../models/types.ts'
import type {
  ExpeditionBattleRecord,
  ExpeditionBattleResolvedContext,
  ExpeditionExecutionContext,
  ExpeditionRequest,
  RetrievalObjectiveState,
} from './types.ts'
import {
  getRetrievalObjective,
  initializeRetrievalObjectiveState,
  resolveRetrievalBattleExposure,
} from './objectives/retrieval.ts'

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

function swapRole(
  roles: AdventurerRole[],
  slot: number,
  newRole: AdventurerRole,
): AdventurerRole[] {
  return roles.map((r, i) => (i === slot ? newRole : r))
}

function retrievalState(
  result: ReturnType<typeof runExpedition>,
): RetrievalObjectiveState {
  return result.state.objectiveState as RetrievalObjectiveState
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

describe('Retrieval paired self-verification', () => {
  it('produces identical outcomes for identical role composition', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'mage',
      'healer',
    ]
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `self-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 0,
          initialIntegrity: 100,
          minimumAcceptableIntegrity: 80,
        },
        false,
        { features: [] },
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

describe('Retrieval role contribution statistics', () => {
  it('Scout improves discovery rate', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'mage',
      'support',
    ]
    const withRoles = swapRole(baseRoles, 3, 'scout')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `scout-${i}`,
        'C',
        { locationKnown: false, discoveryDifficulty: 15 },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `scout-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `scout-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(retrievalState(withResult).located ? 1 : 0)
      withoutValues.push(retrievalState(withoutResult).located ? 1 : 0)
    }
    reports.push({
      role: 'Scout',
      metric: '発見率',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Ranger improves portable extraction rate', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'mage',
      'support',
    ]
    const withRoles = swapRole(baseRoles, 3, 'ranger')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `ranger-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 25,
          bulk: 'portable',
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `ranger-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `ranger-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(retrievalState(withResult).extracted ? 1 : 0)
      withoutValues.push(retrievalState(withoutResult).extracted ? 1 : 0)
    }
    reports.push({
      role: 'Ranger',
      metric: '搬出率（portable）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Mage improves magical environment access rate', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'ranger',
      'support',
    ]
    const withRoles = swapRole(baseRoles, 3, 'mage')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `mage-${i}`,
        'C',
        { locationKnown: true, accessDifficulty: 20 },
        false,
        { environment: 'magical', features: [] },
      )
      const withParty = makePairedParty(withRoles, `mage-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `mage-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(retrievalState(withResult).reached ? 1 : 0)
      withoutValues.push(retrievalState(withoutResult).reached ? 1 : 0)
    }
    reports.push({
      role: 'Mage',
      metric: 'magical環境到達率',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Support improves standard securing rate', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'mage',
      'healer',
    ]
    const withRoles = swapRole(baseRoles, 3, 'support')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `support-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 25,
          handling: 'standard',
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `support-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `support-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(retrievalState(withResult).secured ? 1 : 0)
      withoutValues.push(retrievalState(withoutResult).secured ? 1 : 0)
    }
    reports.push({
      role: 'Support',
      metric: '確保率（standard）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Vanguard improves heavy extraction rate', () => {
    const baseRoles: AdventurerRole[] = ['ranger', 'guardian', 'mage', 'healer']
    const withRoles = swapRole(baseRoles, 3, 'vanguard')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `vanguard-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 25,
          bulk: 'heavy',
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `vanguard-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `vanguard-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(retrievalState(withResult).extracted ? 1 : 0)
      withoutValues.push(retrievalState(withoutResult).extracted ? 1 : 0)
    }
    reports.push({
      role: 'Vanguard',
      metric: '搬出率（heavy）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Guardian reduces battle exposure damage', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'ranger',
      'mage',
      'support',
    ]
    const withRoles = swapRole(baseRoles, 3, 'guardian')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `guardian-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 0,
          protectionDifficulty: 15,
          fragility: 'standard',
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `guardian-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `guardian-${i}`, 'C')

      const withContext = makeRetrievalContext(request, withParty)
      const withObj = getRetrievalObjective(withContext.state)
      withObj.reached = true
      const withResolved: ExpeditionBattleResolvedContext = {
        ...withContext,
        battleId: 'b1',
        battleResult: {
          outcome: 'costlyVictory',
          rounds: 12,
        } as BattleResult,
        battleRecord: { id: 'b1' } as unknown as ExpeditionBattleRecord,
        initialEnemyIds: [],
      }
      resolveRetrievalBattleExposure(withResolved)

      const withoutContext = makeRetrievalContext(request, withoutParty)
      const withoutObj = getRetrievalObjective(withoutContext.state)
      withoutObj.reached = true
      const withoutResolved: ExpeditionBattleResolvedContext = {
        ...withoutContext,
        battleId: 'b1',
        battleResult: {
          outcome: 'costlyVictory',
          rounds: 12,
        } as BattleResult,
        battleRecord: { id: 'b1' } as unknown as ExpeditionBattleRecord,
        initialEnemyIds: [],
      }
      resolveRetrievalBattleExposure(withoutResolved)

      withValues.push(withObj.battleExposureDamage)
      withoutValues.push(withoutObj.battleExposureDamage)
    }
    reports.push({
      role: 'Guardian',
      metric: '戦闘余波ダメージ平均',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeLessThan(average(withoutValues))
  })

  it('Healer shows no significant contribution to retrieval outcomes', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'ranger',
      'support',
    ]
    const withRoles = swapRole(baseRoles, 3, 'healer')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeRetrievalRequest(
        `healer-${i}`,
        'C',
        {
          locationKnown: true,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 0,
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `healer-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `healer-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(withResult.outcome === 'completeSuccess' ? 1 : 0)
      withoutValues.push(withoutResult.outcome === 'completeSuccess' ? 1 : 0)
    }
    reports.push({
      role: 'Healer',
      metric: 'completeSuccess率（負の対照）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
  })
})

afterAll(async () => {
  const table = reports
    .map(
      (r) =>
        `| ${r.role} | ${r.metric} | ${r.withRole.toFixed(3)} | ${r.withoutRole.toFixed(3)} | ${r.pairedDelta >= 0 ? '+' : ''}${r.pairedDelta.toFixed(3)} | ${r.trials} |`,
    )
    .join('\n')
  const report = `# Phase 3.5 回収依頼（retrieval）ロール寄与レポート

| role | metric | withRole | withoutRole | paired delta | trials |
|---|---|---|---|---|---|
${table}
`
  const formatted = await prettier.format(report, { parser: 'markdown' })
  writeFileSync('/home/ubuntu/repos/ai_battler/PHASE3_5_REPORT.md', formatted)
})
