import type { PredictionDangerLabel } from '../../core/tavern/prediction/types.ts'

export function getPredictionLabel(rate: number): PredictionDangerLabel {
  if (rate >= 0.8) return '非常に有望'
  if (rate >= 0.65) return '有望'
  if (rate >= 0.5) return '五分以上'
  if (rate >= 0.35) return '危険'
  return '非常に危険'
}

export const OUTCOME_LABELS: Record<string, string> = {
  completeSuccess: '完全成功',
  success: '成功',
  partialSuccess: '部分成功',
  failedObjective: '依頼失敗',
  forcedRetreat: '撤退',
  lostExpedition: '遠征隊壊滅',
}
