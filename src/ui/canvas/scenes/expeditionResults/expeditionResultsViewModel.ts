import type {
  TavernCampaignState,
  TavernDayRecord,
} from '../../../../core/tavern/campaign/types.ts'
import {
  buildExpeditionReportId,
  buildReportFromResult,
  type ExpeditionReportViewModel,
} from '../../viewModel/expeditionReportViewModel.ts'

export interface ExpeditionResultsSceneInput {
  campaign: TavernCampaignState
  dayNumber: number
  selectedResultId?: string
}

export type ResultOutcomeTone = 'good' | 'mixed' | 'bad' | 'other'

export interface ExpeditionResultItemViewModel extends ExpeditionReportViewModel {
  tone: ResultOutcomeTone
  summaryLines: string[]
  seen: boolean
}

export interface ExpeditionResultsSceneViewModel {
  dayLabel: string
  results: ExpeditionResultItemViewModel[]
  selectedResult?: ExpeditionResultItemViewModel
  selectedIndex: number
  canGoPrevious: boolean
  canGoNext: boolean
}

function outcomeTone(
  outcome: ExpeditionReportViewModel['outcome'],
): ResultOutcomeTone {
  switch (outcome) {
    case 'success':
      return 'good'
    case 'partial_success':
    case 'retreat':
      return 'mixed'
    case 'failure':
      return 'bad'
    default:
      return 'other'
  }
}

export function buildSummaryLines(report: ExpeditionReportViewModel): string[] {
  const lines: string[] = []
  lines.push(`結果：${report.outcomeLabel}`)
  if (report.objectiveSummary) {
    lines.push(report.objectiveSummary)
  }
  if (report.survivalText) {
    lines.push(`生還：${report.survivalText}`)
  }
  const reward = report.rewards.map((r) => r.label).join(' / ') || '記録なし'
  lines.push(`報酬：${reward}`)

  const casualties = report.casualties.map((c) => `${c.name}（${c.condition}）`)
  if (casualties.length > 0) {
    lines.push(`死亡・行方不明：${casualties.join('、')}`)
  }

  const injuries = report.injuries.map((i) => `${i.name}（${i.severity}）`)
  if (injuries.length > 0) {
    lines.push(`負傷：${injuries.join('、')}`)
  } else if (!report.injuryRecordMissing) {
    lines.push('負傷：なし')
  }

  return lines
}

export function buildExpeditionResultsSceneViewModel(
  input: ExpeditionResultsSceneInput,
  seenResultIds: readonly string[] = [],
): ExpeditionResultsSceneViewModel {
  const seen = new Set(seenResultIds)
  const campaign = input.campaign
  const dayNumber = input.dayNumber
  const dayRecord: TavernDayRecord | undefined =
    campaign.history[campaign.history.length - 1]?.dayNumber === dayNumber
      ? campaign.history[campaign.history.length - 1]
      : campaign.history.find((h) => h.dayNumber === dayNumber)

  const rawResults = dayRecord?.results ?? []
  const results: ExpeditionResultItemViewModel[] = []

  for (const result of rawResults) {
    const report = buildReportFromResult(
      dayNumber,
      result,
      campaign.narrativeCandidates,
      campaign.narrativeGenerations,
    )
    if (!report) continue

    const id =
      report.id ||
      buildExpeditionReportId(dayNumber, result.partyId ?? '', result.requestId)
    const item: ExpeditionResultItemViewModel = {
      ...report,
      id,
      tone: outcomeTone(report.outcome),
      summaryLines: buildSummaryLines(report),
      seen: seen.has(id),
    }
    results.push(item)
  }

  // Deterministic ordering: by the campaign's resolved order, which already is
  // the order within the day record.
  const selectedId = input.selectedResultId ?? results[0]?.id
  const selectedIndex = results.findIndex((r) => r.id === selectedId)
  const safeIndex = selectedIndex >= 0 ? selectedIndex : 0
  const selectedResult = results[safeIndex]

  return {
    dayLabel: `Day ${dayNumber} の帰還結果`,
    results,
    selectedResult,
    selectedIndex: safeIndex,
    canGoPrevious: safeIndex > 0,
    canGoNext: safeIndex < results.length - 1,
  }
}
