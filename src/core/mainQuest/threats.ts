import { generateEnemy } from '../generators/enemyGenerator.ts'
import type { Enemy } from '../models/types.ts'
import type {
  MainQuestState,
  MainQuestThreatDefinition,
  MainQuestThreatId,
  UniqueMonsterProfile,
} from './types.ts'

/**
 * Every Unique Monster's combat stat block is a fixed, hand-selected
 * boss-tier `Enemy` — generated once from a seed that never varies across
 * attempts (`mainquest-profile:<threatId>`), so "the same recurring boss"
 * keeps the same stats every time it is fought. No new Combat Power system
 * is introduced (item 14); this reuses the existing procedural Enemy
 * generator (`../generators/enemyGenerator.ts`) exactly as any other boss-
 * tier encounter would, just pinned to one fixed seed/species/archetype
 * per Threat instead of rolled per encounter.
 */
function buildUniqueMonsterEnemy(
  threatId: MainQuestThreatId,
  name: string,
  overrides: Parameters<typeof generateEnemy>[1],
): Enemy {
  const enemy = generateEnemy(`mainquest-profile:${threatId}`, {
    tier: 'boss',
    ...overrides,
  })
  return { ...enemy, id: `mainquest:${threatId}`, name }
}

const ALDEN_PROFILE: UniqueMonsterProfile = {
  id: 'alden',
  name: '王都地下の封印獣',
  personalityTraits: ['尊大', '古い秩序を重視する', '現在の王権を簒奪者と見る'],
  values: ['血統と由緒', '定められた序列', '自らが下した古い約定'],
  motivation: '王国成立以前からこの地を支配していたという自負を取り戻すこと。',
  conflictReason:
    '封印を弱めた現王家の統治を、正統性のない簒奪と見なして拒絶している。',
  attitudeTowardHumans:
    '取るに足らない、短命な統治者の群れとして見下している。',
  attitudeTowardPlayer:
    '酒場の主が元勇者だと知れば、少なくとも「話に値する程度には長く生きた人間」として興味を向ける。',
  communicationStyle:
    '尊大で古風な物言い。命令口調に近い断定的な話し方をする。',
  combatIdentity: [
    '地下に根ざした重厚な防御',
    '古い秩序を体現する荘重な立ち居振る舞い',
  ],
  narrativeMustShow: [
    '自らを王国以前からの支配者と語ること',
    '現王権を短命な簒奪者と見下す発言',
    '人間の言い分に耳を貸さない尊大さ',
  ],
  narrativeMustNotInvent: [
    'Simulationにない技や形態変化',
    '主人公が武器や魔法で攻撃する描写',
  ],
  visualProfile: {
    assetKey: 'mainquest-boss-alden',
    scale: 1.6,
    idleMotion: 'slow-imposing-idle',
    hitReaction: 'stagger-heavy',
    attackMotion: 'ground-slam',
    presentationMotifs: ['封印の鎖', '地下の石柱', '古い王紋'],
  },
}

const VELGA_PROFILE: UniqueMonsterProfile = {
  id: 'velga',
  name: '沼沢の群体魔',
  personalityTraits: [
    '集合知として振る舞う',
    '感情を模倣する',
    '複数の声で話す',
  ],
  values: ['個体を超えた集合の維持', '知識と情報の蓄積'],
  motivation:
    '己を構成する無数の個をこれ以上損なわれないよう、侵入者を排除すること。',
  conflictReason:
    '沼沢へ踏み入る者を、群体を脅かす異物として認識し反応している。',
  attitudeTowardHumans:
    '「個」という発想そのものを奇妙な概念として観察対象にしている。',
  attitudeTowardPlayer:
    '一人でありながら群れ(パーティ)を率いる主人公の在り方に関心を示す。',
  communicationStyle: '複数の声が微妙にずれて重なり合うように話す。',
  combatIdentity: [
    '多数の小さな個体による波状の攻勢',
    '一部を失っても揺らがない継戦力',
  ],
  narrativeMustShow: [
    '複数の声が重なるような話し方',
    '人間の「個」という概念への興味',
    '感情を模倣している違和感',
  ],
  narrativeMustNotInvent: [
    'Simulationにない技や形態変化',
    '主人公が武器や魔法で攻撃する描写',
  ],
  visualProfile: {
    assetKey: 'mainquest-boss-velga',
    scale: 1.3,
    idleMotion: 'swarm-pulse-idle',
    hitReaction: 'scatter-reform',
    attackMotion: 'converge-lash',
    presentationMotifs: ['沼の霧', '無数の光る目', '蠢く群れ'],
  },
}

