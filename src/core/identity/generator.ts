import { SeededRng } from '../rng/seededRng.ts'
import type { Adventurer, CharacterNarrativeProfile } from '../models/types.ts'
import { getCountryWorldProfile, getSpeciesWorldProfile } from './worldData.ts'
import type {
  CharacterIdentity,
  CharacterLifeBackground,
  CharacterRomanticProfile,
  CountryId,
  CulturalInfluence,
  CulturalAttitude,
  FormativeExperience,
  GenderId,
  PersonalityContradiction,
  RelationshipStatus,
  RomanceAttitude,
  RomanticOrientation,
  SpeciesId,
} from './types.ts'

const GENDERS: GenderId[] = ['male', 'female', 'nonbinary', 'other']

const SPECIES_LIST: SpeciesId[] = [
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

const COUNTRY_LIST: CountryId[] = [
  'alden',
  'velga',
  'kared',
  'celesta',
  'eldia',
  'ragna',
  'halma',
]

const FAMILY_BACKGROUNDS = [
  '農家',
  '商家',
  '職人家庭',
  '軍属家庭',
  '鉱夫家庭',
  '船員家庭',
  '遊牧民',
  '役人家庭',
  '宗教施設育ち',
  '孤児',
  '小規模貴族',
  '貧民街',
  '裕福な都市家庭',
  '辺境村落',
]

const FORMER_OCCUPATIONS = [
  '農民',
  '猟師',
  '鉱夫',
  '鍛冶職人',
  '石工',
  '商人',
  '商会職員',
  '船員',
  '漁師',
  '兵士',
  '衛兵',
  '役人',
  '書記',
  '教師',
  '薬師',
  '旅芸人',
  '運送業',
  '牧畜',
  '料理人',
  '無職',
]

const REASONS_FOR_ADVENTURING = [
  '家族への仕送りが必要',
  '借金返済のため',
  '独立資金を得るため',
  '名誉を得たい',
  '希少な知識を得たい',
  '新しい技術を習得したい',
  '旅がしたい',
  '故郷から離れたい',
  '軍務を辞めた',
  '行方不明の家族を探している',
  '誰かに復讐したい',
  '宗教的な使命がある',
  '他に仕事がなかった',
  '生活費を得るため',
  '家業再建のため',
  '自分の名前で認められたい',
]

const EXPERIENCE_TEMPLATES: {
  summary: string
  interpretations: string[]
}[] = [
  {
    summary: '家業が傾いた時期があった',
    interpretations: [
      '金銭の不安をいつも背負っている',
      '安定より機会を重視するようになった',
      '家族を支う責任感が強い',
      '失敗は個人の責任ではないと割り切っている',
    ],
  },
  {
    summary: '大きな災害に遭った',
    interpretations: [
      '危険は早めに避けるべきだ',
      '二度と逃げる側にはなりたくない',
      '守れる力を持つ者が必要だ',
      '昔のこととして割り切っている',
    ],
  },
  {
    summary: '戦争や紛争の影響を受けた',
    interpretations: [
      '組織は信頼できないことがある',
      '命令より現場の判断を信じる',
      '戦う理由を大切にしたい',
      '平穏な日常を守るためなら動く',
    ],
  },
  {
    summary: '魔族の襲撃による避難を経験した',
    interpretations: [
      '撤退を恥ではなく生存のための正当な判断だと考える',
      '命を守るためなら無理はしない',
      '故郷を守る力が欲しい',
      '無謀な勇気を嫌う',
    ],
  },
  {
    summary: '幼少期に移住した',
    interpretations: [
      '定着より移動に慣れている',
      '帰る場所がないため、仲間を大切にする',
      '新しい環境への適応力がある',
      '故郷への執着が薄い',
    ],
  },
  {
    summary: '家族と死別した',
    interpretations: [
      '大切な人を失う恐怖がある',
      '他者との距離を取りがち',
      '残された時間を有意義に使いたい',
      '故人の期待に応えたい',
    ],
  },
  {
    summary: '優れた師匠に恵まれた',
    interpretations: [
      '技術や知識への信頼が厚い',
      '弟子としての誇りを持つ',
      '師匠の教えを柔軟に解釈する',
      '自分でも後進を導きたい',
    ],
  },
  {
    summary: '小さな商売を成功させた',
    interpretations: [
      '条件や約束を細かく確認する',
      '損得を素早く計算する',
      '信用を何より重んじる',
      '成功体験から大胆になった',
    ],
  },
  {
    summary: '長期間の旅をした',
    interpretations: [
      '旅の経験から未知を恐れない',
      '疲労への耐性がある',
      '移り住ぐことに抵抗がない',
      'ひとつの場所に縛られたくない',
    ],
  },
  {
    summary: '差別や偏見を受けた',
    interpretations: [
      '見た目や出自を判断材料にしない',
      '自分を証明する機会を求める',
      '他者の痛みに敏感になった',
      '予断を避ける癖がついた',
    ],
  },
  {
    summary: '異文化を身近に経験した',
    interpretations: [
      '慣習の違いを自然に受け入れる',
      '自国の常識に疑問を持つ',
      '多様な価値観を尊重する',
      '自分のアイデンティティを再考した',
    ],
  },
  {
    summary: '軍務を経験した',
    interpretations: [
      '命令系統を重視する',
      '形式より仲間の命を優先する',
      '規律の中で動くのが得意',
      '権威に盲従しないよう心がけている',
    ],
  },
]

const PERSONAL_BASELINE_TRAITS = [
  '楽天的',
  '短気',
  '臆病',
  '社交的',
  '無口',
  '神経質',
  '大雑把',
  '競争心が強い',
  '冗談好き',
  '浪費家',
  '几帳面',
  '好奇心旺盛',
  '頑固',
  '冷笑的',
  '優柔不断',
  '独創的',
  '保守的',
  '気まぐれ',
  '責任感が強い',
  '自由奔放',
]

const CHILDHOOD_CONTEXTS = [
  '貧しくとも仲の良い家庭で育った',
  '厳格な親のもとで育った',
  '自由に過ごせる環境で育った',
  '兄姉と比較されながら育った',
  '幼い頃から働かされた',
  '集落全体で育てられた',
  '孤児院のような施設で育った',
  '祖父母に育てられた',
]

const EDUCATION_CONTEXTS = [
  '家業で働きながら学んだ',
  '市井の師匠に弟子入りした',
  '教會や施設で基礎教養を学んだ',
  '兵隊式の訓練を受けた',
  '独学で知識を積んだ',
  '商人の倉庫で会計を覚えた',
  '旅の途中で様々な人から学んだ',
]

function pickCountryRegion(country: CountryId, rng: SeededRng): string {
  const regionMap: Record<CountryId, string[]> = {
    alden: ['王都周辺', '北部の農村', '東部の城塞町', '南部の港町'],
    velga: ['自治都市', '山間の集落', '交易街道沿い', '湖畔の町'],
    kared: ['山岳鉱山町', '峠の砦', '深い谷の集落', '山麓の鍛冶町'],
    celesta: ['港湾区', '商会街', '自由市場近く', '外洋貿易町'],
    eldia: ['森の集落', '古い共同体', '林業町', '森の縁の砦'],
    ragna: ['辺境砦町', '国境沿いの村', '防衛拠点', '荒地近くの町'],
    halma: ['遊牧のキャンプ', '草原の交易町', '小国の都', '河畔の集落'],
  }
  return rng.pick(regionMap[country])
}

export function generateCharacterIdentity(rng: SeededRng): CharacterIdentity {
  const species = rng.pick(SPECIES_LIST)
  const country = rng.pick(COUNTRY_LIST)
  const gender = rng.pick(GENDERS)
  const familyBackground = rng.pick(FAMILY_BACKGROUNDS)
  const regionOfOrigin = pickCountryRegion(country, rng)
  const socialOrigin = rng.pick([
    familyBackground,
    `${regionOfOrigin}出身`,
    `${familyBackground}の${regionOfOrigin}出身`,
  ])

  return {
    species,
    gender,
    countryOfOrigin: country,
    regionOfOrigin,
    socialOrigin,
    familyBackground,
  }
}

export function generateCharacterLifeBackground(
  rng: SeededRng,
  identity: CharacterIdentity,
): CharacterLifeBackground {
  const childhood = rng.pick(CHILDHOOD_CONTEXTS)
  const education = rng.pick(EDUCATION_CONTEXTS)
  const formerOccupation = rng.pick(FORMER_OCCUPATIONS)
  const reasonForAdventuring = rng.pick(REASONS_FOR_ADVENTURING)

  const experienceCount = rng.integer(1, 3)
  const formativeExperiences: FormativeExperience[] = []
  const used = new Set<number>()
  for (let i = 0; i < experienceCount; i++) {
    let idx = rng.integer(0, EXPERIENCE_TEMPLATES.length - 1)
    let attempts = 0
    while (used.has(idx) && attempts < 10) {
      idx = rng.integer(0, EXPERIENCE_TEMPLATES.length - 1)
      attempts++
    }
    used.add(idx)
    const template = EXPERIENCE_TEMPLATES[idx]!
    const interpretation = rng.pick(template.interpretations)
    formativeExperiences.push({
      summary: template.summary,
      interpretation,
      importance: rng.integer(5, 10),
    })
  }

  // Make reason concrete by combining with family/occupation context.
  const concreteReason = reasonForAdventuring.includes('家族')
    ? `${identity.familyBackground}の${reasonForAdventuring}`
    : reasonForAdventuring

  return {
    childhood,
    education,
    formerOccupation,
    formativeExperiences,
    reasonForAdventuring: concreteReason,
  }
}

function randomAttitude(rng: SeededRng): CulturalAttitude {
  const attitudes: CulturalAttitude[] = [
    'embraced',
    'mostly_accepted',
    'ambivalent',
    'rejected',
    'reversed',
  ]
  const weights = [25, 35, 25, 10, 5]
  return rng.weightedPick(attitudes, weights)
}

function attitudeLabel(attitude: CulturalAttitude): string {
  switch (attitude) {
    case 'embraced':
      return '強く受け入れている'
    case 'mostly_accepted':
      return 'おおむね受け入れている'
    case 'ambivalent':
      return 'どちらとも言えない'
    case 'rejected':
      return '拒否している'
    case 'reversed':
      return '逆手に取っている'
  }
}

export function generateCulturalInfluences(
  rng: SeededRng,
  identity: CharacterIdentity,
  _lifeBackground: CharacterLifeBackground,
): CulturalInfluence[] {
  const country = getCountryWorldProfile(identity.countryOfOrigin)
  const species = getSpeciesWorldProfile(identity.species)

  const influences: CulturalInfluence[] = []
  const used = new Set<string>()

  const countryValues = rng.shuffle([...country.culturalValues])
  const selectedCount = rng.integer(1, 3)
  for (let i = 0; i < selectedCount && i < countryValues.length; i++) {
    const value = countryValues[i]
    if (!value || used.has(value)) continue
    used.add(value)
    const attitude = randomAttitude(rng)
    influences.push({
      source: identity.countryOfOrigin,
      value,
      strength: rng.integer(30, 95),
      attitude,
      personalInterpretation: `${value}を${attitudeLabel(attitude)}`,
    })
  }

  const speciesContext = rng.shuffle([...species.lifeContext])
  const speciesCount = rng.integer(0, 2)
  for (let i = 0; i < speciesCount && i < speciesContext.length; i++) {
    const value = speciesContext[i]
    if (!value || used.has(value)) continue
    used.add(value)
    influences.push({
      source: identity.species,
      value,
      strength: rng.integer(20, 80),
      attitude: 'mostly_accepted',
      personalInterpretation: `${value}を経験として受け止めている`,
    })
  }

  return influences
}

const ORIENTATION_GENDERS: Record<RomanticOrientation, GenderId[]> = {
  opposite_gender: [], // resolved by gender below
  same_gender: [],
  multiple_genders: ['male', 'female', 'nonbinary'],
  any_gender: ['male', 'female', 'nonbinary', 'other'],
  none: [],
  unspecified: [],
}

export function generateRomanticProfile(
  rng: SeededRng,
  gender: GenderId,
): CharacterRomanticProfile {
  const orientations: RomanticOrientation[] = [
    'opposite_gender',
    'same_gender',
    'multiple_genders',
    'any_gender',
    'none',
    'unspecified',
  ]
  const weights = [30, 20, 20, 10, 10, 10]
  const orientation = rng.weightedPick(orientations, weights)

  let genders: GenderId[] | undefined
  if (orientation === 'opposite_gender') {
    genders =
      gender === 'male'
        ? ['female']
        : gender === 'female'
          ? ['male']
          : ['male', 'female']
  } else if (orientation === 'same_gender') {
    genders = [gender]
  } else if (
    orientation === 'multiple_genders' ||
    orientation === 'any_gender'
  ) {
    genders = ORIENTATION_GENDERS[orientation]
  } else if (orientation === 'none') {
    genders = []
  } else {
    genders = undefined
  }

  const attitudes: RomanceAttitude[] = [
    'romantic',
    'open',
    'cautious',
    'reserved',
    'avoidant',
    'uninterested',
  ]
  const romanceAttitude = rng.pick(attitudes)
  const statuses: RelationshipStatus[] = [
    'single',
    'single',
    'single',
    'partnered',
    'partnered',
    'engaged',
    'married',
    'widowed',
    'separated',
    'unspecified',
  ]
  const relationshipStatus = rng.pick(statuses)

  const openness =
    genders && genders.length > 0 ? rng.integer(10, 95) : rng.integer(0, 30)

  return {
    attraction: {
      genders,
      openness,
      orientation,
    },
    romanceAttitude,
    relationshipStatus,
    romanticHistory:
      relationshipStatus === 'single' &&
      romanceAttitude !== 'uninterested' &&
      rng.chance(30)
        ? [rng.pick(['かつて片思いをした経験がある', '昔の伴侶と別れた'])]
        : undefined,
  }
}

export function generatePersonalBaselineTraits(rng: SeededRng): string[] {
  const count = rng.integer(1, 3)
  const traits = rng.shuffle([...PERSONAL_BASELINE_TRAITS]).slice(0, count)
  return traits
}

export function generateContradiction(
  rng: SeededRng,
  baselineTraits: string[],
): PersonalityContradiction | undefined {
  if (!rng.chance(40)) return undefined
  const a = rng.pick(baselineTraits)
  const bCandidates = baselineTraits.filter((t) => t !== a)
  const b =
    bCandidates.length > 0
      ? rng.pick(bCandidates)
      : rng.pick(PERSONAL_BASELINE_TRAITS)
  if (!a || !b) return undefined
  return {
    sideA: a,
    sideB: b,
    expression: `${a}が、${b}場面で影響を受ける`,
  }
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[\s・、。]/g, '')
}

