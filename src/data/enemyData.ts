import {
  AbilityDefinition,
  EnemyArchetype,
  EnemyRank,
  EnemySpecies,
  WeaknessDefinition,
} from '../core/models/types.ts'

export interface ArchetypeDefinition {
  id: EnemyArchetype
  name: string
  statMods: Partial<
    Record<'str' | 'con' | 'dex' | 'int' | 'per' | 'wil' | 'soc', number>
  >
  ambushBonus?: number
  defaultBehavior: {
    aggression: number
    caution: number
    targetPreference:
      'lowestHp' | 'highestThreat' | 'healer' | 'mage' | 'random' | 'frontline'
    retreatThreshold: number
    protectsLeader: boolean
    usesAbilitiesFirst: boolean
  }
}

export const ARCHETYPES: ArchetypeDefinition[] = [
  {
    id: 'assault',
    name: '強襲型',
    statMods: { str: 20, con: 15, dex: -10, int: -15, per: -5 },
    defaultBehavior: {
      aggression: 85,
      caution: 20,
      targetPreference: 'frontline',
      retreatThreshold: 25,
      protectsLeader: false,
      usesAbilitiesFirst: false,
    },
  },
  {
    id: 'skirmisher',
    name: '遊撃型',
    statMods: { dex: 20, per: 10, con: -5, wil: -5 },
    defaultBehavior: {
      aggression: 60,
      caution: 50,
      targetPreference: 'lowestHp',
      retreatThreshold: 35,
      protectsLeader: false,
      usesAbilitiesFirst: true,
    },
  },
  {
    id: 'ambusher',
    name: '待ち伏せ型',
    statMods: { dex: 15, per: 20, str: -5, wil: -10 },
    ambushBonus: 15,
    defaultBehavior: {
      aggression: 70,
      caution: 40,
      targetPreference: 'mage',
      retreatThreshold: 30,
      protectsLeader: false,
      usesAbilitiesFirst: true,
    },
  },
  {
    id: 'tank',
    name: '防壁型',
    statMods: { con: 25, wil: 10, dex: -15, int: -5 },
    defaultBehavior: {
      aggression: 40,
      caution: 70,
      targetPreference: 'frontline',
      retreatThreshold: 20,
      protectsLeader: true,
      usesAbilitiesFirst: false,
    },
  },
  {
    id: 'controller',
    name: '制御型',
    statMods: { int: 20, wil: 15, str: -15, con: -10 },
    defaultBehavior: {
      aggression: 50,
      caution: 60,
      targetPreference: 'healer',
      retreatThreshold: 40,
      protectsLeader: true,
      usesAbilitiesFirst: true,
    },
  },
  {
    id: 'swarm',
    name: '群体型',
    statMods: {
      str: -15,
      con: -15,
      dex: -15,
      int: -15,
      per: -15,
      wil: -15,
      soc: -15,
    },
    defaultBehavior: {
      aggression: 75,
      caution: 15,
      targetPreference: 'random',
      retreatThreshold: 15,
      protectsLeader: false,
      usesAbilitiesFirst: false,
    },
  },
]

export const ARCHETYPE_MAP = ARCHETYPES.reduce(
  (acc, a) => {
    acc[a.id] = a
    return acc
  },
  {} as Record<EnemyArchetype, ArchetypeDefinition>,
)

export interface SpeciesDefinition {
  id: EnemySpecies
  name: string
  statMods?: Partial<
    Record<'str' | 'con' | 'dex' | 'int' | 'per' | 'wil' | 'soc', number>
  >
  traits: string[]
  preferredArchetypes: EnemyArchetype[]
}

