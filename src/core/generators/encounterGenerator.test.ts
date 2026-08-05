import { describe, expect, it } from 'vitest'
import { generateAdventurers } from './adventurerGenerator.ts'
import {
  generateEncounter,
  calculatePartyThreat,
} from './encounterGenerator.ts'

describe('generateEncounter', () => {
  it('難易度別に脅威予算の±20%以内に収まる', () => {
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
      expect(ratio).toBeGreaterThanOrEqual(0.6)
      expect(ratio).toBeLessThanOrEqual(1.4)
      expect(enemies.length).toBeLessThanOrEqual(12)
      expect(
        enemies.filter((e) => e.tier === 'boss').length,
      ).toBeLessThanOrEqual(1)
    }
  })
})
