import { describe, expect, it } from 'vitest'
import { generateTavernDay } from './dayGenerator.ts'
import {
  evaluateOffer,
  getOfferErrors,
  offerRequestToParty,
  resolveTavernDay,
  toPublicRequestProfile,
} from './brokerage.ts'

const TEST_SEED = 'tavern-brokerage-001'

function findDeclinedPair(day: ReturnType<typeof generateTavernDay>) {
  for (const request of day.requests) {
    const profile = toPublicRequestProfile(request)
    for (const party of day.parties) {
      const evaluation = evaluateOffer(profile, party.party)
      if (evaluation.decision === 'declined') {
        return { requestId: request.id, partyId: party.id }
      }
    }
  }
  return null
}

function findAcceptedPair(day: ReturnType<typeof generateTavernDay>) {
  for (const request of day.requests) {
    const profile = toPublicRequestProfile(request)
    for (const party of day.parties) {
      const evaluation = evaluateOffer(profile, party.party)
      if (evaluation.decision === 'accepted') {
        return { requestId: request.id, partyId: party.id }
      }
    }
  }
  return null
}

function brokerAllRequests(day: ReturnType<typeof generateTavernDay>) {
  let nextDay = day
  const usedParties = new Set<string>()
  for (const request of day.requests) {
    const profile = toPublicRequestProfile(request)
    let matched = false
    for (const party of nextDay.parties) {
      if (usedParties.has(party.id)) continue
      if (evaluateOffer(profile, party.party).decision !== 'accepted') continue
      nextDay = offerRequestToParty(nextDay, request.id, party.id)
      usedParties.add(party.id)
      matched = true
      break
    }
    if (!matched) break
  }
  return nextDay
}

describe('getOfferErrors', () => {
  it('returns empty for a valid initial offer', () => {
    const day = generateTavernDay(TEST_SEED)
    const requestId = day.requests[0].id
    const partyId = day.parties[0].id
    const errors = getOfferErrors(day, requestId, partyId)
    expect(errors).toEqual([])
  })

  it('rejects an unknown request', () => {
    const day = generateTavernDay(TEST_SEED)
    const errors = getOfferErrors(day, 'unknown-request', day.parties[0].id)
    expect(errors.some((e) => e.includes('未知'))).toBe(true)
  })

  it('rejects an unknown party', () => {
    const day = generateTavernDay(TEST_SEED)
    const errors = getOfferErrors(day, day.requests[0].id, 'unknown-party')
    expect(errors.some((e) => e.includes('未知'))).toBe(true)
  })

  it('rejects when day is resolved', () => {
    const day = generateTavernDay(TEST_SEED)
    const resolved = { ...day, status: 'resolved' as const, results: [] }
    const errors = getOfferErrors(
      resolved,
      day.requests[0].id,
      day.parties[0].id,
    )
    expect(errors.some((e) => e.includes('確定'))).toBe(true)
  })

  it('rejects when request is already matched', () => {
    let day = generateTavernDay(TEST_SEED)
    const pair = findAcceptedPair(day)
    if (!pair) return
    day = offerRequestToParty(day, pair.requestId, pair.partyId)
    const otherParty = day.parties.find((p) => p.id !== pair.partyId)!
    const errors = getOfferErrors(day, pair.requestId, otherParty.id)
    expect(errors.some((e) => e.includes('成立'))).toBe(true)
  })

  it('rejects when party already accepted another request', () => {
    let day = generateTavernDay(TEST_SEED)
    const pair = findAcceptedPair(day)
    if (!pair) return
    day = offerRequestToParty(day, pair.requestId, pair.partyId)
    const otherRequest = day.requests.find((r) => r.id !== pair.requestId)!
    const errors = getOfferErrors(day, otherRequest.id, pair.partyId)
    expect(errors.some((e) => e.includes('受諾'))).toBe(true)
  })

  it('rejects duplicate request-party offers', () => {
    let day = generateTavernDay(TEST_SEED)
    const pair = findDeclinedPair(day)
    if (!pair) return
    day = offerRequestToParty(day, pair.requestId, pair.partyId)
    const errors = getOfferErrors(day, pair.requestId, pair.partyId)
    expect(errors.some((e) => e.includes('紹介済み'))).toBe(true)
  })
})

