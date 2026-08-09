import type {
  CharacterEventNarrativeContext,
  ExpeditionNarrativeContext,
  NarrativeContext,
  NarrativeHistoryHighlight,
} from './types.ts'

export const NARRATIVE_PROMPT_VERSION = 'v1'

export interface NarrativePrompt {
  system: string
  user: string
}

const SYSTEM_PROMPT = `あなたはファンタジー世界の酒場を舞台とするゲームのナレーターです。

提供されたFACTSはゲームエンジンが確定した事実です。FACTSと矛盾する内容を書いてはいけません。
結果、人物名、Party名、Rank、負傷、死亡、依頼内容、成功・失敗、関係値などを変更してはいけません。
FACTSに存在しない新しい事件、NPC、依頼、報酬、アイテム、過去、約束、恒久的な人間関係を事実として追加してはいけません。

ただし、物語表現としての一時的な表情、仕草、口調、空気、短い会話などは創作して構いません。それらは新たなゲーム上の事実を作らない範囲にしてください。

ゲームシステムの数値をそのまま読み上げるのではなく、自然な日本語の物語として描写してください。`

function partyLines(party: NarrativeContext['party']): string {
  const lines = [
    `Party: ${party.name} (Rank ${party.rank})`,
    `Leader: ${party.leaderName}`,
    `Affinity: ${party.affinity}`,
    `Financial Pressure: ${party.financialPressure}`,
    `Risk Tolerance: ${party.riskTolerance}`,
    `Growth Milestones: ${party.growthMilestones}`,
    `Training Days: ${party.trainingDays}`,
    `Strong Objective: ${party.missionSpecialization.strongObjective}`,
    `Weak Objective: ${party.missionSpecialization.weakObjective}`,
  ]
  lines.push('Members:')
  for (const m of party.members) {
    const status = m.dead
      ? ' [dead]'
      : m.incapacitated
        ? ' [incapacitated]'
        : ''
    lines.push(`  - ${m.name} (${m.rank} ${m.role})${status}`)
  }
  return lines.join('\n')
}

export function buildExpeditionPrompt(
  context: ExpeditionNarrativeContext,
): string {
  const report = context.report
  const lines: string[] = [
    '【遠征レポート】',
    `依頼: ${context.request.title}`,
    `Party: ${context.party.name}`,
    `Rank Gap: ${context.acceptance?.rankGap ?? 0}`,
    `Acceptance Reason: ${context.acceptance?.reason ?? 'appropriate'}`,
    `Outcome: ${report.outcome}`,
    `Objective Completed: ${report.objectiveCompleted ? 'Yes' : 'No'}`,
    `Objective Progress: ${report.objectiveProgress}%`,
  ]

  if (report.battleOutcome) {
    lines.push(`Battle Outcome: ${report.battleOutcome}`)
  }

  lines.push('Member Final States:')
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

  lines.push('Key Facts:')
  for (const fact of report.keyFacts) {
    lines.push(`  - ${fact}`)
  }

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
    partyLines(context.party),
    'Recent Highlights:',
    recentHighlightsText(context.recentHighlights),
    'Event Facts:',
  ]
  for (const [key, value] of Object.entries(context.eventFacts)) {
    lines.push(`  - ${key}: ${JSON.stringify(value)}`)
  }

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