export const SPECIES: SpeciesDefinition[] = [
  {
    id: 'humanoid',
    name: '人型',
    preferredArchetypes: ['assault', 'skirmisher', 'controller', 'tank'],
    traits: ['usesEquipment', 'losesMoraleOnLeaderDeath', 'canSurrender'],
  },
  {
    id: 'beast',
    name: '獣',
    statMods: { str: 5, per: 5, soc: -10 },
    preferredArchetypes: ['assault', 'ambusher', 'swarm'],
    traits: ['scoutingBonus', 'injuredFleeOrBerserk', 'fearsFireAndNoise'],
  },
  {
    id: 'undead',
    name: 'アンデッド',
    statMods: { con: 10, wil: 5, soc: -20 },
    preferredArchetypes: ['assault', 'swarm', 'tank'],
    traits: ['poisonImmune', 'bleedImmune', 'noMoraleLoss', 'weakToHoly'],
  },
  {
    id: 'construct',
    name: '構造体',
    statMods: { str: 10, con: 15, dex: -10, wil: -10 },
    preferredArchetypes: ['tank', 'assault'],
    traits: [
      'poisonImmune',
      'bleedImmune',
      'fearImmune',
      'highDefense',
      'weakPointCoreOrJoint',
    ],
  },
  {
    id: 'aberration',
    name: '異形',
    statMods: { int: 10, wil: 10, soc: -10 },
    preferredArchetypes: ['controller', 'ambusher', 'skirmisher'],
    traits: ['firstFearCheck', 'manyAbilities', 'hiddenWeakness'],
  },
  {
    id: 'insect',
    name: '昆蟲',
    statMods: { dex: 5, per: 5, con: -5 },
    preferredArchetypes: ['swarm', 'assault', 'ambusher'],
    traits: ['swarmBonus', 'weakToFireAndSmoke', 'mayHaveLeader'],
  },
]

export const SPECIES_MAP = SPECIES.reduce(
  (acc, s) => {
    acc[s.id] = s
    return acc
  },
  {} as Record<EnemySpecies, SpeciesDefinition>,
)

export const ABILITIES: AbilityDefinition[] = [
  {
    id: 'flight',
    name: '飛行',
    description: '近接攻撃を受けにくい',
    threatLevel: 'standard',
    effects: { evadeMelee: 1 },
  },
  {
    id: 'poisonAttack',
    name: '毒攻撃',
    description: '攻撃が毒を付与',
    threatLevel: 'standard',
    effects: { poisonChance: 0.3, poisonDamage: 3 },
  },
  {
    id: 'bleedAttack',
    name: '出血攻撃',
    description: '攻撃が出血を付与',
    threatLevel: 'standard',
    effects: { bleedChance: 0.3, bleedDamage: 3 },
  },
  {
    id: 'areaAttack',
    name: '範囲攻撃',
    description: '複数対象へ同時攻撃',
    threatLevel: 'strong',
    effects: { areaAttackTargets: 3 },
  },
  {
    id: 'revive',
    name: '仲間の蘇生',
    description: '戦闘不能の仲間を蘇生',
    threatLevel: 'strong',
    effects: { reviveHeal: 10 },
  },
  {
    id: 'regeneration',
    name: '再生',
    description: 'ラウンド終了時に回復',
    threatLevel: 'standard',
    effects: { regenPerRound: 5 },
  },
  {
    id: 'frontDefense',
    name: '正面防御',
    description: '正面からのダメージ軽減',
    threatLevel: 'minor',
    effects: { frontReduction: 3 },
  },
  {
    id: 'magicResist',
    name: '魔術耐性',
    description: '魔術ダメージ軽減',
    threatLevel: 'standard',
    effects: { magicReduction: 5 },
  },
  {
    id: 'physicalResist',
    name: '物理耐性',
    description: '物理ダメージ軽減',
    threatLevel: 'standard',
    effects: { physicalReduction: 4 },
  },
  {
    id: 'darknessBoost',
    name: '暗闇強化',
    description: '暗闇で攻撃力上昇',
    threatLevel: 'minor',
    effects: { darkAttackBonus: 3 },
  },
  {
    id: 'corpseExplosion',
    name: '死体爆発',
    description: '死亡時に周囲へダメージ',
    threatLevel: 'standard',
    effects: { corpseExplosionDamage: 8 },
  },
  {
    id: 'summon',
    name: '仲間召喚',
    description: 'ミニオンを召喚',
    threatLevel: 'strong',
    effects: { summonCount: 2 },
  },
  {
    id: 'taunt',
    name: '挑発',
    description: '攻撃を集める',
    threatLevel: 'minor',
    effects: { taunt: 1 },
  },
  {
    id: 'fear',
    name: '恐怖付与',
    description: '恐怖状態を付与',
    threatLevel: 'standard',
    effects: { fearChance: 0.25 },
  },
  {
    id: 'healBlock',
    name: '治療妨害',
    description: '回復を妨害',
    threatLevel: 'strong',
    effects: { healBlock: 1 },
  },
  {
    id: 'counter',
    name: '反撃',
    description: '被弾時に反撃',
    threatLevel: 'standard',
    effects: { counterChance: 0.3 },
  },
  {
    id: 'stealthStart',
    name: '隠密開始',
    description: '戦闘開始時に隠密',
    threatLevel: 'minor',
    effects: { stealthStart: 1 },
  },
  {
    id: 'swarmCoordination',
    name: '群れ連携',
    description: '同種が多いほど強化',
    threatLevel: 'standard',
    effects: { swarmBonus: 2 },
  },
]

