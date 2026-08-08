import { runExpedition } from '../expedition/expedition.ts'
import { deepClone } from '../util.ts'
import {
  acceptanceReasonText,
  evaluateOffer,
  toPublicRequestProfile,
} from './acceptance.ts'
import { buildDispatchReport } from './report.ts'
import type {
  BrokerageMatch,
  BrokerageOfferAttempt,
  ResolvedDispatch,
  TavernDayState,
} from './types.ts'

export function getOfferErrors(
  state: TavernDayState,
  requestId: string,
  partyId: string,
): string[] {
  const errors: string[] = []

  if (state.status === 'resolved') {
    errors.push('既に本日の仲介が確定しています')
  }

  const request = state.requests.find((r) => r.id === requestId)
  if (!request) {
    errors.push(`未知の依頼ID: ${requestId}`)
  }

  const party = state.parties.find((p) => p.id === partyId)
  if (!party) {
    errors.push(`未知のパーティID: ${partyId}`)
  }

  const matchedRequest = state.matches.find((m) => m.requestId === requestId)
  if (matchedRequest) {
    errors.push('この依頼は既に成立しています')
  }

  if (party) {
    const acceptedMatch = state.matches.find((m) => m.partyId === partyId)
    if (acceptedMatch) {
      errors.push('このパーティは既に依頼を受諾しています')
    }
    if (party.acceptedRequestId) {
      errors.push('このパーティは既に依頼を受諾しています')
    }
  }

  const alreadyAttempted = state.offers.some(
    (o) => o.requestId === requestId && o.partyId === partyId,
  )
  if (alreadyAttempted) {
    errors.push('この組み合わせには既に紹介済みです')
  }

  return errors
}

export function offerRequestToParty(
  state: TavernDayState,
  requestId: string,
  partyId: string,
): TavernDayState {
  const errors = getOfferErrors(state, requestId, partyId)
  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }

  const request = state.requests.find((r) => r.id === requestId)!
  const party = state.parties.find((p) => p.id === partyId)!

  const publicProfile = toPublicRequestProfile(request)
  const evaluation = evaluateOffer(publicProfile, party.party)

  const offerId = `${state.seed}:offer:${state.offers.length}`
  const offer: BrokerageOfferAttempt = {
    id: offerId,
    requestId,
    partyId,
    decision: evaluation.decision,
    reason: evaluation.reason,
    evaluation,
  }

  const nextOffers = [...state.offers, offer]

  if (evaluation.decision !== 'accepted') {
    return {
      ...state,
      offers: nextOffers,
    }
  }

  const match: BrokerageMatch = {
    requestId,
    partyId,
    acceptedOfferId: offerId,
  }

  const nextParties = state.parties.map((p) =>
    p.id === partyId ? { ...p, acceptedRequestId: requestId } : p,
  )

  return {
    ...state,
    offers: nextOffers,
    matches: [...state.matches, match],
    parties: nextParties,
  }
}

export function resolveTavernDay(state: TavernDayState): ResolvedDispatch[] {
  if (state.status !== 'planning') {
    throw new Error('解決済みの酒場日は再解決できません')
  }

  const results: ResolvedDispatch[] = []

  for (const request of state.requests) {
    const match = state.matches.find((m) => m.requestId === request.id)
    if (!match) {
      results.push({
        requestId: request.id,
        request,
        memberIds: [],
        status: 'notBrokered',
      })
      continue
    }

    const party = state.parties.find((p) => p.id === match.partyId)
    if (!party) {
      throw new Error(`パーティ ${match.partyId} が見つかりません`)
    }

    const members = deepClone(party.party.members)
    const result = runExpedition(request.expeditionRequest, members)
    const report = buildDispatchReport(request.id, result)

    results.push({
      requestId: request.id,
      request,
      partyId: party.id,
      partyName: party.party.name,
      leaderName: party.party.members.find((m) => m.id === party.party.leaderId)
        ?.name,
      memberIds: party.party.members.map((m) => m.id),
      status: 'resolved',
      result,
      report,
    })
  }

  return results
}

export { acceptanceReasonText, evaluateOffer, toPublicRequestProfile }
