import { describe, expect, it } from 'vitest'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import { generateEnemy } from '../generators/enemyGenerator.ts'
import { generateAdventurers } from '../generators/adventurerGenerator.ts'
import { runBattle } from './battle.ts'
import { createAdventurerUnit, createEnemyUnit } from './battleState.ts'
import { decideEnemyAction } from './ai.ts'
import type {
  Adventurer,
  Enemy,
  BaseStats,
  SkillSet,
  EnemyBehavior,
} from '../models/types.ts'

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
    stats: { ...base.stats, ...(overrides.stats ?? {}) } as BaseStats,
    skills: { ...base.skills, ...(overrides.skills ?? {}) } as SkillSet,
    behavior: {
      ...base.behavior,
      ...(overrides.behavior ?? {}),
    } as EnemyBehavior,
    abilities: overrides.abilities ?? base.abilities,
    weaknesses: overrides.weaknesses ?? base.weaknesses,
    morale: overrides.morale ?? base.morale,
  } as Enemy
}

function aiState(
  party: ReturnType<typeof createAdventurerUnit>[],
  enemies: ReturnType<typeof createEnemyUnit>[],
  round = 1,
  leaderTargetId?: string,
) {
  return { party, enemies, round, leaderTargetId }
}

describe('蘇生・召喚の使用制限', () => {
  it('revive は戦闘中 1 回まで', () => {
    const reviver = makeEnemy('reviver-1', {
      maxHp: 300,
      currentHp: 300,
      abilities: [{ abilityId: 'revive', name: '蘇生' }],
      behavior: { usesAbilitiesFirst: true } as unknown as EnemyBehavior,
    })
    const dead1 = makeEnemy('dead-1', {
      currentHp: 0,
      maxHp: 30,
      abilities: [],
    })
    const dead2 = makeEnemy('dead-2', {
      currentHp: 0,
      maxHp: 30,
      abilities: [],
    })
    const party = [makeAdventurer('rev-adv')]
    const result = runBattle('revive-usage', party, [reviver, dead1, dead2])
    expect(result.abilityUsage.revive).toBe(1)
    expect(
      result.logs.filter(
        (l) => l.actionType === 'revive' && l.actorId === reviver.id,
      ).length,
    ).toBe(1)
    const revivedCount =
      result.survivingEnemies.filter((id) => id === dead1.id || id === dead2.id)
        .length +
      result.escapedEnemies.filter((id) => id === dead1.id || id === dead2.id)
        .length
    expect(revivedCount).toBeLessThanOrEqual(1)
  })

  it('summon は戦闘中 1 回まで', () => {
    const summoner = makeEnemy('summoner-1', {
      maxHp: 500,
      currentHp: 500,
      abilities: [{ abilityId: 'summon', name: '召喚' }],
      behavior: { usesAbilitiesFirst: true } as unknown as EnemyBehavior,
    })
    const party = generateAdventurers({
      seed: 'summon-party-1',
      count: 4,
      rank: 'C',
    })
    const result = runBattle('summon-usage', party, [summoner])
    expect(result.abilityUsage.summon).toBe(1)
    expect(
      result.logs.filter(
        (l) => l.actionType === 'summon' && l.actorId === summoner.id,
      ).length,
    ).toBe(1)
  })

  it('召喚個体は summon/revive を使用しない', () => {
    const summoner = makeEnemy('summoner-2', {
      maxHp: 500,
      currentHp: 500,
      abilities: [{ abilityId: 'summon', name: '召喚' }],
      behavior: { usesAbilitiesFirst: true } as unknown as EnemyBehavior,
    })
    const party = [makeAdventurer('summon-adv-2')]
    const result = runBattle('summon-no-use', party, [summoner])
    const summonLog = result.logs.find(
      (l) => l.actionType === 'summon' && l.actorId === summoner.id,
    )
    expect(summonLog).toBeDefined()
    const summonedIds = summonLog?.targetIds
    expect(summonedIds).toBeDefined()
    for (const summonedId of summonedIds ?? []) {
      const isSummoner =
        result.logs.some(
          (l) =>
            l.actorId === summonedId &&
            (l.actionType === 'summon' || l.actionType === 'revive'),
        ) ?? false
      expect(isSummoner).toBe(false)
    }
  })

  it('使用済み能力は行動候補から除外される（revive）', () => {
    const dead = createEnemyUnit(
      makeEnemy('dead-action', { currentHp: 0, maxHp: 30, abilities: [] }),
    )
    const reviver = createEnemyUnit(
      makeEnemy('reviver-action', {
        abilities: [{ abilityId: 'revive', name: '蘇生' }],
        behavior: { usesAbilitiesFirst: true } as unknown as EnemyBehavior,
      }),
    )
    reviver.usedAbilities.add('revive')
    const party = [createAdventurerUnit(makeAdventurer('action-adv'))]
    const action = decideEnemyAction(reviver, aiState(party, [reviver, dead]))
    expect(action.action).not.toBe('revive')
  })

  it('召喚個体を再度蘇生しない', () => {
    const summoned = createEnemyUnit(
      makeEnemy('summoned-dead', {
        currentHp: 0,
        maxHp: 10,
        abilities: [],
      }),
    )
    summoned.isSummoned = true
    const normalDead = createEnemyUnit(
      makeEnemy('normal-dead', {
        currentHp: 0,
        maxHp: 30,
        abilities: [],
      }),
    )
    const reviver = createEnemyUnit(
      makeEnemy('reviver-no-summon', {
        abilities: [{ abilityId: 'revive', name: '蘇生' }],
        behavior: { usesAbilitiesFirst: true } as unknown as EnemyBehavior,
      }),
    )
    const party = [createAdventurerUnit(makeAdventurer('action-adv2'))]
    const action = decideEnemyAction(
      reviver,
      aiState(party, [reviver, summoned, normalDead]),
    )
    expect(action.action).toBe('revive')
    expect(action.target?.id).toBe(normalDead.id)
  })
})
