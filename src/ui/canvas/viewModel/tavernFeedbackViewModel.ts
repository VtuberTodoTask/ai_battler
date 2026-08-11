import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import type {
  BrokerageOfferAttempt,
  CampaignPartyEvent,
  ResolvedDispatch,
  TavernParty,
} from '../../../core/tavern/types.ts'
import type { CampaignRelationshipEvent } from '../../../core/tavern/campaign/types.ts'
import type { DowntimeEvent } from '../../../core/narrative/types.ts'
import { acceptanceReasonText } from '../../../core/tavern/acceptance.ts'
import { downtimeEventSummary } from '../../../core/narrative/downtime.ts'
import {
  buildExpeditionReportViewModels,
  type ExpeditionReportViewModel,
} from './expeditionReportViewModel.ts'
import { OUTCOME_LABELS } from '../../expedition/labels.ts'

export type FeedbackImportance = 'high' | 'medium' | 'low'

export type TavernFeedbackKind =
  | 'quest_rejected'
  | 'quest_accepted'
  | 'party_arrival'
  | 'party_departure'
  | 'recovery_complete'
  | 'stay_extension'
  | 'expedition_return'
  | 'downtime'
  | 'other'

export interface TavernFeedbackItem {
  id: string
  partyId?: string
  partyName?: string
  title: string
  summary: string
  unread: boolean
  narrativeStatus: 'unseen' | 'generated' | 'viewed'
  kind: TavernFeedbackKind
  canOpen: boolean
  importance: FeedbackImportance
  reportId?: string
  narrativeTargetId?: string
}

const PARTY_EVENT_LABELS: Record<CampaignPartyEvent['type'], string> = {
  arrived: '到着',
  departedScheduled: '出発',
  departedCasualty: '被害者を伴い出発',
  startedRecovery: '療養を開始',
  finishedRecovery: '療養が完了',
}

const STAY_EXTENSION_REASON_LABELS: Record<string, string> = {
  training: '訓練',
  recovery: '回復',
  equipment_preparation: '装備準備',
  party_coordination: 'パーティ連携',
  resource_preparation: '物資準備',
  waiting_for_work: '仕事待ち',
  personal_preference: '個人的希望',
  mixed: '複合',
}

function importanceValue(importance: FeedbackImportance): number {
  switch (importance) {
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
      return 1
    default:
      return 0
  }
}

function stayExtensionReasonLabel(reason: string | undefined): string {
  return STAY_EXTENSION_REASON_LABELS[reason ?? ''] ?? reason ?? '—'
}

const OFFER_REASON_LABELS: Record<string, string> = {
  appropriate: '適正',
  challengingButSuitable: 'やや危険だが対応可能',
  trustedBroker: '仲介人信頼',
  needsIncome: '金策',
  boldChallenge: '格上挑戦',
  tooDangerous: '危険すぎる',
  poorFit: '相性不良',
  cautious: '慎重',
  notReady: '未準備',
  specialtyMatch: '得意分野',
  specialtyMismatch: '苦手分野',
}

function offerReasonLabel(reason: string): string {
  return OFFER_REASON_LABELS[reason] ?? reason
}

function getPartyName(
  dayParties: TavernParty[],
  partyId: string,
  fallback?: string,
): string {
  return (
    dayParties.find((p) => p.id === partyId)?.party.name ?? fallback ?? partyId
  )
}

function getPartyRank(
  dayParties: TavernParty[],
  partyId: string,
): string | undefined {
  return dayParties.find((p) => p.id === partyId)?.party.rank
}

function buildDowntimeFeedback(
  party: TavernParty,
  event: DowntimeEvent,
): TavernFeedbackItem {
  const summary =
    event.generatedText ??
    event.fallbackSummary ??
    downtimeEventSummary(event, party.party.members)
  return {
    id: event.id,
    partyId: party.id,
    partyName: party.party.name,
    title: downtimeEventSummary(event, party.party.members),
    summary,
    unread: event.narrativeStatus !== 'viewed',
    narrativeStatus: event.narrativeStatus,
    kind: 'downtime',
    canOpen: true,
    importance: 'low',
  }
}

function buildPartyEventFeedback(
  event: CampaignPartyEvent,
  dayParties: TavernParty[],
): TavernFeedbackItem {
  const partyName = getPartyName(dayParties, event.partyId, event.partyName)
  const rank = getPartyRank(dayParties, event.partyId)
  const party = dayParties.find((p) => p.id === event.partyId)
  const memberCount = party?.party.members.length ?? 4

  switch (event.type) {
    case 'arrived':
      return {
        id: `${event.type}:${event.partyId}:${event.dayNumber}`,
        partyId: event.partyId,
        partyName,
        title: `新しいパーティが酒場を訪れました`,
        summary: `${partyName} / ${memberCount}人${rank ? ` / Rank ${rank}` : ''}`,
        unread: false,
        narrativeStatus: 'viewed',
        kind: 'party_arrival',
        canOpen: true,
        importance: 'high',
      }
    case 'departedScheduled':
    case 'departedCasualty':
      return {
        id: `${event.type}:${event.partyId}:${event.dayNumber}`,
        partyId: event.partyId,
        partyName,
        title: `${partyName}が${PARTY_EVENT_LABELS[event.type]}`,
        summary: '',
        unread: false,
        narrativeStatus: 'viewed',
        kind: 'party_departure',
        canOpen: false,
        importance: 'high',
      }
    case 'finishedRecovery':
      return {
        id: `${event.type}:${event.partyId}:${event.dayNumber}`,
        partyId: event.partyId,
        partyName,
        title: `${partyName}の療養が完了しました`,
        summary: '待機中に戻りました',
        unread: false,
        narrativeStatus: 'viewed',
        kind: 'recovery_complete',
        canOpen: false,
        importance: 'medium',
      }
    case 'startedRecovery':
    default:
      return {
        id: `${event.type}:${event.partyId}:${event.dayNumber}`,
        partyId: event.partyId,
        partyName,
        title: `${partyName}が${PARTY_EVENT_LABELS[event.type] ?? event.type}`,
        summary: '',
        unread: false,
        narrativeStatus: 'viewed',
        kind: 'other',
        canOpen: false,
        importance: 'low',
      }
  }
}

