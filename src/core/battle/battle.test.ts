import { describe, expect, it } from 'vitest'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import { generateEnemy } from '../generators/enemyGenerator.ts'
import {
  generateEncounter,
  calculatePartyThreat,
} from '../generators/encounterGenerator.ts'
import { runBattle } from './battle.ts'

function balancedParty(rank: 'B' | 'C' | 'D', seed: string) {
  const roles: ('vanguard' | 'ranger' | 'mage' | 'healer')[] = [
    'vanguard',
    'ranger',
    'mage',
    'healer',
  ]
  return roles.map((role, i) =>
    generateAdventurer({ seed: `${seed}-${role}-${i}`, rank, role }),
  )
}

describe('runBattle', () => {
  it('同一シードで同一結果を返す', () => {
    const party = balancedParty('C', 'battle-adv-001')
    const enemies = generateEncounter({
      seed: 'battle-enc-001',
      partyThreat: calculatePartyThreat(party),
      difficulty: 'normal',
    })
    const a = runBattle('battle-seed-001', party, enemies)
    const b = runBattle('battle-seed-001', party, enemies)
    expect(a.outcome).toBe(b.outcome)
    expect(a.rounds).toBe(b.rounds)
    expect(a.partyDamageDealt).toBe(b.partyDamageDealt)
    expect(a.logs.length).toBe(b.logs.length)
  })

  it('1000戦が20ラウンド以内に終了する', () => {
    for (let i = 0; i < 1000; i++) {
      const party = balancedParty('C', `battle-adv-${i}`)
      const enemies = generateEncounter({
        seed: `battle-enc-${i}`,
        partyThreat: calculatePartyThreat(party),
        difficulty: 'normal',
      })
      const result = runBattle(`battle-seed-${i}`, party, enemies)
      expect(result.rounds).toBeLessThanOrEqual(20)
      expect(result.outcome).toMatch(
        /victory|costlyVictory|partialVictory|retreat|defeat|totalLoss|stalemate/,
      )
      expect(Number.isNaN(result.partyDamageDealt)).toBe(false)
      expect(Number.isNaN(result.enemyDamageDealt)).toBe(false)
    }
  })

  it('勝敗結果と生存状況が一致する', () => {
    const party = balancedParty('C', 'consistency-adv')
    const enemies = generateEncounter({
      seed: 'consistency-enc',
      partyThreat: calculatePartyThreat(party),
      difficulty: 'normal',
    })
    const result = runBattle('consistency-seed', party, enemies)
    const allPartyAlive =
      result.survivingAdventurers.length +
      result.deadAdventurers.length +
      result.incapacitatedAdventurers.length
    expect(allPartyAlive).toBe(party.length)
    if (result.outcome === 'totalLoss') {
      expect(result.deadAdventurers.length).toBe(party.length)
    }
    if (result.outcome === 'victory' || result.outcome === 'costlyVictory') {
      expect(result.survivingAdventurers.length).toBeGreaterThan(0)
    }
  })

  it('ランク勝率の単調性', () => {
    const partyBaseSeed = 'mono-battle'
    const partyC = balancedParty('C', partyBaseSeed)
    const enemies = generateEncounter({
      seed: 'enc-3',
      partyThreat: calculatePartyThreat(partyC),
      difficulty: 'normal',
    })

    function winRate(rank: 'B' | 'C' | 'D'): number {
      const party = balancedParty(rank, partyBaseSeed)
      let wins = 0
      const trials = 50
      for (let i = 0; i < trials; i++) {
        const result = runBattle(`mono-seed-${rank}-${i}`, party, enemies)
        if (result.outcome === 'victory' || result.outcome === 'costlyVictory')
          wins++
      }
      return wins / trials
    }

    const bRate = winRate('B')
    const cRate = winRate('C')
    const dRate = winRate('D')
    expect(bRate).toBeGreaterThan(cRate)
    expect(cRate).toBeGreaterThan(dRate)
  })

  it('個別撤退が manualAction として記録される', () => {
    const party = balancedParty('C', 'manual-adv')
    party[0].currentHp = party[0].maxHp * 0.1
    const enemy = generateEnemy('manual-enemy', {
      rank: 'E',
      species: 'beast',
      archetype: 'assault',
    })
    const result = runBattle('manual-seed', party, [enemy])
    expect(result.retreatDiagnostic).toBeDefined()
    expect(result.retreatDiagnostic?.matchedReasons).toContain('manualAction')
  })
})
