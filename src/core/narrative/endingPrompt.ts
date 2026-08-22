import type { CampaignParty } from '../tavern/campaign/types.ts'
import type { CampaignEndingFacts } from '../ending/types.ts'

export const ENDING_NARRATIVE_PROMPT_VERSION = 'v1'

const PLAYER_STORY_FACTS = [
  '主人公はかつて勇者と呼ばれていた。',
  '主人公はNosferatuによって、戦闘行為を禁止する呪いを受けていた。',
  '主人公は今回の最終決戦にも直接戦闘参加者としては加わっていない。',
  'Nosferatuは敗北し、主人公の呪いは解除された。',
].join('\n')

const SYSTEM_PROMPT = `あなたは日本語のゲームシナリオライターです。
これはMain Quest全体(七国の脅威、最終脅威Nosferatuとの戦い)を締めくくるEnding(エピローグ)を執筆します。

【絶対原則】
- Simulationが決定した事実だけが真実であり、あなたはそれを物語として描写するだけです。
- 与えられたFactと矛盾する描写をしてはいけません。存在しない死亡、負傷、生存、恋愛関係、結婚、引退を捏造してはいけません。
- 与えられた死傷者情報以外の犠牲を作り出してはいけません。

【主人公について(最重要)】
${PLAYER_STORY_FACTS}
- 主人公がNosferatuへ攻撃した、直接倒した、といった描写は禁止です。主人公は会話する、迎える、労う、見送る、といった非戦闘的な行動のみ可能です。

【禁止事項(絶対厳守)】
- 死亡した冒険者を生き返らせること
- 存在しない負傷/死亡を新たに作ること
- 存在しない恋愛関係・婚約・結婚を描写すること
- 誰かの引退を確定させること
- 国家の滅亡、王の交代、新たな戦争を描写すること
- 新しいラスボスやNosferatuの復活を示唆すること
- 呪いがまだ残っているかのような描写をすること
- Simulationに存在しない最終Battleの追加展開を描写すること
- 具体的な未来の出来事を確定させること。「この先も酒場の日々は続いていくかもしれない」程度の余韻は許されますが、それ以上の未来を断定してはいけません。

【出力形式(厳守)】
以下のマーカーを、この順序で、指定どおりの書式で出力してください。マーカー行以外に説明文などを含めないでください。各マーカーはちょうど一度だけ出力してください。

===AFTERMATH===
(Nosferatu撃破直後の物語。戦いの終わり、呪いが解けた主人公、戦ったPartyの様子、生存/負傷/死亡の結果を、事実と矛盾しない範囲で描写してください。台詞は「」で囲んでください。)

===TAVERN_RETURN===
(酒場へ戻った後の物語。主人公、Party、酒場、これまでの旅を振り返る場面を描写してください。台詞は「」で囲んでください。)

===CLOSING===
(物語全体を締めくくる短い場面。具体的な未来の出来事を新たに確定させないでください。)`

function formatMemberLine(
  campaignParty: CampaignParty,
  memberId: string,
): string {
  const member = campaignParty.party.members.find((m) => m.id === memberId)
  if (!member) return `- id=${memberId}`
  return `- id=${member.id} 名前=${member.name} 役割=${member.role} 階級=${member.rank}`
}

export interface EndingNarrativePromptContext {
  facts: CampaignEndingFacts
  finalCampaignParty: CampaignParty
}

/**
 * Builds the Ending Narrative Prompt from `CampaignEndingFacts` alone (plus
 * the final Party's roster, needed only to format member name/role/rank
 * lines) — never the raw `TavernCampaignState` (Phase 9.9 items 9/15).
 */
