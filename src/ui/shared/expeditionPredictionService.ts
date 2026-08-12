import { predictExpeditionOutcome } from '../../core/tavern/prediction/prediction.ts'
import { buildPredictionCacheKey } from '../../core/tavern/prediction/predictionCacheKey.ts'
import {
  EXPEDITION_PREDICTION_SAMPLES,
  type ExpeditionPrediction,
} from '../../core/tavern/prediction/types.ts'
import type {
  TavernParty,
  TavernRequestOffer,
} from '../../core/tavern/types.ts'

export interface ExpeditionPredictionOptions {
  sampleCount?: number
}

const cache = new Map<string, ExpeditionPrediction>()
const pending = new Map<string, Promise<ExpeditionPrediction>>()

export function getExpeditionPrediction(
  requestOffer: TavernRequestOffer,
  tavernParty: TavernParty,
  options?: ExpeditionPredictionOptions,
): Promise<ExpeditionPrediction> {
  const sampleCount = options?.sampleCount ?? EXPEDITION_PREDICTION_SAMPLES
  const key = buildPredictionCacheKey(requestOffer, tavernParty, sampleCount)

  const cached = cache.get(key)
  if (cached) {
    return Promise.resolve(cached)
  }

  const existing = pending.get(key)
  if (existing) {
    return existing
  }

  const promise = new Promise<ExpeditionPrediction>((resolve) => {
    setTimeout(() => {
      const result = predictExpeditionOutcome(requestOffer, tavernParty.party, {
        sampleCount,
      })
      cache.set(key, result)
      pending.delete(key)
      resolve(result)
    }, 0)
  })

  pending.set(key, promise)
  return promise
}

export function invalidateExpeditionPredictionCache(): void {
  cache.clear()
  pending.clear()
}

export function expeditionPredictionCacheSize(): number {
  return cache.size
}
