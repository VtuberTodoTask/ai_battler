import type { Personality } from '../models/types.ts'
import type {
  DispatchObjectiveSummary,
  DispatchPartyResult,
  DispatchReport,
  PartyRiskTolerance,
} from '../tavern/types.ts'
import type { ExpeditionNarrativeContext } from './types.ts'

// Narrative facts must represent facts available to the party,
// not merely hidden engine state.

export interface NarrativeFactBundle {
  confirmedFacts: string[]
  unknownDetails: string[]
  presentationHints: string[]
}

const OBJECTIVE_LABELS: Record<DispatchObjectiveSummary['type'], string> = {
  investigation: '調査',
  elimination: '討伐',
  rescue: '救出',
  escort: '護衛',
  retrieval: '回収',
  survey: '測量',
}

const ENVIRONMENT_LABELS: Record<string, string> = {
  forest: '森林',
  mountain: '山岳',
  cave: '洞窟',
  ruins: '遺跡',
  plains: '平原',
  swamp: '湿地',
  coast: '海岸',
  desert: '砂漠',
  tundra: '凍土',
}

export function objectiveLabel(type: DispatchObjectiveSummary['type']): string {
  return OBJECTIVE_LABELS[type] ?? type
}

export function environmentLabel(environment: string): string {
  return ENVIRONMENT_LABELS[environment] ?? environment
}

const OUTCOME_LABELS: Record<DispatchReport['outcome'], string> = {
  completeSuccess: '依頼は完全な成功に終わった',
  success: '依頼は成功した',
  partialSuccess: '依頼は一部成果を得たが、完全な成功には至らなかった',
  failedObjective: '依頼の目的を達成できなかった',
  forcedRetreat: 'Partyは依頼を完遂できず、途中で撤退した',
  lostExpedition: '遠征は壊滅的な結果に終わった',
}

export function outcomeLabel(outcome: DispatchReport['outcome']): string {
  return OUTCOME_LABELS[outcome] ?? `遠征結果: ${outcome}`
}

const BATTLE_OUTCOME_LABELS: Record<string, string> = {
  victory: '勝利',
  costlyVictory: '痛い勝利',
  partialVictory: '部分的な勝利',
  retreat: '撤退',
  defeat: '敗北',
  totalLoss: '全滅',
  stalemate: '相持',
}

export function battleOutcomeLabel(outcome: string): string {
  return BATTLE_OUTCOME_LABELS[outcome] ?? outcome
}

export function riskToleranceLabel(risk: PartyRiskTolerance): string {
  switch (risk) {
    case 'bold':
      return '大胆'
    case 'cautious':
      return '慎重'
    case 'balanced':
    default:
      return 'バランス型'
  }
}

export function affinityBand(affinity: number): string {
  const value = Math.max(0, Math.min(100, affinity))
  if (value < 20) return 'まだ馴染みが薄い'
  if (value < 40) return '顔なじみ'
  if (value < 60) return '信頼している'
  if (value < 80) return '常連'
  return '強い信頼・贔屓'
}

export function specializationMatchText(
  match: 'strong' | 'neutral' | 'weak',
): string {
  switch (match) {
    case 'strong':
      return '今回の依頼はPartyの得意分野'
    case 'weak':
      return '今回の依頼はPartyの苦手分野'
    case 'neutral':
    default:
      return '今回の依頼は得意・苦手のどちらでもない'
  }
}

export function acceptanceReasonText(reason: string): string {
  switch (reason) {
    case 'specialtyMatch':
      return '得意分野への自信が受諾理由の一部だった'
    case 'trustedBroker':
      return '店主への信頼が受諾理由の一部だった'
    case 'needsIncome':
      return '金銭的な必要性が受諾理由の一部だった'
    case 'boldChallenge':
      return '格上の依頼への挑戦が受諾理由の一部だった'
    case 'challengingButSuitable':
      return '難易度は高いが、引き受けられる依頼だった'
    case 'appropriate':
    default:
      return '適切な内容の依頼だった'
  }
}

