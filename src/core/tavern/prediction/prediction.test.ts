import { describe, expect, it, vi } from 'vitest'
import * as expeditionModule from '../../expedition/expedition.ts'
import type { ExpeditionResult } from '../../expedition/types.ts'
import { generateTavernDay } from '../dayGenerator.ts'
import { deepClone } from '../../util.ts'
import { evaluateOffer, toPublicRequestProfile } from '../acceptance.ts'
import { predictExpeditionOutcome } from './prediction.ts'
import { buildPredictionSeed } from './predictionSeed.ts'
import { EXPEDITION_PREDICTION_SAMPLES } from './types.ts'

function makeFixture(seed = 'prediction-test-day-001') {
  const day = generateTavernDay(seed)
  return {
    requestOffer: day.requests[0],
    party: day.parties[0].party,
    day,
  }
}

const mockResult = {
  request: { id: 'mock-request', seed: 'mock-seed' },
  outcome: 'success',
  state: { partyHp: {}, partyMp: {}, partyMorale: {} },
  party: [],
} as unknown as ExpeditionResult

describe('predictExpeditionOutcome', () => {
  it('is deterministic for the same fixture', () => {
    const { requestOffer, party } = makeFixture()
    const a = predictExpeditionOutcome(requestOffer, party, {
      sampleCount: 20,
    })
    const b = predictExpeditionOutcome(requestOffer, party, {
      sampleCount: 20,
    })
    expect(a).toEqual(b)
  })

  it('uses unique prediction seeds for each sample', () => {
    const requestId = 'request-x'
    const partyId = 'party-y'
    const seeds = new Set<string>()
    for (let i = 0; i < EXPEDITION_PREDICTION_SAMPLES; i++) {
      seeds.add(buildPredictionSeed(requestId, partyId, i))
    }
    expect(seeds.size).toBe(EXPEDITION_PREDICTION_SAMPLES)
  })

  it('does not mutate the original request or party', () => {
    const { requestOffer, party } = makeFixture()
    const beforeRequest = deepClone(requestOffer)
    const beforeParty = deepClone(party)
    predictExpeditionOutcome(requestOffer, party, { sampleCount: 20 })
    expect(requestOffer).toEqual(beforeRequest)
    expect(party).toEqual(beforeParty)
  })

  it('does not mutate a campaign when extracting request/party', () => {
    const day = generateTavernDay('prediction-campaign-day-001')
    const before = deepClone(day)
    predictExpeditionOutcome(day.requests[0], day.parties[0].party, {
      sampleCount: 20,
    })
    expect(day).toEqual(before)
  })

  it('keeps outcome counts summing to sampleCount', () => {
    const { requestOffer, party } = makeFixture()
    const prediction = predictExpeditionOutcome(requestOffer, party, {
      sampleCount: 200,
    })
    const sum = Object.values(prediction.counts).reduce((a, b) => a + b, 0)
    expect(sum).toBe(prediction.sampleCount)
    expect(sum).toBe(200)
  })

  it('keeps rates summing to approximately 1', () => {
    const { requestOffer, party } = makeFixture()
    const prediction = predictExpeditionOutcome(requestOffer, party, {
      sampleCount: 20,
    })
    const sum = Object.values(prediction.rates).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 10)
  })

  it('estimates success rate as completeSuccess + success only', () => {
    const { requestOffer, party } = makeFixture()
    const prediction = predictExpeditionOutcome(requestOffer, party, {
      sampleCount: 50,
    })
    expect(prediction.estimatedSuccessRate).toBe(
      (prediction.counts.completeSuccess + prediction.counts.success) /
        prediction.sampleCount,
    )
    expect(prediction.estimatedSuccessRate).toBeGreaterThanOrEqual(0)
    expect(prediction.estimatedSuccessRate).toBeLessThanOrEqual(1)
  })

  it('excludes partialSuccess from estimatedSuccessRate', () => {
    const spy = vi.spyOn(expeditionModule, 'runExpedition').mockReturnValue({
      ...mockResult,
      outcome: 'partialSuccess',
    } as unknown as ExpeditionResult)

    const { requestOffer, party } = makeFixture()
    const prediction = predictExpeditionOutcome(requestOffer, party, {
      sampleCount: 20,
    })
    expect(prediction.estimatedSuccessRate).toBe(0)
    expect(prediction.counts.partialSuccess).toBe(20)

    spy.mockRestore()
  })

  it('uses different sample seeds and varies outcomes for a natural fixture', () => {
    const { requestOffer, party } = makeFixture()
    const prediction = predictExpeditionOutcome(requestOffer, party, {
      sampleCount: 50,
    })
    const distinctOutcomes = new Set(
      Object.entries(prediction.counts)
        .filter(([, count]) => count > 0)
        .map(([outcome]) => outcome),
    )
    expect(distinctOutcomes.size).toBeGreaterThan(1)
  })

  it('audits each objective type using sample-specific request seeds', () => {
    const objectiveTypes = [
      'investigation',
      'elimination',
      'rescue',
      'escort',
      'retrieval',
      'survey',
    ] as const

    for (const type of objectiveTypes) {
      const day = generateTavernDay(`prediction-audit-${type}-001`)
      const requestOffer =
        day.requests.find((r) => r.objectiveType === type) ?? day.requests[0]
      const party = day.parties[0].party

      const seeds: string[] = []
      const spy = vi.spyOn(expeditionModule, 'runExpedition')
      spy.mockImplementation((request: { seed: string }) => {
        seeds.push(request.seed)
        return { ...mockResult, request } as unknown as ExpeditionResult
      })

      predictExpeditionOutcome(requestOffer, party, { sampleCount: 5 })

      expect(new Set(seeds).size).toBe(5)
      expect(seeds.every((s) => s.startsWith('prediction:v1:'))).toBe(true)
      expect(seeds[0]).not.toBe(requestOffer.expeditionRequest.seed)
      if (requestOffer.expeditionRequest.battle) {
        expect(seeds[0]).not.toBe(requestOffer.expeditionRequest.battle.seed)
      }

      spy.mockRestore()
    }
  })

  it('keeps actual expedition result unchanged after prediction', () => {
    const { requestOffer, party } = makeFixture()
    const before = expeditionModule.runExpedition(
      requestOffer.expeditionRequest,
      deepClone(party).members,
    )
    predictExpeditionOutcome(requestOffer, party, { sampleCount: 30 })
    const after = expeditionModule.runExpedition(
      requestOffer.expeditionRequest,
      deepClone(party).members,
    )
    expect(after.outcome).toBe(before.outcome)
    expect(after.request.seed).toBe(before.request.seed)
  })

  it('keeps acceptance evaluation unchanged after prediction', () => {
    const { requestOffer, party } = makeFixture()
    const profile = toPublicRequestProfile(requestOffer)
    const before = evaluateOffer(profile, party)
    predictExpeditionOutcome(requestOffer, party, { sampleCount: 20 })
    const after = evaluateOffer(profile, party)
    expect(after).toEqual(before)
  })

  it('passes current party condition into runExpedition', () => {
    const { requestOffer, party } = makeFixture()
    const damagedParty = deepClone(party)
    damagedParty.members[0].currentHp = 1

    const spy = vi.spyOn(expeditionModule, 'runExpedition')
    spy.mockReturnValue(mockResult)

    predictExpeditionOutcome(requestOffer, damagedParty, { sampleCount: 5 })

    expect(spy).toHaveBeenCalled()
    const passedParty = spy.mock.calls[0][1] as { currentHp: number }[]
    expect(passedParty[0].currentHp).toBe(1)

    spy.mockRestore()
  })
})
