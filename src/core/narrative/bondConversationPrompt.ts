import type { AdventurerRank } from '../models/types.ts'
import type { EnvironmentType, ObjectiveType } from '../expedition/types.ts'
import type { CampaignParty } from '../tavern/campaign/types.ts'
import { buildNarrativePartySnapshot } from './context.ts'
import { projectMemoriesForNarrative } from './memory.ts'
import { projectArcSignalsForNarrative } from './arcSignals.ts'
import { projectRelationshipMilestonesForNarrative } from './milestones.ts'
import type { NarrativeRequestInfo } from './types.ts'
import {
  BOND_CONVERSATION_MILESTONE_LABELS,
  type BondConversationMilestone,
} from './bondConversation.ts'

export const BOND_CONVERSATION_PROMPT_VERSION = 'v1'

/** Canonical Player-facing label — mirrors `mainQuest/narrative.ts`'s
 * `MAIN_QUEST_PLAYER_DISPLAY_NAME`; the tavern owner has no other stable
 * display name anywhere in this codebase, and Bond Conversation must never
 * invent one. */
export const BOND_CONVERSATION_PLAYER_DISPLAY_NAME = '店主'

/** A synthetic environment/objective/rank used only to drive the existing
 * relevance-scoring inside `projectMemoriesForNarrative` and friends — Bond
 * Conversation has no real expedition Request behind it, so these values
 * are never shown to the AI or the player. */
const SYNTHETIC_OBJECTIVE_TYPE: ObjectiveType = 'investigation'
const SYNTHETIC_ENVIRONMENT: EnvironmentType = 'forest'

const MILESTONE_THEME: Record<BondConversationMilestone, string> = {
  familiar: `- まだ浅い関係。店主はこのPartyにとって「よく来る酒場の店主」以上ではない
- 名前や顔を覚えた、軽口を交わすようになった、といったごく軽い変化にとどめる
- 深い信頼、個人的な悩み、過去の重い記憶を打ち明ける場面にはしない
- 「気心が知れた」「長年の付き合いのような」といった誇張をしない`,
  trusted: `- familiarより一段深いが、まだ「常連」や「贔屓」ほどの特別さはない
- ちょっとした本音や、依頼とは関係ない世間話・軽い相談程度は描いてよい
- 重大な秘密の告白、生い立ちの全てを語る、といった重い場面にはしない`,
  regular: `- このPartyにとって、この酒場・店主が「いつもの場所」「頼れる相手」になっている
- 気を抜いた態度、軽い軽口、遠慮のない頼み事などを描いてよい
- 家族同然、唯一無二の存在、といった誇張はしない`,
  favorite: `- このPartyにとって、店主・この酒場は特別に馴染み深い存在になっている
- 深い信頼や気安さを描いてよいが、これは「贔屓の店」に対する信頼関係の描写であり、恋愛関係ではない
- 誰か特定のPartyメンバーと店主の間に恋愛感情・告白・交際・結婚を発生させることは絶対禁止
- 「特別な感情」を匂わせる場合も、店への信頼・愛着として描き、恋愛的な文脈に読める描写は避ける`,
}

const SYSTEM_PROMPT = `あなたは日本語のゲームシナリオライターです。
これは酒場の常連Partyと店主の間で、Party側の来店Affinityがある節目を越えたことを記念する、短い「Bond Conversation(会話イベント)」を執筆します。
戦闘・遠征の物語ではありません。酒場での何気ない一場面です。

【絶対原則】
- Simulationが決定した事実(FACTS)だけが真実であり、あなたはそれを物語として描写するだけです。
- 与えられたFactと矛盾する描写をしてはいけません。存在しない死亡、負傷、恋愛関係、婚約、引退、新しい依頼、新しい目的地を捏造してはいけません。
- このConversationは「読み物」であり、ゲーム的な数値・効果を一切持ちません。読んだ/読まなかったことで何かの数値が変化したかのような描写(「絆が深まった」「信頼度が上がった」など)を書いてはいけません。

【店主＝プレイヤーについて(最重要)】
この酒場の店主はNPCではありません。店主は、このゲームを操作しているプレイヤー本人です。
店主の人格や意思をAIが代わりに決定してはいけません。
FACTSに明示されていない限り、店主について以下を創作してはいけません。
- 名前 / 性別 / 年齢 / 外見 / 性格 / 過去 / 感情 / 思考 / 口調 / 台詞 / 約束 / 判断
店主の名前がFACTSとして与えられていない場合、必ず「${BOND_CONVERSATION_PLAYER_DISPLAY_NAME}」とだけ表記してください。店主へ新しい固有名を与えてはいけません。
店主の台詞を新しく作ってはいけません。店主はプレイヤー本人であるため、AIがプレイヤーに代わって発言してはいけません。
店主について書いてよいのは、Party側の行為として「店主へ話しかけた」「店主に軽口を返した」などを記述する場合だけです。店主の内面(満足げに頷いた、嬉しそうにした等)を描写しないでください。
物語のカメラは主にPartyの FOCAL CHARACTER 側へ置いてください。

【世界観の捏造禁止】
与えられたFACTS・PARTY・CHARACTERS以外の新しい国、種族、歴史、地名、組織、神話、事件を作り出してはいけません。

【恋愛の自動発生禁止(最重要)】
このAffinityは「常連としての来店・信頼関係」であり、恋愛感情ではありません。
FACTSに明示されていない限り、FOCAL CHARACTERが店主に恋愛感情を抱いている、抱き始めている、と読める描写を一切してはいけません。
告白、交際、プロポーズ、嫉妬、独占欲、頬を赤らめる/ときめく等の恋愛的リアクションを新たに作ってはいけません。

【このMilestone(${BOND_CONVERSATION_MILESTONE_LABELS.familiar}/${BOND_CONVERSATION_MILESTONE_LABELS.trusted}/${BOND_CONVERSATION_MILESTONE_LABELS.regular}/${BOND_CONVERSATION_MILESTONE_LABELS.favorite})の深さについて】
MILESTONE THEMEで示す深さの範囲を超えて関係を進めないでください。一度のConversationで関係を過度に飛躍させてはいけません。

【出力形式(厳守)】
マーカーや見出しを一切使わず、短い一場面の物語本文だけを出力してください。
日本語で400〜900字程度。台詞は「」で囲んでください。
最終文章に enum 名、内部フィールド名、FACTS一覧の引用、注意書き、解説、括弧書きのメタコメントを出力しないでください。
段落の区切りには空行を使ってください。`

