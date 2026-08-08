import { OUTCOME_LABELS } from '../expedition/labels.ts'
import type { ReputationChangeSummary } from '../../core/tavern/campaign/types.ts'
import type { ResolvedDispatch } from '../../core/tavern/types.ts'

export interface CampaignResultSummaryProps {
  results: ResolvedDispatch[]
  reputationChange: ReputationChangeSummary
}

export function CampaignResultSummary({
  results,
  reputationChange,
}: CampaignResultSummaryProps) {
  return (
    <div
      className="campaign-result-summary"
      data-testid="campaign-result-summary"
    >
      <h3>本日の結果</h3>
      <ul>
        {results.map((r) => (
          <li key={r.requestId}>
            {r.request.title}:{' '}
            {r.status === 'resolved' && r.report
              ? `${OUTCOME_LABELS[r.report.outcome]} (${r.report.outcome})`
              : '仲介不成立'}
            {r.status === 'resolved' &&
              r.report &&
              (() => {
                const entry = reputationChange.entries.find(
                  (e) => e.requestId === r.requestId,
                )
                const delta = entry?.rawDelta
                if (delta === undefined) return null
                return (
                  <span className="reputation-delta">
                    {' '}
                    {delta >= 0 ? '+' : ''}
                    {delta}
                  </span>
                )
              })()}
            {r.partyName && <span> — 《{r.partyName}》</span>}
          </li>
        ))}
      </ul>
      <div className="reputation-total">
        本日の評判変化: {reputationChange.appliedDelta >= 0 ? '+' : ''}
        {reputationChange.appliedDelta} ({reputationChange.before} →{' '}
        {reputationChange.after})
      </div>
    </div>
  )
}
