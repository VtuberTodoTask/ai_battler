import { describe, expect, it } from 'vitest'
import { generateAdventurer } from './adventurerGenerator.ts'
import { generateEnemy, calculateAbilityThreat } from './enemyGenerator.ts'
import {
  ABILITY_THREAT_COST,
  ENEMY_BASE_THREAT,
  ENEMY_RANK_BASE,
  TIER_THREAT_MULTIPLIER,
} from '../balance/constants.ts'
import { runBattle } from '../battle/battle.ts'
import { abilityCountForRank } from '../../data/enemyData.ts'
import type { Adventurer, Enemy } from '../models/types.ts'

function buildParty(rank: 'E' | 'D' | 'C' | 'B' | 'A' | 'S', seed: string) {
  const roles = ['vanguard', 'guardian', 'mage', 'healer'] as const
  return roles.map((role, i) =>
    generateAdventurer({ seed: `${seed}-${rank}-${role}-${i}`, rank, role }),
  ) as Adventurer[]
}

function bodyScale(enemy: Enemy): number {
  const baseThreat =
    ENEMY_BASE_THREAT[enemy.rank] * TIER_THREAT_MULTIPLIER[enemy.tier]
  const abilityThreat = calculateAbilityThreat(enemy.abilities)
  const bodyThreat = enemy.threatCost - abilityThreat
  return baseThreat > 0 ? bodyThreat / baseThreat : 1
}

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
    const enemy = generateEnemy('enemy-weak-001', {
      rank: 'C',
      species: 'beast',
    })
    expect(enemy.weaknesses.length).toBeGreaterThanOrEqual(1)
    expect(enemy.weaknesses.length).toBeLessThanOrEqual(2)
  })

  it('脅威点が正数', () => {
    const enemy = generateEnemy('enemy-threat-001', { rank: 'D' })
    expect(enemy.threatCost).toBeGreaterThan(0)
  })

  it('すべての実装済み能力が0より大きいコストを持つ', () => {
    for (const cost of Object.values(ABILITY_THREAT_COST)) {
      expect(cost).toBeGreaterThan(0)
    }
  })

  it('実際のthreatCostへ能力コストが加算される', () => {
    const enemy = generateEnemy('enemy-ability-add', {
      rank: 'B',
      species: 'beast',
      archetype: 'assault',
    })
    const abilityThreat = calculateAbilityThreat(enemy.abilities)
    const baseThreat =
      ENEMY_BASE_THREAT[enemy.rank] * TIER_THREAT_MULTIPLIER[enemy.tier]
    const bodyScale = (enemy.threatCost - abilityThreat) / baseThreat
    expect(enemy.threatCost).toBeCloseTo(
      baseThreat * bodyScale + abilityThreat,
      5,
    )
  })

  it('bodyScaleが0.7～1.3以内', () => {
    for (const target of [3, 6, 10, 15]) {
      const enemy = generateEnemy(`enemy-bodyscale-${target}`, {
        targetThreat: target,
        tier: 'standard',
        species: 'beast',
        archetype: 'assault',
      })
      expect(bodyScale(enemy)).toBeGreaterThanOrEqual(0.7)
      expect(bodyScale(enemy)).toBeLessThanOrEqual(1.3)
    }
  })

  it('低いslotTargetThreatで高ランク多能力敵が生成されない', () => {
    const enemy = generateEnemy('enemy-low-target', {
      targetThreat: 2.5,
      tier: 'standard',
      species: 'beast',
      archetype: 'assault',
    })
    expect(['E', 'D']).toContain(enemy.rank)
    expect(enemy.abilities.length).toBeLessThanOrEqual(1)
  })

  it('能力なし敵より強能力付き敵のthreatCostが高い', () => {
    const enemy = generateEnemy('enemy-ability-stronger', {
      rank: 'S',
      species: 'beast',
      archetype: 'assault',
    })
    expect(enemy.abilities.length).toBeGreaterThan(0)
    const abilityThreat = calculateAbilityThreat(enemy.abilities)
    const bodyThreat = enemy.threatCost - abilityThreat
    expect(enemy.threatCost).toBeGreaterThan(bodyThreat)
    expect(abilityThreat).toBeGreaterThan(0)
  })

  it('summonやreviveを削除すると対応するコストも消える', () => {
    const abilities = [
      { abilityId: 'summon', name: 'summon' },
      { abilityId: 'revive', name: 'revive' },
    ] as Enemy['abilities']
    const full = calculateAbilityThreat(abilities)
    const withoutRevive = calculateAbilityThreat([abilities[0]])
    expect(full - withoutRevive).toBeCloseTo(ABILITY_THREAT_COST.revive, 5)
    const withoutSummon = calculateAbilityThreat([abilities[1]])
    expect(full - withoutSummon).toBeCloseTo(ABILITY_THREAT_COST.summon, 5)
  })

  it('同一敵に対する等級単調性が維持される', () => {
    const seed = 'enemy-mono-enemy'
    const enemies: Enemy[] = []
    for (let i = 0; i < 4; i++) {
      enemies.push(
        generateEnemy(`${seed}-${i}`, {
          rank: 'B',
          tier: 'standard',
          species: 'beast',
          archetype: 'assault',
        }),
      )
    }

    const ranks = ['E', 'D', 'C', 'B', 'A', 'S'] as const
    const rates: number[] = []
    for (const rank of ranks) {
      let fav = 0
      const trials = 200
      for (let t = 0; t < trials; t++) {
        const party = buildParty(rank, `enemy-mono-${t}`)
        const result = runBattle(
          `enemy-mono-battle-${rank}-${t}`,
          party,
          enemies,
        )
        if (
          ['victory', 'costlyVictory', 'partialVictory'].includes(
            result.outcome,
          )
        ) {
          fav++
        }
      }
      rates.push(fav / trials)
    }

    for (let i = 0; i < ranks.length - 1; i++) {
      expect(rates[i]).toBeLessThanOrEqual(rates[i + 1] + 0.03)
    }
  })
})
