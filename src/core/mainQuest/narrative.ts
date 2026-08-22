import type { NarrativeProvider } from '../../ai/narrative/types.ts'
import type { Adventurer } from '../models/types.ts'
import type { CampaignParty } from '../tavern/campaign/types.ts'
import { buildNarrativePartySnapshot } from '../narrative/context.ts'
import { projectMemoriesForNarrative } from '../narrative/memory.ts'
import { projectArcSignalsForNarrative } from '../narrative/arcSignals.ts'
import { projectRelationshipMilestonesForNarrative } from '../narrative/milestones.ts'
import type { NarrativeRequestInfo } from '../narrative/types.ts'
import type {
  MainQuestAttemptRecord,
  MainQuestBattleAnchorId,
  MainQuestBattleDialogueCue,
  MainQuestNarrativeScript,
  MainQuestThreatDefinition,
  UniqueMonsterProfile,
} from './types.ts'

/** Canonical Player-facing label for Battle Dialogue — the tavern owner
 * has no other stable display name in this codebase (item 46). */
export const MAIN_QUEST_PLAYER_DISPLAY_NAME = '店主'

/**
 * The ONLY place a `MainQuestBattleDialogueCue.speakerId` is turned into a
 * display name — never trust an AI-authored name, never fall back to the
 * raw id (Phase 9.8.1 items 45-49). `speakerId` is one of: the fixed
 * `'monster'` sentinel, a real roster member id, or (defensively, though
 * `parseMainQuestNarrativeScript`'s whitelist never currently emits it)
 * `'player'`. Anything else can only reach this function via a corrupted
 * Save, so it resolves to a neutral placeholder rather than echoing the
 * raw id.
 */
export function resolveMainQuestSpeakerName(
  speakerId: string,
  monster: UniqueMonsterProfile,
  roster: readonly Adventurer[],
): string {
  if (speakerId === 'monster') return monster.name
  if (speakerId === 'player') return MAIN_QUEST_PLAYER_DISPLAY_NAME
  const member = roster.find((m) => m.id === speakerId)
  return member?.name ?? '???'
}

export const MAIN_QUEST_NARRATIVE_PROMPT_VERSION = 'v2'

/**
 * Player Main Story Facts (item 29) — always injected verbatim, never
 * paraphrased away, so the AI cannot drift into writing the tavern owner
 * as a combatant. Independent of `../narrative/prompt.ts`'s System Prompt
 * (Phase 9.8 uses its own, separate Prompt — item 49 freezes the existing
 * one untouched).
 */
const PLAYER_STORY_FACTS = [
  '主人公はかつて勇者と呼ばれていた。',
  '主人公はNosferatuによって、戦闘行為を禁止する呪いを受けた。',
  '主人公は直接戦えない。現在は酒場を営んでいる。',
].join('\n')