const KALED_PROFILE: UniqueMonsterProfile = {
  id: 'kared',
  name: '黒炉の巨獣',
  personalityTraits: ['寡黙', '職人的', '技術と力量を尊重する'],
  values: ['鍛え上げられた技量', '妥協のない仕事'],
  motivation: '自らの炉と技を汚す者、未熟なまま挑む者を選別し続けること。',
  conflictReason:
    '坑道と炉を侵す者を、鍛錬を経ていない未熟者として拒絶している。',
  attitudeTowardHumans: '弱さそのものより、鍛錬を怠った未熟さを嫌う。',
  attitudeTowardPlayer:
    '戦えない事情を知れば、それを弱さではなく「別の形の代償」として静かに受け止める。',
  communicationStyle: '言葉少なで、必要なことだけを短く告げる。',
  combatIdentity: ['炉の熱を帯びた重い一撃', '無駄のない寡黙な連撃'],
  narrativeMustShow: [
    '寡黙で必要最低限しか語らない態度',
    '技量や鍛錬を評価する視点',
    '弱さより未熟さを嫌う価値観',
  ],
  narrativeMustNotInvent: [
    'Simulationにない技や形態変化',
    '主人公が武器や魔法で攻撃する描写',
  ],
  visualProfile: {
    assetKey: 'mainquest-boss-kared',
    scale: 1.7,
    idleMotion: 'forge-breathing-idle',
    hitReaction: 'sparks-recoil',
    attackMotion: 'hammer-swing',
    presentationMotifs: ['黒炉の火', '鍛冶の火花', '鉱脈の輝き'],
  },
}

const CELESTA_PROFILE: UniqueMonsterProfile = {
  id: 'celesta',
  name: '海峡喰らい',
  personalityTraits: ['狡猾', '取引好き', '損得で物事を見る'],
  values: ['公正に見える取引', '人間の交易文化への興味'],
  motivation: '海峡を通る者から、力ずくではなく「対価」を取り立て続けること。',
  conflictReason:
    '対価を払わず海峡を渡ろうとする者を、契約を破る不誠実な相手と見なす。',
  attitudeTowardHumans: '恐れるよりも、面白い交渉相手として観察している。',
  attitudeTowardPlayer:
    '戦えない主人がなぜ挑むのか、その「取引の裏」に興味を持つ。',
  communicationStyle: '商人めいた軽妙な語り口で、常に取引の言葉を使う。',
  combatIdentity: ['海峡の潮流を利用した搦め手', '不意を突く狡猾な一撃'],
  narrativeMustShow: [
    '取引や対価を持ち出す物言い',
    '損得勘定で相手を値踏みする態度',
    '人間の交易文化を面白がる視点',
  ],
  narrativeMustNotInvent: [
    'Simulationにない技や形態変化',
    '主人公が武器や魔法で攻撃する描写',
  ],
  visualProfile: {
    assetKey: 'mainquest-boss-celesta',
    scale: 1.4,
    idleMotion: 'coil-drift-idle',
    hitReaction: 'thrash-recoil',
    attackMotion: 'tentacle-lash',
    presentationMotifs: ['海峡の飛沫', '難破船の残骸', '光る鱗'],
  },
}

const ELDIA_PROFILE: UniqueMonsterProfile = {
  id: 'eldia',
  name: '古樹を蝕むもの',
  personalityTraits: ['極端に長命', '冷淡', '人間の時間感覚を軽視する'],
  values: ['森という長大な時間そのもの', '人間より上位にある自然の秩序'],
  motivation: '己が根を張る古樹と森を、短命な人間の営みから守り続けること。',
  conflictReason:
    '森を切り拓こうとする、あるいは踏み荒らす者を等しく脅威と見る。',
  attitudeTowardHumans:
    '一瞬で消える儚い生き物として、ほとんど関心を払わない。',
  attitudeTowardPlayer:
    '短命な人間にしては奇妙に長く森と関わり続けている、と僅かに意識する。',
  communicationStyle:
    '間延びした、感情の起伏がほとんど感じられない話し方をする。',
  combatIdentity: [
    '森そのものを操るかのような侵蝕',
    '長い年月に裏打ちされた揺るがぬ耐久',
  ],
  narrativeMustShow: [
    '人間の時間感覚を軽視する発言',
    '森を人間より上位に置く価値観',
    '感情の起伏の乏しい冷淡さ',
  ],
  narrativeMustNotInvent: [
    'Simulationにない技や形態変化',
    '主人公が武器や魔法で攻撃する描写',
  ],
  visualProfile: {
    assetKey: 'mainquest-boss-eldia',
    scale: 1.8,
    idleMotion: 'root-sway-idle',
    hitReaction: 'bark-crack',
    attackMotion: 'root-lash',
    presentationMotifs: ['蝕まれた巨木', '這う根', '朽ちた葉'],
  },
}

