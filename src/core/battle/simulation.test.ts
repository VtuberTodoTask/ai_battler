import { describe, expect, it } from 'vitest'
import { runSimulation, type SimulationOptions } from './simulation.ts'

const baseOptions: SimulationOptions = {
  rank: 'C',
  difficulty: 'normal',
  count: 50,
  mode: 'fixed',
  roleMode: 'fixed',
}

describe('runSimulation', () => {
  it('固定対戦モードは同一設定で再現可能', () => {
    const a = runSimulation(baseOptions)
    const b = runSimulation(baseOptions)
    expect(a.outcomes).toEqual(b.outcomes)
    expect(a.avgRounds).toBe(b.avgRounds)
    expect(a.avgPartyThreat).toBe(b.avgPartyThreat)
    expect(a.avgEnemyThreat).toBe(b.avgEnemyThreat)
  })

  it('ランダム総合モードは試行ごとに異なるパーティと敵を生成する', () => {
    const summary = runSimulation({
      ...baseOptions,
      mode: 'random',
      roleMode: 'random',
    })
    const ids = new Set(summary.rawResults?.map((r) => r.seed))
    expect(ids.size).toBe(summary.count)
    expect(summary.avgEnemyCount).toBeGreaterThan(0)
    expect(summary.avgPartyThreat).toBeGreaterThan(0)

    const partyIds = new Set(summary.fingerprints.flatMap((f) => f.partyIds))
    const partyRoles = new Set(
      summary.fingerprints.flatMap((f) => f.partyRoles),
    )
    const enemyIds = new Set(summary.fingerprints.flatMap((f) => f.enemyIds))
    const compositions = new Set(
      summary.fingerprints.map((f) => f.enemyComposition),
    )
    expect(partyIds.size).toBeGreaterThan(1)
    expect(partyRoles.size).toBeGreaterThan(1)
    expect(enemyIds.size).toBeGreaterThan(1)
    expect(compositions.size).toBeGreaterThan(1)
  })

  it('固定対戦モードではpartyIdsとenemyIdsが全試行で同一で戦闘シードだけ異なる', () => {
    const summary = runSimulation({ ...baseOptions, count: 20 })
    const first = summary.fingerprints[0]
    for (let i = 1; i < summary.fingerprints.length; i++) {
      expect(summary.fingerprints[i].partyIds).toEqual(first.partyIds)
      expect(summary.fingerprints[i].enemyIds).toEqual(first.enemyIds)
      expect(summary.fingerprints[i].partyRoles).toEqual(first.partyRoles)
      expect(summary.fingerprints[i].enemyComposition).toBe(
        first.enemyComposition,
      )
    }
    const seeds = new Set(summary.rawResults?.map((r) => r.seed))
    expect(seeds.size).toBe(summary.count)
  })

  it('結果区分の合計が試行回数と一致する', () => {
    const summary = runSimulation({ ...baseOptions, count: 100 })
    const total = Object.values(summary.outcomes).reduce((a, b) => a + b, 0)
    expect(total).toBe(summary.count)
  })

  it('撤退理由別件数の合計が撤退判断回数と一致する', () => {
    const summary = runSimulation({ ...baseOptions, count: 100 })
    const retreatDecisions = Object.values(summary.retreatReasons).reduce(
      (sum, r) => sum + (r?.count ?? 0),
      0,
    )
    const retreatsFromOutcomes =
      summary.outcomes.retreat + summary.outcomes.partialVictory
    const retreatResults =
      summary.rawResults?.filter((r) => r.retreatDiagnostic).length ?? 0
    expect(retreatDecisions).toBe(retreatResults)
    expect(retreatResults).toBeGreaterThanOrEqual(0)
    if (retreatsFromOutcomes > 0) {
      expect(retreatDecisions).toBeGreaterThan(0)
    }
  })

  it('S級・Normal・固定対戦1000回の結果が記録される', () => {
    const summary = runSimulation({
      rank: 'S',
      difficulty: 'normal',
      count: 1000,
      mode: 'fixed',
      roleMode: 'fixed',
      seed: 'sim-S-normal',
    })
    expect(summary.count).toBe(1000)
    expect(Object.values(summary.outcomes).reduce((a, b) => a + b, 0)).toBe(
      1000,
    )
    expect(summary.avgRounds).toBeGreaterThan(0)
    expect(summary.avgEnemyCount).toBeGreaterThan(0)
  })

  it('診断集計に必要な項目が含まれる', () => {
    const summary = runSimulation({ ...baseOptions, count: 50 })
    expect(summary.avgRounds).toBeGreaterThan(0)
    expect(summary.avgEnemyCount).toBeGreaterThan(0)
    expect(summary.avgPartyThreat).toBeGreaterThan(0)
    expect(summary.avgEnemyThreat).toBeGreaterThan(0)
    expect(summary.contactResultStats).toBeDefined()
    expect(summary.enemyCompositionStats).toBeDefined()
    expect(summary.enemyAbilityStats).toBeDefined()
    expect(summary.fingerprints.length).toBe(summary.count)
    expect(summary.roleProposalRates).toBeDefined()
    expect(summary.retreatAttemptsByCount).toBeDefined()
  })
})