const SYSTEM_PROMPT = `あなたは日本語のゲームシナリオライターです。
これはMain Quest(七国の脅威、あるいは最終脅威Nosferatuとの戦い)の一場面を執筆します。

【絶対原則】
- Simulationが真実を決定し、あなたはそれを物語として描写するだけです。
- 存在しない攻撃、回避、負傷、死亡、形態変化、必殺技、Damage、救援を捏造してはいけません。
- 与えられたBattle Outcome / Battle Traceの事実と矛盾する描写をしてはいけません。
- 敗北という事実がある場合、「あと一歩で倒した」のような勝利をにおわせる描写も禁止です。

【主人公について(最重要)】
${PLAYER_STORY_FACTS}
- 主人公が剣や魔法で敵を攻撃した、Bossにダメージを与えた、Bossを倒した、戦闘Skillでパーティを強化した、といった描写は禁止です。
- 主人公は会話する、敵を観察する、危険を叫ぶ、パーティへ声をかける、逃げ道を探す、戦闘後に負傷者を支える、といった行動のみ可能です。これらに機械的なボーナス効果はありません。

【このMonsterについて(最重要)】
これは汎用的なBoss戦ではありません。対峙する敵は、明確な世界観・人格・動機を持つ特定のUnique Monsterです。
その人格・動機・話し方が、この場面を実質的に形作らなければなりません。「怪物は怒り狂った」のような没個性的な描写だけで済ませてはいけません。

【同行するPartyについて】
このPartyは「依頼だから仕方なく」同行しているのではなく、主人公との間に十分な信頼関係が積み重なっているからこそ、この直接依頼を引き受けています。
与えられるPartyの関係性・記憶・関係の節目・傾向データは、実際にこれまで積み重なってきた事実です。関連性があれば、戦闘前後の会話や描写へ自然に反映してください。
ただし、そこにない過去の冒険・出来事・約束を新たに作り出してはいけません。特に、信頼関係の度合いを表す数値をそのまま台詞や地の文に出してはいけません(「信頼度63」のような表現は禁止)。数値は「長年培われた信頼関係がある」という意味としてのみ扱ってください。

【出力形式(厳守)】
以下のマーカーを、この順序で、指定どおりの書式で出力してください。マーカー行以外に説明文などを含めないでください。

===PRE-BATTLE===
(戦闘前の物語。目的地への到着、土地の雰囲気、主人公とPartyの会話、主人公が同行している理由、Unique Monsterとの遭遇、その人格や価値観が伝わる対話、戦闘へ至る流れを、十分な長さで描写してください。目安1000〜2500字程度ですが、固定文字数で打ち切る必要はありません。台詞は「」で囲んでください。)

===BATTLE:<anchorId> speaker=<speakerId>===
(そのanchorでの短い一言。話者の人格が伝わる一言にしてください。)

===POST-BATTLE===
(戦闘後の物語。Battle Outcomeの事実(勝利/敗北、死傷者)と矛盾しない範囲で、十分な長さで描写してください。台詞は「」で囲んでください。)

BATTLEマーカーは、後述する「実際に発生したanchor一覧」に含まれるanchorIdについてのみ、必要な分だけ出力してください。含まれないanchorIdについては絶対に出力しないでください。speakerには "monster" か、後述する登場人物一覧のいずれかのIDを指定してください。`

export interface MainQuestNarrativePromptContext {
  definition: MainQuestThreatDefinition
  attempt: MainQuestAttemptRecord
  campaignParty: CampaignParty
  isNosferatu: boolean
  /** Every OTHER resolved Main Quest Attempt this same Party has already
   * been on (item 52's "Previous Main Quest participation") — optional
   * since not every call site tracks sibling Attempts; omitted rather than
   * guessed when unavailable. */
  previousAttempts?: MainQuestAttemptRecord[]
}

function formatCharacterLine(member: Adventurer): string {
  const profile = member.narrativeProfile
  const parts = [
    `- id=${member.id} 名前=${member.name} 役割=${member.role} 階級=${member.rank}`,
  ]
  if (profile) {
    const traits = [
      profile.temperament,
      profile.socialStyle,
      profile.speechStyle,
    ]
      .filter((v): v is string => Boolean(v))
      .join(' / ')
    if (traits) parts.push(`  気質・話し方: ${traits}`)
    if (profile.values && profile.values.length > 0) {
      parts.push(`  価値観: ${profile.values.join(' / ')}`)
    }
  }
  return parts.join('\n')
}

const NOSFERATU_CONTEXT = [
  'Nosferatuは主人公に呪いをかけた本人であり、それを知っている。',
  'Nosferatuは主人公がかつて勇者と呼ばれていたことを知っている。',
  'Nosferatuは主人公が酒場を営んできたことをある程度観察してきた。',
  'Nosferatuは主人公が戦えないことを知った上で、興味を持って接する。',
  'Nosferatuは「英雄」という概念そのものを嫌悪しており、人間が危機のたびに一人の強者へ責任を押し付ける在り方を憎悪している。',
  'Nosferatuは主人公を憎悪の対象としてではなく、戦えなくなった元勇者に何が残るかを見る、興味深い実験対象として見ている。',
].join('\n')

