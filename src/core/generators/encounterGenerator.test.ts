import { describe, expect, it } from 'vitest'
import { generateAdventurers } from './adventurerGenerator.ts'
import {
  actionEconomyMultiplier,
  calculatePartyThreat,
  effectiveEncounterThreat,
  generateEncounter,
} from './encounterGenerator.ts'
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
      expect(enemies.length).toBeLessThanOrEqual(12)
      expect(
        enemies.filter((e) => e.tier === 'boss').length,
      ).toBeLessThanOrEqual(1)
    }
  })

  it('Normalのstandard/elite/boss遭遇で敵数は6体を超えない', () => {
    for (let i = 0; i < 200; i++) {
      const p = party('C')
      const threat = calculatePartyThreat(p)
      const shapes: Array<'standard' | 'eliteGroup' | 'boss'> = [
        'standard',
        'eliteGroup',
        'boss',
      ]
      const enemies = generateEncounter({
        seed: `shape-${i}`,
        partyThreat: threat,
        difficulty: 'normal',
        shape: shapes[i % 3],
        partySize: 4,
      })
      expect(enemies.length).toBeLessThanOrEqual(6)
    }
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
