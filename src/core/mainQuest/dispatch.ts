import { deepClone } from '../util.ts'
import type { AdventurerRank } from '../models/types.ts'
import {
  applyLedgerTransaction,
  buildMainQuestPaymentTransaction,
} from '../economy/index.ts'
import { rankIndex } from '../tavern/campaign/generators.ts'
import type { TavernCampaignState } from '../tavern/campaign/types.ts'
import { MAIN_QUEST_THREAT_DEFINITION_MAP } from './threats.ts'
import type {
  MainQuestAttemptRecord,
  MainQuestEvent,
  MainQuestRequest,
  MainQuestThreatId,
} from './types.ts'

export interface MainQuestEligibilityCheck {
  threatId: MainQuestThreatId
  partyId: string
  threatAvailable: boolean
  partyLifecycleStaying: boolean
  partyPresentToday: boolean
  notRecovering: boolean
  notAcceptedNormalRequest: boolean
  notAlreadyOnMainQuestToday: boolean
  noMainQuestDispatchedToday: boolean
  rankSufficient: boolean
  affinitySufficient: boolean
  fundsSufficient: boolean
  partyRank: AdventurerRank
  requiredPartyRank: AdventurerRank
  partyAffinity: number
  requiredAffinity: number
  funds: number
  fee: number
  eligible: boolean
}

/**
 * Pure precondition check, shared by the Dispatch action and the UI
 * projection (per-condition, so the Party Selection screen can show every
 * ✓/✗ row independently — see items 17/18 of the Phase 9.8 spec) — never
 * mutates the Campaign, never consumes RNG or Ledger.
 */
export function evaluateMainQuestDispatch(
  campaign: TavernCampaignState,
  threatId: MainQuestThreatId,
  partyId: string,
): MainQuestEligibilityCheck {
  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[threatId]
  const threatState = campaign.mainQuest.threats[threatId]
  const campaignParty = campaign.parties.find((p) => p.id === partyId)
  const tavernParty = campaign.currentDay.parties.find((p) => p.id === partyId)

  const partyRank: AdventurerRank = campaignParty?.party.rank ?? 'E'
  const partyAffinity = campaignParty?.relationship.affinity ?? 0
  const funds = campaign.finance.funds
  const fee = definition.fee

  const threatAvailable = threatState.status === 'available'
  const partyLifecycleStaying = campaignParty?.lifecycle.status === 'staying'
  const partyPresentToday = tavernParty !== undefined
  const notRecovering = tavernParty?.availability !== 'recovering'
  const notAcceptedNormalRequest = !tavernParty?.acceptedRequestId
  const notAlreadyOnMainQuestToday = !tavernParty?.mainQuestAttemptId
  const noMainQuestDispatchedToday = !campaign.mainQuest.attempts.some(
    (a) => a.dayNumber === campaign.dayNumber,
  )
  const rankSufficient =
    rankIndex(partyRank) >= rankIndex(definition.requiredPartyRank)
  const affinitySufficient = partyAffinity >= definition.requiredAffinity
  const fundsSufficient = funds >= fee

  const eligible =
    threatAvailable &&
    partyLifecycleStaying &&
    partyPresentToday &&
    notRecovering &&
    notAcceptedNormalRequest &&
    notAlreadyOnMainQuestToday &&
    noMainQuestDispatchedToday &&
    rankSufficient &&
    affinitySufficient &&
    fundsSufficient

  return {
    threatId,
    partyId,
    threatAvailable,
    partyLifecycleStaying,
    partyPresentToday,
    notRecovering,
    notAcceptedNormalRequest,
    notAlreadyOnMainQuestToday,
    noMainQuestDispatchedToday,
    rankSufficient,
    affinitySufficient,
    fundsSufficient,
    partyRank,
    requiredPartyRank: definition.requiredPartyRank,
    partyAffinity,
    requiredAffinity: definition.requiredAffinity,
    funds,
    fee,
    eligible,
  }
}

export interface DispatchMainQuestResult {
  ok: boolean
  campaign: TavernCampaignState
  evaluation: MainQuestEligibilityCheck
  attemptId?: string
}

/**
 * Confirms a Main Quest Dispatch: pays the fee immediately (Ledger, per
 * item 22 — never deferred to day settlement like a normal Quest
 * Commission), and reserves the Party for the rest of the day (excluded
 * from brokerage/Quest Chain/World Event/idle-training — see
 * `TavernParty.mainQuestAttemptId`). The actual Battle Simulation does NOT
 * run here — it runs at Day Resolution (`resolveMainQuestForDay`, called
 * from `resolveCampaignDay`), per the Core Doctrine's required ordering
 * (Simulation only ever runs once, deterministically, at a single fixed
 * point). On any blocked precondition, the Campaign is returned unchanged
 * (zero Campaign/Ledger/RNG mutation — item 16).
 */
export function dispatchMainQuest(
  campaign: TavernCampaignState,
  threatId: MainQuestThreatId,
  partyId: string,
): DispatchMainQuestResult {
  const evaluation = evaluateMainQuestDispatch(campaign, threatId, partyId)
  if (!evaluation.eligible) {
    return { ok: false, campaign, evaluation }
  }

  const nextCampaign = deepClone(campaign)
  const attemptId = `mainquest-attempt:${threatId}:${nextCampaign.dayNumber}:${partyId}`

  const entry = buildMainQuestPaymentTransaction(
    nextCampaign.dayNumber,
    threatId,
    attemptId,
    partyId,
    evaluation.fee,
  )
  nextCampaign.finance = applyLedgerTransaction(nextCampaign.finance, entry)

  const request: MainQuestRequest = {
    threatId,
    dayNumber: nextCampaign.dayNumber,
    partyId,
    fee: evaluation.fee,
    requiredPartyRank: evaluation.requiredPartyRank,
    requiredAffinity: evaluation.requiredAffinity,
  }

  const attempt: MainQuestAttemptRecord = {
    id: attemptId,
    threatId,
    dayNumber: nextCampaign.dayNumber,
    partyId,
    fee: evaluation.fee,
    request,
    presentationStatus: 'narrative_pending',
  }

  nextCampaign.mainQuest = {
    ...nextCampaign.mainQuest,
    attempts: [...nextCampaign.mainQuest.attempts, attempt],
  }

  nextCampaign.currentDay = {
    ...nextCampaign.currentDay,
    parties: nextCampaign.currentDay.parties.map((p) =>
      p.id === partyId ? { ...p, mainQuestAttemptId: attemptId } : p,
    ),
  }

  return { ok: true, campaign: nextCampaign, evaluation, attemptId }
}

export function buildMainQuestDispatchedEvent(
  attempt: MainQuestAttemptRecord,
): MainQuestEvent {
  return {
    type: 'dispatched',
    attemptId: attempt.id,
    threatId: attempt.threatId,
    partyId: attempt.partyId,
    dayNumber: attempt.dayNumber,
    fee: attempt.fee,
  }
}