function traitLabel(
  trait: keyof Personality,
  value: number,
): string | undefined {
  const abs = Math.abs(value)
  if (abs < 2) return undefined
  const positive = value > 0
  switch (trait) {
    case 'bravery':
      return positive
        ? '大胆で、危険を過度には恐れない'
        : '危険には慎重な姿勢を取りやすい'
    case 'caution':
      return positive ? '慎重に物事を考える' : '慎重さより行動を優先しやすい'
    case 'cooperation':
      return positive ? '仲間と歩調を合わせやすい' : '自分の判断を優先しやすい'
    case 'discipline':
      return positive ? '規律や手順を重視する' : '形式や手順にはあまり拘らない'
    case 'altruism':
      return positive
        ? '他者への配慮が強い'
        : '他者より自分側の利益を優先しやすい'
    case 'greed':
      return positive ? '利益や報酬への関心が強い' : '金銭的利益への執着は弱い'
  }
}

export function buildPersonalityHints(personality: Personality): string[] {
  const hints: string[] = []
  const traits: (keyof Personality)[] = [
    'bravery',
    'caution',
    'cooperation',
    'discipline',
    'altruism',
    'greed',
  ]
  for (const t of traits) {
    const label = traitLabel(t, personality[t])
    if (label) hints.push(label)
  }
  return hints
}

function hpCondition(partyMember: DispatchPartyResult): string {
  if (partyMember.dead) return '死亡した'
  if (partyMember.incapacitated) return '行動不能になった'
  const ratio =
    partyMember.maxHp > 0 ? partyMember.finalHp / partyMember.maxHp : 1
  if (ratio >= 0.9) return '目立った消耗はない'
  if (ratio >= 0.5) return '帰還時に消耗が見られる'
  return '帰還時の消耗が大きい'
}

function memberConditionFacts(report: DispatchReport): string[] {
  const facts: string[] = []
  const dead: string[] = []
  const incapacitated: string[] = []
  const conditions: string[] = []
  for (const m of report.party) {
    if (m.dead) {
      dead.push(m.name)
    } else if (m.incapacitated) {
      incapacitated.push(m.name)
    } else {
      conditions.push(`${m.name}: ${hpCondition(m)}`)
    }
  }
  if (dead.length > 0) facts.push(`死亡したMember: ${dead.join('、 ')}`)
  if (incapacitated.length > 0) {
    facts.push(`行動不能になったMember: ${incapacitated.join('、 ')}`)
  }
  if (conditions.length > 0) {
    facts.push(`帰還時の状態: ${conditions.join(' / ')}`)
  }
  return facts
}

function surveyFacts(summary: {
  areaName: string
  coveragePercent: number
  averageQuality: number
  minimumAcceptableQuality: number
  reportReturned: boolean
  surveyedSectorCount: number
  completed: boolean
}): { confirmed: string[]; unknown: string[] } {
  const confirmed: string[] = []
  const unknown: string[] = []

  if (summary.coveragePercent <= 0) {
    confirmed.push('予定された範囲を測量できなかった')
  } else if (summary.coveragePercent < 50) {
    confirmed.push('予定された範囲の一部を測量した')
  } else if (summary.coveragePercent < 100) {
    confirmed.push('予定された範囲の大半を測量した')
  } else {
    confirmed.push('予定された範囲をすべて測量した')
  }

  if (summary.averageQuality >= summary.minimumAcceptableQuality) {
    confirmed.push('測量できた範囲の記録品質は依頼の基準を満たした')
  } else {
    confirmed.push('測量記録の品質は依頼の基準に届かなかった')
  }

  if (summary.reportReturned) {
    confirmed.push('測量記録を酒場まで持ち帰った')
  } else {
    confirmed.push('測量記録を持ち帰ることができなかった')
  }

  if (summary.coveragePercent < 100) {
    unknown.push('測量範囲が限定された具体的な原因は記録されていない')
  }
  if (summary.averageQuality < summary.minimumAcceptableQuality) {
    unknown.push(
      '測量記録の品質が依頼基準に届かなかった具体的な原因は記録されていない',
    )
  }
  if (!summary.reportReturned) {
    unknown.push('測量記録を持ち帰れなかった具体的な原因は記録されていない')
  }

  return { confirmed, unknown }
}

