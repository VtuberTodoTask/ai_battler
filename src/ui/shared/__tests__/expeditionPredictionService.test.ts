// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { generateTavernDay } from '../../../core/tavern/dayGenerator.ts'
import {
  expeditionPredictionCacheSize,
  getExpeditionPrediction,
  invalidateExpeditionPredictionCache,
} from '../expeditionPredictionService.ts'

describe('expeditionPredictionService', () => {
  it('returns the same result for the same party × quest', async () => {
    const day = generateTavernDay('svc-cached')
    const requestOffer = day.requests[0]!
    const party = day.parties[0]!

    const a = await getExpeditionPrediction(requestOffer, party, {
      sampleCount: 50,
    })
    const b = await getExpeditionPrediction(requestOffer, party, {
      sampleCount: 50,
    })
    expect(a).toBe(b)
  })

  it(
    'produces different results for different party × quest pairs',
    { timeout: 60000 },
    async () => {
      const day = generateTavernDay('svc-different')
      const requestOffer = day.requests[0]!
      const party = day.parties[0]!
      const otherRequest = day.requests[1]!

      const a = await getExpeditionPrediction(requestOffer, party)
      const b = await getExpeditionPrediction(otherRequest, party)

      expect(a.requestId).not.toBe(b.requestId)
      expect(a.estimatedSuccessRate).toBeGreaterThanOrEqual(0)
      expect(a.estimatedSuccessRate).toBeLessThanOrEqual(1)
    },
  )

  it('reuses the cached result across separate calls', async () => {
    invalidateExpeditionPredictionCache()
    const day = generateTavernDay('svc-share')
    const requestOffer = day.requests[0]!
    const party = day.parties[0]!

    await getExpeditionPrediction(requestOffer, party, { sampleCount: 50 })
    const sizeBefore = expeditionPredictionCacheSize()
    await getExpeditionPrediction(requestOffer, party, { sampleCount: 50 })
    expect(expeditionPredictionCacheSize()).toBe(sizeBefore)
  })

  it('keeps sample count consistent with the request', async () => {
    const day = generateTavernDay('svc-sample')
    const requestOffer = day.requests[0]!
    const party = day.parties[0]!

    const result = await getExpeditionPrediction(requestOffer, party, {
      sampleCount: 50,
    })
    expect(result.sampleCount).toBe(50)
  })

  it('does not mutate campaign state', async () => {
    const day = generateTavernDay('svc-immutable')
    const requestOffer = day.requests[0]!
    const party = day.parties[0]!
    const memberHpBefore = party.party.members[0]!.currentHp

    await getExpeditionPrediction(requestOffer, party, { sampleCount: 20 })
    expect(party.party.members[0]!.currentHp).toBe(memberHpBefore)
  })
})
