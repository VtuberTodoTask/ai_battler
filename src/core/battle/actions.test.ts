import { describe, expect, it } from 'vitest'
import {
  getAbilityNumeric,
  sumAbilityNumeric,
  rollAttack,
  calculateHitChance,
} from './actions.ts'
import { createAdventurerUnit, createEnemyUnit } from './battleState.ts'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import { generateEnemy } from '../generators/enemyGenerator.ts'
import { SeededRng } from '../rng/seededRng.ts'
import type { BattleUnit } from './battleState.ts'

class FakeRng extends SeededRng {
  public hit = 1
  public damage = 0
  public chanceResult = true
  constructor(seed = 'fake') {
    super(seed)
  }
  d100() {
    return this.hit
  }
  integer(_min: number, _max: number) {
    return this.damage
  }
  chance(_percent: number) {
    return this.chanceResult
  }
  die(_sides: number) {
    return this.hit
  }
  shuffle<T>(items: T[]): T[] {
    return [...items]
  }
}

function unitWithAbilities(abilities: BattleUnit['abilities']): BattleUnit {
  return { abilities } as unknown as BattleUnit
}

describe('getAbilityNumeric / sumAbilityNumeric', () => {
  it('reviveHeal は定義値 10、fallback は使われない', () => {
    const unit = unitWithAbilities([{ abilityId: 'revive', name: '蘇生' }])
    expect(getAbilityNumeric(unit, 'reviveHeal', 99)).toBe(10)
    expect(sumAbilityNumeric(unit, 'reviveHeal')).toBe(10)
  })

  it('summonCount は定義値 2', () => {
    const unit = unitWithAbilities([{ abilityId: 'summon', name: '召喚' }])
    expect(getAbilityNumeric(unit, 'summonCount', 5)).toBe(2)
    expect(sumAbilityNumeric(unit, 'summonCount')).toBe(2)
  })

  it('areaAttackTargets は定義値 3', () => {
    const unit = unitWithAbilities([
      { abilityId: 'areaAttack', name: '範囲攻撃' },
    ])
    expect(getAbilityNumeric(unit, 'areaAttackTargets', 1)).toBe(3)
    expect(sumAbilityNumeric(unit, 'areaAttackTargets')).toBe(3)
  })

  it('corpseExplosionDamage は定義値 8', () => {
    const unit = unitWithAbilities([
      { abilityId: 'corpseExplosion', name: '死体爆発' },
    ])
    expect(getAbilityNumeric(unit, 'corpseExplosionDamage', 1)).toBe(8)
    expect(sumAbilityNumeric(unit, 'corpseExplosionDamage')).toBe(8)
  })

  it('counterChance は定義値 0.3', () => {
    const unit = unitWithAbilities([{ abilityId: 'counter', name: '反撃' }])
    expect(getAbilityNumeric(unit, 'counterChance', 0)).toBe(0.3)
    expect(sumAbilityNumeric(unit, 'counterChance')).toBe(0.3)
  })

  it('evadeMelee は flight で定義値 1', () => {
    const unit = unitWithAbilities([{ abilityId: 'flight', name: '飛行' }])
    expect(getAbilityNumeric(unit, 'evadeMelee', 0)).toBe(1)
    expect(sumAbilityNumeric(unit, 'evadeMelee')).toBe(1)
  })

  it('該当 effect がない場合は fallback を返す', () => {
    const unit = unitWithAbilities([{ abilityId: 'flight', name: '飛行' }])
    expect(getAbilityNumeric(unit, 'reviveHeal', 77)).toBe(77)
    expect(sumAbilityNumeric(unit, 'reviveHeal')).toBe(0)
  })

  it('複数能力の同じ effect は合計される', () => {
    const unit = unitWithAbilities([
      { abilityId: 'summon', name: '召喚' },
      { abilityId: 'summon', name: '召喚' },
    ])
    expect(getAbilityNumeric(unit, 'summonCount', 0)).toBe(4)
    expect(sumAbilityNumeric(unit, 'summonCount')).toBe(4)
  })
})

