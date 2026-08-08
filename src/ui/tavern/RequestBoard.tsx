import type {
  DispatchAssignment,
  ResolvedDispatch,
  TavernRequestOffer,
} from '../../core/tavern/types.ts'
import { OUTCOME_LABELS } from '../expedition/labels.ts'
import { RequestCard } from './RequestCard.tsx'

export interface RequestBoardProps {
  requests: TavernRequestOffer[]
  assignments: DispatchAssignment[]
  selectedRequestId: string | null
  results: ResolvedDispatch[]
  onSelectRequest: (id: string) => void
}

export function RequestBoard({
  requests,
  assignments,
  selectedRequestId,
  results,
  onSelectRequest,
}: RequestBoardProps) {
  return (
    <div className="board request-board" data-testid="request-board">
      <h3>依頼板</h3>
      <div className="card-list">
        {requests.map((request) => {
          const assigned =
            assignments.find((a) => a.requestId === request.id)
              ?.adventurerIds ?? []
          const resolved = results.find((r) => r.requestId === request.id)
          const outcome = resolved?.report
            ? OUTCOME_LABELS[resolved.report.outcome]
            : resolved?.status === 'notDispatched'
              ? '未派遣'
              : undefined
          return (
            <RequestCard
              key={request.id}
              request={request}
              assignedCount={assigned.length}
              selected={selectedRequestId === request.id}
              resolved={resolved !== undefined}
              outcome={outcome}
              onClick={() => onSelectRequest(request.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
