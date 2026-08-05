import { describe, expect, it } from 'vitest'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import { generateEnemy } from '../generators/enemyGenerator.ts'
import { generateAdventurers } from '../generators/adventurerGenerator.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { runBattle, executeSummon, type BattleState } from './battle.ts'
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

  it('同一召喚者が複数ラウンド生存し summon は 1 回だけ', () => {
    const summoner = makeEnemy('multi-summoner', {
      maxHp: 1000,
      currentHp: 1000,
      threatCost: 1,
      stats: { str: 1, con: 100, dex: 0, int: 1, per: 1, wil: 100, soc: 1 },
      skills: {
        melee: 0,
        ranged: 1,
        defense: 1,
        tactics: 1,
        attackMagic: 0,
        defenseMagic: 1,
        healing: 0,
        scouting: 0,
        stealth: 0,
        trapDetection: 0,
        trapDisarm: 0,
        survival: 0,
        monsterKnowledge: 0,
        firstAid: 0,
        leadership: 0,
      },
      abilities: [{ abilityId: 'summon', name: '召喚' }],
      behavior: { usesAbilitiesFirst: true } as unknown as EnemyBehavior,
      morale: 100,
    })
    const adv = makeAdventurer('multi-adv', {
      maxHp: 1000,
      currentHp: 1000,
      maxMp: 100,
      currentMp: 100,
      morale: 100,
      stats: { str: 0, con: 100, dex: 1, int: 1, per: 1, wil: 100, soc: 1 },
      skills: {
        melee: 1,
        ranged: 0,
        defense: 1,
        tactics: 1,
        attackMagic: 0,
        defenseMagic: 1,
        healing: 1,
        scouting: 1,
        stealth: 0,
        trapDetection: 0,
        trapDisarm: 0,
        survival: 0,
        monsterKnowledge: 0,
        firstAid: 0,
        leadership: 100,
      },
      equipment: {
        weapon: { id: 'w', name: 'W', kind: 'melee', damage: 0 },
        armor: { id: 'a', name: 'A', reduction: 0 },
      },
      personality: {
        bravery: 3,
        caution: 0,
        cooperation: 0,
        discipline: 0,
        altruism: 0,
        greed: 0,
      },
    })
    const result = runBattle('multi-summon', [adv], [summoner])
    const summonLogs = result.logs.filter(
      (l) => l.actionType === 'summon' && l.actorId === summoner.id,
    )
    expect(summonLogs.length).toBeLessThanOrEqual(1)
    expect(result.rounds).toBeGreaterThanOrEqual(2)
    expect(result.survivingEnemies.includes(summoner.id)).toBe(true)
  })

  it('蘇生者が蘇生後も複数ラウンド生存し revive は 1 回だけ', () => {
    const reviver = makeEnemy('multi-reviver', {
      maxHp: 1000,
      currentHp: 1000,
      threatCost: 1,
      stats: { str: 1, con: 100, dex: 0, int: 1, per: 1, wil: 100, soc: 1 },
      skills: {
        melee: 0,
        ranged: 1,
        defense: 1,
        tactics: 1,
        attackMagic: 0,
        defenseMagic: 1,
        healing: 0,
        scouting: 0,
        stealth: 0,
        trapDetection: 0,
        trapDisarm: 0,
        survival: 0,
        monsterKnowledge: 0,
        firstAid: 0,
        leadership: 0,
      },
      abilities: [{ abilityId: 'revive', name: '蘇生' }],
      behavior: { usesAbilitiesFirst: true } as unknown as EnemyBehavior,
      morale: 100,
    })
    const dead = makeEnemy('multi-dead', {
      currentHp: 0,
      maxHp: 10,
      abilities: [],
    })
    const other = makeEnemy('multi-other', {
      maxHp: 1000,
      currentHp: 1000,
      threatCost: 1,
      stats: { str: 1, con: 100, dex: 0, int: 1, per: 1, wil: 100, soc: 1 },
      skills: {
        melee: 0,
        ranged: 1,
        defense: 1,
        tactics: 1,
        attackMagic: 0,
        defenseMagic: 1,
        healing: 0,
        scouting: 0,
        stealth: 0,
        trapDetection: 0,
        trapDisarm: 0,
        survival: 0,
        monsterKnowledge: 0,
        firstAid: 0,
        leadership: 0,
      },
      abilities: [],
      morale: 100,
    })
    const adv = makeAdventurer('multi-rev-adv', {
      maxHp: 1000,
      currentHp: 1000,
      maxMp: 100,
      currentMp: 100,
      morale: 100,
      stats: { str: 0, con: 100, dex: 1, int: 1, per: 1, wil: 100, soc: 1 },
      skills: {
        melee: 1,
        ranged: 0,
        defense: 1,
        tactics: 1,
        attackMagic: 0,
        defenseMagic: 1,
        healing: 1,
        scouting: 1,
        stealth: 0,
        trapDetection: 0,
        trapDisarm: 0,
        survival: 0,
        monsterKnowledge: 0,
        firstAid: 0,
        leadership: 100,
      },
      equipment: {
        weapon: { id: 'w', name: 'W', kind: 'melee', damage: 0 },
        armor: { id: 'a', name: 'A', reduction: 0 },
      },
      personality: {
        bravery: 3,
        caution: 0,
        cooperation: 0,
        discipline: 0,
        altruism: 0,
        greed: 0,
      },
    })
    const result = runBattle('multi-revive', [adv], [reviver, dead, other])
    const reviveLogs = result.logs.filter(
      (l) => l.actionType === 'revive' && l.actorId === reviver.id,
    )
    expect(reviveLogs.length).toBeLessThanOrEqual(1)
    expect(result.rounds).toBeGreaterThanOrEqual(2)
    expect(result.survivingEnemies.includes(reviver.id)).toBe(true)
  })
})

