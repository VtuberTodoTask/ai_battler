import type {
  CharacterEventNarrativeContext,
  CharacterNarrativeEventType,
  ExpeditionNarrativeContext,
  NarrativeContext,
  NarrativeHistoryHighlight,
  NarrativeMemberSnapshot,
} from './types.ts'

export const NARRATIVE_PROMPT_VERSION = 'v1'

export interface NarrativePrompt {
  system: string
  user: string
}

const SYSTEM_PROMPT = `あなたはファンタジー世界の酒場を舞台とするゲームのナレーターです。

提供されたFACTSはゲームエンジンが確定した事実です。FACTSと矛盾する内容を書いてはいけません。
結果、人物名、Party名、Rank、負傷、死亡、依頼内容、成功・失敗、関係値などを変更してはいけません。
FACTSに存在しない新しい事件、NPC、依頼、報酬、アイテム、過去、約束、恒久的な人間関係、家族設定、故郷設定、借金額を事実として追加してはいけません。

再訪や戻ってくる日付を確約させないでください。「必ず戻る」「来月戻る」などは避け、「近くへ来たら寄る」「機会があれば」程度にとどめてください。
目的地を新しく創作しないでください。生存者を死亡させたり、死者を生き返らせたりしないでください。新しい怪我や病気、恋愛関係を捏造しないでください。

Personality値（勇敢さ、慎重さ、協調性、規律、利他、貪欲）は話し方や反応の参考にしてよいです。ただし、それを根拠に人物の過去、家族、借金、職歴等の新しい設定を作らないでください。

ただし、物語表現としての一時的な表情、仕草、口調、空気、短い会話などは創作して構いません。それらは新たなゲーム上の事実を作らない範囲にしてください。

ゲームシステムの数値をそのまま読み上げるのではなく、自然な日本語の物語として描写してください。`

function personalityLine(
  personality: NarrativeMemberSnapshot['personality'],
): string {
  return `bravery ${personality.bravery}, caution ${personality.caution}, cooperation ${personality.cooperation}, discipline ${personality.discipline}, altruism ${personality.altruism}, greed ${personality.greed}`
}

function memberLines(
  members: NarrativeMemberSnapshot[],
  includePersonality: boolean,
): string {
  const lines: string[] = ['Members:']
  for (const m of members) {
    const status = m.dead
      ? ' [dead]'
      : m.incapacitated
        ? ' [incapacitated]'
        : ''
    lines.push(`  - ${m.name} (${m.rank} ${m.role})${status}`)
    if (includePersonality) {
      lines.push(`      Personality: ${personalityLine(m.personality)}`)
    }
  }
  return lines.join('\n')
}

function partyLines(
  party: NarrativeContext['party'],
  includeAllPersonalities: boolean,
): string {
  const leader = party.members.find((m) => m.id === party.leaderId)
  const leaderPersonality = leader
    ? `Leader Personality: ${personalityLine(leader.personality)}`
    : ''
  const lines = [
    `Party: ${party.name} (Rank ${party.rank})`,
    `Leader: ${party.leaderName}`,
    leaderPersonality,
    `Affinity: ${party.affinity}`,
    `Financial Pressure: ${party.financialPressure}`,
    `Risk Tolerance: ${party.riskTolerance}`,
    `Growth Milestones: ${party.growthMilestones}`,
    `Training Days: ${party.trainingDays}`,
    `Strong Objective: ${party.missionSpecialization.strongObjective}`,
    `Weak Objective: ${party.missionSpecialization.weakObjective}`,
  ]
  lines.push(memberLines(party.members, includeAllPersonalities))
  return lines.filter(Boolean).join('\n')
}

export function characterEventInstruction(
  eventType: CharacterNarrativeEventType,
): string {
  const common = `WRITING INSTRUCTIONS:
- 300～700字程度の日本語
- 酒場を舞台とする短い会話シーン
- Primary Eventを中心に描写する
- secondaryTriggersは自然なら触れてよいが、全部入れる必要はない
- 店主の名前・性別・年齢を捏造しない`

  const instructions: Record<CharacterNarrativeEventType, string> = {
    partyArrival: `partyArrival:
- Partyの第一印象とLeaderの挨拶を描く
- Party名、Rank、得意・苦手を自然に反映してよい
- 過去の冒険や来訪理由を新しく作らない`,
    riskyRequestAccepted: `riskyRequestAccepted:
- 格上依頼を引き受ける直前の場面
- acceptanceReasonを受諾理由として尊重する
- specialtyMatchなら得意分野への自信を表現してよい
- trustedBrokerなら店主への信頼を表現してよい
- needsIncomeなら金銭的必要性を表現してよい
- 実際に存在しない事情を追加しない`,
    weakObjectiveSuccess: `weakObjectiveSuccess:
- 苦手分野の依頼を今回は成功させたことを描く
- 「苦手を完全克服した」と確定しない`,
    recoveryFinished: `recoveryFinished:
- 療養を終え、再び活動可能になった場面
- 病名・治療法・医師等を捏造しない`,
    stayExtended: `stayExtended:
- 本来の予定より滞在を延長すると店主へ伝える場面
- 永住・永久滞在にはしない`,
    becameRegular: `becameRegular:
- 酒場に馴染み、常連になったと感じられる場面
- 「いつもの席」程度の一般的描写は可
- 未定義の具体的料理・注文履歴を事実として作らない`,
    becameFavorite: `becameFavorite:
- 店主への強い信頼・贔屓を表現する
- 親友・家族・恋愛関係等へ勝手に昇格させない`,
    farewell: `farewell:
- 高Affinity Partyとの別れを中心にする
- stayDays / actual expedition history / growth / recentHighlightsを利用する
- 実際に紹介した依頼を振り返ってよい
- 再訪予定は存在しない
- 「必ず戻る」「来月戻る」等を確約させない
- 「また近くへ来たら寄る」「機会があれば」程度は可
- 新しい目的地を確定しない`,
    casualtyDeparture: `casualtyDeparture:
- deadMemberNames / survivorNamesを厳密に守る
- 死者を生存させない
- 生存者を死亡させない
- 葬葬儀、遺族、仇討ち等の新規事実を作らない
- 過度な追加ドラマを避ける`,
  }
  return `${common}\n${instructions[eventType]}`
}