export interface BondConversationPromptContext {
  campaignParty: CampaignParty
  milestone: BondConversationMilestone
  focalCharacterId: string
  dayNumber: number
  /** Up to a few of this Party's previous Bond Conversations, oldest-to-
   * newest, for light continuity (item 35/36) — callers are responsible
   * for trimming to the most recent 2-3; this function does not re-trim. */
  previousBondConversations?: {
    milestone: BondConversationMilestone
    text: string
  }[]
}

function formatCharacterLine(
  campaignParty: CampaignParty,
  memberId: string,
): string {
  const member = campaignParty.party.members.find((m) => m.id === memberId)
  if (!member) return `- id=${memberId}`
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

/**
 * Builds the Bond Conversation prompt. Deliberately its own file rather
 * than a branch inside `./prompt.ts` (item 27) — Bond Conversation has a
 * narrower, stricter prohibition set (no romance escalation, no numeric-
 * effect implications) than the general Narrative prompt, and mixing the
 * two would risk either weakening the general prompt's flexibility or
 * loosening Bond Conversation's guardrails.
 *
 * Reuses the SAME read-only Narrative Data projections a normal Character
 * Event prompt would (memories/arc signals/relationship milestones) via a
 * synthetic `NarrativeRequestInfo`, exactly like
 * `mainQuest/narrative.ts`'s `buildMainQuestNarrativePrompt` — never a new
 * Character/Relationship system.
 */
export function buildBondConversationPrompt(
  context: BondConversationPromptContext,
): { system: string; user: string } {
  const {
    campaignParty,
    milestone,
    focalCharacterId,
    dayNumber,
    previousBondConversations = [],
  } = context

  const partySnapshot = buildNarrativePartySnapshot(campaignParty)
  const sceneCharacterIds = campaignParty.party.members.map((m) => m.id)
  const focus = `${BOND_CONVERSATION_MILESTONE_LABELS[milestone]}のBond Conversation`
  const narrativeRequest: NarrativeRequestInfo = {
    id: `bond-conversation:${campaignParty.id}:${milestone}`,
    title: focus,
    briefing: focus,
    rank: campaignParty.party.rank as AdventurerRank,
    objectiveType: SYNTHETIC_OBJECTIVE_TYPE,
    environment: SYNTHETIC_ENVIRONMENT,
    publicTags: [],
  }

  const memoryContext = projectMemoriesForNarrative(
    campaignParty,
    focus,
    narrativeRequest,
    sceneCharacterIds,
    dayNumber,
  )
  const arcSignals = projectArcSignalsForNarrative(
    campaignParty,
    focus,
    narrativeRequest,
    sceneCharacterIds,
    dayNumber,
  )
  const milestoneFacts = projectRelationshipMilestonesForNarrative(
    campaignParty,
    focus,
    narrativeRequest,
    sceneCharacterIds,
    dayNumber,
  )

  const sections: string[] = []

  sections.push(`=== FACTS (絶対に矛盾させないこと) ===
今回のMilestone: ${BOND_CONVERSATION_MILESTONE_LABELS[milestone]}
このPartyが、この酒場の${BOND_CONVERSATION_MILESTONE_LABELS[milestone]}になったという事実(数値そのものは台詞に出さないこと)
現在の来店Affinityの水準: ${partySnapshot.affinity}`)

  sections.push(`=== MILESTONE THEME (この深さを超えないこと) ===
${MILESTONE_THEME[milestone]}`)

  sections.push(
    `=== PARTY (${campaignParty.party.name}) ===\n${campaignParty.party.members
      .map((m) => formatCharacterLine(campaignParty, m.id))
      .join('\n')}`,
  )

  sections.push(
    `=== FOCAL CHARACTER (この場面の中心人物) ===\n${formatCharacterLine(campaignParty, focalCharacterId)}
この場面は主にこのCharacterを中心に描いてください。Party全員へ均等に台詞を割り振る必要はありません。`,
  )

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

  if (milestoneFacts.length > 0) {
    sections.push(
      `=== 関係の節目(事実) ===\n${milestoneFacts.map((m) => `- ${m.summary}`).join('\n')}`,
    )
  }

  if (previousBondConversations.length > 0) {
    sections.push(
      `=== これまでのBond Conversation(事実、軽く踏まえてよいが繰り返さない) ===\n${previousBondConversations
        .map(
          (p, i) =>
            `--- ${i + 1}回目 (${BOND_CONVERSATION_MILESTONE_LABELS[p.milestone]}) ---\n${p.text}`,
        )
        .join('\n\n')}`,
    )
  }

  const user = sections.join('\n\n')
  return { system: SYSTEM_PROMPT, user }
}
