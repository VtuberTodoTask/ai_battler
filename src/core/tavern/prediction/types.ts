import type { ExpeditionOutcome } from '../../expedition/types.ts'

export const EXPEDITION_PREDICTION_SAMPLES = 200
export const PREDICTION_MODEL_VERSION = 'v1'

export interface ExpeditionPrediction {
  requestId: string
  partyId: string

  modelVersion: string
  sampleCount: number

  estimatedSuccessRate: number

  counts: Record<ExpeditionOutcome, number>
  rates: Record<ExpeditionOutcome, number>
}

export interface PredictionKey {
  campaignSeed: string
  dayNumber: number
  requestId: string
  partyId: string
  modelVersion: string
  memberFingerprint: string
}

export type PredictionDangerLabel =
  '非常に有望' | '有望' | '五分以上' | '危険' | '非常に危険'