describe('rollAttack successChance', () => {
  function makeUnits() {
    const adv = createAdventurerUnit(
      generateAdventurer({ seed: 's-adv', rank: 'C', role: 'vanguard' }),
    )
    const enemy = createEnemyUnit(
      generateEnemy('s-enemy', {
        rank: 'C',
        species: 'beast',
        archetype: 'assault',
      }),
    )
    return { adv, enemy }
  }

  it('基礎命中の successChance が calculateHitChance と一致する', () => {
    const { adv, enemy } = makeUnits()
    const rng = new FakeRng()
    rng.hit = 1
    const result = rollAttack(
      rng,
      adv,
      enemy,
      'melee',
      'defense',
      8,
      'physical',
      { attackType: 'melee' },
    )
    const expected = calculateHitChance(adv, enemy, 'melee', 'defense', 0)
    expect(result.successChance).toBe(expected)
  })

  it('flight で successChance が下がる', () => {
    const { adv, enemy } = makeUnits()
    enemy.abilities = [{ abilityId: 'flight', name: '飛行' }]
    const rng = new FakeRng()
    rng.hit = 1
    const result = rollAttack(
      rng,
      adv,
      enemy,
      'melee',
      'defense',
      8,
      'physical',
      { attackType: 'melee' },
    )
    const expected = calculateHitChance(adv, enemy, 'melee', 'defense', -40)
    expect(result.successChance).toBe(expected)
    expect(result.successChance).toBeLessThan(
      calculateHitChance(adv, enemy, 'melee', 'defense', 0),
    )
  })

  it('stealthStart/stealthed で successChance が上がる', () => {
    const { adv, enemy } = makeUnits()
    adv.statusEffects = [{ type: 'stealthed', duration: 1, sourceId: 'test' }]
    const rng = new FakeRng()
    rng.hit = 1
    const result = rollAttack(
      rng,
      adv,
      enemy,
      'melee',
      'defense',
      8,
      'physical',
      { attackType: 'melee' },
    )
    const expected = calculateHitChance(adv, enemy, 'melee', 'defense', 10)
    expect(result.successChance).toBe(expected)
    expect(result.successChance).toBeGreaterThan(
      calculateHitChance(adv, enemy, 'melee', 'defense', 0),
    )
  })

  it('frightened（防御側）で successChance が上がる', () => {
    const { adv, enemy } = makeUnits()
    enemy.statusEffects = [
      { type: 'frightened', duration: 2, value: 5, sourceId: 'test' },
    ]
    const rng = new FakeRng()
    rng.hit = 1
    const result = rollAttack(
      rng,
      adv,
      enemy,
      'melee',
      'defense',
      8,
      'physical',
      { attackType: 'melee' },
    )
    const expected = calculateHitChance(adv, enemy, 'melee', 'defense', 5)
    expect(result.successChance).toBe(expected)
    expect(result.successChance).toBeGreaterThan(
      calculateHitChance(adv, enemy, 'melee', 'defense', 0),
    )
  })

  it('contact bonus（firstRoundHitBonus）で successChance が上がる', () => {
    const { adv, enemy } = makeUnits()
    const rng = new FakeRng()
    rng.hit = 1
    const result = rollAttack(
      rng,
      adv,
      enemy,
      'melee',
      'defense',
      8,
      'physical',
      { attackType: 'melee', firstRoundHitBonus: 15 },
    )
    const expected = calculateHitChance(adv, enemy, 'melee', 'defense', 15)
    expect(result.successChance).toBe(expected)
  })

  it('status effect（defenseDown）で defense が下がり successChance が上がる', () => {
    const { adv, enemy } = makeUnits()
    enemy.statusEffects = [
      { type: 'defenseDown', duration: 2, value: 10, sourceId: 'test' },
    ]
    const rng = new FakeRng()
    rng.hit = 1
    const result = rollAttack(
      rng,
      adv,
      enemy,
      'melee',
      'defense',
      8,
      'physical',
      { attackType: 'melee' },
    )
    const expected = calculateHitChance(adv, enemy, 'melee', 'defense', 0)
    expect(result.successChance).toBe(expected)
    expect(result.successChance).toBeGreaterThan(
      calculateHitChance(
        adv,
        { ...enemy, statusEffects: [] } as BattleUnit,
        'melee',
        'defense',
        0,
      ),
    )
  })

  it('frontDefense と weakness effect は命中判定に影響を与えない', () => {
    const { adv, enemy } = makeUnits()
    enemy.abilities = [{ abilityId: 'frontDefense', name: '正面防御' }]
    enemy.weaknesses = [
      { weaknessId: 'rearAttack', name: '背面攻撃', known: true },
    ]
    const rng = new FakeRng()
    rng.hit = 1
    const result = rollAttack(
      rng,
      adv,
      enemy,
      'melee',
      'defense',
      8,
      'physical',
      { attackType: 'melee' },
    )
    const expected = calculateHitChance(adv, enemy, 'melee', 'defense', 0)
    expect(result.successChance).toBe(expected)
  })
})
