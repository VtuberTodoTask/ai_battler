import { useState } from 'react'
import { OUTCOME_LABELS } from '../expedition/labels.ts'
import type { TavernDayRecord } from '../../core/tavern/campaign/types.ts'
import type {
  CampaignProgressionEvent,
  CampaignRelationshipEvent,
} from '../../core/tavern/campaign/types.ts'
import type { NarrativeCandidate } from '../../core/narrative/types.ts'

export interface CampaignHistoryProps {
  history: TavernDayRecord[]
  candidates?: NarrativeCandidate[]
}

export function CampaignHistory({
  history,
  candidates = [],
}: CampaignHistoryProps) {
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
                {record.relationshipEvents.length > 0 && (
                  <div className="history-events">
                    <strong>Relationship:</strong>
                    <ul>
                      {record.relationshipEvents.map((e, i) => (
                        <li key={i}>{relationshipLabel(e)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {record.progressionEvents.length > 0 && (
                  <div className="history-events">
                    <strong>成長 / 鍛錬:</strong>
                    <ul>
                      {record.progressionEvents.map((e, i) => (
                        <li key={i}>{progressionLabel(e)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <DayNarrativeCandidates
                  dayNumber={record.dayNumber}
                  candidates={candidates}
                />
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

function relationshipLabel(event: CampaignRelationshipEvent): string {
  switch (event.type) {
    case 'affinityChanged':
      return `《${event.partyName}》 お気に入り ${event.before} → ${event.after} (${outcomeLabel(event.outcome)})`
    case 'financialPressureChanged':
      return `《${event.partyName}》 懐事情 ${event.before} → ${event.after} (${sourceLabel(event.source)})`
    case 'stayExtended': {
      const reasonLabel = stayExtensionReasonLabel(event.primaryReason)
      return `《${event.partyName}》 滞在 +${event.extensionDays}日 / 理由：${reasonLabel}（Day ${event.previousDepartureDay} → ${event.newDepartureDay}）`
    }
    default:
      return `《${(event as CampaignRelationshipEvent).partyName}》 ${(event as CampaignRelationshipEvent).type}`
  }
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    expedition: '遠征結果',
    idle: '仕事なし',
    recovery: '療養',
  }
  return labels[source] ?? source
}

function stayExtensionReasonLabel(reason: string | undefined): string {
  const labels: Record<string, string> = {
    training: '訓練',
    recovery: '回復',
    equipment_preparation: '装備準備',
    party_coordination: 'パーティ連携',
    resource_preparation: '物資準備',
    waiting_for_work: '仕事待ち',
    personal_preference: '個人的希望',
    mixed: '複合',
  }
  return labels[reason ?? ''] ?? reason ?? '—'
}

function outcomeLabel(outcome: string): string {
  const labels: Record<string, string> = {
    completeSuccess: '完全成功',
    success: '成功',
    partialSuccess: '部分成功',
    failedObjective: '失敗',
    forcedRetreat: '強制撤退',
    lostExpedition: '全滅',
  }
  return labels[outcome] ?? outcome
}

function progressionLabel(event: CampaignProgressionEvent): string {
  switch (event.type) {
    case 'experienceGained':
      return `《${event.partyName}》 ${sourceLabelExpedition(event.source)} +${event.amount} XP (計 ${event.totalGrowthXpAfter})`
    case 'training':
      return `《${event.partyName}》 自主鍛錬 +${event.amount} XP`
    case 'skillImproved':
      return `${event.memberName}: ${event.skill} ${event.before} → ${event.after}`
    case 'progressionSkipped':
      return `《${event.partyName}》 成長スキップ (${event.reason})`
    default:
      return `《${(event as CampaignProgressionEvent).partyName}》 ${(event as CampaignProgressionEvent).type}`
  }
}

function sourceLabelExpedition(source: string): string {
  const labels: Record<string, string> = {
    completeSuccess: '完全成功',
    success: '成功',
    partialSuccess: '部分成功',
    failedObjective: '失敗',
    forcedRetreat: '強制撤退',
    training: '自主鍛錬',
  }
  return labels[source] ?? source
}

function DayNarrativeCandidates({
  dayNumber,
  candidates,
}: {
  dayNumber: number
  candidates: NarrativeCandidate[]
}) {
  const dayCandidates = candidates.filter((c) => c.dayNumber === dayNumber)
  if (dayCandidates.length === 0) return null
  return (
    <div className="history-events">
      <strong>AI文章候補:</strong>
      <ul>
        {dayCandidates.map((c) => (
          <li key={c.id}>
            {c.title} —{' '}
            {c.state === 'generated'
              ? '生成済み'
              : c.state === 'dismissed'
                ? '非表示'
                : '未生成'}
          </li>
        ))}
      </ul>
    </div>
  )
}
