import type { CountryId, SpeciesId } from './types.ts'

export const SPECIES_LIST: SpeciesId[] = [
  'human',
  'long_eared',
  'mountainfolk',
  'smallfolk',
  'tuskfolk',
  'goblinfolk',
  'scalefolk',
  'wingfolk',
  'finfolk',
]

export const COUNTRY_LIST: CountryId[] = [
  'alden',
  'velga',
  'kared',
  'celesta',
  'eldia',
  'ragna',
  'halma',
]

export interface SpeciesWorldProfile {
  id: SpeciesId
  nameJa: string
  physicalTraits: string[]
  lifeContext: string[]
  stereotypeWarnings?: string[]
}

export interface CountryWorldProfile {
  id: CountryId
  nameJa: string
  historicalContext: string[]
  culturalValues: string[]
  commonInfluences: string[]
}

export const SPECIES_WORLD_PROFILES: Record<SpeciesId, SpeciesWorldProfile> = {
  human: {
    id: 'human',
    nameJa: '人族',
    physicalTraits: ['寿命が比較的短い', '身体能力の個人差が大きい'],
    lifeContext: ['どの国にも属することが多い', '多種族社会で多数派を占める'],
    stereotypeWarnings: ['人族だから特別適応性があるとは限らない'],
  },
  long_eared: {
    id: 'long_eared',
    nameJa: '長耳族',
    physicalTraits: ['長い耳', '長寿'],
    lifeContext: ['世代感覚の違い', '他種族との寿命差'],
    stereotypeWarnings: ['長寿だから慎重とは限らない'],
  },
  mountainfolk: {
    id: 'mountainfolk',
    nameJa: '山人族',
    physicalTraits: ['小柄で頑健', '筋力と耐久力に優れやすい'],
    lifeContext: [
      '山岳・鉱山文化との歴史的関係',
      '都市育ちなら鉱山経験は限定的',
    ],
    stereotypeWarnings: ['山人族だから職人気質とは限らない'],
  },
  smallfolk: {
    id: 'smallfolk',
    nameJa: '小人族',
    physicalTraits: ['小柄な身体'],
    lifeContext: ['設備や装備サイズの問題', '文化は地域依存'],
    stereotypeWarnings: ['小柄だから勇敢でないとは限らない'],
  },
  tuskfolk: {
    id: 'tuskfolk',
    nameJa: '牙人族',
    physicalTraits: ['牙', '頑健な身体'],
    lifeContext: ['外見上の先入観を受ける可能性'],
    stereotypeWarnings: ['牙人族だから荒々しいとは限らない'],
  },
  goblinfolk: {
    id: 'goblinfolk',
    nameJa: '小鬼族',
    physicalTraits: ['小柄', '独特な顔立ち'],
    lifeContext: ['魔族と誤認される社会経験の可能性'],
    stereotypeWarnings: ['小鬼族は必ずしも卑怯ではない'],
  },
  scalefolk: {
    id: 'scalefolk',
    nameJa: '鱗人族',
    physicalTraits: ['鱗', '尾', '爪'],
    lifeContext: ['地域・系統による差'],
    stereotypeWarnings: ['鱗人族だから冷血とは限らない'],
  },
  wingfolk: {
    id: 'wingfolk',
    nameJa: '羽人族',
    physicalTraits: ['羽毛', '翼'],
    lifeContext: ['飛行能力の個体差', '高所環境への適性差'],
    stereotypeWarnings: ['羽人族だから自由を好むとは限らない'],
  },
  finfolk: {
    id: 'finfolk',
    nameJa: '鰭人族',
    physicalTraits: ['水中適応能力の個体差', '鰓・鰭等'],
    lifeContext: ['陸上生活者も正常系'],
    stereotypeWarnings: ['鰭人族だから水辺にしか住めないとは限らない'],
  },
}

export const COUNTRY_WORLD_PROFILES: Record<CountryId, CountryWorldProfile> = {
  alden: {
    id: 'alden',
    nameJa: 'アルデン王国',
    historicalContext: ['王権を中心とした秩序の重視'],
    culturalValues: [
      '秩序',
      '組織',
      '責任',
      '役割',
      '上下関係',
      '集団行動',
      '約束',
    ],
    commonInfluences: ['役割を果たすこと', '組織への貢献'],
  },
  velga: {
    id: 'velga',
    nameJa: 'ヴェルガ自治連邦',
    historicalContext: ['各自治体が合議で成り立つ'],
    culturalValues: [
      '自治',
      '対等',
      '合議',
      '議論',
      '権威への警戒',
      '地元意識',
      '合意後の遵守',
    ],
    commonInfluences: ['合意形成', '対等な協力'],
  },
  kared: {
    id: 'kared',
    nameJa: 'カレド山岳国',
    historicalContext: ['山岳・鉱山で発展'],
    culturalValues: [
      '実務',
      '技術',
      '熟練',
      '安全管理',
      '道具',
      '資源管理',
      '形式より能力',
    ],
    commonInfluences: ['技術の熟練', '安全管理'],
  },
  celesta: {
    id: 'celesta',
    nameJa: 'セレスタ交易共和国',
    historicalContext: ['交易港と自由港で成り立つ'],
    culturalValues: [
      '信用',
      '契約',
      '交渉',
      '実績',
      '異文化受容',
      '損得',
      '条件確認',
    ],
    commonInfluences: ['契約の遵守', '信用の蓄積'],
  },
  eldia: {
    id: 'eldia',
    nameJa: 'エルディア森林領邦',
    historicalContext: ['森林と古い共同体に支えられている'],
    culturalValues: [
      '長期視点',
      '前例',
      '伝統',
      '恩義',
      '因縁',
      '慎重な決断',
      '時間をかける',
    ],
    commonInfluences: ['伝統の尊重', '長期的な恩義'],
  },
  ragna: {
    id: 'ragna',
    nameJa: 'ラグナ辺境侯国',
    historicalContext: ['魔族脅威に晒された辺境'],
    culturalValues: [
      '生存',
      '危険管理',
      '迅速判断',
      '仲間',
      '撤退判断',
      '現場優先',
      '無謀の否定',
    ],
    commonInfluences: ['生存の優先', '現場判断'],
  },
  halma: {
    id: 'halma',
    nameJa: 'ハルマ草原諸国',
    historicalContext: ['遊牧民と小国家の連合'],
    culturalValues: [
      '客人保護',
      '分かち合い',
      '仲間意識',
      '自由',
      '恩義',
      '名誉',
      '束縛への反発',
    ],
    commonInfluences: ['客人への厚遇', '仲間意識'],
  },
}

export function getSpeciesWorldProfile(id: SpeciesId): SpeciesWorldProfile {
  return SPECIES_WORLD_PROFILES[id]
}

export function getCountryWorldProfile(id: CountryId): CountryWorldProfile {
  return COUNTRY_WORLD_PROFILES[id]
}

export function isVariantFolk(species: SpeciesId): boolean {
  return (
    species === 'scalefolk' || species === 'wingfolk' || species === 'finfolk'
  )
}
