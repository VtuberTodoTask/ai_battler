import { describe, expect, it } from 'vitest'
import {
  generateAdventurer,
  generateAdventurers,
} from '../generators/adventurerGenerator.ts'
import { generateEnemy } from '../generators/enemyGenerator.ts'
import {
  calculatePartyThreat,
  generateEncounter,
} from '../generators/encounterGenerator.ts'
import { runBattle } from './battle.ts'
import { createAdventurerUnit, createEnemyUnit } from './battleState.ts'
import { calculateHitChance, rollAttack, healUnit } from './actions.ts'
import { decideAdventurerAction, decideEnemyAction } from './ai.ts'
import { calculateRetreatChance } from './morale.ts'
import { SeededRng } from '../rng/seededRng.ts'
import type {
  Adventurer,
  Enemy,
  AdventurerRole,
  BaseStats,
  SkillSet,
  EnemyBehavior,
  EquipmentSet,
  Personality,
} from '../models/types.ts'

type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

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

function makeAdventurer(
  seed: string,
  role: AdventurerRole,
  overrides: DeepPartial<Adventurer> = {},
): Adventurer {
  const base = generateAdventurer({ seed, rank: 'C', role })
  const hp =
    (overrides.currentHp as number | undefined) ??
    (overrides.maxHp as number | undefined) ??
    base.currentHp
  const mp = (overrides.currentMp as number | undefined) ?? base.currentMp
  const equipment = overrides.equipment
    ? {
        weapon: {
          ...base.equipment.weapon,
          ...((overrides.equipment as Partial<EquipmentSet>).weapon ?? {}),
        },
        armor: {
          ...base.equipment.armor,
          ...((overrides.equipment as Partial<EquipmentSet>).armor ?? {}),
        },
      }
    : base.equipment
  return {
    ...base,
    ...overrides,
    currentHp: hp,
    currentMp: mp,
    maxHp: (overrides.maxHp as number | undefined) ?? base.maxHp,
    maxMp: (overrides.maxMp as number | undefined) ?? base.maxMp,
    stats: { ...base.stats, ...(overrides.stats as Partial<BaseStats>) },
    skills: { ...base.skills, ...(overrides.skills as Partial<SkillSet>) },
    personality: {
      ...base.personality,
      ...(overrides.personality as Partial<Personality>),
    },
    equipment,
    traits: overrides.traits ?? base.traits,
    morale: overrides.morale ?? base.morale,
  } as Adventurer
}

