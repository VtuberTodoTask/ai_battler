import { PREDICTION_MODEL_VERSION } from './types.ts'

export function buildPredictionSeed(
  requestId: string,
  partyId: string,
  index: number,
): string {
  return `prediction:${PREDICTION_MODEL_VERSION}:${requestId}:${partyId}:${index}`
}
