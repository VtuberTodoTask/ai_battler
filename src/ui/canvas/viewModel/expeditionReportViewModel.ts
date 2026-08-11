import type { ExpeditionOutcome } from '../../../core/expedition/types.ts'
import type {
  DispatchObjectiveSummary,
  DispatchReport,
  ResolvedDispatch,
} from '../../../core/tavern/types.ts'
import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import { OUTCOME_LABELS } from '../../expedition/labels.ts'
import type {
  NarrativeCandidate,
  NarrativeGenerationRecord,
} from '../../../core/narrative/types.ts'

export type ReportOutcome =
  'success' | 'partial_success' | 'failure' | 'retreat' | 'other'

export interface ExpeditionCasualtyViewModel {
  name: string
  condition: string
}

export interface ExpeditionInjuryViewModel {
  name: string
  severity: string
}

export interface ExpeditionRewardViewModel {
  label: string
}

export interface ExpeditionReportEventViewModel {
  text: string
}

export interface ExpeditionReportViewModel {
  id: string
  day: number
  questTitle: string
  partyName: string
  outcome: ReportOutcome
  outcomeLabel: string
  objectiveSummary: string
  survivalText: string
  casualties: ExpeditionCasualtyViewModel[]
  injuries: ExpeditionInjuryViewModel[]
  rewards: ExpeditionRewardViewModel[]
  majorEvents: string[]
  narrativeStatus: 'unseen' | 'generated' | 'viewed'
  narrativeTargetId?: string
  generatedText?: string
  canGenerateNarrative: boolean
}

function reportOutcomeFromExpedition(
  outcome: ExpeditionOutcome,
): ReportOutcome {
  switch (outcome) {
    case 'completeSuccess':
    case 'success':
      return 'success'
    case 'partialSuccess':
      return 'partial_success'
    case 'failedObjective':
      return 'failure'
    case 'forcedRetreat':
    case 'lostExpedition':
      return 'retreat'
    default:
      return 'other'
  }
}

function objectiveSummary(objective: DispatchObjectiveSummary): string {
  switch (objective.type) {
    case 'investigation':
      return `情報発見 ${objective.discoveredInformationCount}件（完全 ${objective.completeInformationCount}件）${objective.completed ? '／完了' : ''}`
    case 'elimination':
      return `目標 ${objective.requiredTargetCount}体中 ${objective.defeatedCount}体撃破${objective.completed ? '（完了）' : '（未完了）'}`
    case 'rescue':
      return `対象 ${objective.targetName} HP ${objective.finalHp}/${objective.maxHp} ${objective.returned ? '／救出成功' : objective.completed ? '／完了' : '／未帰還'}`
    case 'escort':
      return `護衛対象 ${objective.targetName} HP ${objective.finalHp}/${objective.maxHp} ルート ${Math.round(objective.routeProgress)}%${objective.delivered ? '／達成' : ''}`
    case 'retrieval':
      return `回収物 ${objective.targetName} 状態 ${objective.finalIntegrity}/${objective.minimumAcceptableIntegrity}${objective.returned ? '／帰還' : ''}`
    case 'survey':
      return `測量 ${objective.areaName} カバレッジ ${Math.round(objective.coveragePercent)}%${objective.completed ? '／完了' : ''}`
    default:
      return '目的進行状況'
  }
}

function buildMemberStatus(report: DispatchReport): {
  casualties: ExpeditionCasualtyViewModel[]
  injuries: ExpeditionInjuryViewModel[]
} {
  const casualties: ExpeditionCasualtyViewModel[] = []
  const injuries: ExpeditionInjuryViewModel[] = []
  for (const member of report.party) {
    if (member.dead) {
      casualties.push({ name: member.name, condition: '死亡' })
      continue
    }
    if (member.incapacitated) {
      injuries.push({ name: member.name, severity: '重傷' })
      continue
    }
    if (member.finalHp < member.maxHp) {
      const ratio = member.finalHp / member.maxHp
      if (ratio < 0.3) {
        injuries.push({ name: member.name, severity: '重傷' })
      } else if (ratio < 0.7) {
        injuries.push({ name: member.name, severity: '負傷' })
      }
    }
  }
  // Include any casualty ids that were not in the party snapshot (old saves).
  const memberById = new Map(report.party.map((m) => [m.adventurerId, m]))
  for (const id of report.casualties) {
    if (!memberById.has(id)) {
      casualties.push({ name: id, condition: '死亡' })
    }
  }
  for (const id of report.incapacitated) {
    if (!memberById.has(id)) {
      injuries.push({ name: id, severity: '重傷' })
    }
  }
  return { casualties, injuries }
}

