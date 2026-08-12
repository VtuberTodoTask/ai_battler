import type {
  EnvironmentType,
  ExpeditionInjury,
  ExpeditionOutcome,
} from '../../../core/expedition/types.ts'
import type {
  DispatchObjectiveSummary,
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
  cause?: string
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
  partyId?: string
  outcome: ReportOutcome
  outcomeLabel: string
  objectiveSummary: string
  survivalText: string
  environment?: EnvironmentType
  casualties: ExpeditionCasualtyViewModel[]
  injuries: ExpeditionInjuryViewModel[]
  injuryRecordMissing: boolean
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

export function buildExpeditionReportId(
  day: number,
  partyId: string | undefined,
  requestId: string,
): string {
  return `expedition-report:${day}:${partyId ?? 'unknown'}:${requestId}`
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

function severityLabel(type: ExpeditionInjury['type']): string {
  return type === 'serious' ? '重傷' : '軽傷'
}

function severityWeight(type: ExpeditionInjury['type']): number {
  return type === 'serious' ? 2 : 1
}

function buildMemberStatus(result: ResolvedDispatch): {
  casualties: ExpeditionCasualtyViewModel[]
  injuries: ExpeditionInjuryViewModel[]
  injuryRecordMissing: boolean
} {
  const report = result.report
  if (!report) {
    return { casualties: [], injuries: [], injuryRecordMissing: true }
  }

  const nameById = new Map<string, string>()
  for (const member of report.party) {
    nameById.set(member.adventurerId, member.name)
  }
  for (const id of report.casualties) {
    if (!nameById.has(id)) nameById.set(id, id)
  }
  for (const id of report.incapacitated) {
    if (!nameById.has(id)) nameById.set(id, id)
  }

  const casualties: ExpeditionCasualtyViewModel[] = report.casualties.map(
    (id) => ({
      name: nameById.get(id) ?? id,
      condition: '死亡',
    }),
  )

  const deadIds = new Set(report.casualties)
  const expeditionState = result.result?.state
  const injuryRecordMissing = !expeditionState?.injuries

  const injuryById = new Map<
    string,
    { type: ExpeditionInjury['type']; cause?: string }
  >()

  if (!injuryRecordMissing) {
    for (const injury of expeditionState!.injuries) {
      if (deadIds.has(injury.adventurerId)) continue
      const current = injuryById.get(injury.adventurerId)
      if (
        !current ||
        severityWeight(injury.type) > severityWeight(current.type)
      ) {
        injuryById.set(injury.adventurerId, {
          type: injury.type,
          cause: injury.cause,
        })
      }
    }
  }

  // Incapacitation is a structured status; if it is recorded and no worse
  // injury exists, surface it as a serious condition.
  for (const id of report.incapacitated) {
    if (deadIds.has(id)) continue
    const current = injuryById.get(id)
    if (!current || current.type !== 'serious') {
      injuryById.set(id, { type: 'serious', cause: current?.cause })
    }
  }

  const injuries: ExpeditionInjuryViewModel[] = []
  for (const [id, info] of injuryById) {
    injuries.push({
      name: nameById.get(id) ?? id,
      severity: severityLabel(info.type),
      cause: info.cause,
    })
  }

  return { casualties, injuries, injuryRecordMissing }
}

export function findNarrativeCandidate(
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

export function narrativeStatusForCandidate(
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
  if (result.status !== 'resolved' || !result.report) {
    return null
  }
  const report = result.report
  const { casualties, injuries, injuryRecordMissing } =
    buildMemberStatus(result)
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
    id: buildExpeditionReportId(day, result.partyId, result.requestId),
    day,
    questTitle: result.request.title,
    partyName: result.partyName ?? '不明',
    partyId: result.partyId,
    outcome: reportOutcomeFromExpedition(report.outcome),
    outcomeLabel: OUTCOME_LABELS[report.outcome] ?? report.outcome,
    objectiveSummary: objectiveSummary(report.objective),
    survivalText: `${surviving} / ${total} 生還`,
    environment: result.request.environment,
    casualties,
    injuries,
    injuryRecordMissing,
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
  const reportsById = new Map<string, ExpeditionReportViewModel>()
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
      if (report) reportsById.set(report.id, report)
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
      if (report) reportsById.set(report.id, report)
    }
  }

  const reports = [...reportsById.values()]

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
