import { getOfferErrors } from '../../../core/tavern/brokerage.ts'
import {
  getReputationTier,
  getReputationTierLabel,
} from '../../../core/tavern/campaign/reputation.ts'
import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import { downtimeEventSummary } from '../../../core/narrative/downtime.ts'
import type { DowntimeEvent } from '../../../core/narrative/types.ts'
import type {
  CampaignPartyEvent,
  TavernDayState,
  TavernParty,
  TavernRequestOffer,
} from '../../../core/tavern/types.ts'
import type { CampaignRelationshipEvent } from '../../../core/tavern/campaign/types.ts'
import { OBJECTIVE_LABELS, OUTCOME_LABELS } from '../../expedition/labels.ts'
import type { GameUiState, UiActionMessage } from '../types.ts'

export interface TavernHeaderViewModel {
  day: number
  reputation: number
  reputationLabel: string
  moneyLabel?: string
  canAdvanceDay: boolean
  canResolveDay: boolean
  advanceDayDisabledReason?: string
  statusMessage?: UiActionMessage
}

export interface TavernPartyMemberViewModel {
  id: string
  name: string
  role: string
  rank: string
  conditionLabel: string
}

export interface TavernPartyListItemViewModel {
  id: string
  name: string
  status:
    | 'available'
    | 'assigned'
    | 'resting'
    | 'recovering'
    | 'idle'
    | 'departing'
    | 'other'
  statusLabel: string
  memberCount: number
  selected: boolean
  unreadEventCount: number
  extensionDaysRemaining?: number
}

export interface TavernPartySummaryViewModel {
  id: string
  name: string
  statusLabel: string
  members: TavernPartyMemberViewModel[]
  currentQuest?: { id: string; title: string }
  stayInfo?: {
    daysRemaining?: number
    extended?: boolean
    extensionReasonLabel?: string
  }
  canAssignQuest: boolean
  canRest: boolean
  restDisabledReason?: string
  assignDisabledReason?: string
}

export interface TavernQuestListItemViewModel {
  id: string
  title: string
  rankLabel: string
  difficultyLabel?: string
  objectiveLabel: string
  rewardLabel?: string
  statusLabel: string
  selected: boolean
  assignable: boolean
  disabledReason?: string
}

export type TavernActivityItemKind =
  'downtime' | 'stay_extension' | 'expedition_return' | 'other'

export interface TavernActivityItemViewModel {
  id: string
  partyId?: string
  partyName?: string
  title: string
  summary: string
  unread: boolean
  narrativeStatus: 'unseen' | 'generated' | 'viewed'
  kind: TavernActivityItemKind
  canOpen: boolean
}

