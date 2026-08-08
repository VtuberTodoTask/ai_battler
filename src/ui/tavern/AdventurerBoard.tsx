import type {
  TavernAdventurer,
  TavernRequestOffer,
} from '../../core/tavern/types.ts'
import { AdventurerCard } from './AdventurerCard.tsx'

export interface AdventurerBoardProps {
  adventurers: TavernAdventurer[]
  requests: TavernRequestOffer[]
  selectedRequestId: string | null
  readOnly?: boolean
  onToggleAdventurer: (adventurerId: string) => void
}

export function AdventurerBoard({
  adventurers,
  requests,
  selectedRequestId,
  readOnly = false,
  onToggleAdventurer,
}: AdventurerBoardProps) {
  const requestTitleById = new Map(requests.map((r) => [r.id, r.title]))
  return (
    <div className="board adventurer-board" data-testid="adventurer-board">
      <h3>冒険者一覧</h3>
      <div className="card-list">
        {adventurers.map((ta) => {
          const selected =
            selectedRequestId !== null &&
            ta.assignedRequestId === selectedRequestId
          const disabled =
            readOnly ||
            (selectedRequestId !== null &&
              ta.assignedRequestId !== undefined &&
              ta.assignedRequestId !== selectedRequestId)
          return (
            <AdventurerCard
              key={ta.id}
              tavernAdventurer={ta}
              assignedRequestTitle={
                ta.assignedRequestId
                  ? requestTitleById.get(ta.assignedRequestId)
                  : undefined
              }
              selected={selected}
              disabled={disabled}
              onClick={() => onToggleAdventurer(ta.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
