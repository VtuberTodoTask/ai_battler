import { useState } from 'react'
import { OUTCOME_LABELS } from '../expedition/labels.ts'
import type { TavernDayRecord } from '../../core/tavern/campaign/types.ts'

export interface CampaignHistoryProps {
  history: TavernDayRecord[]
}

export function CampaignHistory({ history }: CampaignHistoryProps) {
  const [expandedDay, setExpandedDay] = useState<number | null>(null)

  if (history.length === 0) return null

  return (
    <div className="campaign-history" data-testid="campaign-history">
      <h3>キャンペーン履歴</h3>
      <ul className="history-list">
        {history.map((record) => (
          <li key={record.dayNumber} className="history-entry">
            <button
              className="history-toggle"
              onClick={() =>
                setExpandedDay(
                  expandedDay === record.dayNumber ? null : record.dayNumber,
                )
              }
            >
              Day {record.dayNumber} — 評判 {record.reputationBefore} →{' '}
              {record.reputationAfter} (
              {record.reputationChange.appliedDelta >= 0 ? '+' : ''}
              {record.reputationChange.appliedDelta})
            </button>
            {expandedDay === record.dayNumber && (
              <div className="history-detail">
                <ul>
                  {record.results.map((r) => (
                    <li key={r.requestId}>
                      {r.request.title}:{' '}
                      {r.status === 'resolved' && r.report
                        ? OUTCOME_LABELS[r.report.outcome]
                        : '仲介不成立'}
                      {r.partyName && <span> — 《{r.partyName}》</span>}
                    </li>
                  ))}
                </ul>
                {record.partyEvents.length > 0 && (
                  <div className="history-events">
                    <strong>Party events:</strong>
                    <ul>
                      {record.partyEvents.map((e, i) => (
                        <li key={i}>
                          {eventLabel(e.type)}: 《{e.partyName}》
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    arrived: '到着',
    departedScheduled: '滞在期間満了で離脱',
    departedCasualty: '死亡者発生で離脱',
    startedRecovery: '療養開始',
    finishedRecovery: '療養完了',
  }
  return labels[type] ?? type
}
