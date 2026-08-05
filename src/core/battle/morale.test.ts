import { describe, expect, it } from 'vitest'
import { shouldEnemyRetreat, shouldPartyRetreat } from './morale.ts'
import { createAdventurerUnit, createEnemyUnit } from './battleState.ts'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import { generateEnemy } from '../generators/enemyGenerator.ts'
import type { Adventurer, Enemy } from '../models/types.ts'

function makeAdventurer(
  seed: string,
  overrides: Partial<Adventurer> = {},
): Adventurer {
  const base = generateAdventurer({ seed, rank: 'C', role: 'vanguard' })
  return {
    ...base,
    ...overrides,
    stats: { ...base.stats, ...(overrides.stats ?? {}) } as Adventurer['stats'],
    skills: {
      ...base.skills,
      ...(overrides.skills ?? {}),
    } as Adventurer['skills'],
    personality: {
      ...base.personality,
      ...(overrides.personality ?? {}),
    } as Adventurer['personality'],
  } as Adventurer
}

function makeEnemy(seed: string, overrides: Partial<Enemy> = {}): Enemy {
  const base = generateEnemy(seed, {
    rank: 'C',
    species: 'beast',
    archetype: 'assault',
  })
  return {
    ...base,
    ...overrides,
    currentHp: overrides.currentHp ?? base.currentHp,
    maxHp: overrides.maxHp ?? base.maxHp,
    stats: { ...base.stats, ...(overrides.stats ?? {}) } as Enemy['stats'],
    skills: { ...base.skills, ...(overrides.skills ?? {}) } as Enemy['skills'],
    behavior: {
      ...base.behavior,
      ...(overrides.behavior ?? {}),
    } as Enemy['behavior'],
    abilities: overrides.abilities ?? base.abilities,
    weaknesses: overrides.weaknesses ?? base.weaknesses,
    morale: overrides.morale ?? base.morale,
  } as Enemy
}

describe('shouldEnemyRetreat', () => {
  it('アンデッド/構造体が 1 体いるだけで集団全体が撤退不能にならない', () => {
    const humanoid = createEnemyUnit(
      makeEnemy('ret-human', {
        species: 'humanoid',
        morale: 10,
        behavior: { retreatThreshold: 25 } as unknown as Enemy['behavior'],
      }),
    )
    const undead = createEnemyUnit(
      makeEnemy('ret-undead', {
        species: 'undead',
        morale: 10,
        behavior: { retreatThreshold: 25 } as unknown as Enemy['behavior'],
      }),
    )
    const mixed = [humanoid, undead]
    const allUndead = [
      createEnemyUnit(
        makeEnemy('ret-undead-1', {
          species: 'undead',
          morale: 10,
          behavior: { retreatThreshold: 25 } as unknown as Enemy['behavior'],
        }),
      ),
      createEnemyUnit(
        makeEnemy('ret-undead-2', {
          species: 'undead',
          morale: 10,
          behavior: { retreatThreshold: 25 } as unknown as Enemy['behavior'],
        }),
      ),
    ]
    expect(shouldEnemyRetreat(mixed, [])).toBe(true)
    expect(shouldEnemyRetreat(allUndead, [])).toBe(false)
  })

  it('commanderLoss は同じ士気条件で撤退を容易にする', () => {
    const follower = createEnemyUnit(
      makeEnemy('ret-follower', {
        species: 'humanoid',
        morale: 20,
        skills: { leadership: 10 } as unknown as Enemy['skills'],
        behavior: { retreatThreshold: 25 } as unknown as Enemy['behavior'],
        weaknesses: [
          { weaknessId: 'commanderLoss', name: '指揮官喪失', known: true },
        ],
      }),
    )
    const leader = createEnemyUnit(
      makeEnemy('ret-leader', {
        species: 'humanoid',
        currentHp: 0,
        maxHp: 60,
        skills: { leadership: 30 } as unknown as Enemy['skills'],
        behavior: { retreatThreshold: 25 } as unknown as Enemy['behavior'],
      }),
    )
    const withoutLoss = [follower]
    const withLoss = [leader, follower]
    expect(shouldEnemyRetreat(withoutLoss, [])).toBe(false)
    expect(shouldEnemyRetreat(withLoss, [])).toBe(true)
  })
})

describe('shouldPartyRetreat', () => {
  function firstRetreatRound(greed: number): number {
    const healer = createAdventurerUnit(
      makeAdventurer('greed-healer', {
        role: 'healer',
        skills: { leadership: 0 } as unknown as Adventurer['skills'],
      }),
    )
    const leader = createAdventurerUnit(
      makeAdventurer('greed-leader', {
        role: 'vanguard',
        personality: { greed } as unknown as Adventurer['personality'],
        skills: { leadership: 100 } as unknown as Adventurer['skills'],
      }),
    )
    const party = [
      leader,
      healer,
      createAdventurerUnit(
        makeAdventurer('greed-m1', {
          skills: { leadership: 0 } as unknown as Adventurer['skills'],
        }),
      ),
      createAdventurerUnit(
        makeAdventurer('greed-m2', {
          skills: { leadership: 0 } as unknown as Adventurer['skills'],
        }),
      ),
    ]
    party.forEach((u) => {
      u.morale = 80
    })
    const enemy = createEnemyUnit(
      makeEnemy('greed-enemy', { threatCost: 1, maxHp: 1, currentHp: 1 }),
    )

    for (let round = 1; round <= 40; round++) {
      const ratio = Math.max(0.01, 0.5 - round * 0.01)
      party.forEach((u) => {
        u.hp = u.maxHp * ratio
      })
      if (shouldPartyRetreat(party, [enemy], round)) return round
    }
    return 41
  }

  it('greed が高いほど撤退ラウンドが遅くなる', () => {
    const lowGreed = firstRetreatRound(-3)
    const highGreed = firstRetreatRound(3)
    expect(highGreed).toBeGreaterThan(lowGreed)
  })
})