export function buildMainQuestNarrativePrompt(
  context: MainQuestNarrativePromptContext,
): { system: string; user: string } {
  const {
    definition,
    attempt,
    campaignParty,
    isNosferatu,
    previousAttempts = [],
  } = context
  const monster = definition.uniqueMonster
  const result = attempt.result!
  const trace = attempt.battleTrace!

  const sections: string[] = []

  // Reuses the SAME read-only Narrative Data projections a normal
  // Expedition Narrative prompt would (`../narrative/context.ts` and
  // friends) — never a new Character/Relationship system (item 51). The
  // Threat's own title/briefing stands in for an Expedition's "focus" /
  // "request" so relevance-scoring within those projections works exactly
  // as it does elsewhere; nothing here mutates Party state.
  const partySnapshot = buildNarrativePartySnapshot(campaignParty)
  const sceneCharacterIds = campaignParty.party.members.map((m) => m.id)
  const narrativeRequest: NarrativeRequestInfo = {
    id: attempt.id,
    title: definition.title,
    briefing: definition.scenarioRules.briefing,
    rank: definition.requiredPartyRank,
    objectiveType: 'elimination',
    environment: definition.scenarioRules.environment,
    publicTags: [],
  }
  const focus = `${definition.name} ${definition.scenarioRules.briefing}`
  const memoryContext = projectMemoriesForNarrative(
    campaignParty,
    focus,
    narrativeRequest,
    sceneCharacterIds,
    attempt.dayNumber,
  )
  const arcSignals = projectArcSignalsForNarrative(
    campaignParty,
    focus,
    narrativeRequest,
    sceneCharacterIds,
    attempt.dayNumber,
  )
  const milestones = projectRelationshipMilestonesForNarrative(
    campaignParty,
    focus,
    narrativeRequest,
    sceneCharacterIds,
    attempt.dayNumber,
  )

  sections.push(`=== THREAT ===
名称: ${definition.name}
呼称: ${definition.title}
状況: ${definition.scenarioRules.briefing}
舞台: ${definition.scenarioRules.environment}`)

  sections.push(`=== UNIQUE MONSTER PROFILE (${monster.name}) ===
性格: ${monster.personalityTraits.join(' / ')}
価値観: ${monster.values.join(' / ')}
動機: ${monster.motivation}
敵対する理由: ${monster.conflictReason}
人間への態度: ${monster.attitudeTowardHumans}
主人公への態度: ${monster.attitudeTowardPlayer ?? '(特筆事項なし)'}
話し方: ${monster.communicationStyle}
戦闘での在り方: ${monster.combatIdentity.join(' / ')}
必ず示すべきこと: ${monster.narrativeMustShow.join(' / ')}
捏造禁止事項: ${monster.narrativeMustNotInvent.join(' / ')}`)

  if (isNosferatu) {
    sections.push(
      `=== NOSFERATU: 主人公との関係(必須反映) ===\n${NOSFERATU_CONTEXT}`,
    )
  }

  sections.push(
    `=== PARTY (${campaignParty.party.name}) ===\n${campaignParty.party.members
      .map(formatCharacterLine)
      .join('\n')}`,
  )

  sections.push(`=== PARTY と主人公の関係 ===
このPartyが主人公との信頼関係にもとづきこの依頼を引き受けたという事実(数値そのものは台詞に出さないこと):
現在の信頼関係の水準: ${partySnapshot.affinity}
求められた最低水準: ${definition.requiredAffinity}`)

  if ((partySnapshot.characterRelationships ?? []).length > 0) {
    sections.push(
      `=== PARTY内の関係性(参考、無理に触れなくてよい) ===\n${(
        partySnapshot.characterRelationships ?? []
      )
        .map(
          (r) =>
            `- ${r.sourceName}→${r.targetName}: 信頼${r.trust} 敬意${r.respect} 緊張${r.tension}${r.tags && r.tags.length > 0 ? ` (${r.tags.join(', ')})` : ''}`,
        )
        .join('\n')}`,
    )
  }

  const memorySummaries = Object.entries(memoryContext.characterMemories)
    .flatMap(([memberId, memories]) => {
      const name =
        campaignParty.party.members.find((m) => m.id === memberId)?.name ??
        memberId
      return memories.map((m) => `- ${name}: ${m.summary}`)
    })
    .concat(
      Object.values(memoryContext.relationshipMemories).flatMap((memories) =>
        memories.map((m) => `- ${m.summary}`),
      ),
    )
  if (memorySummaries.length > 0) {
    sections.push(
      `=== 関連する過去の記憶(事実、活かせるなら反映してよい) ===\n${memorySummaries.join('\n')}`,
    )
  }

  if (arcSignals.length > 0) {
    sections.push(
      `=== 現在の関係の傾向(参考) ===\n${arcSignals.map((s) => `- ${s.summary}`).join('\n')}`,
    )
  }

  if (milestones.length > 0) {
    sections.push(
      `=== 関係の節目(事実) ===\n${milestones.map((m) => `- ${m.summary}`).join('\n')}`,
    )
  }

  if (previousAttempts.length > 0) {
    const priorSummaries = previousAttempts.map((a) => {
      const priorDefinition = a.threatId === definition.id ? definition : null
      const label = priorDefinition ? priorDefinition.name : a.threatId
      const outcome = a.result
        ? a.result.monsterDefeated
          ? '勝利'
          : '敗北/撤退'
        : '結果未確定'
      return `- DAY ${a.dayNumber}: ${label} (${outcome})`
    })
    sections.push(
      `=== このPartyの過去の主依頼参加歴(事実) ===\n${priorSummaries.join('\n')}`,
    )
  }

  sections.push(`=== SIMULATION OUTCOME (絶対に矛盾させないこと) ===
結果: ${result.monsterDefeated ? '勝利(Monster討伐)' : '敗北/撤退(Monsterは生存)'}
Battle Outcome: ${result.battleOutcome}
生存: ${result.survivingMemberIds.join(', ') || 'なし'}
戦闘不能: ${result.incapacitatedMemberIds.join(', ') || 'なし'}
死亡: ${result.deadMemberIds.join(', ') || 'なし'}`)

  sections.push(
    `=== 実際に発生したanchor一覧(この中のanchorIdのみBATTLEマーカーで使用可) ===\n${trace.occurredAnchors.join(', ') || '(なし)'}`,
  )

  const user = sections.join('\n\n')
  return { system: SYSTEM_PROMPT, user }
}

