import { OUTCOME_LABELS } from '../expedition/labels.ts'
import type {
  DayReputationSummary,
  TavernReputationEvent,
} from '../../core/tavern/campaign/types.ts'
import type { ResolvedDispatch } from '../../core/tavern/types.ts'

export interface CampaignResultSummaryProps {
  results: ResolvedDispatch[]
  reputationSummary: DayReputationSummary
  reputationEvents: TavernReputationEvent[]
}

export function CampaignResultSummary({
  results,
  reputationSummary,
  reputationEvents,
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
                const event = reputationEvents.find(
                  (e) => e.source.requestId === r.requestId,
                )
                const delta = event?.delta
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
        本日の評判変化: {reputationSummary.delta >= 0 ? '+' : ''}
        {reputationSummary.delta} ({reputationSummary.beforeScore} →{' '}
        {reputationSummary.afterScore})
      </div>
    </div>
  )
}
