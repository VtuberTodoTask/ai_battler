import { buildNarrativePrompt } from '../src/core/narrative/prompt.ts'
import { determineNarrativeDirection } from '../src/core/narrative/director.ts'
import type {
  NarrativeMemberSnapshot,
  NarrativePartySnapshot,
  NarrativeRequestInfo,
  NarrativeTimelineBeat,
} from '../src/core/narrative/types.ts'
import type { DispatchReport } from '../src/core/tavern/types.ts'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`)
  }
}

function makeMember(
  id: string,
  name: string,
  role: NarrativeMemberSnapshot['role'],
  overrides?: Partial<NarrativeMemberSnapshot['personality']>,
  profile?: Partial<NarrativeMemberSnapshot['narrativeProfile']>,
): NarrativeMemberSnapshot {
  return {
    id,
    name,
    role,
    rank: 'C',
    personality: {
      bravery: 0,
      caution: 0,
      cooperation: 0,
      discipline: 0,
      altruism: 0,
      greed: 0,
      ...overrides,
    },
    narrativeProfile: {
      temperament: 'バランス型',
      socialStyle: '控えめ',
      values: ['任務完了'],
      flaws: ['頑固'],
      fears: ['失敗'],
      habits: ['装備を整える'],
      speechStyle: '普通',
      ...profile,
    },
  }
}

const members: NarrativeMemberSnapshot[] = [
  makeMember(
    'a',
    'アルド',
    'vanguard',
    { bravery: 2, caution: -1, cooperation: 1, discipline: 1 },
    {
      temperament: '責任感が強く寡黙',
      socialStyle: '相手を観察してから話す',
      values: ['仲間の安全', '任務の達成'],
      flaws: ['自分を省みない'],
      fears: ['守れない仲間'],
      habits: ['戦闘前に剣の切先を一度見る'],
      speechStyle: '短く、主語を省略しがち',
    },
  ),
  makeMember(
    'b',
    'ベル',
    'guardian',
    { bravery: 1, caution: 1, cooperation: 2, discipline: 0 },
    {
      temperament: '気遣いが多い',
      socialStyle: '相手の様子を窺う',
      values: ['誰も見捨てない'],
      flaws: ['優柔不断'],
      fears: ['手の届かない傷'],
      habits: ['薬袋の紐を確かめる'],
      speechStyle: '丁寧で落ち着いた',
    },
  ),
  makeMember(
    'c',
    'シン',
    'ranger',
    { bravery: 0, caution: 2, cooperation: 0, discipline: 2 },
    {
      temperament: '慎重で計算高い',
      socialStyle: '必要最小限の会話',
      values: ['自己保存', '精度'],
      flaws: ['冷たく見える'],
      fears: ['情報不足'],
      habits: ['周囲を素早く見回す'],
      speechStyle: '事実のみ短く述べる',
    },
  ),
  makeMember(
    'd',
    'ドナ',
    'mage',
    { bravery: 0, caution: 0, cooperation: 1, discipline: -1 },
    {
      temperament: '気ままで皮肉が多い',
      socialStyle: '冗談を交えて距離を測る',
      values: ['自由', '楽に生きる'],
      flaws: ['責任転嫁'],
      fears: ['退屈'],
      habits: ['杖の先端で地面を叩く'],
      speechStyle: 'やや挑発的で語尾が長い',
    },
  ),
]

const relationships: NonNullable<
  NarrativePartySnapshot['characterRelationships']
> = [
  {
    sourceCharacterId: 'a',
    sourceName: 'アルド',
    targetCharacterId: 'b',
    targetName: 'ベル',
    affinity: 55,
    trust: 75,
    respect: 60,
    tension: 80,
    tags: ['背中を預け合う'],
    recentEvents: [],
  },
  {
    sourceCharacterId: 'b',
    sourceName: 'ベル',
    targetCharacterId: 'a',
    targetName: 'アルド',
    affinity: 50,
    trust: 70,
    respect: 65,
    tension: 75,
    tags: ['守ってくれる存在'],
    recentEvents: [],
  },
  {
    sourceCharacterId: 'a',
    sourceName: 'アルド',
    targetCharacterId: 'c',
    targetName: 'シン',
    affinity: 60,
    trust: 75,
    respect: 70,
    tension: 10,
    tags: ['歩調が合う'],
    recentEvents: [],
  },
  {
    sourceCharacterId: 'c',
    sourceName: 'シン',
    targetCharacterId: 'a',
    targetName: 'アルド',
    affinity: 55,
    trust: 70,
    respect: 75,
    tension: 15,
    tags: ['相談しやすい'],
    recentEvents: [],
  },
]

const baseParty: NarrativePartySnapshot = {
  id: 'p1',
  name: '鉄靴の一行',
  rank: 'C',
  leaderId: 'a',
  leaderName: 'アルド',
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
  objectiveType: NarrativeRequestInfo['objectiveType'],
): NarrativeRequestInfo {
  return {
    id: 'r1',
    title,
    briefing,
    rank: 'C',
    objectiveType,
    environment: 'forest',
    publicTags: ['テスト'],
  }
}

function makeReport(
  outcome: DispatchReport['outcome'],
  objective: DispatchReport['objective'],
  party: DispatchReport['party'],
): DispatchReport {
  return {
    requestId: 'r1',
    objectiveType: objective.type,
    outcome,
    objectiveCompleted: false,
    objectiveProgress: 50,
    elapsedTime: 3,
    party,
    casualties: [],
    incapacitated: [],
    keyFacts: [],
    objective,
  }
}

function makePartyReport(
  overrides: Record<string, Partial<DispatchReport['party'][number]>>,
): DispatchReport['party'] {
  return members.map((m) => {
    const over = overrides[m.id]
    return {
      adventurerId: m.id,
      name: m.name,
      role: m.role,
      rank: m.rank,
      finalHp: over?.finalHp ?? 20,
      maxHp: 20,
      finalMp: 14,
      maxMp: 20,
      finalMorale: 80,
      incapacitated: over?.incapacitated ?? false,
      dead: over?.dead ?? false,
    }
  })
}

function makeBeat(
  overrides: Partial<NarrativeTimelineBeat> & { id: string; text: string },
): NarrativeTimelineBeat {
  return {
    phase: 'exploration',
    kind: 'event',
    importance: 45,
    actorIds: [],
    targetIds: [],
    ...overrides,
  }
}

function assertPromptIntegrity(user: string, system: string): void {
  assert(
    user.includes('=== NARRATIVE DIRECTION ==='),
    'NARRATIVE DIRECTION missing',
  )
  assert(user.includes('Omitted Beat IDs:'), 'Omitted Beat IDs missing')
  assert(user.includes('Focus:'), 'Focus missing')
  assert(user.includes('Main Scenes:'), 'Main Scenes missing')
  assert(user.includes('=== CHARACTERS ==='), 'CHARACTERS missing')
  assert(
    user.includes('=== PARTY RELATIONSHIPS ==='),
    'PARTY RELATIONSHIPS missing',
  )
  assert(user.includes('=== EXPEDITION TIMELINE ==='), 'TIMELINE missing')
  assert(user.includes('WRITING INSTRUCTIONS'), 'WRITING INSTRUCTIONS missing')

  assert(system.includes('FACT PRESERVATION'), 'FACT PRESERVATION missing')
  assert(system.includes('FACT COVERAGE'), 'FACT COVERAGE missing')
  assert(
    system.includes('不在は出来事ではない'),
    'Absence is not an event rule missing',
  )
  assert(
    system.includes('キャラクター特性は傾向である'),
    'Traits are tendencies rule missing',
  )
  assert(
    system.includes('関係性の差異化'),
    'Relationship differentiation rule missing',
  )
  assert(
    system.includes('Narrative Generator と UI の責務分界'),
    'UI responsibility boundary missing',
  )
}

function runCase(
  name: string,
  request: NarrativeRequestInfo,
  report: DispatchReport,
  timeline: NarrativeTimelineBeat[],
): {
  user: string
  system: string
  direction: ReturnType<typeof determineNarrativeDirection>
} {
  console.log(`\n=== ${name} ===`)
  const direction = determineNarrativeDirection(
    timeline,
    baseParty.members,
    baseParty.characterRelationships,
  )
  console.log(
    `mainScenes: ${JSON.stringify(direction.mainScenes.map((s) => s.beatIds))}`,
  )
  console.log(
    `secondaryScenes: ${JSON.stringify(direction.secondaryScenes.map((s) => s.beatIds))}`,
  )
  console.log(`montageBeatIds: ${direction.montageBeatIds.length}`)
  console.log(`omittedBeatIds: ${direction.omittedBeatIds?.length ?? 0}`)
  if (direction.focus) {
    console.log(`focus: ${direction.focus.summary}`)
  }
  if (direction.interactionHints && direction.interactionHints.length > 0) {
    for (const hint of direction.interactionHints) {
      console.log(
        `hint: ${hint.characterIds.join('+')} — ${hint.relationshipSummary ?? ''} / ${hint.suggestedDynamic ?? ''}`,
      )
    }
  }

  const prompt = buildNarrativePrompt({
    kind: 'expedition',
    party: baseParty,
    request,
    report,
    timeline,
    acceptance: {
      reason: 'appropriate',
      rankGap: 0,
      specializationMatch: 'neutral',
    },
  })
  const { system, user } = prompt
  assertPromptIntegrity(user, system)
  return { user, system, direction }
}

// Case A: Missing Healing Event — injured member, no healing beat
{
  const request = makeRequest(
    '森の調査',
    '街道沿いで増えている魔物の出現理由を探る。',
    'investigation',
  )
  const report = makeReport(
    'partialSuccess',
    {
      type: 'investigation',
      progress: 50,
      completed: false,
      discoveredInformationCount: 1,
      completeInformationCount: 0,
      battleIntelCount: 0,
    },
    makePartyReport({ a: { finalHp: 8 } }),
  )
  const timeline: NarrativeTimelineBeat[] = [
    makeBeat({
      id: 'a1',
      phase: 'departure',
      text: 'Partyは依頼を引き受け、森へ向かった',
      importance: 45,
    }),
    makeBeat({
      id: 'a2',
      phase: 'exploration',
      text: '魔物の気配を察知した',
      importance: 50,
      actorIds: ['a'],
    }),
    makeBeat({
      id: 'a3',
      phase: 'battle',
      text: 'アルドが負傷した',
      importance: 85,
      actorIds: ['a'],
      targetIds: ['a'],
    }),
    makeBeat({
      id: 'a4',
      phase: 'objective',
      text: '断片的な手がかりを得た',
      importance: 80,
    }),
    makeBeat({
      id: 'a5',
      phase: 'return',
      text: 'Partyは酒場へ帰還した',
      importance: 45,
    }),
  ]
  const { user } = runCase(
    'A: Missing Healing Event',
    request,
    report,
    timeline,
  )
  assert(
    !user.includes('手当てが行われなかった'),
    'Case A: negative absence phrase in prompt',
  )
  assert(
    !user.includes('手当ては行われなかった'),
    'Case A: alternative negative absence phrase in prompt',
  )
  assert(
    user.includes('不在の出来事'),
    'Case A: absence rule missing in writing instructions',
  )
}

// Case B: Mixed Status — one heavily wounded, others fine
{
  const request = makeRequest(
    '遺跡内部の調査',
    '遺跡の内部構造と危険を調べる。',
    'investigation',
  )
  const report = makeReport(
    'partialSuccess',
    {
      type: 'investigation',
      progress: 60,
      completed: false,
      discoveredInformationCount: 1,
      completeInformationCount: 0,
      battleIntelCount: 0,
    },
    makePartyReport({ a: { finalHp: 6 } }),
  )
  const timeline: NarrativeTimelineBeat[] = [
    makeBeat({
      id: 'b1',
      phase: 'departure',
      text: 'Partyは遺跡へ向かった',
      importance: 45,
    }),
    makeBeat({
      id: 'b2',
      phase: 'exploration',
      text: 'アルドが罠を踏み、大きな怪我を負った',
      importance: 90,
      actorIds: ['a'],
      targetIds: ['a'],
    }),
    makeBeat({
      id: 'b3',
      phase: 'objective',
      text: '内部の構造を一部確認した',
      importance: 80,
    }),
    makeBeat({
      id: 'b4',
      phase: 'return',
      text: 'Partyは帰還した',
      importance: 45,
    }),
  ]
  const { user } = runCase('B: Mixed Status', request, report, timeline)
  assert(user.includes('帰還時の状態'), 'Case B: no member condition facts')
  assert(
    user.includes('帰還時の消耗が大きい'),
    'Case B: heavily wounded member not reflected',
  )
  assert(
    !user.includes('目立った消耗はない'),
    'Case B: healthy members should not be listed',
  )
  assert(
    !user.includes('消耗はない'),
    'Case B: absence-of-damage phrase should not appear',
  )
}

// Case C: Strong Character Trait — trait should be present but not a checklist
{
  const request = makeRequest(
    '古戦場の討伐',
    '古戦場に集う魔物を撃退する。',
    'elimination',
  )
  const report = makeReport(
    'success',
    {
      type: 'elimination',
      targetCount: 3,
      defeatedCount: 3,
      completed: true,
    },
    makePartyReport({}),
  )
  const timeline: NarrativeTimelineBeat[] = [
    makeBeat({
      id: 'c1',
      phase: 'departure',
      text: 'Partyは古戦場へ向かった',
      importance: 45,
    }),
    makeBeat({
      id: 'c2',
      phase: 'battle',
      text: 'アルドが先陣を切り、敵を引きつけた',
      importance: 85,
      actorIds: ['a'],
    }),
    makeBeat({
      id: 'c3',
      phase: 'battle',
      text: 'アルドは味方を守るため、自らが盾になった',
      importance: 90,
      actorIds: ['a'],
      targetIds: ['b', 'c'],
    }),
    makeBeat({
      id: 'c4',
      phase: 'objective',
      text: '目標を全て撃破した',
      importance: 85,
    }),
    makeBeat({
      id: 'c5',
      phase: 'return',
      text: 'Partyは帰還した',
      importance: 45,
    }),
  ]
  const { user, system, direction } = runCase(
    'C: Strong Character Trait',
    request,
    report,
    timeline,
  )
  const selectedCIds = [
    ...direction.mainScenes.flatMap((s) => s.beatIds),
    ...direction.secondaryScenes.flatMap((s) => s.beatIds),
  ]
  assert(
    selectedCIds.some((id) => id === 'c2' || id === 'c3'),
    'Case C: trait-bearing beats should be selected as main or secondary',
  )
  assert(
    user.includes('短く、主語を省略しがち'),
    'Case C: speechStyle reference missing',
  )
  assert(
    system.includes('キャラクター特性は傾向である'),
    'Case C: trait tendency rule missing',
  )
}

// Case D: Relationship Contrast — high trust + high tension vs high trust + low tension
{
  const request = makeRequest(
    '森の護衛',
    '森の街道を通る旅人を護衛する。',
    'escort',
  )
  const report = makeReport(
    'success',
    {
      type: 'escort',
      escortTargetName: '旅人',
      escortTargetState: 'alive',
      completed: true,
    },
    makePartyReport({}),
  )
  const timeline: NarrativeTimelineBeat[] = [
    makeBeat({
      id: 'd1',
      phase: 'departure',
      text: 'Partyは護衛対象を連れて出発した',
      importance: 45,
    }),
    makeBeat({
      id: 'd2',
      phase: 'battle',
      text: '旅人を守るため、アルドがベルとシンに指示を出した',
      importance: 85,
      actorIds: ['a'],
      targetIds: ['b', 'c'],
    }),
    makeBeat({
      id: 'd3',
      phase: 'return',
      text: 'Partyは無事に護衛を終えた',
      importance: 80,
    }),
  ]
  const { user, direction } = runCase(
    'D: Relationship Contrast',
    request,
    report,
    timeline,
  )
  const abHint = direction.interactionHints?.find(
    (h) => h.characterIds.includes('a') && h.characterIds.includes('b'),
  )
  const acHint = direction.interactionHints?.find(
    (h) => h.characterIds.includes('a') && h.characterIds.includes('c'),
  )
  assert(abHint, 'Case D: A-B hint missing')
  assert(acHint, 'Case D: A-C hint missing')
  assert(
    abHint.suggestedDynamic !== acHint.suggestedDynamic,
    'Case D: A-B and A-C dynamics should differ',
  )
  assert(
    abHint.relationshipSummary !== acHint.relationshipSummary,
    'Case D: A-B and A-C relationship summaries should differ',
  )
  assert(user.includes('信頼が厚い'), 'Case D: trust hint not in prompt')
  assert(user.includes('緊張がある'), 'Case D: tension contrast not in prompt')
}

// Case E: Routine Timeline — many low-importance beats; main should stay at one
{
  const request = makeRequest(
    '街道の定期巡回',
    '街道沿いの安全を確認する。',
    'investigation',
  )
  const report = makeReport(
    'success',
    {
      type: 'investigation',
      progress: 100,
      completed: true,
      discoveredInformationCount: 2,
      completeInformationCount: 2,
      battleIntelCount: 0,
    },
    makePartyReport({}),
  )
  const timeline: NarrativeTimelineBeat[] = [
    makeBeat({
      id: 'e1',
      phase: 'departure',
      text: 'Partyは酒場を出発した',
      importance: 45,
    }),
    makeBeat({
      id: 'e2',
      phase: 'approach',
      text: '街道を進んだ',
      importance: 45,
    }),
    makeBeat({
      id: 'e3',
      phase: 'approach',
      text: '周囲を見回した',
      importance: 45,
    }),
    makeBeat({
      id: 'e4',
      phase: 'exploration',
      text: '痕跡を探した',
      importance: 45,
    }),
    makeBeat({
      id: 'e5',
      phase: 'exploration',
      text: '少し休憩を取った',
      importance: 45,
    }),
    makeBeat({
      id: 'e6',
      phase: 'exploration',
      text: 'さらに街道を進んだ',
      importance: 45,
    }),
    makeBeat({
      id: 'e7',
      phase: 'exploration',
      text: '道具を整えた',
      importance: 45,
    }),
    makeBeat({
      id: 'e8',
      phase: 'objective',
      text: '街道の安全を確認した',
      importance: 80,
    }),
    makeBeat({
      id: 'e9',
      phase: 'return',
      text: 'Partyは酒場へ帰還した',
      importance: 45,
    }),
    makeBeat({
      id: 'e10',
      phase: 'return',
      text: '荷物を下ろした',
      importance: 45,
    }),
  ]
  const { user, direction } = runCase(
    'E: Routine Timeline',
    request,
    report,
    timeline,
  )
  assert(
    direction.mainScenes.length <= 1,
    'Case E: main scenes should be 0 or 1',
  )
  assert(
    direction.secondaryScenes.length <= 1,
    'Case E: secondary scenes should be 0 or 1',
  )
  assert(
    direction.montageBeatIds.length <= 3,
    'Case E: montage budget exceeded',
  )
  assert(
    (direction.omittedBeatIds ?? []).length >= 3,
    'Case E: routine beats should be omitted',
  )
  assert(user.includes('Omitted Beat IDs:'), 'Case E: omitted section missing')
  assert(
    user.includes('短い Narrative が正常系'),
    'Case E: short narrative rule missing',
  )
}

console.log('\n=== Phase 7.2.2 Narrative Restraint Smoke: ALL PASS ===')
