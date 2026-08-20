import type { CampaignPartyEvent } from '../../../../core/tavern/types.ts'
import type {
  CampaignProgressionEvent,
  CampaignRelationshipEvent,
  DayReputationSummary,
  QuestChainEvent,
  TavernCampaignState,
  TavernDayRecord,
} from '../../../../core/tavern/campaign/types.ts'
import type { NarrativeCandidate } from '../../../../core/narrative/types.ts'
import {
  buildExpeditionReportId,
  buildReportFromResult,
  type ExpeditionReportViewModel,
} from '../../viewModel/expeditionReportViewModel.ts'
import {
  formatCurrencyAmount,
  validateSignedCurrencyAmount,
  type TavernLedgerEntry,
} from '../../../../core/economy/index.ts'
import {
  getMaxQuestRank,
  questRankUnlockLabel,
  tavernRankLabel,
} from '../../../../core/tavern/campaign/reputation.ts'
import { getQuestChainDefinition } from '../../../../core/tavern/campaign/questChains.ts'
import { skillLabel } from '../../viewModel/characterLabels.ts'

export type DayResultsStep = 'important_events' | 'expedition_results'

export type DayResultEventImportance = 'high' | 'normal' | 'low'

export interface DayResultEventViewModel {
  id: string
  kind:
    | 'partyArrival'
    | 'partyDeparture'
    | 'recoveryComplete'
    | 'stayExtended'
    | 'casualtyDeparture'
    | 'startedRecovery'
    | 'relationshipChange'
    | 'progression'
    | 'tavernRankUp'
    | 'questChain'
  title: string
  summary: string
  importance: DayResultEventImportance
  narrativeTargetId?: string
  partyId?: string
}

export type ResultOutcomeTone = 'good' | 'mixed' | 'bad' | 'other'

export interface ExpeditionResultItemViewModel extends ExpeditionReportViewModel {
  tone: ResultOutcomeTone
  summaryLines: string[]
  seen: boolean
}

export interface DayResultsSceneInput {
  campaign: TavernCampaignState
  resolvedDay: number
  nextDay: number
  selectedResultId?: string
  step?: DayResultsStep
  returnTarget?: { sceneId: string }
  importantEvents?: DayResultEventViewModel[]
  expeditionResults?: ExpeditionResultItemViewModel[]
}

export interface DailyFinanceSummary {
  commissionIncome: number
  operatingCost: number
  net: number
  currentFunds: number
}

export interface DailyReputationSummary extends DayReputationSummary {
  beforeRankLabel: string
  afterRankLabel: string
}