function valuesFromCulturalInfluences(
  influences: CulturalInfluence[] | undefined,
): string[] {
  if (!influences || influences.length === 0) return []
  const result: string[] = []
  for (const inf of influences) {
    if (inf.attitude === 'embraced' || inf.attitude === 'mostly_accepted') {
      result.push(`${inf.value}を重視`)
    } else if (inf.attitude === 'rejected') {
      result.push(`${inf.value}への疑問`)
    } else if (inf.attitude === 'reversed') {
      result.push(`${inf.value}を逆手に取る`)
    }
  }
  return result.slice(0, 3)
}

function fearFromExperience(
  experiences: FormativeExperience[] | undefined,
  role: string,
): string[] {
  const base: string[] = []
  const roleFears: Record<string, string> = {
    vanguard: '孤立して囲まれること',
    guardian: '守るべき者を失うこと',
    scout: '見落とした脅威',
    ranger: '獲物を逃すこと',
    mage: '魔力の枯渇',
    healer: '手の届かない傷',
    support: '後方の崩壊',
  }
  if (role in roleFears) base.push(roleFears[role])

  if (experiences) {
    for (const e of experiences) {
      const summary = normalizeText(e.summary)
      if (summary.includes('災害') || summary.includes('襲撃')) {
        base.push('再び身近なものを失うこと')
      } else if (summary.includes('死別') || summary.includes('家族')) {
        base.push('大切な者を失うこと')
      } else if (summary.includes('差別') || summary.includes('偏見')) {
        base.push('再び偏見に晒されること')
      }
    }
  }

  return [...new Set(base)]
}