describe('offerRequestToParty', () => {
  it('records a declined offer without locking the party', () => {
    const day = generateTavernDay(TEST_SEED)
    const pair = findDeclinedPair(day)
    if (!pair) return

    const nextDay = offerRequestToParty(day, pair.requestId, pair.partyId)

    expect(nextDay.offers.length).toBe(1)
    expect(nextDay.offers[0].requestId).toBe(pair.requestId)
    expect(nextDay.offers[0].partyId).toBe(pair.partyId)
    expect(nextDay.offers[0].decision).toBe('declined')
    expect(nextDay.matches.length).toBe(0)
    const party = nextDay.parties.find((p) => p.id === pair.partyId)!
    expect(party.acceptedRequestId).toBeUndefined()
  })

  it('reuses a declined party for a different request', () => {
    const day = generateTavernDay(TEST_SEED)
    const first = findDeclinedPair(day)
    if (!first) return

    const firstParty = day.parties.find((p) => p.id === first.partyId)!
    const otherRequest = day.requests.find((r) => r.id !== first.requestId)!

    if (
      evaluateOffer(toPublicRequestProfile(otherRequest), firstParty.party)
        .decision === 'accepted'
    ) {
      return
    }

    let nextDay = offerRequestToParty(day, first.requestId, first.partyId)
    nextDay = offerRequestToParty(nextDay, otherRequest.id, first.partyId)

    expect(nextDay.offers.length).toBe(2)
    expect(nextDay.offers[1].partyId).toBe(first.partyId)
  })

  it('reuses a declined request with a different party', () => {
    const day = generateTavernDay(TEST_SEED)
    const first = findDeclinedPair(day)
    if (!first) return

    const firstRequest = day.requests.find((r) => r.id === first.requestId)!
    const otherParty = day.parties.find((p) => p.id !== first.partyId)!

    if (
      evaluateOffer(toPublicRequestProfile(firstRequest), otherParty.party)
        .decision === 'accepted'
    ) {
      return
    }

    let nextDay = offerRequestToParty(day, first.requestId, first.partyId)
    nextDay = offerRequestToParty(nextDay, first.requestId, otherParty.id)

    expect(nextDay.offers.length).toBe(2)
    expect(nextDay.offers[1].requestId).toBe(first.requestId)
  })

  it('throws when re-offering the same request-party pair', () => {
    const day = generateTavernDay(TEST_SEED)
    const pair = findDeclinedPair(day)
    if (!pair) return

    const nextDay = offerRequestToParty(day, pair.requestId, pair.partyId)
    expect(() =>
      offerRequestToParty(nextDay, pair.requestId, pair.partyId),
    ).toThrow()
  })

  it('locks both request and party on acceptance', () => {
    const day = generateTavernDay(TEST_SEED)
    const pair = findAcceptedPair(day)
    if (!pair) return

    const nextDay = offerRequestToParty(day, pair.requestId, pair.partyId)

    const offer = nextDay.offers.find(
      (o) => o.requestId === pair.requestId && o.partyId === pair.partyId,
    )!
    expect(offer.decision).toBe('accepted')
    expect(nextDay.matches.some((m) => m.requestId === pair.requestId)).toBe(
      true,
    )
    const party = nextDay.parties.find((p) => p.id === pair.partyId)!
    expect(party.acceptedRequestId).toBe(pair.requestId)

    const otherRequest = nextDay.requests.find((r) => r.id !== pair.requestId)!
    expect(() =>
      offerRequestToParty(nextDay, otherRequest.id, pair.partyId),
    ).toThrow()
  })
})

describe('resolveTavernDay', () => {
  it('resolves matched requests and marks unmatched as notBrokered', () => {
    const day = generateTavernDay(TEST_SEED)
    const pair = findAcceptedPair(day)
    if (!pair) return

    const nextDay = offerRequestToParty(day, pair.requestId, pair.partyId)
    const results = resolveTavernDay(nextDay)

    expect(results.length).toBe(nextDay.requests.length)

    let resolvedCount = 0
    let notBrokeredCount = 0
    for (const result of results) {
      if (result.status === 'resolved') {
        resolvedCount++
        expect(result.report).toBeTruthy()
        expect(result.memberIds.length).toBe(4)
      } else {
        notBrokeredCount++
        expect(result.status).toBe('notBrokered')
        expect(result.memberIds).toEqual([])
      }
    }

    expect(resolvedCount).toBe(1)
    expect(notBrokeredCount).toBe(2)
  })

  it('resolves three accepted matches and runs expedition for each', () => {
    const day = generateTavernDay('three-matches-001')
    const nextDay = brokerAllRequests(day)

    if (nextDay.matches.length !== day.requests.length) {
      return
    }

    const results = resolveTavernDay(nextDay)
    expect(results.filter((r) => r.status === 'resolved').length).toBe(3)
  })

  it('throws when resolving an already resolved day', () => {
    const day = generateTavernDay(TEST_SEED)
    const resolved = { ...day, status: 'resolved' as const, results: [] }
    expect(() => resolveTavernDay(resolved)).toThrow('解決済み')
  })
})
