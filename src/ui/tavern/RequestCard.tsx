import type { TavernRequestOffer } from '../../core/tavern/types.ts'
import { OBJECTIVE_LABELS } from '../expedition/labels.ts'

export interface RequestCardProps {
  request: TavernRequestOffer
  assignedCount: number
  selected: boolean
  resolved?: boolean
  outcome?: string
  onClick: () => void
}

export function RequestCard({
  request,
  assignedCount,
  selected,
  resolved,
  outcome,
  onClick,
}: RequestCardProps) {
  const full = assignedCount >= request.recommendedPartySize

  return (
    <div
      className={`tavern-card request-card ${selected ? 'selected' : ''} ${full ? 'full' : ''}`}
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
        <span className="assigned-count">
          編成: {assignedCount} / {request.recommendedPartySize}
        </span>
        {resolved && outcome && (
          <span className="outcome-label">{outcome}</span>
        )}
      </div>
    </div>
  )
}