const RAGNA_PROFILE: UniqueMonsterProfile = {
  id: 'ragna',
  name: '東境の攻城獣',
  personalityTraits: ['軍事的', '合理的', '勝敗と任務を重視する'],
  values: ['与えられた任務の完遂', '合理的な戦術判断'],
  motivation: '東境の要塞群を陥とすという、己に課された任務を遂行すること。',
  conflictReason: '要塞防衛にあたる者を、任務遂行を阻む敵対戦力として扱う。',
  attitudeTowardHumans:
    '感情を交えず、戦力として、あるいは障害として評価する。',
  attitudeTowardPlayer:
    '戦わない指揮官という存在を、理解し難い非合理として観察する。',
  communicationStyle: '簡潔で軍事的な報告調。無駄な感情語を挟まない。',
  combatIdentity: [
    '要塞を陥とすための力任せの猛攻',
    '任務優先の合理的な連携行動',
  ],
  narrativeMustShow: [
    '任務と勝敗を重視する合理性',
    '戦力として相手を評価する視点',
    '軍事的で簡潔な物言い',
  ],
  narrativeMustNotInvent: [
    'Simulationにない技や形態変化',
    '主人公が武器や魔法で攻撃する描写',
  ],
  visualProfile: {
    assetKey: 'mainquest-boss-ragna',
    scale: 1.7,
    idleMotion: 'armored-stance-idle',
    hitReaction: 'armor-clang',
    attackMotion: 'charge-ram',
    presentationMotifs: ['破城の角', '戦場の砂塵', '要塞の残骸'],
  },
}

const HALMA_PROFILE: UniqueMonsterProfile = {
  id: 'halma',
  name: '天駆ける災竜',
  personalityTraits: [
    '自由を尊ぶ',
    '誇り高い',
    '縄張り意識が強い',
    '拘束を激しく嫌う',
  ],
  values: ['何者にも縛られない自由', '力への敬意'],
  motivation: '草原の空という己の縄張りを、何者にも侵させないこと。',
  conflictReason:
    '空を縄張りとして踏み荒らす、あるいは縛ろうとする者を敵と見なす。',
  attitudeTowardHumans:
    '取るに足らない相手には興味を示さないが、力ある者には敬意を払う。',
  attitudeTowardPlayer:
    '戦えぬ身でありながら向かってくる姿勢そのものに、僅かな敬意を見せる。',
  communicationStyle: '荒々しく誇り高い、挑発めいた物言い。',
  combatIdentity: ['空を駆ける俊敏な急襲', '誇り高い一騎打ちめいた立ち回り'],
  narrativeMustShow: [
    '自由と縄張りへの強いこだわり',
    '拘束されることへの激しい嫌悪',
    '力ある者への敬意',
  ],
  narrativeMustNotInvent: [
    'Simulationにない技や形態変化',
    '主人公が武器や魔法で攻撃する描写',
  ],
  visualProfile: {
    assetKey: 'mainquest-boss-halma',
    scale: 1.9,
    idleMotion: 'wing-flutter-idle',
    hitReaction: 'roar-recoil',
    attackMotion: 'dive-strike',
    presentationMotifs: ['草原の疾風', '鋭い鱗', '広げた翼'],
  },
}

