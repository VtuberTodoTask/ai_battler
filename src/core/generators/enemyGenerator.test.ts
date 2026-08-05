import { describe, expect, it } from 'vitest'
import { generateEnemy } from './enemyGenerator.ts'
import { ENEMY_RANK_BASE } from '../balance/constants.ts'
import { abilityCountForRank } from '../../data/enemyData.ts'

describe('generateEnemy', () => {
  it('同一シードで同一敵を生成する', () => {
    const a = generateEnemy('enemy-test-001', {
      rank: 'C',
      species: 'beast',
      archetype: 'assault',
    })
    const b = generateEnemy('enemy-test-001', {
      rank: 'C',
      species: 'beast',
      archetype: 'assault',
    })
    expect(a).toEqual(b)
  })

  it('能力値が基準値を反映している', () => {
    const enemy = generateEnemy('enemy-test-002', { rank: 'C' })
    expect(enemy.stats.str).toBeGreaterThanOrEqual(
      ENEMY_RANK_BASE[enemy.rank] - 35,
    )
    expect(enemy.stats.con).toBeGreaterThanOrEqual(1)
  })

  it('等級に応じた特殊能力数', () => {
    for (const rank of ['E', 'D', 'C', 'B', 'A', 'S', 'DISASTER'] as const) {
      const enemy = generateEnemy(`enemy-ability-${rank}`, { rank })
      const { min, max } = abilityCountForRank(rank)
      expect(enemy.abilities.length).toBeGreaterThanOrEqual(min)
      expect(enemy.abilities.length).toBeLessThanOrEqual(max)
    }
  })

  it('弱点が1～2個存在する', () => {
    const enemy = generateEnemy('enemy-weak-001', { rank: 'C' })
    expect(enemy.weaknesses.length).toBeGreaterThanOrEqual(1)
    expect(enemy.weaknesses.length).toBeLessThanOrEqual(2)
  })

  it('脅威点が正数', () => {
    const enemy = generateEnemy('enemy-threat-001', { rank: 'D' })
    expect(enemy.threatCost).toBeGreaterThan(0)
  })
})
