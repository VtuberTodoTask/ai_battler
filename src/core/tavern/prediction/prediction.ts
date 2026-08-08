import { runExpedition } from '../../expedition/expedition.ts'
import { deepClone } from '../../util.ts'
import type { AdventurerParty } from '../types.ts'
import type { TavernRequestOffer } from '../types.ts'
import {
  EXPEDITION_PREDICTION_SAMPLES,
  PREDICTION_MODEL_VERSION,
  type ExpeditionPrediction,
} from './types.ts'
import { buildPredictionSeed } from './predictionSeed.ts'

export function predictExpeditionOutcome(
  requestOffer: TavernRequestOffer,
  party: AdventurerParty,
  options?: { sampleCount?: number },
): ExpeditionPrediction {
  const sampleCount = options?.sampleCount ?? EXPEDITION_PREDICTION_SAMPLES

  const requestId = requestOffer.id
  const partyId = party.id
  const originalRequest = requestOffer.expeditionRequest

  const counts = {
    completeSuccess: 0,
    success: 0,
    partialSuccess: 0,
    failedObjective: 0,
    forcedRetreat: 0,
    lostExpedition: 0,
  } as Record<string, number>

  for (let i = 0; i < sampleCount; i++) {
    const sampleSeed = buildPredictionSeed(requestId, partyId, i)
    const sampleRequest = deepClone(originalRequest)
    sampleRequest.seed = sampleSeed
    if (sampleRequest.battle) {
      sampleRequest.battle.seed = `${sampleSeed}:battle:0`
    }

    const sampleParty = deepClone(party)
    const result = runExpedition(sampleRequest, sampleParty.members)
    counts[result.outcome] += 1
  }

  const rates = {
    completeSuccess: 0,
    success: 0,
    partialSuccess: 0,
    failedObjective: 0,
    forcedRetreat: 0,
    lostExpedition: 0,
  } as Record<string, number>

  for (const outcome of Object.keys(counts)) {
    rates[outcome] = counts[outcome] / sampleCount
  }

  const estimatedSuccessRate =
    (counts.completeSuccess + counts.success) / sampleCount

  return {
    requestId,
    partyId,
    modelVersion: PREDICTION_MODEL_VERSION,
    sampleCount,
    estimatedSuccessRate,
    counts: counts as ExpeditionPrediction['counts'],
    rates: rates as ExpeditionPrediction['rates'],
  }
}