function habitsFromBackground(
  role: string,
  formerOccupation: string | undefined,
): string[] {
  const roleHabits: Record<string, string> = {
    vanguard: '先陣を切る前に息を整える',
    guardian: '防具をこまめに確認する',
    scout: '周囲を素早く見回す',
    ranger: '武器の手入れを欠かさない',
    mage: '呪文の詠唱を口ずさむ',
    healer: '医薬品の位置を確認する',
    support: '仲間の様子を窺う',
  }
  const habits: string[] = []
  if (role in roleHabits) habits.push(roleHabits[role])

  if (formerOccupation) {
    const text = normalizeText(formerOccupation)
    if (text.includes('商人') || text.includes('商会')) {
      habits.push('条件を細かく確認する')
    } else if (text.includes('兵士') || text.includes('衛兵')) {
      habits.push('命令系統を意識する')
    } else if (text.includes('鉱夫')) {
      habits.push('足元や天井を気にする')
    } else if (text.includes('薬師')) {
      habits.push('薬草の有無を確認する')
    }
  }

  return habits
}

export function buildCharacterNarrativeProfile(
  member: Pick<
    Adventurer,
    | 'role'
    | 'personality'
    | 'traits'
    | 'narrativeProfile'
    | 'identity'
    | 'lifeBackground'
    | 'culturalInfluences'
    | 'contradiction'
  >,
): CharacterNarrativeProfile {
  if (member.narrativeProfile) return member.narrativeProfile

  const { bravery, caution, cooperation, discipline, altruism, greed } =
    member.personality
  const role = member.role
  const lifeBackground = member.lifeBackground
  const culturalInfluences = member.culturalInfluences
  const contradiction = member.contradiction

  let temperament = 'バランスの取れた型'
  if (bravery > 1 && caution <= 0) {
    temperament = '猪突猛進で勇敢'
  } else if (bravery > 1 && caution > 0) {
    temperament = '大胆だが計画的'
  } else if (caution > 1 && bravery <= 0) {
    temperament = '慎重で用心深い'
  } else if (caution > 1 && bravery > 0) {
    temperament = '慎重だが決断力がある'
  } else if (bravery <= 0 && caution <= 0) {
    temperament = '楽観的で柔軟'
  }

  let socialStyle = '協調的'
  if (cooperation >= 2 && discipline >= 1) {
    socialStyle = 'チームを重んじる'
  } else if (cooperation >= 2 && discipline < 1) {
    socialStyle = '気安く世話焼き'
  } else if (cooperation < 0 && discipline >= 1) {
    socialStyle = '実利主義で淡白'
  } else if (cooperation < 0 && discipline < 0) {
    socialStyle = '独立独歩'
  }

  const values: string[] = []
  if (altruism >= 2) values.push('仲間の安全')
  if (greed >= 2) values.push('報酬と評価')
  if (altruism <= -2) values.push('自己保存')
  values.push(...valuesFromCulturalInfluences(culturalInfluences))
  if (values.length === 0) values.push('依頼の成功')

  const flaws: string[] = []
  if (bravery >= 2) flaws.push('無謀になりがち')
  if (caution >= 2) flaws.push('優柔不断になりがち')
  if (greed >= 2) flaws.push('金銭に弱い')
  if (discipline <= -2) flaws.push('規律を欠く')
  if (cooperation <= -2) flaws.push('協調性に欠ける')
  if (flaws.length === 0 && altruism >= 2) flaws.push('犠牲を顧みない')

  const fears = fearFromExperience(lifeBackground?.formativeExperiences, role)

  const habits = habitsFromBackground(role, lifeBackground?.formerOccupation)
  const traitNames = member.traits.map((t) => t.name).join('・')
  if (traitNames) {
    habits.push(`${traitNames}の傾向が強い`)
  }

  let speechStyle = '普通'
  if (bravery > 1) speechStyle = '短く力強い'
  else if (caution > 1) speechStyle = '丁寧で控えめ'
  else if (cooperation > 1) speechStyle = '優しく寄り添う'
  else if (discipline > 1) speechStyle = '簡潔で事務的'
  else if (altruism > 1) speechStyle = '励ましの言葉を好む'
  else if (greed > 1) speechStyle = '条件や報酬を気にする'

  const beliefs: string[] = []
  if (lifeBackground?.reasonForAdventuring) {
    beliefs.push(lifeBackground.reasonForAdventuring)
  }

  const attitudes: string[] = []
  if (culturalInfluences) {
    for (const inf of culturalInfluences.slice(0, 2)) {
      attitudes.push(
        `${inf.value}: ${inf.personalInterpretation ?? attitudeLabel(inf.attitude)}`,
      )
    }
  }

  const result: CharacterNarrativeProfile = {
    temperament,
    socialStyle,
    values: values.slice(0, 4),
    flaws: flaws.slice(0, 2),
    fears,
    habits,
    speechStyle,
    beliefs,
    attitudes,
    contradictions: contradiction ? [contradiction] : undefined,
  }

  return result
}

export function generateAdventurerIdentity(seed: string): {
  identity: CharacterIdentity
  lifeBackground: CharacterLifeBackground
  culturalInfluences: CulturalInfluence[]
  romanticProfile: CharacterRomanticProfile
  baselineTraits: string[]
  contradiction?: PersonalityContradiction
} {
  const rng = new SeededRng(seed)
  const identity = generateCharacterIdentity(rng)
  const lifeBackground = generateCharacterLifeBackground(rng, identity)
  const culturalInfluences = generateCulturalInfluences(
    rng,
    identity,
    lifeBackground,
  )
  const romanticProfile = generateRomanticProfile(rng, identity.gender)
  const baselineTraits = generatePersonalBaselineTraits(rng)
  const contradiction = generateContradiction(rng, baselineTraits)

  return {
    identity,
    lifeBackground,
    culturalInfluences,
    romanticProfile,
    baselineTraits,
    contradiction,
  }
}