export interface DayResultsSceneViewModel {
  resolvedDay: number
  nextDay: number
  step: DayResultsStep
  importantEvents: DayResultEventViewModel[]
  expeditionResults: ExpeditionResultItemViewModel[]
  dailyFinanceSummary: DailyFinanceSummary
  dailyReputationSummary?: DailyReputationSummary
  selectedResult?: ExpeditionResultItemViewModel
  selectedIndex: number
  canGoPrevious: boolean
  canGoNext: boolean
  returnTarget: { sceneId: string }
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
  if (report.settlement) {
    const { settlement } = report
    lines.push('精算')
    lines.push(`提示報酬 ${formatCurrencyAmount(settlement.promisedReward)}`)
    lines.push(`支払額 ${formatCurrencyAmount(settlement.paidReward)}`)
    lines.push(`酒場収入 ${formatCurrencyAmount(settlement.tavernCommission)}`)
    if (settlement.settlementReason === 'objective_failed') {
      lines.push('依頼目標を達成できなかったため、報酬は支払われなかった。')
    } else if (settlement.settlementReason === 'partial_objective') {
      lines.push('目標を一部達成したため、報酬は半額支払われた。')
    }
  } else {
    lines.push('精算記録なし')
  }

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

function findCharacterEventCandidate(
  campaign: TavernCampaignState,
  eventType: string,
  partyId: string,
): NarrativeCandidate | undefined {
  return campaign.narrativeCandidates.find(
    (c) =>
      c.category === 'characterEvent' &&
      c.eventType === eventType &&
      c.partyId === partyId,
  )
}

function findParty(
  campaign: TavernCampaignState,
  partyId: string,
):
  | {
      id: string
      name: string
      rank?: string
      members?: { name: string }[]
    }
  | undefined {
  const fromCampaign = campaign.parties.find((p) => p.id === partyId)
  if (fromCampaign) {
    return {
      id: fromCampaign.id,
      name: fromCampaign.party.name,
      rank: fromCampaign.party.rank,
      members: fromCampaign.party.members,
    }
  }
  const fromCurrentDay = campaign.currentDay.parties.find(
    (p) => p.id === partyId,
  )
  if (fromCurrentDay) {
    return {
      id: fromCurrentDay.id,
      name: fromCurrentDay.party.name,
      rank: fromCurrentDay.party.rank,
      members: fromCurrentDay.party.members,
    }
  }
  return undefined
}

function partySummaryText(
  party: ReturnType<typeof findParty>,
  fallbackName: string,
): string {
  if (!party) return fallbackName
  const rank = party.rank ? `[${party.rank}] ` : ''
  const count = party.members?.length ?? '?'
  return `${rank}${party.name}（${count}人）`
}

function buildStayExtensionSummary(
  event: CampaignRelationshipEvent & { type: 'stayExtended' },
): string {
  const parts: string[] = []
  parts.push(`${event.partyName}`)
  if (event.extensionDays > 0) {
    parts.push(`+${event.extensionDays}日滞在`)
  }
  if (event.primaryReason) {
    parts.push(`理由：${event.primaryReason}`)
  }
  return parts.join(' / ')
}

function buildPartyEvent(
  event: CampaignPartyEvent,
  campaign: TavernCampaignState,
): DayResultEventViewModel | null {
  const party = findParty(campaign, event.partyId)
  switch (event.type) {
    case 'arrived': {
      const narrativeTarget = findCharacterEventCandidate(
        campaign,
        'partyArrival',
        event.partyId,
      )
      return {
        id: `party-event:${event.dayNumber}:arrived:${event.partyId}`,
        kind: 'partyArrival',
        title: '新しいパーティが酒場を訪れました',
        summary: partySummaryText(party, event.partyName),
        importance: 'normal',
        narrativeTargetId: narrativeTarget?.id,
        partyId: event.partyId,
      }
    }
    case 'departedScheduled': {
      const narrativeTarget = findCharacterEventCandidate(
        campaign,
        'farewell',
        event.partyId,
      )
      return {
        id: `party-event:${event.dayNumber}:departed:${event.partyId}`,
        kind: 'partyDeparture',
        title: 'パーティが旅立ちました',
        summary: event.partyName,
        importance: 'normal',
        narrativeTargetId: narrativeTarget?.id,
        partyId: event.partyId,
      }
    }
    case 'departedCasualty': {
      const narrativeTarget = findCharacterEventCandidate(
        campaign,
        'casualtyDeparture',
        event.partyId,
      )
      return {
        id: `party-event:${event.dayNumber}:casualty:${event.partyId}`,
        kind: 'casualtyDeparture',
        title: '傷ついたパーティが去りました',
        summary: event.partyName,
        importance: 'high',
        narrativeTargetId: narrativeTarget?.id,
        partyId: event.partyId,
      }
    }
    case 'startedRecovery':
      return {
        id: `party-event:${event.dayNumber}:recovery-start:${event.partyId}`,
        kind: 'startedRecovery',
        title: 'パーティが療養を開始しました',
        summary: partySummaryText(party, event.partyName),
        importance: 'normal',
        partyId: event.partyId,
      }
    case 'finishedRecovery': {
      const narrativeTarget = findCharacterEventCandidate(
        campaign,
        'recoveryFinished',
        event.partyId,
      )
      return {
        id: `party-event:${event.dayNumber}:recovery-finish:${event.partyId}`,
        kind: 'recoveryComplete',
        title: '療養が完了しました',
        summary: partySummaryText(party, event.partyName),
        importance: 'normal',
        narrativeTargetId: narrativeTarget?.id,
        partyId: event.partyId,
      }
    }
    default:
      return null
  }
}

/**
 * Phase 9.6 Quest Chain status-change feedback — deliberately status-only
 * (started/advanced/completed/failed/abandoned). A chain step's ordinary
 * Reward/Reputation/Growth are already surfaced by the existing expedition
 * result and progression feedback; duplicating them here would just be
 * notification noise. Never falls back to a raw chainId/definitionId.
 */
function buildQuestChainEvent(
  event: QuestChainEvent,
  campaign: TavernCampaignState,
): DayResultEventViewModel | null {
  const chain = campaign.questChains.find((c) => c.id === event.chainId)
  const definitionTitle = chain
    ? getQuestChainDefinition(chain.definitionId)?.title
    : undefined

  switch (event.type) {
    case 'started':
      return {
        id: `quest-chain-event:${event.dayNumber}:started:${event.chainId}`,
        kind: 'questChain',
        title: '新たな連続依頼が発生しました',
        summary: [
          definitionTitle ? `「${definitionTitle}」` : undefined,
          '明日、新しい依頼が掲示されます。',
        ]
          .filter((line): line is string => Boolean(line))
          .join('\n'),
        importance: 'high',
      }
    case 'advanced':
      return {
        id: `quest-chain-event:${event.dayNumber}:advanced:${event.chainId}`,
        kind: 'questChain',
        title: '連続依頼が続きます',
        summary: '次の依頼が明日掲示されます。',
        importance: 'normal',
      }
    case 'completed':
      return {
        id: `quest-chain-event:${event.dayNumber}:completed:${event.chainId}`,
        kind: 'questChain',
        title: '連続依頼を完了しました',
        summary: definitionTitle ? `「${definitionTitle}」` : '',
        importance: 'high',
      }
    case 'failed':
      return {
        id: `quest-chain-event:${event.dayNumber}:failed:${event.chainId}`,
        kind: 'questChain',
        title: '連続依頼はここで終了しました',
        summary: '依頼達成に至らなかったため、この一連の依頼は終了しました。',
        importance: 'normal',
      }
    case 'abandoned':
      return {
        id: `quest-chain-event:${event.dayNumber}:abandoned:${event.chainId}`,
        kind: 'questChain',
        title: '連続依頼を見送りました',
        summary: '',
        importance: 'low',
      }
    default:
      return null
  }
}

function buildRelationshipEvent(
  event: CampaignRelationshipEvent,
  campaign: TavernCampaignState,
): DayResultEventViewModel | null {
  if (event.type === 'stayExtended') {
    const narrativeTarget = findCharacterEventCandidate(
      campaign,
      'stayExtended',
      event.partyId,
    )
    return {
      id: `relationship-event:${event.dayNumber}:stay:${event.partyId}`,
      kind: 'stayExtended',
      title: '滞在が延長されました',
      summary: buildStayExtensionSummary(event),
      importance: 'high',
      narrativeTargetId: narrativeTarget?.id,
      partyId: event.partyId,
    }
  }
  if (event.type === 'affinityChanged' && Math.abs(event.delta) >= 10) {
    return {
      id: `relationship-event:${event.dayNumber}:affinity:${event.partyId}`,
      kind: 'relationshipChange',
      title: 'パーティの士気が大きく変動しました',
      summary: `${event.partyName}（信頼度 ${event.before} → ${event.after}）`,
      importance: 'normal',
      partyId: event.partyId,
    }
  }
  if (
    event.type === 'financialPressureChanged' &&
    Math.abs(event.delta) >= 10
  ) {
    return {
      id: `relationship-event:${event.dayNumber}:finance:${event.partyId}`,
      kind: 'relationshipChange',
      title: 'パーティの資金圧力が大きく変動しました',
      summary: `${event.partyName}（資金圧力 ${event.before} → ${event.after}）`,
      importance: 'normal',
      partyId: event.partyId,
    }
  }
  return null
}

/**
 * Consolidates a day's skillImproved events into at most one DayResults
 * item per party ("「Party名」が成長しました", one line per grown member)
 * instead of one item per member — a full party growing together
 * shouldn't flood the day's event list with near-duplicate entries.
 */
function buildAggregatedSkillGrowthEvents(
  events: CampaignProgressionEvent[],
  campaign: TavernCampaignState,
  dayNumber: number,
): DayResultEventViewModel[] {
  const byParty = new Map<
    string,
    Extract<CampaignProgressionEvent, { type: 'skillImproved' }>[]
  >()
  for (const event of events) {
    if (event.type !== 'skillImproved') continue
    const list = byParty.get(event.partyId) ?? []
    list.push(event)
    byParty.set(event.partyId, list)
  }

  const results: DayResultEventViewModel[] = []
  for (const [partyId, improvements] of byParty) {
    const party = findParty(campaign, partyId)
    const partyName = party?.name ?? improvements[0].partyName
    const lines = improvements.map(
      (e) => `${e.memberName}：${skillLabel(e.skill)} ${e.before} → ${e.after}`,
    )
    results.push({
      id: `progression-event:${dayNumber}:skill-growth:${partyId}`,
      kind: 'progression',
      title: `「${partyName}」が成長しました`,
      summary: lines.join('\n'),
      importance: 'normal',
      partyId,
    })
  }
  return results
}

function findDayRecord(
  campaign: TavernCampaignState,
  resolvedDay: number,
): TavernDayRecord | undefined {
  return campaign.history[campaign.history.length - 1]?.dayNumber ===
    resolvedDay
    ? campaign.history[campaign.history.length - 1]
    : campaign.history.find((h) => h.dayNumber === resolvedDay)
}

function buildTavernRankUpEvent(
  summary: DayReputationSummary,
): DayResultEventViewModel {
  const unlocked = questRankUnlockLabel(getMaxQuestRank(summary.afterRank))
  return {
    id: `tavern-rank-up:${summary.afterRank}`,
    kind: 'tavernRankUp',
    title: '酒場ランクが上がりました',
    summary: `${tavernRankLabel(summary.beforeRank)} → ${tavernRankLabel(summary.afterRank)}\n${unlocked}が届くようになります。`,
    importance: 'high',
  }
}

function buildImportantEvents(
  campaign: TavernCampaignState,
  resolvedDay: number,
  nextDay: number,
): DayResultEventViewModel[] {
  const events: DayResultEventViewModel[] = []

  const dayRecord = findDayRecord(campaign, resolvedDay)

  if (dayRecord) {
    if (dayRecord.reputationSummary.promoted) {
      events.push(buildTavernRankUpEvent(dayRecord.reputationSummary))
    }
    for (const event of dayRecord.partyEvents ?? []) {
      const vm = buildPartyEvent(event, campaign)
      if (vm) events.push(vm)
    }
    for (const event of dayRecord.relationshipEvents ?? []) {
      const vm = buildRelationshipEvent(event, campaign)
      if (vm) events.push(vm)
    }
    for (const event of dayRecord.questChainEvents ?? []) {
      const vm = buildQuestChainEvent(event, campaign)
      if (vm) events.push(vm)
    }
    events.push(
      ...buildAggregatedSkillGrowthEvents(
        dayRecord.progressionEvents ?? [],
        campaign,
        dayRecord.dayNumber,
      ),
    )
  }

  for (const event of campaign.currentDay.partyEvents ?? []) {
    if (event.dayNumber !== nextDay) continue
    const vm = buildPartyEvent(event, campaign)
    if (vm) events.push(vm)
  }

  const order: Record<DayResultEventImportance, number> = {
    high: 0,
    normal: 1,
    low: 2,
  }
  events.sort((a, b) => {
    if (order[a.importance] !== order[b.importance]) {
      return order[a.importance] - order[b.importance]
    }
    return a.id.localeCompare(b.id)
  })

  return events
}

function buildExpeditionResults(
  campaign: TavernCampaignState,
  resolvedDay: number,
  seenResultIds: readonly string[],
): ExpeditionResultItemViewModel[] {
  const seen = new Set(seenResultIds)
  const dayRecord = findDayRecord(campaign, resolvedDay)

  const rawResults = dayRecord?.results ?? []
  const results: ExpeditionResultItemViewModel[] = []

  for (const result of rawResults) {
    const report = buildReportFromResult(
      resolvedDay,
      result,
      campaign.narrativeCandidates,
      campaign.narrativeGenerations,
    )
    if (!report) continue

    const id =
      report.id ||
      buildExpeditionReportId(
        resolvedDay,
        result.partyId ?? '',
        result.requestId,
      )
    const item: ExpeditionResultItemViewModel = {
      ...report,
      id,
      tone: outcomeTone(report.outcome),
      summaryLines: buildSummaryLines(report),
      seen: seen.has(id),
    }
    results.push(item)
  }

  return results
}

export function projectDayFinanceSummary(
  ledgerEntries: readonly TavernLedgerEntry[],
  resolvedDay: number,
  currentFunds: number,
): DailyFinanceSummary {
  let commissionIncome = 0
  let operatingCost = 0
  for (const entry of ledgerEntries) {
    if (entry.day !== resolvedDay) continue
    if (entry.kind === 'quest_commission') {
      commissionIncome = validateSignedCurrencyAmount(
        commissionIncome + entry.amount,
      )
    } else if (entry.kind === 'daily_operating_cost') {
      operatingCost = validateSignedCurrencyAmount(operatingCost + entry.amount)
    }
  }
  const net = validateSignedCurrencyAmount(commissionIncome + operatingCost)
  return { commissionIncome, operatingCost, net, currentFunds }
}

/**
 * Returns undefined when no history record exists for resolvedDay. This is
 * a genuine "unknown" state, not "no change" — a fabricated 0/Rank 1
 * fallback would misrepresent a missing record as an actual outcome.
 */
export function projectDayReputationSummary(
  campaign: TavernCampaignState,
  resolvedDay: number,
): DailyReputationSummary | undefined {
  const dayRecord = findDayRecord(campaign, resolvedDay)
  if (!dayRecord) return undefined
  const summary = dayRecord.reputationSummary
  return {
    ...summary,
    beforeRankLabel: tavernRankLabel(summary.beforeRank),
    afterRankLabel: tavernRankLabel(summary.afterRank),
  }
}

export function buildDayResultsSceneViewModel(
  input: DayResultsSceneInput,
  seenResultIds: readonly string[] = [],
): DayResultsSceneViewModel {
  const importantEvents =
    input.importantEvents ??
    buildImportantEvents(input.campaign, input.resolvedDay, input.nextDay)
  const expeditionResults =
    input.expeditionResults ??
    buildExpeditionResults(input.campaign, input.resolvedDay, seenResultIds)

  const dailyReputationSummary = projectDayReputationSummary(
    input.campaign,
    input.resolvedDay,
  )

  const dailyFinanceSummary = projectDayFinanceSummary(
    input.campaign.finance.ledgerEntries,
    input.resolvedDay,
    input.campaign.finance.funds,
  )

  const selectedId = input.selectedResultId ?? expeditionResults[0]?.id
  const selectedIndex = expeditionResults.findIndex((r) => r.id === selectedId)
  const safeIndex = selectedIndex >= 0 ? selectedIndex : 0
  const selectedResult = expeditionResults[safeIndex]

  return {
    resolvedDay: input.resolvedDay,
    nextDay: input.nextDay,
    step: input.step ?? 'important_events',
    importantEvents,
    expeditionResults,
    dailyFinanceSummary,
    dailyReputationSummary,
    selectedResult,
    selectedIndex: safeIndex,
    canGoPrevious: safeIndex > 0,
    canGoNext: safeIndex < expeditionResults.length - 1,
    returnTarget: input.returnTarget ?? { sceneId: 'tavern' },
  }
}
