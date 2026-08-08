import type { TavernRequestOffer } from '../../core/tavern/types.ts'
import { OBJECTIVE_LABELS } from '../expedition/labels.ts'

export interface RequestCardProps {
  request: TavernRequestOffer
  offerCount: number
  matched: boolean
  selected: boolean
  onClick: () => void
}

export function RequestCard({
  request,
  offerCount,
  matched,
  selected,
  onClick,
}: RequestCardProps) {
  const status = matched
    ? '成立'
    : offerCount > 0
      ? `紹介履歴: ${offerCount}`
      : '未紹介'

  return (
    <div
      className={`tavern-card request-card ${selected ? 'selected' : ''}`}
      onClick={onClick}
    >
      <div className="request-header">
        <h4>{request.title}</h4>
        <span className={`rank-badge rank-${request.rank}`}>
          {request.rank}
        </span>
      </div>
      <div className="request-meta">
        <span className="objective-type">
          {OBJECTIVE_LABELS[request.objectiveType]}
        </span>
        <span className="environment">{request.environment}</span>
      </div>
      <p className="briefing">{request.briefing}</p>
      <div className="tags">
        {request.publicTags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
      <div className="request-footer">
        <span className="request-status">{status}</span>
      </div>
    </div>
  )
}