export const ABILITY_MAP = ABILITIES.reduce(
  (acc, a) => {
    acc[a.id] = a
    return acc
  },
  {} as Record<string, AbilityDefinition>,
)

export const WEAKNESSES: WeaknessDefinition[] = [
  { id: 'fire', name: '火', element: 'fire', multiplier: 1.5 },
  { id: 'ice', name: '冷気', element: 'ice', multiplier: 1.5 },
  { id: 'lightning', name: '雷', element: 'lightning', multiplier: 1.5 },
  { id: 'holy', name: '神聖', element: 'holy', multiplier: 1.8 },
  { id: 'physical', name: '物理', element: 'physical', multiplier: 1.3 },
  { id: 'magic', name: '魔術', element: 'dark', multiplier: 1.3 },
  { id: 'brightLight', name: '強い光', effect: 'stunChance', multiplier: 1.2 },
  { id: 'loudNoise', name: '大音量', effect: 'fleeChance', multiplier: 1.2 },
  { id: 'commanderLoss', name: '指揮官喪失', effect: 'moraleDown' },
  { id: 'flightImpairment', name: '飛行阻害', effect: 'disable' },
  { id: 'powerCore', name: '動力核', element: 'physical', multiplier: 1.5 },
  { id: 'joints', name: '関節', element: 'physical', multiplier: 1.4 },
  { id: 'rearAttack', name: '背面攻撃', multiplier: 1.3 },
  { id: 'water', name: '水場', effect: 'defenseDown' },
  { id: 'smoke', name: '煙', effect: 'stunChance' },
]

export const WEAKNESS_MAP = WEAKNESSES.reduce(
  (acc, w) => {
    acc[w.id] = w
    return acc
  },
  {} as Record<string, WeaknessDefinition>,
)

export function enemyRankIndex(rank: EnemyRank): number {
  switch (rank) {
    case 'E':
      return 0
    case 'D':
      return 1
    case 'C':
      return 2
    case 'B':
      return 3
    case 'A':
      return 4
    case 'S':
      return 5
    case 'DISASTER':
      return 6
  }
}

export function abilityCountForRank(rank: EnemyRank): {
  min: number
  max: number
} {
  switch (rank) {
    case 'E':
      return { min: 0, max: 1 }
    case 'D':
      return { min: 1, max: 1 }
    case 'C':
      return { min: 1, max: 2 }
    case 'B':
      return { min: 2, max: 2 }
    case 'A':
      return { min: 2, max: 3 }
    case 'S':
      return { min: 3, max: 4 }
    case 'DISASTER':
      return { min: 4, max: 6 }
  }
}

export const ENEMY_NAME_PREFIXES: Record<EnemySpecies, string[]> = {
  humanoid: ['洞窟', '荒野', '傭兵', '暗殺者', '強盗'],
  beast: ['牙', '爪', '毒', '森', '夜'],
  undead: ['朽ちた', '蘇った', '呪われた', '骸骨', '亡霊'],
  construct: ['古代', '錆びた', '魔力', '石', '鉄'],
  aberration: ['狂気の', '深淵', '異形の', '触手', '虚ろな'],
  insect: ['大', '甲殻', '毒', '砂', '群れ'],
}

export const ENEMY_NAME_CORES: Record<EnemySpecies, string[]> = {
  humanoid: ['ゴブリン', 'オーク', 'kobold', '兵士', '傭兵'],
  beast: ['オオカミ', 'クマ', '大蛇', '魔獣', 'ワーム'],
  undead: ['ゾンビ', 'スケルトン', 'ゴースト', 'リッチ', '屍'],
  construct: ['ゴーレム', '魔法人形', '機械兵', '像', '魔導砲'],
  aberration: ['スライム', 'ミミック', '深淵者', '狂信者', '触手怪'],
  insect: ['蟲', '甲虫', '蜘蛛', '蟻', '蠍'],
}

export const ENEMY_NAME_SUFFIXES: Record<EnemyArchetype, string[]> = {
  assault: ['突撃兵', '戦士', '狂戦士'],
  skirmisher: ['遊撃兵', '狩人', '斥候'],
  ambusher: ['待ち伏せ', '暗殺者', '忍'],
  tank: ['重戦士', '盾', '守護者'],
  controller: ['魔術師', '指揮官', '司祭'],
  swarm: ['の群れ', '子分', '雑兵'],
}