export interface TavernScreenViewModel {
  header: TavernHeaderViewModel
  parties: TavernPartyListItemViewModel[]
  quests: TavernQuestListItemViewModel[]
  selectedParty?: TavernPartySummaryViewModel
  activities: TavernActivityItemViewModel[]
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

const PARTY_EVENT_LABELS: Record<string, string> = {
  arrived: '到着',
  departedScheduled: '出発',
  departedCasualty: '被害者を伴い出発',
  startedRecovery: '療養を開始',
  finishedRecovery: '療養が完了',
}

function stayExtensionReasonLabel(reason: string | undefined): string {
  return STAY_EXTENSION_REASON_LABELS[reason ?? ''] ?? reason ?? '—'
}

function statusLabelForParty(party: TavernParty): string {
  if (party.availability === 'recovering') {
    const remaining =
      party.recoveryDaysRemaining !== undefined
        ? `（あと${party.recoveryDaysRemaining}日）`
        : ''
    return `療養中${remaining}`
  }
  if (party.acceptedRequestId) {
    return '依頼受諾済み'
  }
  return '待機中'
}

function statusKindForParty(
  party: TavernParty,
): TavernPartyListItemViewModel['status'] {
  if (party.availability === 'recovering') return 'recovering'
  if (party.acceptedRequestId) return 'assigned'
  return 'available'
}

function memberConditionLabel(member: {
  name: string
  currentHp: number
  maxHp: number
  currentMp: number
  maxMp: number
  morale: number
}): string {
  return `HP ${member.currentHp}/${member.maxHp} · MP ${member.currentMp}/${member.maxMp} · 士気 ${member.morale}`
}

function selectedPartyStatusLabel(
  party: TavernParty,
  day: TavernDayState,
): string {
  if (party.availability === 'recovering') {
    const remaining =
      party.recoveryDaysRemaining !== undefined
        ? `（あと${party.recoveryDaysRemaining}日）`
        : ''
    return `療養中${remaining}`
  }
  if (party.acceptedRequestId) {
    const request = day.requests.find((r) => r.id === party.acceptedRequestId)
    return request ? `依頼受諾：${request.title}` : '依頼受諾済み'
  }
  return '待機中'
}

function currentQuestForParty(
  party: TavernParty,
  day: TavernDayState,
): { id: string; title: string } | undefined {
  if (!party.acceptedRequestId) return undefined
  const request = day.requests.find((r) => r.id === party.acceptedRequestId)
  if (!request) return undefined
  return { id: request.id, title: request.title }
}

function stayInfoForParty(
  party: TavernParty,
  dayNumber: number,
  history: TavernCampaignState['history'],
): TavernPartySummaryViewModel['stayInfo'] {
  if (
    party.plannedDepartureDay === undefined ||
    party.arrivalDay === undefined
  ) {
    return undefined
  }
  const daysRemaining = Math.max(0, party.plannedDepartureDay - dayNumber + 1)
  const extended = (party.relationship?.stayExtensionDaysUsed ?? 0) > 0
  if (!extended) {
    return { daysRemaining, extended: false }
  }

  // Find the latest stay-extension event for this party in the history.
  let reason: string | undefined
  for (let i = history.length - 1; i >= 0; i--) {
    const record = history[i]
    const event = record.relationshipEvents.find(
      (e) => 'type' in e && e.type === 'stayExtended' && e.partyId === party.id,
    )
    if (event && event.type === 'stayExtended') {
      reason = event.primaryReason
      break
    }
  }

  return {
    daysRemaining,
    extended: true,
    extensionReasonLabel: stayExtensionReasonLabel(reason),
  }
}

function buildPartyListItem(
  party: TavernParty,
  selected: boolean,
  dayNumber: number,
): TavernPartyListItemViewModel {
  const unreadCount =
    party.downtimeEvents?.filter((e) => e.narrativeStatus !== 'viewed')
      .length ?? 0
  const extensionDaysRemaining =
    party.plannedDepartureDay !== undefined
      ? Math.max(0, party.plannedDepartureDay - dayNumber + 1)
      : undefined
  return {
    id: party.id,
    name: party.party.name,
    status: statusKindForParty(party),
    statusLabel: statusLabelForParty(party),
    memberCount: party.party.members.length,
    selected,
    unreadEventCount: unreadCount,
    extensionDaysRemaining,
  }
}

function buildPartySummary(
  party: TavernParty,
  day: TavernDayState,
  dayNumber: number,
  history: TavernCampaignState['history'],
  selectedQuestId: string | null,
): TavernPartySummaryViewModel {
  const members: TavernPartyMemberViewModel[] = party.party.members.map(
    (m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      rank: m.rank,
      conditionLabel: memberConditionLabel(m),
    }),
  )

  let canAssignQuest = false
  let assignDisabledReason: string | undefined
  if (selectedQuestId && day.status === 'planning') {
    const errors = getOfferErrors(day, selectedQuestId, party.id)
    if (errors.length === 0) {
      canAssignQuest = true
    } else {
      assignDisabledReason = errors[0]
    }
  } else if (day.status !== 'planning') {
    assignDisabledReason = '本日の仲介は確定済みです'
  } else {
    assignDisabledReason = '依頼を選択してください'
  }

  return {
    id: party.id,
    name: party.party.name,
    statusLabel: selectedPartyStatusLabel(party, day),
    members,
    currentQuest: currentQuestForParty(party, day),
    stayInfo: stayInfoForParty(party, dayNumber, history),
    canAssignQuest,
    canRest: false,
    assignDisabledReason,
  }
}

function questStatusLabel(
  request: TavernRequestOffer,
  day: TavernDayState,
): string {
  const matched = day.matches.find((m) => m.requestId === request.id)
  if (matched) return '成立'
  const offerCount = day.offers.filter((o) => o.requestId === request.id).length
  if (offerCount > 0) return `紹介履歴: ${offerCount}`
  return '未紹介'
}

function buildQuestListItem(
  request: TavernRequestOffer,
  day: TavernDayState,
  selectedPartyId: string | null,
  selected: boolean,
): TavernQuestListItemViewModel {
  let assignable = false
  let disabledReason: string | undefined
  if (selectedPartyId && day.status === 'planning') {
    const errors = getOfferErrors(day, request.id, selectedPartyId)
    if (errors.length === 0) {
      assignable = true
    } else {
      disabledReason = errors[0]
    }
  }

  return {
    id: request.id,
    title: request.title,
    rankLabel: `Rank ${request.rank}`,
    objectiveLabel: OBJECTIVE_LABELS[request.objectiveType],
    statusLabel: questStatusLabel(request, day),
    selected,
    assignable,
    disabledReason,
  }
}

function buildDowntimeActivity(
  party: TavernParty,
  event: DowntimeEvent,
): TavernActivityItemViewModel {
  return {
    id: event.id,
    partyId: party.id,
    partyName: party.party.name,
    title: downtimeEventSummary(event, party.party.members),
    summary:
      event.generatedText ??
      event.fallbackSummary ??
      downtimeEventSummary(event, party.party.members),
    unread: event.narrativeStatus !== 'viewed',
    narrativeStatus: event.narrativeStatus,
    kind: 'downtime',
    canOpen: true,
  }
}

