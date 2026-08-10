import { determineNarrativeDirection } from '../src/core/narrative/director.ts'
import { buildExpeditionPrompt } from '../src/core/narrative/prompt.ts'
import type {
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

const relationships = [
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
      { type: 'shared_success', summary: '依頼成功を共にした', importance: 5 },
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
  characterRelationships: relationships,
  arrivalDay: 1,
  plannedDepartureDay: 7,
}

function makeRequest(
  title: string,
  briefing: string,
  objectiveType:
    | 'investigation'
    | 'elimination'
    | 'rescue'
    | 'escort'
    | 'retrieval'
    | 'survey',
  environment: 'forest' | 'mountain' | 'swamp' | 'ruins' | 'cave' | 'plains',
  publicTags: string[],
): TavernRequestOffer {
  return {
    id: 'r1',
    title,
    briefing,
    rank: 'C',
    objectiveType,
    environment,
    publicTags,
    estimate: {
      successProbability: 0.7,
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
      actualObjectiveType: objectiveType,
      actualEnvironment: environment,
      actualDifficulty: 4,
      actualRank: 'C',
    },
    request: {
      id: 'r1',
      objectiveType,
      rank: 'C',
      environment,
      durationEstimate: 3,
      baseReward: 250,
      title,
      briefing,
    },
  }
}

function makeReport(
  outcome:
    | 'success'
    | 'partialSuccess'
    | 'failedObjective'
    | 'forcedRetreat'
    | 'completeSuccess'
    | 'lostExpedition',
  objectiveCompleted: boolean,
  objectiveProgress: number,
  objective: DispatchReport['objective'],
  keyFacts: string[],
  battleOutcome?: 'victory' | 'retreat' | 'defeat',
): DispatchReport {
  return {
    requestId: 'r1',
    objectiveType: objective.type,
    outcome,
    objectiveCompleted,
    objectiveProgress,
    elapsedTime: 3,
    battleOutcome,
    party: members.map((m) => ({
      adventurerId: m.id,
      name: m.name,
      role: m.role,
      rank: m.rank,
      finalHp: 18,
      maxHp: 20,
      finalMp: 14,
      maxMp: 20,
      finalMorale: 80,
      incapacitated: false,
      dead: false,
    })),
    casualties: [],
    incapacitated: [],
    keyFacts,
    objective,
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`)
  }
}

function assertPromptIntegrity(user: string): void {
  assert(
    user.includes('=== NARRATIVE DIRECTION ==='),
    'NARRATIVE DIRECTION section missing',
  )
  assert(user.includes('Focus:'), 'Focus missing')
  assert(user.includes('Main Scenes:'), 'Main Scenes missing')
  assert(
    user.includes('Narrative Interaction Hints:'),
    'Narrative Interaction Hints missing',
  )
  assert(user.includes('NARRATIVE FOCUS'), 'NARRATIVE FOCUS rule missing')
  assert(
    user.includes('MONTAGEは1～3文程度'),
    'MONTAGE compression rule missing',
  )
  assert(
    user.includes('TIMELINEのすべての出来事を順番に説明しない'),
    'TIMELINE not checklist rule missing',
  )
  assert(
    user.includes('同じ結果を繰り返し説明しない'),
    'No repeated outcome rule missing',
  )
  assert(user.includes('水筒を渡す'), 'Allowed non-verbal interaction missing')

  assert(!user.includes('HP '), 'raw HP leakage')
  assert(!user.includes('MP '), 'raw MP leakage')
  assert(!user.includes('Morale '), 'raw Morale leakage')
  assert(!user.includes('Objective Progress'), 'Objective Progress leakage')
  assert(!user.includes('AverageQuality'), 'AverageQuality leakage')
  assert(!user.includes('Coverage'), 'Coverage leakage')
  assert(!user.includes('battleOutcome'), 'raw battleOutcome field leakage')
}

function runCase(
  name: string,
  timeline: NarrativeTimelineBeat[],
  request: TavernRequestOffer,
  report: DispatchReport,
): string {
  console.log(`\n=== ${name} ===`)

  const direction = determineNarrativeDirection(
    timeline,
    members,
    relationships,
  )
  console.log(
    `mainScenes: ${JSON.stringify(direction.mainScenes.map((s) => s.beatIds))}`,
  )
  console.log(
    `secondaryScenes: ${JSON.stringify(direction.secondaryScenes.map((s) => s.beatIds))}`,
  )
  console.log(`montageBeatIds: ${direction.montageBeatIds.length}`)
  if (direction.focus) {
    console.log(`focus: ${direction.focus.summary}`)
  }
  if (direction.interactionHints) {
    for (const hint of direction.interactionHints) {
      console.log(
        `hint: ${hint.characterIds.join('+')} — ${hint.suggestedDynamic ?? ''}`,
      )
    }
  }

  const context = {
    kind: 'expedition' as const,
    party,
    request,
    report,
  }
  const user = buildExpeditionPrompt(context)
  assertPromptIntegrity(user)
  return user
}

// Case A: injury + strong relationship
{
  const request = makeRequest(
    '森の遺跡調査',
    '森の奥に出現した遺跡の内部構造を調査する。',
    'investigation',
    'forest',
    ['遺跡', '森', '調査'],
  )
  const report = makeReport(
    'success',
    true,
    100,
    {
      type: 'investigation',
      progress: 100,
      completed: true,
      discoveredInformationCount: 2,
      completeInformationCount: 2,
      battleIntelCount: 0,
    },
    ['遺跡の主要な部屋を確認した'],
    'retreat',
  )
  const timeline: NarrativeTimelineBeat[] = [
    {
      id: 'a1',
      phase: 'departure',
      kind: 'transition',
      text: 'Partyは依頼を引き受け、森へ向かった',
      importance: 50,
    },
    {
      id: 'a2',
      phase: 'approach',
      kind: 'event',
      text: 'アルンはリナの装備をそっと直した',
      actorIds: ['m2', 'm1'],
      importance: 65,
    },
    {
      id: 'a3',
      phase: 'battle',
      kind: 'battle',
      text: '遺跡の守護者と遭遇し、ゼファーが孤立しかけた',
      actorIds: ['m3'],
      targetIds: ['m3'],
      importance: 90,
    },
    {
      id: 'a4',
      phase: 'battle',
      kind: 'battle',
      text: 'ゼファーは深い傷を負い、リナが前に出て守った',
      actorIds: ['m3', 'm1'],
      targetIds: ['m3', 'm1'],
      importance: 95,
    },
    {
      id: 'a5',
      phase: 'objective',
      kind: 'event',
      text: '遺跡の最深部に到達し、古代の刻印を確認した',
      importance: 85,
    },
    {
      id: 'a6',
      phase: 'return',
      kind: 'return',
      text: 'Partyは夜道を進み、酒場へ戻った',
      importance: 55,
    },
  ]
  const user = runCase(
    'Case A: injury + strong relationship',
    timeline,
    request,
    report,
  )
  const direction = determineNarrativeDirection(
    timeline,
    members,
    relationships,
  )
  assert(
    direction.mainScenes.length >= 1,
    'Case A: expected at least one main scene',
  )
  assert(
    direction.mainScenes.some((s) => s.beatIds.includes('a4')),
    'Case A: injury beat should be a main scene',
  )
  assert(
    direction.interactionHints &&
      direction.interactionHints.some(
        (h) => h.characterIds.includes('m1') && h.characterIds.includes('m2'),
      ),
    'Case A: expected a relationship hint for リナ and アルン',
  )
  assert(user.includes('リナ'), 'Case A: prompt should mention リナ')
  assert(user.includes('アルン'), 'Case A: prompt should mention アルン')
  assert(user.includes('ゼファー'), 'Case A: prompt should mention ゼファー')
}

// Case B: route failure
{
  const request = makeRequest(
    '東の古道調査',
    '東の古道で発生した行き止まりの原因を調査する。',
    'investigation',
    'mountain',
    ['古道', '山', '道'],
  )
  const report = makeReport(
    'failedObjective',
    false,
    0,
    {
      type: 'investigation',
      progress: 0,
      completed: false,
      discoveredInformationCount: 0,
      completeInformationCount: 0,
      battleIntelCount: 0,
    },
    ['目的地点に到達できなかった'],
  )
  const timeline: NarrativeTimelineBeat[] = [
    {
      id: 'b1',
      phase: 'departure',
      kind: 'transition',
      text: 'Partyは依頼を引き受け、山道へ向かった',
      importance: 50,
    },
    {
      id: 'b2',
      phase: 'exploration',
      kind: 'event',
      text: 'リナはゼファーの先走りを注意した',
      actorIds: ['m1', 'm3'],
      importance: 70,
    },
    {
      id: 'b3',
      phase: 'exploration',
      kind: 'event',
      text: '分岐路で標識を見落とし、パーティーは違う道へ進んだ',
      actorIds: ['m1', 'm2', 'm3'],
      importance: 90,
    },
    {
      id: 'b4',
      phase: 'exploration',
      kind: 'event',
      text: '行き止まりに気づき、引き返すしかなかった',
      actorIds: ['m1', 'm2', 'm3'],
      importance: 85,
    },
    {
      id: 'b5',
      phase: 'objective',
      kind: 'outcome',
      text: '依頼の目的を達成できなかった',
      importance: 85,
    },
    {
      id: 'b6',
      phase: 'return',
      kind: 'return',
      text: 'Partyは空しい足取りで酒場へ戻った',
      importance: 55,
    },
  ]
  const user = runCase('Case B: route failure', timeline, request, report)
  const direction = determineNarrativeDirection(
    timeline,
    members,
    relationships,
  )
  assert(
    direction.mainScenes.some(
      (s) => s.beatIds.includes('b3') || s.beatIds.includes('b4'),
    ),
    'Case B: route beats should dominate main scenes over generic outcome',
  )
  const routeMainCount = direction.mainScenes.filter((s) =>
    s.beatIds.some((id) => id === 'b3' || id === 'b4'),
  ).length
  assert(
    routeMainCount >= 1,
    'Case B: at least one main scene should be route-driven',
  )
  assert(
    direction.focus && /[道路迷戻分岐]/.test(direction.focus.summary),
    'Case B: focus should reference route theme',
  )
  assert(
    user.includes('行き止まり'),
    'Case B: prompt should mention route dead end',
  )
}

// Case C: routine success
{
  const request = makeRequest(
    '街道沿いの魔物調査',
    '街道沿いで増えている魔物の出没理由を探る。',
    'investigation',
    'forest',
    ['調査', '森林', '待ち伏せの可能性'],
  )
  const report = makeReport(
    'success',
    true,
    100,
    {
      type: 'investigation',
      progress: 100,
      completed: true,
      discoveredInformationCount: 2,
      completeInformationCount: 2,
      battleIntelCount: 0,
    },
    ['魔物の食料源を確認した'],
  )
  const timeline: NarrativeTimelineBeat[] = [
    {
      id: 'c1',
      phase: 'departure',
      kind: 'transition',
      text: 'Partyは依頼を引き受け、森林へ向かった',
      importance: 45,
    },
    {
      id: 'c2',
      phase: 'exploration',
      kind: 'event',
      text: '森の中を進んだ',
      importance: 45,
    },
    {
      id: 'c3',
      phase: 'exploration',
      kind: 'event',
      text: '調査を進めた',
      importance: 55,
    },
    {
      id: 'c4',
      phase: 'objective',
      kind: 'outcome',
      text: '依頼の目的を達成した',
      importance: 85,
    },
    {
      id: 'c5',
      phase: 'return',
      kind: 'return',
      text: 'Partyは酒場へ帰還した',
      importance: 45,
    },
  ]
  runCase('Case C: routine success', timeline, request, report)
  const direction = determineNarrativeDirection(
    timeline,
    members,
    relationships,
  )
  assert(
    direction.mainScenes.length <= 1,
    'Case C: main scenes should be 0 or 1',
  )
  assert(
    direction.secondaryScenes.length <= 2,
    'Case C: secondary scenes should be 0-2',
  )
  assert(
    direction.montageBeatIds.length >= 2,
    'Case C: routine beats should compress to montage',
  )
}

// Case D: multiple combats
{
  const request = makeRequest(
    '遺跡周辺の魔物駆除',
    '遺跡周辺に潜む魔物を駆除する。',
    'elimination',
    'ruins',
    ['遺跡', '魔物', '戦闘'],
  )
  const report = makeReport(
    'success',
    true,
    100,
    {
      type: 'elimination',
      requiredTargetCount: 5,
      defeatedCount: 3,
      escapedCount: 0,
      survivingCount: 2,
      unknownCount: 0,
      confirmedCount: 5,
      progress: 100,
      completed: true,
    } as DispatchReport['objective'],
    ['魔物を複数体撃退した'],
    'victory',
  )
  const timeline: NarrativeTimelineBeat[] = [
    {
      id: 'd1',
      phase: 'departure',
      kind: 'transition',
      text: 'Partyは依頼を引き受け、遺跡へ向かった',
      importance: 45,
    },
    {
      id: 'd2',
      phase: 'battle',
      kind: 'battle',
      text: '戦闘が発生した',
      importance: 80,
    },
    {
      id: 'd3',
      phase: 'battle',
      kind: 'battle',
      text: '戦闘が発生した',
      importance: 80,
    },
    {
      id: 'd4',
      phase: 'battle',
      kind: 'battle',
      text: '戦闘が発生した',
      importance: 80,
    },
    {
      id: 'd5',
      phase: 'objective',
      kind: 'outcome',
      text: '依頼の目的を達成した',
      importance: 85,
    },
    {
      id: 'd6',
      phase: 'return',
      kind: 'return',
      text: 'Partyは酒場へ帰還した',
      importance: 45,
    },
  ]
  runCase('Case D: multiple combats', timeline, request, report)
  const direction = determineNarrativeDirection(
    timeline,
    members,
    relationships,
  )
  assert(
    direction.mainScenes.length <= 2,
    'Case D: main scenes should not exceed 2',
  )
  assert(
    direction.secondaryScenes.length <= 2,
    'Case D: secondary scenes should not exceed 2',
  )
  const selectedBattleIds = [
    ...direction.mainScenes.flatMap((s) => s.beatIds),
    ...direction.secondaryScenes.flatMap((s) => s.beatIds),
  ].filter((id) => id === 'd2' || id === 'd3' || id === 'd4')
  assert(
    selectedBattleIds.length <= 2,
    'Case D: repetitive penalty should keep generic battles from all becoming scenes',
  )
}

// Case E: character fear collision
{
  const request = makeRequest(
    '洞窟奥部の調査',
    '洞窟の奥で鳴き声が聞こえる原因を調査する。',
    'investigation',
    'cave',
    ['洞窟', '調査', '音'],
  )
  const report = makeReport(
    'success',
    true,
    100,
    {
      type: 'investigation',
      progress: 100,
      completed: true,
      discoveredInformationCount: 1,
      completeInformationCount: 1,
      battleIntelCount: 0,
    },
    ['鳴き声の原因を確認した'],
    'victory',
  )
  const timeline: NarrativeTimelineBeat[] = [
    {
      id: 'e1',
      phase: 'departure',
      kind: 'transition',
      text: 'Partyは依頼を引き受け、洞窟へ向かった',
      importance: 45,
    },
    {
      id: 'e2',
      phase: 'exploration',
      kind: 'event',
      text: '洞窟内で敵に囲まれ、ゼファーが孤立しかけた',
      actorIds: ['m3'],
      targetIds: ['m3'],
      importance: 80,
    },
    {
      id: 'e3',
      phase: 'battle',
      kind: 'battle',
      text: 'リナがゼファーの背中を守り、包囲を突破した',
      actorIds: ['m1', 'm3'],
      targetIds: ['m3'],
      importance: 95,
    },
    {
      id: 'e4',
      phase: 'objective',
      kind: 'outcome',
      text: '依頼の目的を達成した',
      importance: 85,
    },
    {
      id: 'e5',
      phase: 'return',
      kind: 'return',
      text: 'Partyは酒場へ帰還した',
      importance: 45,
    },
  ]
  const user = runCase(
    'Case E: character fear collision',
    timeline,
    request,
    report,
  )
  const direction = determineNarrativeDirection(
    timeline,
    members,
    relationships,
  )
  assert(
    direction.mainScenes.some(
      (s) => s.beatIds.includes('e2') || s.beatIds.includes('e3'),
    ),
    'Case E: fear-collision beat should be main scene',
  )
  assert(
    direction.focus?.summary.includes('ゼファー'),
    'Case E: focus should mention ゼファー',
  )
  assert(user.includes('孤立'), 'Case E: prompt should mention isolation')
}

console.log('\n=== Phase 7.2.1 Narrative Quality Smoke: ALL PASS ===')