const NOSFERATU_PROFILE: UniqueMonsterProfile = {
  id: 'nosferatu',
  name: 'ノスフェラトゥ',
  personalityTraits: ['極めて冷静', '知的', '残酷', 'ほとんど怒らない', '長命'],
  values: ['個への過度な責任集中を嫌う', '観察と検証'],
  motivation: '「英雄」という概念を解体し、その先に何が残るかを見届けること。',
  conflictReason:
    '人間が危機のたびに一人の強者へ責任を押し付ける在り方そのものを憎悪している。',
  attitudeTowardHumans:
    '人間社会を長年観察し続ける、冷淡な観察者としての態度を取る。',
  attitudeTowardPlayer:
    '主人公を憎悪の対象ではなく、戦えなくなった元勇者が何を残すかを見る実験対象として見ている。',
  communicationStyle: '静かで淀みなく、挑発すら冷静な口調で行う。',
  combatIdentity: [
    '圧倒的な余裕を感じさせる立ち回り',
    '無駄のない、感情を交えない攻勢',
  ],
  narrativeMustShow: [
    'かつて主人公を呪った本人であるという事実',
    '主人公が元勇者だと知っている、という事実',
    '主人公が酒場を営んできたことをある程度観察している、という事実',
    '主人公が戦えないことを知った上での態度',
    '「英雄」という概念そのものへの嫌悪',
  ],
  narrativeMustNotInvent: [
    'Simulationにない技や形態変化',
    '主人公が武器や魔法で攻撃する描写',
    '主人公とNosferatuの間に存在しない過去の直接対決',
  ],
  visualProfile: {
    assetKey: 'mainquest-boss-nosferatu',
    scale: 1.5,
    idleMotion: 'still-composed-idle',
    hitReaction: 'unmoved-glance',
    attackMotion: 'silent-strike',
    presentationMotifs: ['夜の帳', '血のように紅い瞳', '静止した佇まい'],
  },
}

export const MAIN_QUEST_THREAT_DEFINITIONS: MainQuestThreatDefinition[] = [
  {
    id: 'alden',
    nationId: 'alden',
    name: '王都地下の封印獣',
    title: 'アルデンの脅威',
    requiredPartyRank: 'B',
    requiredAffinity: 40,
    fee: 1200,
    uniqueMonster: ALDEN_PROFILE,
    scenarioRules: {
      environment: 'ruins',
      briefing:
        '王都地下に封じられていた古い獣が目覚め、封印の間から出ようとしている。',
    },
  },
  {
    id: 'velga',
    nationId: 'velga',
    name: '沼沢の群体魔',
    title: 'ヴェルガの脅威',
    requiredPartyRank: 'B',
    requiredAffinity: 40,
    fee: 1200,
    uniqueMonster: VELGA_PROFILE,
    scenarioRules: {
      environment: 'swamp',
      briefing:
        'ヴェルガ北西部の沼沢地で、群体をなす魔が周辺の共同体を脅かしている。',
    },
  },
  {
    id: 'kared',
    nationId: 'kared',
    name: '黒炉の巨獣',
    title: 'カレドの脅威',
    requiredPartyRank: 'A',
    requiredAffinity: 50,
    fee: 1800,
    uniqueMonster: KALED_PROFILE,
    scenarioRules: {
      environment: 'cave',
      briefing:
        'カレド山岳国の坑道深くにある黒炉から、巨大な獣が坑道を脅かしている。',
    },
  },
  {
    id: 'celesta',
    nationId: 'celesta',
    name: '海峡喰らい',
    title: 'セレスタの脅威',
    requiredPartyRank: 'A',
    requiredAffinity: 50,
    fee: 1800,
    uniqueMonster: CELESTA_PROFILE,
    scenarioRules: {
      environment: 'urban',
      briefing:
        'セレスタの海峡に潜む怪物が、通行料と称して船や人を襲っている。',
    },
  },
  {
    id: 'eldia',
    nationId: 'eldia',
    name: '古樹を蝕むもの',
    title: 'エルディアの脅威',
    requiredPartyRank: 'A',
    requiredAffinity: 50,
    fee: 1800,
    uniqueMonster: ELDIA_PROFILE,
    scenarioRules: {
      environment: 'forest',
      briefing:
        'エルディアの深い森で、古樹に取り憑いた何かが森全体を蝕み始めている。',
    },
  },
  {
    id: 'ragna',
    nationId: 'ragna',
    name: '東境の攻城獣',
    title: 'ラグナの脅威',
    requiredPartyRank: 'S',
    requiredAffinity: 60,
    fee: 2800,
    uniqueMonster: RAGNA_PROFILE,
    scenarioRules: {
      environment: 'mountain',
      briefing: 'ラグナ東境の要塞群へ向けて、巨大な攻城獣が進軍を続けている。',
    },
  },
  {
    id: 'halma',
    nationId: 'halma',
    name: '天駆ける災竜',
    title: 'ハルマの脅威',
    requiredPartyRank: 'S',
    requiredAffinity: 60,
    fee: 2800,
    uniqueMonster: HALMA_PROFILE,
    scenarioRules: {
      environment: 'plains',
      briefing:
        'ハルマの草原の空に、縄張りを主張する災竜が現れ人々を襲っている。',
    },
  },
  {
    id: 'nosferatu',
    name: 'ノスフェラトゥ',
    title: '最後の脅威',
    requiredPartyRank: 'S',
    requiredAffinity: 70,
    fee: 4000,
    uniqueMonster: NOSFERATU_PROFILE,
    scenarioRules: {
      environment: 'magical',
      briefing:
        '七国の脅威をすべて退けた今、主人公に呪いをかけた本人が姿を現す。',
    },
  },
]