interface ParsedMainQuestNarrative {
  preBattle: string
  battleInterludes: MainQuestBattleDialogueCue[]
  postBattle: string
}

const SECTION_MARKER =
  /^===(PRE-BATTLE|POST-BATTLE|BATTLE:([a-z_0-9]+)\s+speaker=(\S+))===\s*$/

/**
 * Parses the plain-text, marker-delimited response into a structured
 * `MainQuestNarrativeScript`'s constituent parts — the existing
 * `NarrativeProvider` only does plain text in/out (no JSON-schema-
 * constrained generation exists anywhere in this codebase), so Structured
 * Output (item 52) is achieved by parsing a fixed marker format rather
 * than by extending the provider layer. Defensively enforces the Battle
 * Anchor allow-list itself (item 58/59) — an interlude for an anchor that
 * did not occur, or from a speaker outside the given roster, is dropped
 * rather than trusted, regardless of what the AI produced. Throws if the
 * mandatory PRE-BATTLE/POST-BATTLE sections are missing (treated as a
 * generation failure by `generateMainQuestNarrative`, same as an empty
 * response — never a reason to resimulate, item 69).
 */
export function parseMainQuestNarrativeScript(
  text: string,
  occurredAnchors: readonly MainQuestBattleAnchorId[],
  validSpeakerIds: readonly string[],
): ParsedMainQuestNarrative {
  const occurredSet = new Set<string>(occurredAnchors)
  const speakerSet = new Set<string>(['monster', ...validSpeakerIds])

  const lines = text.split('\n')
  let currentSection: 'preBattle' | 'postBattle' | null = null
  let currentCueAnchor: string | null = null
  let currentCueSpeaker: string | null = null
  let currentCueLines: string[] = []
  const preBattleLines: string[] = []
  const postBattleLines: string[] = []
  const battleInterludes: MainQuestBattleDialogueCue[] = []

  function flushCue(): void {
    if (currentCueAnchor === null || currentCueSpeaker === null) return
    const cueText = currentCueLines.join('\n').trim()
    if (
      cueText.length > 0 &&
      occurredSet.has(currentCueAnchor) &&
      speakerSet.has(currentCueSpeaker)
    ) {
      battleInterludes.push({
        anchorId: currentCueAnchor as MainQuestBattleAnchorId,
        speakerId: currentCueSpeaker,
        text: cueText,
      })
    }
    currentCueAnchor = null
    currentCueSpeaker = null
    currentCueLines = []
  }

  for (const rawLine of lines) {
    const match = SECTION_MARKER.exec(rawLine.trim())
    if (match) {
      flushCue()
      if (match[1] === 'PRE-BATTLE') {
        currentSection = 'preBattle'
      } else if (match[1] === 'POST-BATTLE') {
        currentSection = 'postBattle'
      } else {
        currentSection = null
        currentCueAnchor = match[2]
        currentCueSpeaker = match[3]
      }
      continue
    }

    if (currentSection === 'preBattle') {
      preBattleLines.push(rawLine)
    } else if (currentSection === 'postBattle') {
      postBattleLines.push(rawLine)
    } else if (currentCueAnchor !== null) {
      currentCueLines.push(rawLine)
    }
  }
  flushCue()

  const preBattle = preBattleLines.join('\n').trim()
  const postBattle = postBattleLines.join('\n').trim()

  if (preBattle.length === 0 || postBattle.length === 0) {
    throw new Error('AI response is missing PRE-BATTLE or POST-BATTLE content')
  }

  return { preBattle, battleInterludes, postBattle }
}

