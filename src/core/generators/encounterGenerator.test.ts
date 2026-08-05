import { describe, expect, it } from 'vitest'
import { generateAdventurers } from './adventurerGenerator.ts'
import {
  generateEncounter,
  calculatePartyThreat,
} from './encounterGenerator.ts'

describe('generateEncounter', () => {
  it('難易度別に脅威予算の0.8～1.2倍に収まる', () => {
    for (let i = 0; i < 1000; i++) {
      const party = generateAdventurers({ seed: `enc-party-${i}`, count: 4 })
      const threat = calculatePartyThreat(party)
      const difficulty = (['easy', 'normal', 'hard', 'deadly'] as const)[i % 4]
      const enemies = generateEncounter({
        seed: `enc-${i}`,
        partyThreat: threat,
        difficulty,
      })
      const totalThreat = enemies.reduce((sum, e) => sum + e.threatCost, 0)
      const budget =
        difficulty === 'easy'
          ? threat * 0.7
          : difficulty === 'normal'
            ? threat
            : difficulty === 'hard'
              ? threat * 1.25
              : threat * 1.5
      const ratio = totalThreat / budget
      // Extremely small budgets fall back to one cheap minion and may exceed 1.2.
      if (budget >= 1) {
        expect(ratio).toBeGreaterThanOrEqual(0.8)
        expect(ratio).toBeLessThanOrEqual(1.2)
      }
      expect(enemies.length).toBeLessThanOrEqual(12)
      expect(
        enemies.filter((e) => e.tier === 'boss').length,
      ).toBeLessThanOrEqual(1)
    }
  })

  it('bossAllowed=false の場合、1000 編成にボスが 0 体', () => {
    for (let i = 0; i < 1000; i++) {
      const party = generateAdventurers({
        seed: `boss-false-party-${i}`,
        count: 4,
      })
      const threat = calculatePartyThreat(party)
      const difficulty = (['easy', 'normal', 'hard', 'deadly'] as const)[i % 4]
      const enemies = generateEncounter({
        seed: `boss-false-${i}`,
        partyThreat: threat,
        difficulty,
        bossAllowed: false,
      })
      expect(enemies.some((e) => e.tier === 'boss')).toBe(false)
    }
  })

  it('bossAllowed=true でも各編成のボスは最大 1 体', () => {
    for (let i = 0; i < 1000; i++) {
      const party = generateAdventurers({
        seed: `boss-true-party-${i}`,
        count: 4,
      })
      const threat = calculatePartyThreat(party)
      const difficulty = (['easy', 'normal', 'hard', 'deadly'] as const)[i % 4]
      const enemies = generateEncounter({
        seed: `boss-true-${i}`,
        partyThreat: threat,
        difficulty,
        bossAllowed: true,
      })
      expect(
        enemies.filter((e) => e.tier === 'boss').length,
      ).toBeLessThanOrEqual(1)
    }
  })

  it('同一シードで遭遇生成結果が再現される', () => {
    const party = generateAdventurers({ seed: 'rep-party', count: 4 })
    const threat = calculatePartyThreat(party)
    const options = {
      seed: 'rep-seed',
      partyThreat: threat,
      difficulty: 'normal' as const,
    }
    const first = generateEncounter(options)
    const second = generateEncounter(options)
    expect(first.map((e) => e.id)).toEqual(second.map((e) => e.id))
  })

  it('1 編成内のすべての敵 ID が一意である', () => {
    for (let i = 0; i < 1000; i++) {
      const party = generateAdventurers({ seed: `unique-party-${i}`, count: 4 })
      const threat = calculatePartyThreat(party)
      const enemies = generateEncounter({
        seed: `unique-${i}`,
        partyThreat: threat,
        difficulty: 'normal',
        bossAllowed: true,
      })
      const ids = enemies.map((e) => e.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})
