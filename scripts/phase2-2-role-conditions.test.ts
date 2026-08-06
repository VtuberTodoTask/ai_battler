import { describe, expect, it } from 'vitest'
import type { ExperimentResult } from './phase2-2-role-conditions.ts'
import {
  calculateRoleContributionDelta,
  determineRolePresentSide,
  roleSpecificMetrics,
  specificValue,
} from './phase2-2-role-conditions.ts'

function makeSpecific(overrides: Record<string, unknown> = {}) {
  return {
    contactSuccesses: 0,
    firstStrikes: 0,
    initialDamage: 0,
    weaknessDiscoveries: 0,
    featureDamage: 0,
    featureDefeatRounds: 0,
    featureDefeatCount: 0,
    controllerDefeatRounds: 0,
    controllerDefeatCount: 0,
    actualDamagePrevented: 0,
    actualDamagePreventedByGuardian: 0,
    actualDamagePreventedBySupport: 0,
    preventedIncapacitations: 0,
    preventedIncapacitationsByGuardian: 0,
    redirectedAttackCount: 0,
    healerMpSavedEstimate: 0,
    guardTargetRoleCounts: {},
    guardTargetRoleCountsByGuardian: {},
    guardTargetRoleCountsBySupport: {},
    moraleGained: 0,
    leaderTargetFollowCount: 0,
    focusFireContribution: 0,
    healAmount: 0,
    statusCured: 0,
    healerMpUsed: 0,
    healerMaxMp: 0,
    healerCount: 0,
    ...overrides,
  }
}

function makeOverall(overrides: Record<string, unknown> = {}) {
  return {
    trials: 1,
    victories: 0,
    retreats: 0,
    defeats: 0,
    totalLosses: 0,
    stalemates: 0,
    avgRounds: 0,
    contactFailures: 0,
    avgPartyDamage: 0,
    avgEnemyDamage: 0,
    avgInjuries: 0,
    ...overrides,
  }
}

function makeExp(overrides: Partial<ExperimentResult> = {}): ExperimentResult {
  return {
    role: 'vanguard',
    replacement: 'test',
    condition: 'flying',
    rolePresentSide: 'variant',
    roleCountDelta: 1,
    roleContributionDelta: 0,
    baseOverall: makeOverall(),
    variantOverall: makeOverall(),
    baseSpecific: makeSpecific(),
    variantSpecific: makeSpecific(),
    summary: {
      baseRate: 0.5,
      variantRate: 0.6,
      diff: 0.1,
      ci: { lower: 0.05, upper: 0.15, mean: 0.1 },
      baseWinVariantLoss: 100,
      baseLossVariantWin: 200,
    },
    suitability: {
      combatOutcomeDelta: 0,
      contactSuccessDelta: 0,
      informationGainDelta: 0,
      injuryReductionDelta: 0,
      retreatReductionDelta: 0,
      objectiveUtilityDelta: 0,
    },
    ...overrides,
  } as ExperimentResult
}

describe('role present side and contribution sign', () => {
  it('対象ロールがvariant側のとき、正のraw差分が正のロール寄与になる', () => {
    expect(calculateRoleContributionDelta('variant', 0.5, 0.7)).toBeCloseTo(0.2)
  })

  it('対象ロールがbase側のとき、負のraw差分が正のロール寄与になる', () => {
    expect(calculateRoleContributionDelta('base', 0.7, 0.5)).toBeCloseTo(0.2)
  })

  it('RangerとScoutの符号が正しく処理される', () => {
    expect(
      determineRolePresentSide(
        ['vanguard', 'guardian', 'mage', 'healer'],
        ['vanguard', 'guardian', 'ranger', 'healer'],
        'ranger',
      ),
    ).toBe('variant')
    expect(
      determineRolePresentSide(
        ['vanguard', 'guardian', 'mage', 'healer'],
        ['scout', 'guardian', 'mage', 'healer'],
        'scout',
      ),
    ).toBe('variant')
  })

  it('GuardianとHealerはbase側に存在する', () => {
    expect(
      determineRolePresentSide(
        ['vanguard', 'guardian', 'mage', 'healer'],
        ['vanguard', 'vanguard', 'mage', 'healer'],
        'guardian',
      ),
    ).toBe('base')
    expect(
      determineRolePresentSide(
        ['vanguard', 'guardian', 'mage', 'healer'],
        ['vanguard', 'guardian', 'mage', 'vanguard'],
        'healer',
      ),
    ).toBe('base')
  })

  it('両側に対象ロールが存在する実験は分類エラー', () => {
    expect(() =>
      determineRolePresentSide(
        ['vanguard', 'guardian', 'healer', 'support'],
        ['vanguard', 'guardian', 'healer', 'support'],
        'support',
      ),
    ).toThrow()
  })

  it('どちら側にも対象ロールが存在しない実験は分類エラー', () => {
    expect(() =>
      determineRolePresentSide(
        ['vanguard', 'guardian', 'mage', 'healer'],
        ['vanguard', 'guardian', 'mage', 'healer'],
        'support',
      ),
    ).toThrow()
  })
})

describe('role-specific metrics selection', () => {
  it('Guardian追加表がbaseSpecificを参照する', () => {
    const exp = makeExp({
      role: 'guardian',
      rolePresentSide: 'base',
      baseSpecific: makeSpecific({
        actualDamagePreventedByGuardian: 99,
        preventedIncapacitationsByGuardian: 11,
      }),
      variantSpecific: makeSpecific({
        actualDamagePreventedByGuardian: 1,
        preventedIncapacitationsByGuardian: 1,
      }),
    })
    expect(roleSpecificMetrics(exp).actualDamagePreventedByGuardian).toBe(99)
    expect(specificValue(exp, 'actualDamagePrevented')).toBe('99.000')
    expect(specificValue(exp, 'preventedIncapacitations')).toBe('11.000')
  })

  it('Support不在側の値をSupport固有指標として表示しない', () => {
    const exp = makeExp({
      role: 'support',
      rolePresentSide: 'base',
      baseSpecific: makeSpecific({
        moraleGained: 3,
        leaderTargetFollowCount: 1,
        focusFireContribution: 2,
        actualDamagePreventedBySupport: 0,
      }),
      variantSpecific: makeSpecific({
        moraleGained: 999,
        leaderTargetFollowCount: 999,
        focusFireContribution: 999,
        actualDamagePreventedBySupport: 999,
      }),
      baseOverall: makeOverall({ retreats: 100 }),
      variantOverall: makeOverall({ retreats: 150 }),
    })
    expect(specificValue(exp, 'moraleGained')).toBe('3.000')
    expect(specificValue(exp, 'actualDamagePrevented')).toBe('0.000')

    const leader = specificValue(exp, 'leaderTargetFollowCount')
    expect(leader).toContain('1.000')
    expect(leader).toContain('パーティ全体値')
    expect(leader).not.toContain('999')

    const focus = specificValue(exp, 'focusFireContribution')
    expect(focus).toContain('2.000')
    expect(focus).toContain('パーティ全体値')
    expect(focus).not.toContain('999')

    const retreat = specificValue(exp, 'retreatChanceReduction')
    expect(retreat).toContain('パーティ全体値')
  })
})
