import { getOfferErrors } from '../../../core/tavern/brokerage.ts'
import { deriveTavernRank } from '../../../core/tavern/campaign/reputation.ts'
import {
  computeSuccessCommission,
  formatCurrencyAmount,
  formatSignedCurrencyAmount,
} from '../../../core/economy/index.ts'
import type {
  TavernCampaignState,
  TavernRank,
} from '../../../core/tavern/campaign/types.ts'
import type {
  TavernDayState,
  TavernParty,
  TavernRequestOffer,
} from '../../../core/tavern/types.ts'
import {
  ENVIRONMENT_LABELS,
  OBJECTIVE_LABELS,
} from '../../expedition/labels.ts'
import type { GameUiState, UiActionMessage } from '../types.ts'
import {
  buildExpeditionReportViewModels,
  type ExpeditionReportViewModel,
} from './expeditionReportViewModel.ts'
import {
  buildTavernFeedbackItems,
  sortFeedbackItems,
  type TavernFeedbackItem,
} from './tavernFeedbackViewModel.ts'

export interface TavernHeaderViewModel {
  day: number
  reputationScore: number
  tavernRank: TavernRank
  reputationLabel: string
  moneyLabel?: string
  canAdvanceDay: boolean
  canResolveDay: boolean
  advanceDayDisabledReason?: string
  statusMessage?: UiActionMessage
  unreadReportCount: number
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
  /** '新規' for a party arriving for the first time today, '再訪' for a returning party arriving today, undefined otherwise. */
  arrivalBadge?: '新規' | '再訪'
}

export interface TavernPartySummaryViewModel {
  id: string
  name: string
  rankLabel: string
  statusLabel: string
  memberCount: number
  injuryLabel: string
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
  rank: string
  rankLabel: string
  difficultyLabel?: string
  objectiveLabel: string
  terrainLabel: string
  rewardLabel?: string
  statusLabel: string
  selected: boolean
  assignable: boolean
  disabledReason?: string
}

export interface TavernQuestDetailViewModel {
  id: string
  title: string
  rankLabel: string
  objectiveTypeLabel: string
  terrainLabel: string
  combatLabel: string
  description: string
  tags: string[]
  offerStatusLabel: string
  promisedRewardLabel: string
  successCommissionLabel: string
}

export interface TavernDecisionViewModel {
  selectedParty?: TavernPartySummaryViewModel
  selectedQuest?: TavernQuestDetailViewModel
  canOffer: boolean
  offerDisabledReason?: string
}

export type TavernActivityItemViewModel = TavernFeedbackItem

export interface TavernScreenViewModel {
  header: TavernHeaderViewModel
  parties: TavernPartyListItemViewModel[]
  quests: TavernQuestListItemViewModel[]
  selectedParty?: TavernPartySummaryViewModel
  decision?: TavernDecisionViewModel
  activities: TavernActivityItemViewModel[]
  reports: ExpeditionReportViewModel[]
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
    arrivalBadge: party.arrivalBadge,
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

  const injuredCount = party.party.members.filter(
    (m) => m.currentHp < m.maxHp || (m.statusEffects?.length ?? 0) > 0,
  ).length
  const injuryLabel =
    injuredCount === 0 ? '負傷：なし' : `負傷：あり（${injuredCount}名）`

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
    rankLabel: `Rank ${party.party.rank}`,
    statusLabel: selectedPartyStatusLabel(party, day),
    memberCount: party.party.members.length,
    injuryLabel,
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
  selectedPartyId: string | null,
): string {
  const matched = day.matches.find((m) => m.requestId === request.id)
  if (matched) return '成立'

  if (selectedPartyId) {
    const offer = day.offers.find(
      (o) => o.requestId === request.id && o.partyId === selectedPartyId,
    )
    if (offer) {
      if (offer.decision === 'declined') return '拒否済'
      if (offer.decision === 'accepted') return '受諾済'
    }
  }

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

  const rewardAmount = formatCurrencyAmount(request.rewardTerms.promisedReward)

  return {
    id: request.id,
    title: request.title,
    rank: request.rank,
    rankLabel: `Rank ${request.rank}`,
    objectiveLabel: OBJECTIVE_LABELS[request.objectiveType],
    terrainLabel:
      ENVIRONMENT_LABELS[request.environment] ?? request.environment,
    statusLabel: questStatusLabel(request, day, selectedPartyId),
    rewardLabel: `報酬 ${rewardAmount}`,
    selected,
    assignable,
    disabledReason,
  }
}