function makeEnemy(seed: string, overrides: DeepPartial<Enemy> = {}): Enemy {
  const base = generateEnemy(seed, {
    rank: 'C',
    species: 'beast',
    archetype: 'assault',
  })
  const hp =
    (overrides.currentHp as number | undefined) ??
    (overrides.maxHp as number | undefined) ??
    base.currentHp
  const baseEquipment = base.equipment ?? {
    weapon: { id: 'claw', name: 'Claw', kind: 'melee' as const, damage: 4 },
    armor: { id: 'hide', name: 'Hide', reduction: 0 },
  }
  const equipment = overrides.equipment
    ? {
        weapon: {
          ...baseEquipment.weapon,
          ...((overrides.equipment as Partial<EquipmentSet>).weapon ?? {}),
        },
        armor: {
          ...baseEquipment.armor,
          ...((overrides.equipment as Partial<EquipmentSet>).armor ?? {}),
        },
      }
    : baseEquipment
  return {
    ...base,
    ...overrides,
    currentHp: hp,
    maxHp: (overrides.maxHp as number | undefined) ?? base.maxHp,
    stats: { ...base.stats, ...(overrides.stats as Partial<BaseStats>) },
    skills: { ...base.skills, ...(overrides.skills as Partial<SkillSet>) },
    behavior: {
      ...base.behavior,
      ...(overrides.behavior as Partial<EnemyBehavior>),
    },
    abilities: overrides.abilities ?? base.abilities,
    weaknesses: overrides.weaknesses ?? base.weaknesses,
    equipment,
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

describe('特殊能力', () => {
  it('flight: 近接攻撃の命中判定が下がる', () => {
    const adventurer = makeAdventurer('adv-flight', 'vanguard', {
      skills: { melee: 40 } as Partial<SkillSet>,
      stats: { str: 60, dex: 60, con: 60 } as Partial<BaseStats>,
    })
    const flying = makeEnemy('enemy-flight', {
      abilities: [{ abilityId: 'flight', name: '飛行' }] as Enemy['abilities'],
      skills: { defense: 30 } as Partial<SkillSet>,
      stats: { dex: 60, con: 60 } as Partial<BaseStats>,
    })
    const normal = makeEnemy('enemy-normal', {
      abilities: [] as Enemy['abilities'],
      skills: { defense: 30 } as Partial<SkillSet>,
      stats: { dex: 60, con: 60 } as Partial<BaseStats>,
    })
    const a = createAdventurerUnit(adventurer)
    const f = createEnemyUnit(flying)
    const n = createEnemyUnit(normal)
    const rng = new FakeRng()
    rng.hit = 40
    const without = rollAttack(rng, a, n, 'melee', 'defense', 8, 'physical', {
      attackType: 'melee',
    })
    const withFlight = rollAttack(
      rng,
      a,
      f,
      'melee',
      'defense',
      8,
      'physical',
      { attackType: 'melee' },
    )
    expect(without.hit).toBe(true)
    expect(withFlight.hit).toBe(false)
  })

  it('areaAttack: 敵が攻撃したとき追加ダメージログが発生する', () => {
    const party = generateAdventurers({
      seed: 'area-party',
      count: 4,
      rank: 'C',
    })
    const enemy = makeEnemy('area-enemy', {
      abilities: [
        { abilityId: 'areaAttack', name: '範囲攻撃' },
      ] as Enemy['abilities'],
      maxHp: 200,
      stats: { str: 80, dex: 80, con: 60 } as Partial<BaseStats>,
      skills: { melee: 80, defense: 40 } as Partial<SkillSet>,
    })
    const result = runBattle('area-seed', party, [enemy])
    expect(result.logs.some((l) => l.actionType === 'area')).toBe(true)
    expect(result.enemyDamageDealt).toBeGreaterThan(0)
  })

  it('revive: 戦闘不能の仲間を蘇生する行動を選択する', () => {
    const dead = createEnemyUnit(makeEnemy('dead', { currentHp: 0, maxHp: 30 }))
    const reviver = makeEnemy('reviver', {
      abilities: [{ abilityId: 'revive', name: '蘇生' }] as Enemy['abilities'],
      behavior: { usesAbilitiesFirst: true } as Partial<EnemyBehavior>,
    })
    const party = [createAdventurerUnit(makeAdventurer('rev-adv', 'vanguard'))]
    const action = decideEnemyAction(
      createEnemyUnit(reviver),
      aiState(party, [createEnemyUnit(reviver), dead]),
    )
    expect(action.action).toBe('revive')
    expect(action.target?.id).toBe(dead.id)
  })

  it('frontDefense: 正面からの物理ダメージを軽減する', () => {
    const attacker = createAdventurerUnit(
      makeAdventurer('front-atk', 'vanguard', {
        stats: { str: 60, dex: 60, con: 60 } as Partial<BaseStats>,
        skills: { melee: 80 } as Partial<SkillSet>,
        equipment: {
          weapon: { id: 'sword', name: 'Sword', kind: 'melee', damage: 6 },
          armor: { id: 'cloth', name: 'Cloth', reduction: 0 },
        } as DeepPartial<EquipmentSet>,
      }),
    )
    const withDef = createEnemyUnit(
      makeEnemy('front-def', {
        abilities: [
          { abilityId: 'frontDefense', name: '正面防御' },
        ] as Enemy['abilities'],
        stats: { con: 60 } as Partial<BaseStats>,
        skills: { defense: 20 } as Partial<SkillSet>,
        equipment: {
          weapon: { id: 'claw', name: 'Claw', kind: 'melee', damage: 4 },
          armor: { id: 'hide', name: 'Hide', reduction: 0 },
        } as DeepPartial<EquipmentSet>,
      }),
    )
    const withoutDef = createEnemyUnit(
      makeEnemy('front-none', {
        abilities: [] as Enemy['abilities'],
        stats: { con: 60 } as Partial<BaseStats>,
        skills: { defense: 20 } as Partial<SkillSet>,
        equipment: {
          weapon: { id: 'claw', name: 'Claw', kind: 'melee', damage: 4 },
          armor: { id: 'hide', name: 'Hide', reduction: 0 },
        } as DeepPartial<EquipmentSet>,
      }),
    )
    const rng = new FakeRng()
    const r1 = rollAttack(
      rng,
      attacker,
      withDef,
      'melee',
      'defense',
      8,
      'physical',
      { attackType: 'melee' },
    )
    const r2 = rollAttack(
      rng,
      attacker,
      withoutDef,
      'melee',
      'defense',
      8,
      'physical',
      { attackType: 'melee' },
    )
    expect(r1.hit && r2.hit).toBe(true)
    expect(r1.damageDealt).toBeLessThan(r2.damageDealt)
  })

  it('darknessBoost: 暗闇で攻撃力が上昇する', () => {
    const attacker = createEnemyUnit(
      makeEnemy('dark-atk', {
        abilities: [
          { abilityId: 'darknessBoost', name: '暗闇強化' },
        ] as Enemy['abilities'],
        stats: { str: 60, dex: 60 } as Partial<BaseStats>,
        skills: { melee: 80 } as Partial<SkillSet>,
      }),
    )
    const defender = createAdventurerUnit(
      makeAdventurer('dark-def', 'vanguard'),
    )
    const rng = new FakeRng()
    const normal = rollAttack(
      rng,
      attacker,
      defender,
      'melee',
      'defense',
      10,
      'physical',
      { attackType: 'melee' },
    )
    const dark = rollAttack(
      rng,
      attacker,
      defender,
      'melee',
      'defense',
      10,
      'physical',
      {
        attackType: 'melee',
        context: { lighting: 'dark', noise: 0, water: false, smoke: false },
      },
    )
    expect(normal.hit && dark.hit).toBe(true)
    expect(dark.damageDealt).toBeGreaterThan(normal.damageDealt)
  })

  it('corpseExplosion: 死亡時に周囲へダメージを与える', () => {
    const enemy = makeEnemy('corpse-enemy', {
      maxHp: 1,
      currentHp: 1,
      abilities: [
        { abilityId: 'corpseExplosion', name: '死体爆発' },
      ] as Enemy['abilities'],
      stats: { str: 20, dex: 20, con: 10 } as Partial<BaseStats>,
      behavior: { targetPreference: 'frontline' } as Partial<EnemyBehavior>,
    })
    const party = generateAdventurers({
      seed: 'corpse-party',
      count: 4,
      rank: 'C',
    })
    const result = runBattle('corpse-seed', party, [enemy])
    expect(result.logs.some((l) => l.actionType === 'corpseExplosion')).toBe(
      true,
    )
  })

  it('summon: 戦闘中に仲間を召喚する', () => {
    const summoner = makeEnemy('summoner', {
      maxHp: 200,
      abilities: [{ abilityId: 'summon', name: '召喚' }] as Enemy['abilities'],
      behavior: { usesAbilitiesFirst: true } as Partial<EnemyBehavior>,
      stats: { str: 20, dex: 20, con: 80 } as Partial<BaseStats>,
    })
    const party = generateAdventurers({
      seed: 'summon-party',
      count: 4,
      rank: 'C',
    })
    const result = runBattle('summon-seed', party, [summoner])
    expect(result.logs.some((l) => l.actionType === 'summon')).toBe(true)
    const allEnemyIds = [
      ...result.survivingEnemies,
      ...result.defeatedEnemies,
      ...result.escapedEnemies,
    ]
    expect(allEnemyIds.length).toBeGreaterThan(1)
  })

  it('taunt: 挑発を行っている敵を優先的に攻撃する', () => {
    const taunter = createEnemyUnit(
      makeEnemy('taunter', {
        abilities: [{ abilityId: 'taunt', name: '挑発' }] as Enemy['abilities'],
      }),
    )
    const other = createEnemyUnit(
      makeEnemy('other', { abilities: [] as Enemy['abilities'] }),
    )
    const adventurer = createAdventurerUnit(makeAdventurer('taunt-adv', 'mage'))
    const action = decideAdventurerAction(
      adventurer,
      aiState([adventurer], [taunter, other]),
    )
    expect(action.target?.id).toBe(taunter.id)
  })

  it('healBlock: 回復を妨害する', () => {
    const target = createAdventurerUnit(makeAdventurer('heal-target', 'healer'))
    target.statusEffects = [
      { type: 'healBlocked', duration: 2, sourceId: 'enemy' },
    ]
    target.hp = 10
    target.maxHp = 50
    const healer = createAdventurerUnit(makeAdventurer('healer', 'healer'))
    const amount = healUnit(healer, target, 20)
    expect(amount).toBe(0)
    expect(target.hp).toBe(10)
  })

  it('counter: 被弾時に反撃するログが発生する', () => {
    const party = Array.from({ length: 4 }, (_, i) =>
      generateAdventurer({
        seed: `counter-party-${i}`,
        rank: 'D',
        role: 'vanguard',
      }),
    )
    const enemy = makeEnemy('counter-enemy', {
      maxHp: 500,
      abilities: [{ abilityId: 'counter', name: '反撃' }] as Enemy['abilities'],
      stats: { str: 20, dex: 20, con: 100 } as Partial<BaseStats>,
      skills: { melee: 40, defense: 50 } as Partial<SkillSet>,
      behavior: { targetPreference: 'frontline' } as Partial<EnemyBehavior>,
    })
    let counterSeen = false
    for (let i = 0; i < 50; i++) {
      const result = runBattle(`counter-seed-${i}`, party, [enemy])
      if (result.logs.some((l) => l.actionType === 'counter')) {
        counterSeen = true
        break
      }
    }
    expect(counterSeen).toBe(true)
  })

  it('stealthStart: 隠密状態で命中補正を得る', () => {
    const attacker = createAdventurerUnit(
      makeAdventurer('stealth-atk', 'scout', {
        skills: { melee: 50 } as Partial<SkillSet>,
      }),
    )
    const defender = createEnemyUnit(
      makeEnemy('stealth-def', {
        skills: { defense: 30 } as Partial<SkillSet>,
      }),
    )
    const rng = new FakeRng()
    rng.hit = 75
    const without = rollAttack(
      rng,
      attacker,
      defender,
      'melee',
      'defense',
      8,
      'physical',
      { attackType: 'melee' },
    )
    attacker.statusEffects = [
      { type: 'stealthed', duration: 1, sourceId: 'test' },
    ]
    const withStealth = rollAttack(
      rng,
      attacker,
      defender,
      'melee',
      'defense',
      8,
      'physical',
      { attackType: 'melee' },
    )
    expect(without.hit).toBe(false)
    expect(withStealth.hit).toBe(true)
  })

  it('swarmCoordination: 同種がいるほどダメージが増加する', () => {
    const attacker = createEnemyUnit(
      makeEnemy('swarm-atk', {
        species: 'insect',
        abilities: [
          { abilityId: 'swarmCoordination', name: '群れ連携' },
        ] as Enemy['abilities'],
      }),
    )
    const defender = createAdventurerUnit(
      makeAdventurer('swarm-def', 'vanguard'),
    )
    const rng = new FakeRng()
    const alone = rollAttack(
      rng,
      attacker,
      defender,
      'melee',
      'defense',
      10,
      'physical',
      { attackType: 'melee', swarmAllyCount: 0 },
    )
    const swarm = rollAttack(
      rng,
      attacker,
      defender,
      'melee',
      'defense',
      10,
      'physical',
      { attackType: 'melee', swarmAllyCount: 2 },
    )
    expect(alone.hit && swarm.hit).toBe(true)
    expect(swarm.damageDealt).toBeGreaterThan(alone.damageDealt)
  })

  it('poisonAttack: 命中時に毒を付与する', () => {
    const attacker = createEnemyUnit(
      makeEnemy('poison-atk', {
        abilities: [
          { abilityId: 'poisonAttack', name: '毒攻撃' },
        ] as Enemy['abilities'],
      }),
    )
    const defender = createAdventurerUnit(
      makeAdventurer('poison-def', 'vanguard'),
    )
    const rng = new FakeRng()
    const result = rollAttack(
      rng,
      attacker,
      defender,
      'melee',
      'defense',
      10,
      'physical',
      { attackType: 'melee' },
    )
    expect(result.hit).toBe(true)
    expect(result.statusApplied).toContain('poisoned')
  })

  it('bleedAttack: 命中時に出血を付与する', () => {
    const attacker = createEnemyUnit(
      makeEnemy('bleed-atk', {
        abilities: [
          { abilityId: 'bleedAttack', name: '出血攻撃' },
        ] as Enemy['abilities'],
      }),
    )
    const defender = createAdventurerUnit(
      makeAdventurer('bleed-def', 'vanguard'),
    )
    const rng = new FakeRng()
    const result = rollAttack(
      rng,
      attacker,
      defender,
      'melee',
      'defense',
      10,
      'physical',
      { attackType: 'melee' },
    )
    expect(result.hit).toBe(true)
    expect(result.statusApplied).toContain('bleeding')
  })

  it('fear: 命中時に恐怖を付与する', () => {
    const attacker = createEnemyUnit(
      makeEnemy('fear-atk', {
        abilities: [{ abilityId: 'fear', name: '恐怖' }] as Enemy['abilities'],
      }),
    )
    const defender = createAdventurerUnit(
      makeAdventurer('fear-def', 'vanguard'),
    )
    const rng = new FakeRng()
    const result = rollAttack(
      rng,
      attacker,
      defender,
      'melee',
      'defense',
      10,
      'physical',
      { attackType: 'melee' },
    )
    expect(result.hit).toBe(true)
    expect(result.statusApplied).toContain('frightened')
  })

  it('magicResist: 魔術ダメージを軽減する', () => {
    const attacker = createAdventurerUnit(
      makeAdventurer('mr-atk', 'mage', {
        equipment: {
          weapon: {
            id: 'staff',
            name: 'Staff',
            kind: 'magic',
            damage: 8,
            element: 'dark',
          },
          armor: { id: 'robe', name: 'Robe', reduction: 0 },
        } as DeepPartial<EquipmentSet>,
      }),
    )
    const resist = createEnemyUnit(
      makeEnemy('mr-def', {
        abilities: [
          { abilityId: 'magicResist', name: '魔術耐性' },
        ] as Enemy['abilities'],
        skills: { defenseMagic: 20 } as Partial<SkillSet>,
      }),
    )
    const normal = createEnemyUnit(
      makeEnemy('mr-none', {
        abilities: [] as Enemy['abilities'],
        skills: { defenseMagic: 20 } as Partial<SkillSet>,
      }),
    )
    const rng = new FakeRng()
    const r1 = rollAttack(
      rng,
      attacker,
      resist,
      'attackMagic',
      'defenseMagic',
      10,
      'dark',
      { attackType: 'magic' },
    )
    const r2 = rollAttack(
      rng,
      attacker,
      normal,
      'attackMagic',
      'defenseMagic',
      10,
      'dark',
      { attackType: 'magic' },
    )
    expect(r1.hit && r2.hit).toBe(true)
    expect(r1.damageDealt).toBeLessThan(r2.damageDealt)
  })

  it('physicalResist: 物理ダメージを軽減する', () => {
    const attacker = createAdventurerUnit(makeAdventurer('pr-atk', 'vanguard'))
    const resist = createEnemyUnit(
      makeEnemy('pr-def', {
        abilities: [
          { abilityId: 'physicalResist', name: '物理耐性' },
        ] as Enemy['abilities'],
        skills: { defense: 20 } as Partial<SkillSet>,
      }),
    )
    const normal = createEnemyUnit(
      makeEnemy('pr-none', {
        abilities: [] as Enemy['abilities'],
        skills: { defense: 20 } as Partial<SkillSet>,
      }),
    )
    const rng = new FakeRng()
    const r1 = rollAttack(
      rng,
      attacker,
      resist,
      'melee',
      'defense',
      10,
      'physical',
      { attackType: 'melee' },
    )
    const r2 = rollAttack(
      rng,
      attacker,
      normal,
      'melee',
      'defense',
      10,
      'physical',
      { attackType: 'melee' },
    )
    expect(r1.hit && r2.hit).toBe(true)
    expect(r1.damageDealt).toBeLessThan(r2.damageDealt)
  })

  it('regeneration: ラウンド終了時に回復する', () => {
    const enemy = makeEnemy('regen-enemy', {
      maxHp: 300,
      currentHp: 300,
      abilities: [
        { abilityId: 'regeneration', name: '再生' },
      ] as Enemy['abilities'],
      stats: { str: 20, dex: 20, con: 100 } as Partial<BaseStats>,
      skills: { melee: 30, defense: 50 } as Partial<SkillSet>,
    })
    const party = generateAdventurers({
      seed: 'regen-party',
      count: 4,
      rank: 'C',
    })
    const result = runBattle('regen-seed', party, [enemy])
    expect(result.logs.some((l) => l.actionType === 'regen')).toBe(true)
  })
})

describe('弱点発見と利用', () => {
  it('known=false の弱点はダメージ計算に利用されない', () => {
    const attacker = createAdventurerUnit(
      makeAdventurer('weak-atk', 'mage', {
        equipment: {
          weapon: {
            id: 'staff',
            name: 'Staff',
            kind: 'magic',
            damage: 8,
            element: 'fire',
          },
          armor: { id: 'robe', name: 'Robe', reduction: 0 },
        } as DeepPartial<EquipmentSet>,
      }),
    )
    const defender = createEnemyUnit(
      makeEnemy('weak-def', {
        weaknesses: [
          { weaknessId: 'fire', name: '火', known: false },
        ] as Enemy['weaknesses'],
        skills: { defenseMagic: 20 } as Partial<SkillSet>,
      }),
    )
    const rng = new FakeRng()
    const unknown = rollAttack(
      rng,
      attacker,
      defender,
      'attackMagic',
      'defenseMagic',
      10,
      'fire',
      { attackType: 'magic' },
    )
    if (defender.weaknesses) defender.weaknesses[0].known = true
    const known = rollAttack(
      rng,
      attacker,
      defender,
      'attackMagic',
      'defenseMagic',
      10,
      'fire',
      { attackType: 'magic' },
    )
    expect(unknown.hit && known.hit).toBe(true)
    expect(known.damageDealt).toBeGreaterThan(unknown.damageDealt)
  })

  it('魔物知識成功後に弱点が利用可能になる', () => {
    const attacker = makeAdventurer('monk-atk', 'mage', {
      skills: { monsterKnowledge: 100, attackMagic: 80 } as Partial<SkillSet>,
      equipment: {
        weapon: {
          id: 'staff',
          name: 'Staff',
          kind: 'magic',
          damage: 8,
          element: 'fire',
        },
        armor: { id: 'robe', name: 'Robe', reduction: 0 },
      } as DeepPartial<EquipmentSet>,
    })
    const enemy = makeEnemy('monk-def', {
      weaknesses: [
        { weaknessId: 'fire', name: '火', known: false },
      ] as Enemy['weaknesses'],
      skills: { defenseMagic: 30 } as Partial<SkillSet>,
    })
    const party = [attacker]
    const result = runBattle('monk-seed', party, [enemy])
    expect(result.discoveredWeaknesses.length).toBeGreaterThan(0)
  })

  it('discoveredWeaknessesが空のままにならない（接敵大成功）', () => {
    const party = generateAdventurers({
      seed: 'discover-party',
      count: 4,
      rank: 'C',
    })
    const enemies = [
      makeEnemy('discover-enemy', {
        weaknesses: [
          { weaknessId: 'fire', name: '火', known: false },
        ] as Enemy['weaknesses'],
      }),
    ]
    const result = runBattle('discover-seed', party, enemies)
    expect(result.discoveredWeaknesses.length).toBeGreaterThan(0)
  })

  it('known=false の弱点を参照しないAIターゲット', () => {
    const mage = createAdventurerUnit(
      makeAdventurer('mage-ai', 'mage', {
        skills: { attackMagic: 80 } as Partial<SkillSet>,
      }),
    )
    const highThreat = createEnemyUnit(
      makeEnemy('high-threat', {
        rank: 'A',
        maxHp: 120,
        currentHp: 120,
        abilities: [] as Enemy['abilities'],
      }),
    )
    const fireWeakKnown = createEnemyUnit(
      makeEnemy('fire-known', {
        rank: 'C',
        maxHp: 40,
        currentHp: 40,
        weaknesses: [
          { weaknessId: 'fire', name: '火', known: true },
        ] as Enemy['weaknesses'],
      }),
    )
    const fireWeakUnknown = createEnemyUnit(
      makeEnemy('fire-unknown', {
        rank: 'C',
        maxHp: 40,
        currentHp: 40,
        weaknesses: [
          { weaknessId: 'fire', name: '火', known: false },
        ] as Enemy['weaknesses'],
      }),
    )
    const knownAction = decideAdventurerAction(
      mage,
      aiState([mage], [highThreat, fireWeakKnown]),
    )
    const unknownAction = decideAdventurerAction(
      mage,
      aiState([mage], [highThreat, fireWeakUnknown]),
    )
    expect(knownAction.target?.id).toBe(fireWeakKnown.id)
    expect(unknownAction.target?.id).toBe(highThreat.id)
  })
})

describe('非属性弱点', () => {
  it('rearAttack: 背面攻撃で弱点ダメージが増加する', () => {
    const attacker = createAdventurerUnit(makeAdventurer('rear-atk', 'scout'))
    const defender = createEnemyUnit(
      makeEnemy('rear-def', {
        weaknesses: [
          { weaknessId: 'rearAttack', name: '背面攻撃', known: true },
        ] as Enemy['weaknesses'],
        skills: { defense: 20 } as Partial<SkillSet>,
      }),
    )
    const rng = new FakeRng()
    const normal = rollAttack(
      rng,
      attacker,
      defender,
      'melee',
      'defense',
      10,
      'physical',
      { attackType: 'melee', isFlank: false },
    )
    const flank = rollAttack(
      rng,
      attacker,
      defender,
      'melee',
      'defense',
      10,
      'physical',
      { attackType: 'melee', isFlank: true },
    )
    expect(normal.hit && flank.hit).toBe(true)
    expect(flank.damageDealt).toBeGreaterThan(normal.damageDealt)
  })

  it('brightLight: 強い光でスタンを与える', () => {
    const attacker = createAdventurerUnit(makeAdventurer('light-atk', 'mage'))
    const defender = createEnemyUnit(
      makeEnemy('light-def', {
        weaknesses: [
          { weaknessId: 'brightLight', name: '強い光', known: true },
        ] as Enemy['weaknesses'],
      }),
    )
    const rng = new FakeRng()
    const result = rollAttack(
      rng,
      attacker,
      defender,
      'attackMagic',
      'defenseMagic',
      10,
      'dark',
      {
        attackType: 'magic',
        context: { lighting: 'bright', noise: 0, water: false, smoke: false },
      },
    )
    expect(result.statusApplied).toContain('stunned')
  })

  it('water: 水場で防御低下を与える', () => {
    const attacker = createAdventurerUnit(makeAdventurer('water-atk', 'mage'))
    const defender = createEnemyUnit(
      makeEnemy('water-def', {
        weaknesses: [
          { weaknessId: 'water', name: '水場', known: true },
        ] as Enemy['weaknesses'],
      }),
    )
    const rng = new FakeRng()
    const result = rollAttack(
      rng,
      attacker,
      defender,
      'attackMagic',
      'defenseMagic',
      10,
      'dark',
      {
        attackType: 'magic',
        context: { lighting: 'normal', noise: 0, water: true, smoke: false },
      },
    )
    expect(result.statusApplied).toContain('defenseDown')
  })

  it('smoke: 煙でスタンを与える', () => {
    const attacker = createAdventurerUnit(makeAdventurer('smoke-atk', 'mage'))
    const defender = createEnemyUnit(
      makeEnemy('smoke-def', {
        weaknesses: [
          { weaknessId: 'smoke', name: '煙', known: true },
        ] as Enemy['weaknesses'],
      }),
    )
    const rng = new FakeRng()
    const result = rollAttack(
      rng,
      attacker,
      defender,
      'attackMagic',
      'defenseMagic',
      10,
      'dark',
      {
        attackType: 'magic',
        context: { lighting: 'normal', noise: 0, water: false, smoke: true },
      },
    )
    expect(result.statusApplied).toContain('stunned')
  })

  it('loudNoise: 大音量で恐怖を与える', () => {
    const attacker = createAdventurerUnit(makeAdventurer('noise-atk', 'mage'))
    const defender = createEnemyUnit(
      makeEnemy('noise-def', {
        weaknesses: [
          { weaknessId: 'loudNoise', name: '大音量', known: true },
        ] as Enemy['weaknesses'],
      }),
    )
    const rng = new FakeRng()
    const result = rollAttack(
      rng,
      attacker,
      defender,
      'attackMagic',
      'defenseMagic',
      10,
      'dark',
      {
        attackType: 'magic',
        context: { lighting: 'normal', noise: 50, water: false, smoke: false },
      },
    )
    expect(result.statusApplied).toContain('frightened')
  })
})

describe('接敵効果', () => {
  it('接敵大成功で第1ラウンド命中率が上昇する', () => {
    const attacker = createAdventurerUnit(
      makeAdventurer('contact-atk', 'vanguard', {
        skills: { melee: 50 } as Partial<SkillSet>,
      }),
    )
    const defender = createEnemyUnit(
      makeEnemy('contact-def', {
        skills: { defense: 30 } as Partial<SkillSet>,
      }),
    )
    const base = calculateHitChance(attacker, defender, 'melee', 'defense', 0)
    const withBonus = calculateHitChance(
      attacker,
      defender,
      'melee',
      'defense',
      10,
    )
    expect(withBonus).toBe(base + 10)
  })

  it('接敵大成功でdiscoveredWeaknessesに記録される', () => {
    const party = generateAdventurers({
      seed: 'contact-party',
      count: 4,
      rank: 'B',
    })
    const enemy = makeEnemy('contact-enemy', {
      weaknesses: [
        { weaknessId: 'fire', name: '火', known: false },
      ] as Enemy['weaknesses'],
    })
    const result = runBattle('contact-seed', party, [enemy])
    const hasDiscovery = result.logs.some(
      (l) => l.phase === 'contact' && l.actionType === 'weaknessDiscovery',
    )
    expect(hasDiscovery || result.discoveredWeaknesses.length > 0).toBe(true)
  })
})

describe('戦闘結果', () => {
  it('重傷者がいる勝利はcostlyVictory', () => {
    const party = generateAdventurers({
      seed: 'costly-party',
      count: 4,
      rank: 'C',
    })
    const sacrificed = makeAdventurer('costly-sac', 'vanguard', {
      currentHp: -30,
      maxHp: 60,
      stats: { con: 20 } as Partial<BaseStats>,
    })
    const enemy = makeEnemy('costly-enemy', {
      maxHp: 10,
      currentHp: 10,
      stats: { str: 10, dex: 10, con: 10 } as Partial<BaseStats>,
    })
    const result = runBattle(
      'costly-seed',
      [sacrificed, ...party.slice(1)],
      [enemy],
    )
    expect(result.outcome).toBe('costlyVictory')
  })

  it('軽傷のみの勝利はvictory', () => {
    const party = generateAdventurers({
      seed: 'victory-party',
      count: 4,
      rank: 'B',
    })
    const enemy = makeEnemy('victory-enemy', {
      maxHp: 5,
      currentHp: 5,
      stats: { str: 5, dex: 5, con: 5 } as Partial<BaseStats>,
    })
    const result = runBattle('victory-seed', party, [enemy])
    expect(result.outcome).toBe('victory')
  })
})

describe('遭遇生成', () => {
  it('脅威点が予算の0.8～1.2倍に収まる', () => {
    for (let i = 0; i < 200; i++) {
      const party = generateAdventurers({ seed: `enc-party-${i}`, count: 4 })
      const threat = calculatePartyThreat(party)
      const difficulty = (['easy', 'normal', 'hard', 'deadly'] as const)[i % 4]
      const enemies = generateEncounter({
        seed: `enc-${i}`,
        partyThreat: threat,
        difficulty,
      })
      const total = enemies.reduce((sum, e) => sum + e.threatCost, 0)
      const budget =
        difficulty === 'easy'
          ? threat * 0.7
          : difficulty === 'normal'
            ? threat
            : difficulty === 'hard'
              ? threat * 1.25
              : threat * 1.5
      if (budget >= 1) {
        const ratio = total / budget
        expect(ratio).toBeGreaterThanOrEqual(0.8)
        expect(ratio).toBeLessThanOrEqual(1.2)
      }
    }
  })
})

describe('性格反映', () => {
  it('bravery/caution が撤退率に影響する', () => {
    const base = makeAdventurer('ret-base', 'vanguard')
    const brave = createAdventurerUnit(makeAdventurer('ret-brave', 'vanguard'))
    const coward = createAdventurerUnit(
      makeAdventurer('ret-coward', 'vanguard'),
    )
    for (const unit of [brave, coward]) {
      unit.skills.leadership = 10
      unit.stats.wil = 20
      unit.stats.dex = 20
    }
    ;(brave.original as Adventurer).personality = {
      ...base.personality,
      bravery: 3,
      caution: -3,
    }
    ;(coward.original as Adventurer).personality = {
      ...base.personality,
      bravery: -3,
      caution: 3,
    }
    const pursuers = [
      createEnemyUnit(
        makeEnemy('pursuer', {
          stats: { dex: 30, wil: 20 } as Partial<BaseStats>,
        }),
      ),
    ]
    const braveChance = calculateRetreatChance(brave, pursuers)
    const cowardChance = calculateRetreatChance(coward, pursuers)
    expect(braveChance).toBeGreaterThan(cowardChance)
  })

  it('altruism が高い治療役ほど早い段階で味方を治療する', () => {
    const high = createAdventurerUnit(
      makeAdventurer('altruism-high', 'healer', {
        personality: { altruism: 3 } as Partial<Personality>,
        currentMp: 10,
      }),
    )
    const low = createAdventurerUnit(
      makeAdventurer('altruism-low', 'healer', {
        personality: { altruism: -3 } as Partial<Personality>,
        currentMp: 10,
      }),
    )
    const wounded = createAdventurerUnit(
      makeAdventurer('altruism-wounded', 'vanguard', {
        currentHp: 28,
        maxHp: 50,
      }),
    )
    const healthy = createAdventurerUnit(
      makeAdventurer('altruism-healthy', 'ranger', {
        currentHp: 50,
        maxHp: 50,
      }),
    )
    const enemy = createEnemyUnit(makeEnemy('altr-enemy'))
    const highAction = decideAdventurerAction(
      high,
      aiState([high, wounded, healthy], [enemy]),
    )
    const lowAction = decideAdventurerAction(
      low,
      aiState([low, wounded, healthy], [enemy]),
    )
    expect(highAction.action).toBe('heal')
    expect(highAction.target?.id).toBe(wounded.id)
    expect(lowAction.action).toBe('attack')
  })

  it('heal は戦闘不能者を対象にしない', () => {
    const healer = createAdventurerUnit(
      makeAdventurer('healer-dead', 'healer', { currentMp: 10 }),
    )
    const down = createAdventurerUnit(
      makeAdventurer('down-target', 'vanguard', {
        currentHp: -5,
        maxHp: 50,
      }),
    )
    const amount = healUnit(healer, down, 20)
    expect(amount).toBe(0)
    expect(down.hp).toBe(-5)
  })

  it('discipline が指揮対象の追従に影響する', () => {
    const leader = createAdventurerUnit(makeAdventurer('leader', 'vanguard'))
    const follower = createAdventurerUnit(
      makeAdventurer('follower', 'ranger', {
        personality: {
          ...makeAdventurer('base', 'ranger').personality,
          discipline: 3,
        },
      }),
    )
    const target = createEnemyUnit(makeEnemy('leader-target'))
    const other = createEnemyUnit(makeEnemy('other-target'))
    const action = decideAdventurerAction(
      follower,
      aiState([leader, follower], [target, other], 1, target.id),
    )
    expect(action.target?.id).toBe(target.id)
  })
})

describe('特殊能力と勝率の整合性', () => {
  function winRate(
    seedBase: string,
    party: Adventurer[],
    enemy: Enemy,
    trials = 30,
  ): number {
    let wins = 0
    for (let i = 0; i < trials; i++) {
      const result = runBattle(`${seedBase}-${i}`, party, [enemy])
      if (result.outcome === 'victory' || result.outcome === 'costlyVictory')
        wins++
    }
    return wins / trials
  }

  it('areaAttack は勝率を下げるが極端に偏らない', () => {
    const party = generateAdventurers({
      seed: 'thr-party',
      count: 4,
      rank: 'C',
    })
    const baseEnemy = makeEnemy('thr-base', {
      maxHp: 150,
      stats: { str: 60, dex: 60, con: 80 } as Partial<BaseStats>,
      skills: { melee: 60, defense: 50 } as Partial<SkillSet>,
      abilities: [] as Enemy['abilities'],
    })
    const strongEnemy = makeEnemy('thr-area', {
      maxHp: 150,
      stats: { str: 60, dex: 60, con: 80 } as Partial<BaseStats>,
      skills: { melee: 60, defense: 50 } as Partial<SkillSet>,
      abilities: [
        { abilityId: 'areaAttack', name: '範囲攻撃' },
      ] as Enemy['abilities'],
    })
    const baseRate = winRate('base', party, baseEnemy, 100)
    const areaRate = winRate('area', party, strongEnemy, 100)
    expect(areaRate).toBeLessThan(baseRate)
    expect(baseRate - areaRate).toBeLessThan(0.5)
  })
})
