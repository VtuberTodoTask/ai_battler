import { useEffect, useMemo, useRef, useState } from 'react'
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
import { getPredictionLabel, OUTCOME_LABELS } from './predictionLabels.ts'

export interface ExpeditionPredictionPanelProps {
  requestOffer: TavernRequestOffer | null
  tavernParty: TavernParty | null
  sampleCount?: number
}

export function ExpeditionPredictionPanel({
  requestOffer,
  tavernParty,
  sampleCount = EXPEDITION_PREDICTION_SAMPLES,
}: ExpeditionPredictionPanelProps) {
  const [prediction, setPrediction] = useState<ExpeditionPrediction | null>(
    null,
  )
  const cacheRef = useRef<Map<string, ExpeditionPrediction>>(new Map())

  const canPredict = useMemo(() => {
    return (
      requestOffer !== null &&
      tavernParty !== null &&
      tavernParty.availability !== 'recovering'
    )
  }, [requestOffer, tavernParty])

  const currentKey = useMemo(() => {
    if (!canPredict || !requestOffer || !tavernParty) return null
    return buildPredictionCacheKey(requestOffer, tavernParty, sampleCount)
  }, [canPredict, requestOffer, tavernParty, sampleCount])

  const isMatch = useMemo(() => {
    if (!prediction || !requestOffer || !tavernParty) return false
    return (
      prediction.requestId === requestOffer.id &&
      prediction.partyId === tavernParty.id &&
      prediction.sampleCount === sampleCount
    )
  }, [prediction, requestOffer, tavernParty, sampleCount])

  useEffect(() => {
    if (!currentKey || !requestOffer || !tavernParty) {
      return undefined
    }

    const cached = cacheRef.current.get(currentKey)
    if (cached) {
      const handle = setTimeout(() => {
        setPrediction(cached)
      }, 0)
      return () => clearTimeout(handle)
    }

    const handle = setTimeout(() => {
      const next = predictExpeditionOutcome(requestOffer, tavernParty.party, {
        sampleCount,
      })
      cacheRef.current.set(currentKey, next)
      setPrediction(next)
    }, 0)

    return () => clearTimeout(handle)
  }, [currentKey, requestOffer, tavernParty, sampleCount])

  if (!requestOffer) {
    return (
      <div className="prediction-panel" data-testid="prediction-panel">
        <h4>遠征予測</h4>
        <p className="prediction-hint">
          依頼を選択すると遠征予測が表示されます
        </p>
      </div>
    )
  }

  if (!tavernParty) {
    return (
      <div className="prediction-panel" data-testid="prediction-panel">
        <h4>遠征予測</h4>
        <p className="prediction-hint">
          パーティを選択すると遠征見込みを確認できます
        </p>
      </div>
    )
  }

  if (tavernParty.availability === 'recovering') {
    return (
      <div className="prediction-panel" data-testid="prediction-panel">
        <h4>遠征予測</h4>
        <p className="prediction-hint">療養中のため遠征予測できません</p>
      </div>
    )
  }

  if (!isMatch || !prediction) {
    return (
      <div className="prediction-panel" data-testid="prediction-panel">
        <h4>遠征予測</h4>
        <p className="prediction-computing">遠征見込みを計算中…</p>
      </div>
    )
  }

  return (
    <div className="prediction-panel" data-testid="prediction-panel">
      <h4>遠征予測</h4>
      <div className="prediction-main">
        <div className="prediction-label">推定依頼達成率</div>
        <div className="prediction-rate" data-testid="prediction-rate">
          {Math.round(prediction.estimatedSuccessRate * 100)}%
        </div>
        <div className="prediction-danger" data-testid="prediction-danger">
          {getPredictionLabel(prediction.estimatedSuccessRate)}
        </div>
      </div>
      <p className="prediction-disclaimer">
        {prediction.sampleCount}回の仮想遠征による推定
      </p>
      <p className="prediction-disclaimer">
        予測値は多数の仮想遠征から算出した見込みです。
        実際の遠征結果を保証するものではありません。
      </p>
      <details className="prediction-breakdown">
        <summary>内訳を見る</summary>
        <ul>
          {(
            [
              'completeSuccess',
              'success',
              'partialSuccess',
              'failedObjective',
              'forcedRetreat',
              'lostExpedition',
            ] as const
          ).map((outcome) => (
            <li key={outcome}>
              <span className="outcome-name">{OUTCOME_LABELS[outcome]}</span>
              <span className="outcome-rate">
                {Math.round(prediction.rates[outcome] * 100)}%
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