export function buildEndingNarrativePrompt(
  context: EndingNarrativePromptContext,
): { system: string; user: string } {
  const { facts, finalCampaignParty } = context
  const sections: string[] = []

  sections.push(`=== VICTORY FACTS (絶対に矛盾させないこと) ===
Nosferatuは敗北した。
主人公の呪いは解除された。
クリア日: DAY ${facts.clearDay}
経過日数: ${facts.journey.daysElapsed}日`)

  sections.push(`=== 最後に戦ったParty (${facts.finalParty.partyName}) ===
${facts.finalParty.memberIds.map((id) => formatMemberLine(finalCampaignParty, id)).join('\n')}
このPartyと主人公の信頼関係の水準: ${facts.finalParty.affinity}(数値そのものは台詞に出さないこと)`)

  sections.push(`=== 最終決戦の結果 (絶対に矛盾させないこと) ===
生存: ${facts.finalBattle.survivingMemberIds.join(', ') || 'なし'}
戦闘不能(要療養): ${facts.finalBattle.incapacitatedMemberIds.join(', ') || 'なし'}
死亡: ${facts.finalBattle.deadMemberIds.join(', ') || 'なし'}`)

  sections.push(
    `=== 七国の脅威 撃破履歴(事実) ===\n${facts.threats
      .map((t) => `- ${t.threatId}: DAY ${t.defeatedDay}`)
      .join('\n')}`,
  )

  sections.push(`=== 酒場の歩み(事実) ===
酒場ランク: ${facts.tavern.rank}
評判: ${facts.tavern.reputationScore}(最高到達: ${facts.tavern.peakReputationScore})
資金: ${facts.tavern.funds}
解決した依頼数: ${facts.journey.resolvedRequestCount}(うち成功: ${facts.journey.successfulRequestCount})
完了した継続依頼数: ${facts.journey.completedQuestChainCount}
沈静化させた地域情勢数: ${facts.journey.containedWorldEventCount}`)

  const user = sections.join('\n\n')
  return { system: SYSTEM_PROMPT, user }
}

interface ParsedEndingNarrative {
  aftermath: string
  tavernReturn: string
  closing: string
}

type EndingSectionKey = 'AFTERMATH' | 'TAVERN_RETURN' | 'CLOSING'
const ENDING_SECTION_KEYS: readonly EndingSectionKey[] = [
  'AFTERMATH',
  'TAVERN_RETURN',
  'CLOSING',
]
const ENDING_SECTION_MARKER = /^===(AFTERMATH|TAVERN_RETURN|CLOSING)===\s*$/

/**
 * Parses the plain-text, marker-delimited response into the Ending
 * Narrative's three sections — mirrors
 * `mainQuest/narrative.ts`'s `parseMainQuestNarrativeScript` (marker-based
 * plain text, no JSON-schema-constrained generation exists in this
 * codebase). Unlike the Main Quest parser, a duplicated marker is itself a
 * failure here (Phase 9.9 item 14), not merely appended text.
 */
export function parseEndingNarrativeScript(
  text: string,
): ParsedEndingNarrative {
  const lines = text.split('\n')
  const seen = new Set<EndingSectionKey>()
  const sectionLines: Record<EndingSectionKey, string[]> = {
    AFTERMATH: [],
    TAVERN_RETURN: [],
    CLOSING: [],
  }
  let current: EndingSectionKey | null = null

  for (const rawLine of lines) {
    const match = ENDING_SECTION_MARKER.exec(rawLine.trim())
    if (match) {
      const key = match[1] as EndingSectionKey
      if (seen.has(key)) {
        throw new Error(`AI response contains a duplicate ${key} marker`)
      }
      seen.add(key)
      current = key
      continue
    }
    if (current) {
      sectionLines[current].push(rawLine)
    }
  }

  for (const key of ENDING_SECTION_KEYS) {
    if (!seen.has(key)) {
      throw new Error(`AI response is missing the ${key} marker`)
    }
  }

  const aftermath = sectionLines.AFTERMATH.join('\n').trim()
  const tavernReturn = sectionLines.TAVERN_RETURN.join('\n').trim()
  const closing = sectionLines.CLOSING.join('\n').trim()

  if (
    aftermath.length === 0 ||
    tavernReturn.length === 0 ||
    closing.length === 0
  ) {
    throw new Error('AI response contains an empty Ending section')
  }

  return { aftermath, tavernReturn, closing }
}