function buildPartyEventActivity(
  event: CampaignPartyEvent,
): TavernActivityItemViewModel {
  return {
    id: `${event.type}:${event.partyId}:${event.dayNumber}`,
    partyId: event.partyId,
    partyName: event.partyName,
    title: `${event.partyName}が${PARTY_EVENT_LABELS[event.type] ?? event.type}`,
    summary: '',
    unread: false,
    narrativeStatus: 'viewed',
    kind: 'other',
    canOpen: false,
  }
}

function buildStayExtensionActivity(
  party: TavernParty,
  event: Extract<CampaignRelationshipEvent, { type: 'stayExtended' }>,
): TavernActivityItemViewModel {
  const reason = stayExtensionReasonLabel(event.primaryReason)
  const summary = `滞在を${event.extensionDays}日延長しました${event.secondaryReason ? `（${reason}／${stayExtensionReasonLabel(event.secondaryReason)}）` : `（${reason}）`}`
  return {
    id: `stay-extension:${event.partyId}:${event.dayNumber}`,
    partyId: event.partyId,
    partyName: event.partyName,
    title: `滞在延長：${event.partyName}`,
    summary,
    unread: false,
    narrativeStatus: 'viewed',
    kind: 'stay_extension',
    canOpen: true,
  }
}

function buildExpeditionReturnActivity(
  party: TavernParty,
  request: TavernRequestOffer,
  outcome: string,
): TavernActivityItemViewModel {
  return {
    id: `expedition-return:${party.id}:${request.id}`,
    partyId: party.id,
    partyName: party.party.name,
    title: `遠征から帰還：${request.title}`,
    summary: `結果：${OUTCOME_LABELS[outcome as keyof typeof OUTCOME_LABELS] ?? outcome}`,
    unread: false,
    narrativeStatus: 'viewed',
    kind: 'expedition_return',
    canOpen: true,
  }
}

function buildActivities(
  campaign: TavernCampaignState,
): TavernActivityItemViewModel[] {
  const activities: TavernActivityItemViewModel[] = []
  const day = campaign.currentDay

  for (const party of day.parties) {
    for (const event of party.downtimeEvents ?? []) {
      activities.push(buildDowntimeActivity(party, event))
    }
  }

  for (const event of day.partyEvents ?? []) {
    activities.push(buildPartyEventActivity(event))
  }

  const stayEvents: Extract<
    CampaignRelationshipEvent,
    { type: 'stayExtended' }
  >[] = []
  for (const record of campaign.history) {
    for (const event of record.relationshipEvents) {
      if (
        event.dayNumber === campaign.dayNumber &&
        event.type === 'stayExtended'
      ) {
        stayEvents.push(event)
      }
    }
  }
  const seenStayIds = new Set<string>()
  for (const event of stayEvents) {
    const id = `stay-extension:${event.partyId}:${event.dayNumber}`
    if (seenStayIds.has(id)) continue
    seenStayIds.add(id)
    const party = day.parties.find((p) => p.id === event.partyId)
    if (party) {
      activities.push(buildStayExtensionActivity(party, event))
    }
  }

  if (day.status === 'resolved') {
    for (const result of day.results) {
      if (result.status !== 'resolved' || !result.result || !result.partyId)
        continue
      const party = day.parties.find((p) => p.id === result.partyId)
      const request = day.requests.find((r) => r.id === result.requestId)
      if (!party || !request) continue
      activities.push(
        buildExpeditionReturnActivity(party, request, result.result.outcome),
      )
    }
  }

  return activities
}

export function buildTavernScreenViewModel(
  campaign: TavernCampaignState,
  uiState: GameUiState,
): TavernScreenViewModel {
  const day = campaign.currentDay

  const header: TavernHeaderViewModel = {
    day: campaign.dayNumber,
    reputation: campaign.reputation,
    reputationLabel: `酒場評判 ${campaign.reputation}（${getReputationTierLabel(
      getReputationTier(campaign.reputation),
    )}）`,
    canResolveDay: day.status === 'planning',
    canAdvanceDay: day.status === 'resolved',
    advanceDayDisabledReason:
      day.status !== 'resolved'
        ? '本日を確定してから翌日へ進めます'
        : undefined,
    statusMessage: uiState.actionMessage,
  }

  const parties = day.parties.map((p) =>
    buildPartyListItem(p, p.id === uiState.selectedPartyId, campaign.dayNumber),
  )

  const quests = day.requests.map((r) =>
    buildQuestListItem(
      r,
      day,
      uiState.selectedPartyId,
      r.id === uiState.selectedQuestId,
    ),
  )

  const selectedParty = day.parties.find(
    (p) => p.id === uiState.selectedPartyId,
  )

  return {
    header,
    parties,
    quests,
    selectedParty: selectedParty
      ? buildPartySummary(
          selectedParty,
          day,
          campaign.dayNumber,
          campaign.history,
          uiState.selectedQuestId,
        )
      : undefined,
    activities: buildActivities(campaign),
  }
}

export { stayExtensionReasonLabel, memberConditionLabel, statusLabelForParty }