export const MAIN_QUEST_THREAT_DEFINITION_MAP: Record<
  MainQuestThreatId,
  MainQuestThreatDefinition
> = Object.fromEntries(
  MAIN_QUEST_THREAT_DEFINITIONS.map((d) => [d.id, d]),
) as Record<MainQuestThreatId, MainQuestThreatDefinition>

const UNIQUE_MONSTER_ENEMY_BUILD: Record<MainQuestThreatId, () => Enemy> = {
  alden: () =>
    buildUniqueMonsterEnemy('alden', '王都地下の封印獣', {
      rank: 'B',
      species: 'aberration',
      archetype: 'tank',
    }),
  velga: () =>
    buildUniqueMonsterEnemy('velga', '沼沢の群体魔', {
      rank: 'B',
      species: 'aberration',
      archetype: 'swarm',
    }),
  kared: () =>
    buildUniqueMonsterEnemy('kared', '黒炉の巨獣', {
      rank: 'A',
      species: 'construct',
      archetype: 'assault',
    }),
  celesta: () =>
    buildUniqueMonsterEnemy('celesta', '海峡喰らい', {
      rank: 'A',
      species: 'beast',
      archetype: 'ambusher',
    }),
  eldia: () =>
    buildUniqueMonsterEnemy('eldia', '古樹を蝕むもの', {
      rank: 'A',
      species: 'aberration',
      archetype: 'controller',
    }),
  ragna: () =>
    buildUniqueMonsterEnemy('ragna', '東境の攻城獣', {
      rank: 'S',
      species: 'beast',
      archetype: 'tank',
    }),
  halma: () =>
    buildUniqueMonsterEnemy('halma', '天駆ける災竜', {
      rank: 'S',
      species: 'beast',
      archetype: 'skirmisher',
    }),
  nosferatu: () =>
    buildUniqueMonsterEnemy('nosferatu', 'ノスフェラトゥ', {
      rank: 'S',
      species: 'undead',
      archetype: 'controller',
    }),
}

/**
 * Returns the fixed, deterministic boss-tier `Enemy` for a Threat. The
 * same Threat always yields the same stat block (seed pinned to the
 * Threat id, not to any attempt/day) — only `runBattle`'s own seed varies
 * per attempt.
 */
export function buildMainQuestEnemy(threatId: MainQuestThreatId): Enemy {
  return UNIQUE_MONSTER_ENEMY_BUILD[threatId]()
}

export const NATIONAL_THREAT_IDS: MainQuestThreatId[] = [
  'alden',
  'velga',
  'kared',
  'celesta',
  'eldia',
  'ragna',
  'halma',
]

/**
 * Pure selector (item 118): Nosferatu unlocks only once all seven national
 * Threats are individually confirmed `defeated` — never derived any other
 * way (no counter, no percentage, no partial credit).
 */
export function isNosferatuUnlocked(mainQuestState: MainQuestState): boolean {
  return NATIONAL_THREAT_IDS.every(
    (id) => mainQuestState.threats[id].status === 'defeated',
  )
}

export function createInitialMainQuestState(): MainQuestState {
  const threats = Object.fromEntries(
    MAIN_QUEST_THREAT_DEFINITIONS.map((d) => [
      d.id,
      {
        id: d.id,
        status: d.id === 'nosferatu' ? 'locked' : 'available',
      },
    ]),
  ) as MainQuestState['threats']

  return {
    threats,
    attempts: [],
    playerCurseStatus: 'active',
  }
}
