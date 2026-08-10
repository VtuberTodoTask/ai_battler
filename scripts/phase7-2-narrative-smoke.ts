import { buildExpeditionPrompt } from '../src/core/narrative/prompt.ts'
import type {
  ExpeditionNarrativeContext,
  NarrativeDirection,
  NarrativeMemberSnapshot,
  NarrativePartySnapshot,
  NarrativeTimelineBeat,
} from '../src/core/narrative/types.ts'
import type {
  DispatchReport,
  TavernRequestOffer,
} from '../src/core/tavern/types.ts'

const members: NarrativeMemberSnapshot[] = [
  {
    id: 'm1',
    name: 'リナ',
    role: 'guardian',
    rank: 'C',
    personality: {
      bravery: 2,
      caution: 0,
      cooperation: 1,
      discipline: 1,
      altruism: 2,
      greed: -1,
    },
    narrativeProfile: {
      temperament: '仲間を守ることに誇りを持つ',
      socialStyle: '寡黙だが面倒見がいい',
      values: ['仲間の安全', '責任'],
      flaws: ['自分を省みない'],
      fears: ['守れない仲間'],
      habits: ['戦闘前に盾の位置を確認する'],
      speechStyle: '短く、確認を怠らない',
    },
  },
  {
    id: 'm2',
    name: 'アルン',
    role: 'healer',
    rank: 'C',
    personality: {
      bravery: -1,
      caution: 2,
      cooperation: 2,
      discipline: 0,
      altruism: 2,
      greed: -2,
    },
    narrativeProfile: {
      temperament: '思慮深く慎重',
      socialStyle: '人の痛みに寄り添う',
      values: ['誰も見捨てない'],
      flaws: ['優柔不断'],
      fears: ['手の届かない傷'],
      habits: ['薬袋の紐を何度も確かめる'],
      speechStyle: '丁寧で落ち着いた',
    },
  },
  {
    id: 'm3',
    name: 'ゼファー',
    role: 'vanguard',
    rank: 'C',
    personality: {
      bravery: 3,
      caution: -2,
      cooperation: 0,
      discipline: -1,
      altruism: 0,
      greed: 1,
    },
    narrativeProfile: {
      temperament: '猪突猛進で楽天的',
      socialStyle: '軽口を叩くが気は優しい',
      values: ['勝利', '評価'],
      flaws: ['無謀', '金銭に弱い'],
      fears: ['孤立して囲まれること'],
      habits: ['剣を振り回して血を巡らせる'],
      speechStyle: '威勢がよく、時に軽佻',
    },
  },
]

const party: NarrativePartySnapshot = {
  id: 'p1',
  name: '鉄靴のトリオ',
  rank: 'C',
  leaderId: 'm1',
  leaderName: 'リナ',
  members,
  missionSpecialization: {
    id: 'balanced',
    name: 'バランス',
    strongObjective: 'investigation',
    weakObjective: 'escort',
  },
  affinity: 55,
  financialPressure: 0,
  riskTolerance: 'balanced',
  growthMilestones: 0,
  trainingDays: 0,
  stats: {
    totalExpeditions: 1,
    completeSuccesses: 0,
    successes: 1,
    partialSuccesses: 0,
    failures: 0,
    retreats: 0,
  },
  characterRelationships: [
    {
      sourceCharacterId: 'm1',
      sourceName: 'リナ',
      targetCharacterId: 'm2',
      targetName: 'アルン',
      affinity: 70,
      trust: 75,
      respect: 65,
      tension: 10,
      tags: ['背中を預け合う'],
      recentEvents: [
        {
          type: 'shared_success',
          summary: '依頼成功を共にした',
          importance: 5,
        },
      ],
    },
    {
      sourceCharacterId: 'm2',
      sourceName: 'アルン',
      targetCharacterId: 'm1',
      targetName: 'リナ',
      affinity: 68,
      trust: 72,
      respect: 70,
      tension: 8,
      tags: ['守ってくれる存在'],
      recentEvents: [
        { type: 'healed', summary: 'リナの手当てをした', importance: 6 },
      ],
    },
    {
      sourceCharacterId: 'm1',
      sourceName: 'リナ',
      targetCharacterId: 'm3',
      targetName: 'ゼファー',
      affinity: 35,
      trust: 30,
      respect: 25,
      tension: 60,
      tags: ['言い合いが多い'],
      recentEvents: [
        { type: 'conflict', summary: '撤退提案を無視された', importance: 6 },
      ],
    },
    {
      sourceCharacterId: 'm3',
      sourceName: 'ゼファー',
      targetCharacterId: 'm1',
      targetName: 'リナ',
      affinity: 40,
      trust: 35,
      respect: 50,
      tension: 55,
      tags: ['苦手な相方'],
      recentEvents: [
        { type: 'conflict', summary: '攻勢を抑えられて不満', importance: 5 },
      ],
    },
  ],
  arrivalDay: 1,
  plannedDepartureDay: 7,
}