const EXPEDITION_WRITING_INSTRUCTIONS = `WRITING INSTRUCTIONS:
- 400～800字程度の日本語
- Partyが酒場へ帰還し、店主へ結果を報告する短編
- 重要な出来事を自然な文章にする
- Party Memberの短い会話を含めてよい
- HP/MP/Morale等の数値をそのまま読み上げない
- Outcomeを変更しない`

export function buildExpeditionPrompt(
  context: ExpeditionNarrativeContext,
): string {
  const report = context.report
  const request = context.request
  const lines: string[] = [
    '【遠征レポート】',
    `依頼タイトル: ${request.title}`,
    `依頼ランク: ${request.rank}`,
    `目的: ${request.objectiveType}`,
    `環境: ${request.environment}`,
    `Public Tags: ${request.publicTags.join(', ')}`,
    `依頼内容: ${request.briefing}`,
    '',
    `Party: ${context.party.name} (Rank ${context.party.rank})`,
    `Leader: ${context.party.leaderName}`,
    `Affinity: ${context.party.affinity}`,
    `Financial Pressure: ${context.party.financialPressure}`,
    `Risk Tolerance: ${context.party.riskTolerance}`,
    `Specialization Match: ${context.acceptance?.specializationMatch ?? 'neutral'}`,
    `Strong Objective: ${context.party.missionSpecialization.strongObjective}`,
    `Weak Objective: ${context.party.missionSpecialization.weakObjective}`,
  ]

  const leader = context.party.members.find(
    (m) => m.id === context.party.leaderId,
  )
  if (leader) {
    lines.push(`Leader Personality: ${personalityLine(leader.personality)}`)
  }

  lines.push(memberLines(context.party.members, true))

  lines.push(
    '',
    `Acceptance Reason: ${context.acceptance?.reason ?? 'appropriate'}`,
    `Rank Gap: ${context.acceptance?.rankGap ?? 0}`,
    `Outcome: ${report.outcome}`,
    `Objective Completed: ${report.objectiveCompleted ? 'Yes' : 'No'}`,
    `Objective Progress: ${report.objectiveProgress}%`,
  )

  if (report.battleOutcome) {
    lines.push(`Battle Outcome: ${report.battleOutcome}`)
  }

  lines.push('', 'Member Final States:')
  for (const m of report.party) {
    const status = m.dead
      ? ' [dead]'
      : m.incapacitated
        ? ' [incapacitated]'
        : ''
    lines.push(
      `  - ${m.name} (${m.role} ${m.rank}) — HP ${m.finalHp}/${m.maxHp}, MP ${m.finalMp}/${m.maxMp}, Morale ${m.finalMorale}${status}`,
    )
  }

  if (report.casualties.length > 0) {
    lines.push(`Casualties: ${report.casualties.join(', ')}`)
  }
  if (report.incapacitated.length > 0) {
    lines.push(`Incapacitated: ${report.incapacitated.join(', ')}`)
  }

  lines.push('', 'Key Facts:')
  for (const fact of report.keyFacts) {
    lines.push(`  - ${fact}`)
  }

  lines.push('', EXPEDITION_WRITING_INSTRUCTIONS)
  return lines.join('\n')
}

function recentHighlightsText(highlights: NarrativeHistoryHighlight[]): string {
  if (highlights.length === 0) return 'なし'
  return highlights
    .map(
      (h) =>
        `Day ${h.dayNumber}: ${h.requestTitle} (${h.objectiveType}, ${h.outcome})`,
    )
    .join('\n')
}

export function buildCharacterEventPrompt(
  context: CharacterEventNarrativeContext,
): string {
  const lines: string[] = [
    '【キャラクターイベント】',
    `Event Type: ${context.eventType}`,
    partyLines(context.party, true),
    '',
    'Recent Highlights:',
    recentHighlightsText(context.recentHighlights),
    '',
    'Event Facts:',
  ]
  for (const [key, value] of Object.entries(context.eventFacts)) {
    lines.push(`  - ${key}: ${JSON.stringify(value)}`)
  }

  if (context.secondaryTriggers.length > 0) {
    lines.push(
      '',
      'Secondary Triggers:',
      ...context.secondaryTriggers.map((t) => `  - ${t}`),
    )
  }

  lines.push('', characterEventInstruction(context.eventType))
  return lines.join('\n')
}

export function buildNarrativePrompt(
  context: NarrativeContext,
): NarrativePrompt {
  const user =
    context.kind === 'expedition'
      ? buildExpeditionPrompt(context)
      : buildCharacterEventPrompt(context)
  return { system: SYSTEM_PROMPT, user }
}