export interface GenerateMainQuestNarrativeResult {
  script: MainQuestNarrativeScript
}

/**
 * Forced-generation entry point for a resolved Main Quest Attempt (item
 * 67/104: only ever called AFTER Simulation/Battle Trace/Campaign save —
 * never before, never triggers a resimulation on failure). Mirrors
 * `generateNarrative` (`../narrative/generation.ts`) in shape/guard style,
 * but is entirely separate infrastructure — Main Quest Narrative is never
 * mixed into `campaign.narrativeCandidates`/`narrativeGenerations`.
 */
export async function generateMainQuestNarrative(
  definition: MainQuestThreatDefinition,
  attempt: MainQuestAttemptRecord,
  campaignParty: CampaignParty,
  provider: NarrativeProvider,
  previousAttempts: MainQuestAttemptRecord[] = [],
): Promise<GenerateMainQuestNarrativeResult> {
  if (!attempt.result || !attempt.battleTrace) {
    throw new Error(
      'Main Quest Narrative can only be generated after Simulation has resolved this Attempt',
    )
  }

  const isNosferatu = definition.id === 'nosferatu'
  const prompt = buildMainQuestNarrativePrompt({
    definition,
    attempt,
    campaignParty,
    isNosferatu,
    previousAttempts,
  })

  const response = await provider.generate({
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    candidateId: attempt.id,
    promptVersion: MAIN_QUEST_NARRATIVE_PROMPT_VERSION,
  })

  if (!response.text || response.text.trim().length === 0) {
    throw new Error('AI returned empty response')
  }
  if (response.text.length > 20000) {
    throw new Error('AI response is too large')
  }

  const validSpeakerIds = campaignParty.party.members.map((m) => m.id)
  const parsed = parseMainQuestNarrativeScript(
    response.text,
    attempt.battleTrace.occurredAnchors,
    validSpeakerIds,
  )

  const script: MainQuestNarrativeScript = {
    preBattle: parsed.preBattle,
    battleInterludes: parsed.battleInterludes,
    postBattle: parsed.postBattle,
    promptVersion: MAIN_QUEST_NARRATIVE_PROMPT_VERSION,
    providerId: provider.id,
    model: response.model,
    createdAt: new Date().toISOString(),
  }

  return { script }
}
