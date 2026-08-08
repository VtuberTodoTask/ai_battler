import type {
  TavernDayState,
  TavernRequestOffer,
} from '../../core/tavern/types.ts'
import { RequestCard } from './RequestCard.tsx'

export interface RequestBoardProps {
  day: TavernDayState
  selectedRequestId: string | null
  onSelectRequest: (id: string) => void
}

export function RequestBoard({
  day,
  selectedRequestId,
  onSelectRequest,
}: RequestBoardProps) {
  return (
    <div className="board request-board" data-testid="request-board">
      <h3>依頼板</h3>
      <div className="card-list">
        {day.requests.map((request: TavernRequestOffer) => {
          const offerCount = day.offers.filter(
            (o) => o.requestId === request.id,
          ).length
          const matched = day.matches.some((m) => m.requestId === request.id)
          return (
            <RequestCard
              key={request.id}
              request={request}
              offerCount={offerCount}
              matched={matched}
              selected={selectedRequestId === request.id}
              onClick={() => onSelectRequest(request.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