function makeSummonTestState(
  summoner: ReturnType<typeof createEnemyUnit>,
  extras: ReturnType<typeof createEnemyUnit>[],
): BattleState {
  return {
    seed: 'summon-test',
    rng: new SeededRng('summon-test'),
    party: [],
    enemies: [summoner, ...extras],
    round: 1,
    logs: [],
    contact: {
      type: 'success',
      partyScouting: 0,
      enemyStealth: 0,
      successChance: 50,
      roll: 50,
      effects: {},
    },
    discoveredWeaknesses: new Set(),
    partyDamageDealt: 0,
    enemyDamageDealt: 0,
    ended: false,
    partyInitBonus: 0,
    enemyInitBonus: 0,
    deadAdventurers: new Set(),
    injuries: [],
    abilityUsage: {},
    retreatAttempts: [],
    lastRetreatRound: -2,
    context: {
      lighting: 'normal',
      noise: 0,
      water: false,
      smoke: false,
    },
  }
}

describe('召喚上限の回帰テスト', () => {
  it('敵12体のうち1体が死亡している場合、1体以上召喚できる', () => {
    const summoner = createEnemyUnit(
      makeEnemy('summon-cap-summoner', {
        abilities: [{ abilityId: 'summon', name: '召喚' }],
        behavior: { usesAbilitiesFirst: true } as unknown as EnemyBehavior,
      }),
    )
    const enemies: ReturnType<typeof createEnemyUnit>[] = []
    for (let i = 0; i < 10; i++) {
      enemies.push(createEnemyUnit(makeEnemy(`summon-cap-alive-${i}`)))
    }
    enemies.push(
      createEnemyUnit(makeEnemy('summon-cap-dead', { currentHp: 0 })),
    )
    const state = makeSummonTestState(summoner, enemies)
    const summoned = executeSummon(state, summoner, {
      action: 'summon',
      abilityId: 'summon',
    })
    expect(summoned).toBeGreaterThanOrEqual(1)
    expect(state.enemies.filter((e) => e.isAlive && !e.escaped).length).toBe(12)
    expect(summoner.usedAbilities.has('summon')).toBe(true)
    expect(state.abilityUsage.summon).toBe(1)
    const summonLog = state.logs.find((l) => l.actionType === 'summon')
    expect(summonLog).toBeDefined()
    expect(summonLog!.result).toContain('1体')
  })

  it('生存敵が12体の場合、AIは召喚を選択しない', () => {
    const summoner = createEnemyUnit(
      makeEnemy('summon-full-summoner', {
        abilities: [{ abilityId: 'summon', name: '召喚' }],
        behavior: { usesAbilitiesFirst: true } as unknown as EnemyBehavior,
      }),
    )
    const enemies: ReturnType<typeof createEnemyUnit>[] = []
    for (let i = 0; i < 11; i++) {
      enemies.push(createEnemyUnit(makeEnemy(`summon-full-${i}`)))
    }
    const party = [createAdventurerUnit(makeAdventurer('summon-full-adv'))]
    const action = decideEnemyAction(
      summoner,
      aiState(party, [summoner, ...enemies]),
    )
    expect(action.action).not.toBe('summon')
  })

  it('召喚可能枠が0の場合、能力を消費しない', () => {
    const summoner = createEnemyUnit(
      makeEnemy('summon-zero-summoner', {
        abilities: [{ abilityId: 'summon', name: '召喚' }],
      }),
    )
    const enemies: ReturnType<typeof createEnemyUnit>[] = []
    for (let i = 0; i < 11; i++) {
      enemies.push(createEnemyUnit(makeEnemy(`summon-zero-${i}`)))
    }
    const state = makeSummonTestState(summoner, enemies)
    const beforeLogs = state.logs.length
    const summoned = executeSummon(state, summoner, {
      action: 'summon',
      abilityId: 'summon',
    })
    expect(summoned).toBe(0)
    expect(summoner.usedAbilities.has('summon')).toBe(false)
    expect(state.abilityUsage.summon).toBeUndefined()
    expect(state.logs.length).toBe(beforeLogs)
  })

  it('召喚ログに0体召喚が記録されない', () => {
    const summoner = createEnemyUnit(
      makeEnemy('summon-no-log-summoner', {
        abilities: [{ abilityId: 'summon', name: '召喚' }],
      }),
    )
    const enemies: ReturnType<typeof createEnemyUnit>[] = []
    for (let i = 0; i < 11; i++) {
      enemies.push(createEnemyUnit(makeEnemy(`summon-no-log-${i}`)))
    }
    const state = makeSummonTestState(summoner, enemies)
    executeSummon(state, summoner, { action: 'summon', abilityId: 'summon' })
    const summonLog = state.logs.find((l) => l.actionType === 'summon')
    expect(summonLog).toBeUndefined()
  })
})
