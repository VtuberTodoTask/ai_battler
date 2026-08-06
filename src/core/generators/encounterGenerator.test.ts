import { describe, expect, it } from 'vitest'
import { generateAdventurers } from './adventurerGenerator.ts'
import {
  actionEconomyMultiplier,
  calculatePartyThreat,
  effectiveEncounterThreat,
  generateEncounter,
} from './encounterGenerator.ts'
import type { EncounterShape } from '../models/types.ts'
import {
  ADVENTURER_THREAT,
  DIFFICULTY_BUDGET_MULTIPLIER,
} from '../balance/constants.ts'

function party(rank: 'E' | 'D' | 'C' | 'B' | 'A' | 'S' = 'C') {
  return generateAdventurers({ seed: 'enc-party', count: 4, rank })
}

describe('generateEncounter', () => {
  it('難易度別に有効脅威予算の0.8～1.2倍に収まる', () => {
    for (let i = 0; i < 200; i++) {
      const p = party('C')
      const threat = calculatePartyThreat(p)
      const difficulty = (['easy', 'normal', 'hard', 'deadly'] as const)[i % 4]
      const enemies = generateEncounter({
        seed: `enc-${i}`,
        partyThreat: threat,
        difficulty,
        partySize: 4,
      })
      const rawThreat = enemies.reduce((sum, e) => sum + e.threatCost, 0)
      const budget = threat * DIFFICULTY_BUDGET_MULTIPLIER[difficulty]
      const effective = effectiveEncounterThreat(rawThreat, enemies.length, 4)
      if (budget >= 1) {
        expect(effective).toBeGreaterThanOrEqual(budget * 0.8)
        expect(effective).toBeLessThanOrEqual(budget * 1.2)
      }
      expect(
        enemies.filter((e) => e.tier === 'boss').length,
      ).toBeLessThanOrEqual(1)
    }
  })

  it('指定した形状の敵数が等級に関係なく固定される', () => {
    const shapes: EncounterShape[] = ['standard', 'eliteGroup', 'swarm', 'boss']
    const expected: Record<(typeof shapes)[number], number> = {
      standard: 4,
      eliteGroup: 4,
      swarm: 7,
      boss: 4,
    }
    for (const rank of ['E', 'D', 'C', 'B', 'A', 'S'] as const) {
      for (const shape of shapes) {
        for (let i = 0; i < 50; i++) {
          const p = party(rank)
          const enemies = generateEncounter({
            seed: `count-${rank}-${shape}-${i}`,
            partyThreat: calculatePartyThreat(p),
            difficulty: 'normal',
            shape,
            partySize: 4,
          })
          expect(enemies.length).toBe(expected[shape])
        }
      }
    }
  })

  it('全等級でNormalの平均敵数が等級間で一致する', () => {
    const countsByRank: number[] = []
    const trials = 200
    for (const rank of ['E', 'D', 'C', 'B', 'A', 'S'] as const) {
      let total = 0
      for (let i = 0; i < trials; i++) {
        const p = party(rank)
        const enemies = generateEncounter({
          seed: `avg-${rank}-${i}`,
          planSeed: `avg-plan-${i}`,
          partyThreat: calculatePartyThreat(p),
          difficulty: 'normal',
          partySize: 4,
        })
        total += enemies.length
      }
      countsByRank.push(total / trials)
    }
    expect(new Set(countsByRank).size).toBe(1)
  })

  it('bossAllowed=false の場合、1000 編成にボスが 0 体', () => {
    for (let i = 0; i < 1000; i++) {
      const p = generateAdventurers({
        seed: `boss-false-party-${i}`,
        count: 4,
      })
      const threat = calculatePartyThreat(p)
      const difficulty = (['easy', 'normal', 'hard', 'deadly'] as const)[i % 4]
      const enemies = generateEncounter({
        seed: `boss-false-${i}`,
        partyThreat: threat,
        difficulty,
        bossAllowed: false,
        partySize: 4,
      })
      expect(enemies.some((e) => e.tier === 'boss')).toBe(false)
    }
  })

  it('同一シードで遭遇生成結果が再現される', () => {
    const p = party('C')
    const threat = calculatePartyThreat(p)
    const options = {
      seed: 'rep-seed',
      partyThreat: threat,
      difficulty: 'normal' as const,
      partySize: 4,
    }
    const first = generateEncounter(options)
    const second = generateEncounter(options)
    expect(first.map((e) => e.id)).toEqual(second.map((e) => e.id))
  })

  it('1 編成内のすべての敵 ID が一意である', () => {
    for (let i = 0; i < 1000; i++) {
      const p = generateAdventurers({
        seed: `unique-party-${i}`,
        count: 4,
      })
      const threat = calculatePartyThreat(p)
      const enemies = generateEncounter({
        seed: `unique-${i}`,
        partyThreat: threat,
        difficulty: 'normal',
        bossAllowed: true,
        partySize: 4,
      })
      const ids = enemies.map((e) => e.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('boss形状以外にbossが生成されない', () => {
    for (let i = 0; i < 500; i++) {
      const p = party('C')
      const enemies = generateEncounter({
        seed: `noboss-${i}`,
        partyThreat: calculatePartyThreat(p),
        difficulty: 'normal',
        shape: 'standard',
        partySize: 4,
      })
      expect(enemies.every((e) => e.tier !== 'boss')).toBe(true)
    }
  })

  it('swarm形状では全敵がminionである', () => {
    for (let i = 0; i < 500; i++) {
      const p = party('C')
      const enemies = generateEncounter({
        seed: `swarm-${i}`,
        partyThreat: calculatePartyThreat(p),
        difficulty: 'normal',
        shape: 'swarm',
        partySize: 4,
      })
      expect(enemies.length).toBe(7)
      expect(enemies.every((e) => e.tier === 'minion')).toBe(true)
    }
  })

  it('boss形状では必ず1体のbossと3体のstandardである', () => {
    for (let i = 0; i < 500; i++) {
      const p = party('C')
      const enemies = generateEncounter({
        seed: `boss-shape-${i}`,
        partyThreat: calculatePartyThreat(p),
        difficulty: 'normal',
        shape: 'boss',
        partySize: 4,
      })
      expect(enemies.length).toBe(4)
      expect(enemies.filter((e) => e.tier === 'boss').length).toBe(1)
      expect(enemies.filter((e) => e.tier === 'standard').length).toBe(3)
    }
  })

  it('予算不足でも敵数を削減しない', () => {
    const p = party('E')
    const threat = calculatePartyThreat(p)
    for (let i = 0; i < 200; i++) {
      const enemies = generateEncounter({
        seed: `underbudget-${i}`,
        partyThreat: threat,
        difficulty: 'normal',
        shape: 'standard',
        partySize: 4,
      })
      expect(enemies.length).toBe(4)
    }
  })

  it('予算余剰でも敵数を追加しない', () => {
    const p = party('S')
    const threat = calculatePartyThreat(p)
    for (let i = 0; i < 200; i++) {
      const enemies = generateEncounter({
        seed: `overbudget-${i}`,
        partyThreat: threat,
        difficulty: 'normal',
        shape: 'standard',
        partySize: 4,
      })
      expect(enemies.length).toBe(4)
    }
  })

  it('actionEconomyMultiplier は敵数-パーティサイズに応じた補正を返す', () => {
    expect(actionEconomyMultiplier(1, 4)).toBe(0.8)
    expect(actionEconomyMultiplier(3, 4)).toBe(0.9)
    expect(actionEconomyMultiplier(4, 4)).toBe(1.0)
    expect(actionEconomyMultiplier(5, 4)).toBe(1.15)
    expect(actionEconomyMultiplier(6, 4)).toBe(1.3)
    expect(actionEconomyMultiplier(8, 4)).toBe(1.5)
    expect(actionEconomyMultiplier(10, 4)).toBe(1.75)
  })

  it('bossAllowed=false かつ高予算でもボスを生成しない', () => {
    const enemies = generateEncounter({
      seed: 'boss-false-high',
      partyThreat: ADVENTURER_THREAT.S * 4,
      difficulty: 'normal',
      bossAllowed: false,
      partySize: 4,
    })
    expect(enemies.some((e) => e.tier === 'boss')).toBe(false)
    const raw = enemies.reduce((sum, e) => sum + e.threatCost, 0)
    const budget = ADVENTURER_THREAT.S * 4 * DIFFICULTY_BUDGET_MULTIPLIER.normal
    const effective = effectiveEncounterThreat(raw, enemies.length, 4)
    expect(effective).toBeGreaterThanOrEqual(budget * 0.8)
    expect(effective).toBeLessThanOrEqual(budget * 1.2)
  })
})