function findNarrativeCandidate(
  day: number,
  partyId: string,
  requestId: string,
  candidates: NarrativeCandidate[],
): NarrativeCandidate | undefined {
  return candidates.find(
    (c) =>
      c.category === 'expedition' &&
      c.dayNumber === day &&
      c.partyId === partyId &&
      c.requestId === requestId,
  )
}

function narrativeStatusForCandidate(
  candidate: NarrativeCandidate | undefined,
  generations: NarrativeGenerationRecord[],
): {
  status: 'unseen' | 'generated' | 'viewed'
  generatedText?: string
  canGenerate: boolean
} {
  if (!candidate) {
    return { status: 'unseen', canGenerate: false }
  }
  if (candidate.state === 'generated' && candidate.activeGenerationId) {
    const record = generations.find(
      (g) => g.id === candidate.activeGenerationId,
    )
    if (record) {
      return {
        status: 'generated',
        generatedText: record.generatedText,
        canGenerate: true,
      }
    }
  }
  if (candidate.state === 'dismissed') {
    return { status: 'unseen', canGenerate: true }
  }
  return { status: 'unseen', canGenerate: true }
}

function buildReportFromResult(
  day: number,
  result: ResolvedDispatch,
  candidates: NarrativeCandidate[],
  generations: NarrativeGenerationRecord[],
): ExpeditionReportViewModel | null {
  if (result.status !== 'resolved' || !result.result || !result.report) {
    return null
  }
  const report = result.report
  const { casualties, injuries } = buildMemberStatus(report)
  const surviving = report.party.filter((m) => !m.dead).length
  const total = report.party.length
  const candidate = findNarrativeCandidate(
    day,
    result.partyId ?? '',
    result.requestId,
    candidates,
  )
  const narrative = narrativeStatusForCandidate(candidate, generations)

  return {
    id: `${day}:${result.requestId}:${result.partyId ?? ''}`,
    day,
    questTitle: result.request.title,
    partyName: result.partyName ?? '不明',
    outcome: reportOutcomeFromExpedition(report.outcome),
    outcomeLabel: OUTCOME_LABELS[report.outcome] ?? report.outcome,
    objectiveSummary: objectiveSummary(report.objective),
    survivalText: `${surviving} / ${total} 生還`,
    casualties,
    injuries,
    rewards: [{ label: '記録なし' }],
    majorEvents: report.keyFacts.slice(0, 5),
    narrativeStatus: narrative.status,
    narrativeTargetId: candidate?.id,
    generatedText: narrative.generatedText,
    canGenerateNarrative: narrative.canGenerate,
  }
}

export function buildExpeditionReportViewModels(
  campaign: TavernCampaignState,
): ExpeditionReportViewModel[] {
  const reports: ExpeditionReportViewModel[] = []
  const candidates = campaign.narrativeCandidates
  const generations = campaign.narrativeGenerations

  if (campaign.currentDay.status === 'resolved') {
    for (const result of campaign.currentDay.results) {
      const report = buildReportFromResult(
        campaign.dayNumber,
        result,
        candidates,
        generations,
      )
      if (report) reports.push(report)
    }
  }

  for (const record of campaign.history) {
    for (const result of record.results) {
      const report = buildReportFromResult(
        record.dayNumber,
        result,
        candidates,
        generations,
      )
      if (report) reports.push(report)
    }
  }

  // Newest first, stable by day then request id.
  reports.sort((a, b) => {
    if (b.day !== a.day) return b.day - a.day
    return a.id.localeCompare(b.id)
  })

  return reports
}

export function findExpeditionReportById(
  reports: ExpeditionReportViewModel[],
  id: string,
): ExpeditionReportViewModel | undefined {
  return reports.find((r) => r.id === id)
}