function buildStayExtensionFeedback(
  event: Extract<CampaignRelationshipEvent, { type: 'stayExtended' }>,
  party?: TavernParty,
): TavernFeedbackItem {
  const partyName = party?.party.name ?? event.partyName
  const primary = stayExtensionReasonLabel(event.primaryReason)
  const secondary = event.secondaryReason
    ? stayExtensionReasonLabel(event.secondaryReason)
    : undefined
  const reason = secondary ? `${primary} / ${secondary}` : primary
  const summary = `滞在を${event.extensionDays}日延長しました（${reason}）`
  return {
    id: `stay-extension:${event.partyId}:${event.dayNumber}`,
    partyId: event.partyId,
    partyName,
    title: `滞在延長：${partyName}`,
    summary,
    unread: false,
    narrativeStatus: 'viewed',
    kind: 'stay_extension',
    canOpen: true,
    importance: 'medium',
  }
}

function buildOfferFeedback(
  offer: BrokerageOfferAttempt,
  dayParties: TavernParty[],
): TavernFeedbackItem | null {
  const party = dayParties.find((p) => p.id === offer.partyId)
  const partyName = party?.party.name ?? offer.partyId
  const reasonLabel = offerReasonLabel(offer.reason)
  const reasonText = acceptanceReasonText(offer.reason)

  if (offer.decision === 'accepted') {
    return {
      id: `offer-accepted:${offer.id}`,
      partyId: offer.partyId,
      partyName,
      title: `${partyName}が依頼を引き受けました`,
      summary: `理由：${reasonLabel} — ${reasonText}`,
      unread: false,
      narrativeStatus: 'viewed',
      kind: 'quest_accepted',
      canOpen: true,
      importance: 'medium',
    }
  }

  return {
    id: `offer-rejected:${offer.id}`,
    partyId: offer.partyId,
    partyName,
    title: `${partyName}は依頼を断りました`,
    summary: `理由：${reasonLabel} — ${reasonText}`,
    unread: false,
    narrativeStatus: 'viewed',
    kind: 'quest_rejected',
    canOpen: true,
    importance: 'medium',
  }
}

function buildExpeditionReturnFeedback(
  day: number,
  result: ResolvedDispatch,
  reports: ExpeditionReportViewModel[],
): TavernFeedbackItem | null {
  if (result.status !== 'resolved' || !result.result || !result.report) {
    return null
  }
  const report = reports.find(
    (r) =>
      r.day === day &&
      r.questTitle === result.request.title &&
      r.partyName === (result.partyName ?? '不明'),
  )
  const reportId = report?.id
  return {
    id: `expedition-return:${result.partyId ?? ''}:${result.requestId}`,
    partyId: result.partyId ?? undefined,
    partyName: result.partyName ?? undefined,
    title: `遠征から帰還：${result.request.title}`,
    summary: `結果：${OUTCOME_LABELS[result.result.outcome] ?? result.result.outcome}`,
    unread: false,
    narrativeStatus: 'viewed',
    kind: 'expedition_return',
    canOpen: true,
    importance: 'high',
    reportId,
    narrativeTargetId: report?.narrativeTargetId,
  }
}

function pushUniqueFeedback(
  items: TavernFeedbackItem[],
  seen: Set<string>,
  feedback: TavernFeedbackItem | null,
): void {
  if (!feedback || seen.has(feedback.id)) return
  seen.add(feedback.id)
  items.push(feedback)
}

export function buildTavernFeedbackItems(
  campaign: TavernCampaignState,
): TavernFeedbackItem[] {
  const items: TavernFeedbackItem[] = []
  const seen = new Set<string>()
  const day = campaign.currentDay
  const reports = buildExpeditionReportViewModels(campaign)

  for (const party of day.parties) {
    for (const event of party.downtimeEvents ?? []) {
      pushUniqueFeedback(items, seen, buildDowntimeFeedback(party, event))
    }
  }

  for (const event of day.partyEvents ?? []) {
    pushUniqueFeedback(items, seen, buildPartyEventFeedback(event, day.parties))
  }

  for (const offer of day.offers) {
    pushUniqueFeedback(items, seen, buildOfferFeedback(offer, day.parties))
  }

  if (day.status === 'resolved') {
    for (const result of day.results) {
      pushUniqueFeedback(
        items,
        seen,
        buildExpeditionReturnFeedback(campaign.dayNumber, result, reports),
      )
    }
  }

  for (const record of campaign.history) {
    for (const event of record.relationshipEvents) {
      if (event.dayNumber !== campaign.dayNumber) continue
      if (event.type === 'stayExtended') {
        const party = day.parties.find((p) => p.id === event.partyId)
        pushUniqueFeedback(
          items,
          seen,
          buildStayExtensionFeedback(event, party),
        )
      }
    }
  }

  return items
}

export function sortFeedbackItems(
  items: TavernFeedbackItem[],
): TavernFeedbackItem[] {
  const indexed = items.map((item, index) => ({ item, index }))
  indexed.sort((a, b) => {
    const diff =
      importanceValue(b.item.importance) - importanceValue(a.item.importance)
    if (diff !== 0) return diff
    if (a.item.unread !== b.item.unread) return a.item.unread ? -1 : 1
    return a.index - b.index
  })
  return indexed.map(({ item }) => item)
}