function buildQuestDetail(
  request: TavernRequestOffer,
  day: TavernDayState,
  selectedPartyId: string | null,
): TavernQuestDetailViewModel {
  const promisedReward = formatCurrencyAmount(
    request.rewardTerms.promisedReward,
  )
  const successCommission = formatCurrencyAmount(
    computeSuccessCommission(request.rewardTerms),
  )
  return {
    id: request.id,
    title: request.title,
    rankLabel: `Rank ${request.rank}`,
    objectiveTypeLabel: OBJECTIVE_LABELS[request.objectiveType],
    terrainLabel:
      ENVIRONMENT_LABELS[request.environment] ?? request.environment,
    combatLabel: request.expeditionRequest.battle ? 'あり' : 'なし',
    description: request.briefing,
    tags: request.publicTags,
    offerStatusLabel: questStatusLabel(request, day, selectedPartyId),
    promisedRewardLabel: `依頼報酬 ${promisedReward}`,
    successCommissionLabel: `成功時手数料 ${successCommission}`,
  }
}

function buildDecision(
  selectedParty: TavernParty | undefined,
  selectedQuest: TavernRequestOffer | undefined,
  day: TavernDayState,
  dayNumber: number,
  history: TavernCampaignState['history'],
): TavernDecisionViewModel {
  const partySummary = selectedParty
    ? buildPartySummary(
        selectedParty,
        day,
        dayNumber,
        history,
        selectedQuest?.id ?? null,
      )
    : undefined
  const questDetail = selectedQuest
    ? buildQuestDetail(selectedQuest, day, selectedParty?.id ?? null)
    : undefined

  const canOffer =
    !!selectedParty &&
    !!selectedQuest &&
    day.status === 'planning' &&
    partySummary?.canAssignQuest === true
  const offerDisabledReason = selectedParty
    ? partySummary?.assignDisabledReason
    : 'パーティを選択してください'

  return {
    selectedParty: partySummary,
    selectedQuest: questDetail,
    canOffer,
    offerDisabledReason,
  }
}

function buildActivities(
  campaign: TavernCampaignState,
  viewedActivityIds: readonly string[] = [],
): TavernActivityItemViewModel[] {
  return buildTavernFeedbackItems(campaign, viewedActivityIds)
}

export function buildTavernScreenViewModel(
  campaign: TavernCampaignState,
  uiState: GameUiState,
): TavernScreenViewModel {
  const day = campaign.currentDay
  const reports = buildExpeditionReportViewModels(campaign)
  const viewedReportIds = new Set(uiState.viewedReportIds ?? [])
  const unreadReportCount = reports.filter(
    (r) => !viewedReportIds.has(r.id),
  ).length

  const funds = campaign.finance.funds
  const tavernRank = deriveTavernRank(campaign.reputation.peakScore)
  const header: TavernHeaderViewModel = {
    day: campaign.dayNumber,
    reputationScore: campaign.reputation.score,
    tavernRank,
    reputationLabel: `酒場ランク ${tavernRank} / 評判 ${campaign.reputation.score}`,
    moneyLabel:
      funds < 0
        ? `資金 ${formatSignedCurrencyAmount(funds)} / 資金不足`
        : `資金 ${formatSignedCurrencyAmount(funds)}`,
    canResolveDay: day.status === 'planning',
    canAdvanceDay: day.status === 'resolved',
    advanceDayDisabledReason:
      day.status !== 'resolved'
        ? '本日を確定してから翌日へ進めます'
        : undefined,
    statusMessage: uiState.actionMessage,
    unreadReportCount,
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
  const selectedQuest = day.requests.find(
    (r) => r.id === uiState.selectedQuestId,
  )

  const decision = buildDecision(
    selectedParty,
    selectedQuest,
    day,
    campaign.dayNumber,
    campaign.history,
  )

  return {
    header,
    parties,
    quests,
    selectedParty: decision.selectedParty,
    decision,
    activities: sortFeedbackItems(
      buildActivities(campaign, uiState.viewedActivityIds ?? []),
    ),
    reports,
  }
}

export { stayExtensionReasonLabel, memberConditionLabel, statusLabelForParty }