const request: TavernRequestOffer = {
  id: 'r1',
  title: '森の遺跡調査',
  briefing: '森の奥に出現した遺跡の内部構造を調査する。',
  rank: 'C',
  objectiveType: 'investigation',
  environment: 'forest',
  publicTags: ['遺跡', '森', '調査'],
  estimate: {
    successProbability: 0.75,
    riskLevel: 'medium',
    rewardRange: [200, 300],
  },
  difficulty: {
    base: 1,
    environment: 1,
    rank: 2,
    total: 4,
  },
  hiddenInfo: {
    actualObjectiveType: 'investigation',
    actualEnvironment: 'forest',
    actualDifficulty: 4,
    actualRank: 'C',
  },
  request: {
    id: 'r1',
    objectiveType: 'investigation',
    rank: 'C',
    environment: 'forest',
    durationEstimate: 3,
    baseReward: 250,
    title: '森の遺跡調査',
    briefing: '森の奥に出現した遺跡の内部構造を調査する。',
  },
}

const report: DispatchReport = {
  requestId: 'r1',
  objectiveType: 'investigation',
  outcome: 'success',
  objectiveCompleted: true,
  objectiveProgress: 1,
  elapsedTime: 3,
  battleOutcome: 'retreat',
  party: members.map((m) => ({
    adventurerId: m.id,
    name: m.name,
    role: m.role,
    rank: m.rank,
    finalHp: 10,
    maxHp: 20,
    finalMp: 10,
    maxMp: 20,
    finalMorale: 80,
    incapacitated: false,
    dead: false,
  })),
  casualties: [],
  incapacitated: [],
  keyFacts: ['遺跡の主要な部屋を確認した'],
  objective: {
    type: 'investigation',
    progress: 100,
    completed: true,
    discoveredInformationCount: 2,
    completeInformationCount: 2,
    battleIntelCount: 0,
  },
}

const timeline: NarrativeTimelineBeat[] = [
  {
    id: 'b1',
    phase: 'departure',
    kind: 'transition',
    text: 'Partyは依頼を引き受け、森へ向かった',
    importance: 50,
  },
  {
    id: 'b2',
    phase: 'approach',
    kind: 'event',
    text: 'リナは周囲の警戒を怠らず、先陣を進んだ',
    actorIds: ['m1'],
    importance: 60,
  },
  {
    id: 'b3',
    phase: 'battle',
    kind: 'battle',
    text: '遺跡の守護者と遭遇し、ゼファーが孤立しかけた',
    actorIds: ['m3'],
    targetIds: ['m3'],
    importance: 90,
  },
  {
    id: 'b4',
    phase: 'battle',
    kind: 'battle',
    text: 'アルンは負傷したゼファーを手当てし、リナが庇いを固めた',
    actorIds: ['m2', 'm1'],
    targetIds: ['m3'],
    importance: 95,
  },
  {
    id: 'b5',
    phase: 'objective',
    kind: 'event',
    text: '遺跡の最深部に到達し、古代の刻印を確認した',
    importance: 85,
  },
  {
    id: 'b6',
    phase: 'return',
    kind: 'transition',
    text: 'Partyは夜道を進み、酒場へ戻った',
    importance: 55,
  },
]

const direction: NarrativeDirection = {
  mainScenes: [
    {
      beatIds: ['b3', 'b4'],
      focus: '遺跡の守護者との戦闘と負傷者の手当て',
      reason: '戦闘における命綱のやり取り',
    },
    {
      beatIds: ['b5'],
      focus: '最深部の刻印確認',
      reason: '依頼目的の達成',
    },
  ],
  secondaryScenes: [
    {
      beatIds: ['b2'],
      focus: 'リナの警戒と先陣',
      reason: 'リーダーの気質を示す場面',
    },
  ],
  montageBeatIds: ['b1', 'b6'],
}

const context: ExpeditionNarrativeContext = {
  kind: 'expedition',
  party,
  request,
  report,
  acceptance: {
    reason: 'appropriate',
    rankGap: 0,
    specializationMatch: 'strong',
  },
  timeline,
  direction,
}

const user = buildExpeditionPrompt(context)

console.log('=== Phase 7.2 Narrative Smoke ===')
console.log('\n--- PROMPT SNAPSHOT ---')
console.log(user)
console.log('\n--- PROMPT STATS ---')
console.log(`Characters: ${user.length}`)
console.log('Lines:', user.split('\n').length)
