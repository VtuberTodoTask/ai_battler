import type { ResolvedDispatch } from '../../core/tavern/types.ts'
import { OUTCOME_LABELS, BATTLE_OUTCOME_LABELS } from '../expedition/labels.ts'

export interface DispatchResultsProps {
  results: ResolvedDispatch[]
  selectedResultId: string | null
  onSelectResult: (requestId: string) => void
}

export function DispatchResults({
  results,
  selectedResultId,
  onSelectResult,
}: DispatchResultsProps) {
  if (results.length === 0) return null

  return (
    <div className="dispatch-results">
      <h3>本日の仲介結果</h3>
      <div className="card-list">
        {results.map((result) => {
          const isBrokered = result.status === 'resolved'
          const outcomeText = isBrokered
            ? result.report
              ? `${OUTCOME_LABELS[result.report.outcome]} (${result.report.outcome})`
              : '解決済み'
            : '仲介不成立'
          return (
            <div
              key={result.requestId}
              className={`tavern-card result-card ${selectedResultId === result.requestId ? 'selected' : ''}`}
              onClick={() => onSelectResult(result.requestId)}
            >
              <h4>{result.request.title}</h4>
              <p>{outcomeText}</p>
              {result.partyName && <p>《{result.partyName}》</p>}
              {isBrokered && result.report?.battleOutcome && (
                <p>
                  戦闘: {BATTLE_OUTCOME_LABELS[result.report.battleOutcome]} (
                  {result.report.battleOutcome})
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