function investigationFacts(summary: {
  progress: number
  completed: boolean
  discoveredInformationCount: number
  completeInformationCount: number
  battleIntelCount: number
}): { confirmed: string[]; unknown: string[] } {
  const confirmed: string[] = []
  const unknown: string[] = []

  if (summary.discoveredInformationCount === 0) {
    confirmed.push('調査によって具体的な情報を得ることはできなかった')
  } else {
    confirmed.push('調査によっていくつかの情報を得た')
  }

  if (summary.completeInformationCount > 0) {
    confirmed.push('得られた情報の中には、十分な内容まで判明したものもある')
  }

  if (summary.battleIntelCount > 0) {
    confirmed.push('戦闘に関係する情報も得られた')
  }

  if (!summary.completed) {
    unknown.push('目的を達成できなかった具体的原因は記録されていない')
    if (summary.discoveredInformationCount > 0) {
      unknown.push('得られた情報の具体的内容は記録されていない')
    }
  } else if (summary.discoveredInformationCount > 0) {
    unknown.push('得られた情報の具体的内容は記録されていない')
  }

  return { confirmed, unknown }
}

function eliminationFacts(summary: {
  requiredTargetCount: number
  defeatedCount: number
  escapedCount: number
  survivingCount: number
  unknownCount: number
  completed: boolean
}): { confirmed: string[]; unknown: string[] } {
  const confirmed: string[] = []
  const unknown: string[] = []

  if (
    summary.defeatedCount === summary.requiredTargetCount &&
    summary.escapedCount === 0
  ) {
    confirmed.push('依頼対象はすべて撃破された')
  } else {
    if (summary.defeatedCount > 0) {
      confirmed.push(`依頼対象を${summary.defeatedCount}体撃破した`)
    }
    if (summary.escapedCount > 0) {
      confirmed.push('一部の対象は逃走した')
    }
    if (summary.survivingCount > 0) {
      confirmed.push('依頼対象の一部が残っている')
    }
    if (summary.unknownCount > 0) {
      confirmed.push('一部対象の最終状態を確認できていない')
    }
  }

  if (summary.completed) {
    confirmed.push('依頼目的を達成した')
  }

  return { confirmed, unknown }
}

function rescueFacts(summary: {
  targetName: string
  located: boolean
  reached: boolean
  stabilized: boolean
  evacuated: boolean
  returned: boolean
  abandoned: boolean
  completed: boolean
}): { confirmed: string[]; unknown: string[] } {
  const confirmed: string[] = []
  const unknown: string[] = []
  const target = summary.targetName || '救助対象'

  if (summary.located) confirmed.push(`${target}を発見した`)
  if (summary.reached) confirmed.push(`${target}のもとへ到達した`)
  if (summary.stabilized) confirmed.push(`${target}を安定させた`)
  if (summary.evacuated) confirmed.push(`${target}を退避させた`)
  if (summary.returned) confirmed.push(`${target}とともに帰還した`)
  if (summary.abandoned) confirmed.push(`${target}を置き去りにした`)

  if (summary.completed) {
    confirmed.push('依頼目的を達成した')
  } else {
    if (!summary.located) confirmed.push(`${target}を発見できなかった`)
    if (summary.located && !summary.reached) {
      unknown.push(
        '発見したにもかかわらず到達できなかった具体的原因は記録されていない',
      )
    }
    if (summary.reached && !summary.stabilized) {
      unknown.push(
        '到達したにもかかわらず安定させられなかった具体的原因は記録されていない',
      )
    }
    if (summary.stabilized && !summary.evacuated) {
      unknown.push(
        '安定させたにもかかわらず退避できなかった具体的原因は記録されていない',
      )
    }
  }

  return { confirmed, unknown }
}

function escortFacts(summary: {
  targetName: string
  destinationReached: boolean
  delivered: boolean
  returnedToOrigin: boolean
  stranded: boolean
  completed: boolean
}): { confirmed: string[]; unknown: string[] } {
  const confirmed: string[] = []
  const unknown: string[] = []
  const target = summary.targetName || '護衛対象'

  if (summary.destinationReached)
    confirmed.push(`${target}を目的地へ到達させた`)
  if (summary.delivered) confirmed.push(`${target}を引き渡した`)
  if (summary.returnedToOrigin) confirmed.push('護衛を終えて酒場まで戻った')
  if (summary.stranded) confirmed.push(`${target}が取り残された`)

  if (summary.completed) {
    confirmed.push('依頼目的を達成した')
  } else {
    if (!summary.destinationReached)
      confirmed.push(`${target}を目的地へ到達させることができなかった`)
    if (!summary.delivered)
      unknown.push('引き渡しができなかった具体的原因は記録されていない')
  }

  return { confirmed, unknown }
}

