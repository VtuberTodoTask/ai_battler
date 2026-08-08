import type { TavernParty } from '../../core/tavern/types.ts'
import { PartyCard } from './PartyCard.tsx'

export interface PartyBoardProps {
  parties: TavernParty[]
  selectedPartyId: string | null
  disabled: boolean
  onSelectParty: (id: string) => void
}

export function PartyBoard({
  parties,
  selectedPartyId,
  disabled,
  onSelectParty,
}: PartyBoardProps) {
  return (
    <div className="board party-board" data-testid="party-board">
      <h3>滞在パーティ</h3>
      <div className="card-list">
        {parties.map((tavernParty) => (
          <PartyCard
            key={tavernParty.id}
            party={tavernParty}
            selected={selectedPartyId === tavernParty.id}
            disabled={disabled}
            onClick={() => onSelectParty(tavernParty.id)}
          />
        ))}
      </div>
    </div>
  )
}