function retrievalFacts(summary: {
  targetName: string
  finalIntegrity: number
  minimumAcceptableIntegrity: number
  secured: boolean
  extracted: boolean
  returned: boolean
  completed: boolean
}): { confirmed: string[]; unknown: string[] } {
  const confirmed: string[] = []
  const unknown: string[] = []
  const target = summary.targetName || '回収対象'

  if (summary.secured) confirmed.push(`${target}を確保した`)
  if (summary.extracted) confirmed.push(`${target}を回収地点から運び出した`)
  if (summary.returned) confirmed.push(`${target}を持ち帰った`)

  // Only report the target's integrity if the party has actually
  // interacted with it; hidden engine values must not leak into the narrative.
  if (summary.secured || summary.extracted || summary.returned) {
    if (summary.finalIntegrity >= summary.minimumAcceptableIntegrity) {
      confirmed.push('回収物の状態は依頼の許容基準を満たしている')
    } else {
      confirmed.push('回収物の状態は依頼の許容基準に届かなかった')
    }
  }

  if (summary.completed) {
    confirmed.push('依頼目的を達成した')
  } else {
    if (!summary.secured) confirmed.push(`${target}を確保できなかった`)
    if (summary.secured && !summary.extracted)
      unknown.push(
        '確保したにもかかわらず運び出せなかった具体的原因は記録されていない',
      )
    if (summary.extracted && !summary.returned)
      unknown.push(
        '運び出したにもかかわらず持ち帰れなかった具体的原因は記録されていない',
      )
  }

  return { confirmed, unknown }
}

function objectiveSpecificFacts(objective: DispatchObjectiveSummary): {
  confirmed: string[]
  unknown: string[]
} {
  switch (objective.type) {
    case 'survey':
      return surveyFacts(objective)
    case 'investigation':
      return investigationFacts(objective)
    case 'elimination':
      return eliminationFacts(objective)
    case 'rescue':
      return rescueFacts(objective)
    case 'escort':
      return escortFacts(objective)
    case 'retrieval':
      return retrievalFacts(objective)
    default:
      return { confirmed: [], unknown: [] }
  }
}

export function buildExpeditionNarrativeFacts(
  context: ExpeditionNarrativeContext,
): NarrativeFactBundle {
  const report = context.report
  const confirmed: string[] = []
  const unknown: string[] = []
  const hints: string[] = []

  confirmed.push(outcomeLabel(report.outcome))

  if (report.battleOutcome) {
    confirmed.push('遠征中に戦闘が発生した')
    confirmed.push(
      `戦闘結果は${battleOutcomeLabel(report.battleOutcome)}だった`,
    )
  }

  const objective = objectiveSpecificFacts(report.objective)
  confirmed.push(...objective.confirmed)
  unknown.push(...objective.unknown)

  const memberFacts = memberConditionFacts(report)
  confirmed.push(...memberFacts)

  const hasDamagedMember = report.party.some(
    (m) =>
      !m.dead && !m.incapacitated && m.maxHp > 0 && m.finalHp / m.maxHp < 0.9,
  )
  if (hasDamagedMember) {
    unknown.push('Memberが消耗した具体的な原因は記録されていない')
  }

  if (report.outcome === 'forcedRetreat') {
    if (!unknown.some((u) => u.includes('撤退した具体的原因'))) {
      unknown.push('撤退した具体的原因は記録されていない')
    }
  } else if (
    report.outcome === 'failedObjective' ||
    report.outcome === 'partialSuccess'
  ) {
    if (!unknown.some((u) => u.includes('目的を達成できなかった具体的原因'))) {
      unknown.push('目的を達成できなかった具体的原因は記録されていない')
    }
  }

  hints.push(`関係性: ${affinityBand(context.party.affinity)}`)
  hints.push(
    `リスクへの姿勢: ${riskToleranceLabel(context.party.riskTolerance)}`,
  )

  const match = context.acceptance?.specializationMatch ?? 'neutral'
  hints.push(specializationMatchText(match))

  if (context.acceptance) {
    hints.push(`受諾理由: ${acceptanceReasonText(context.acceptance.reason)}`)
  }

  return {
    confirmedFacts: confirmed,
    unknownDetails: unknown,
    presentationHints: hints,
  }
}
