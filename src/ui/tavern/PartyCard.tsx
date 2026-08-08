import type { TavernParty } from '../../core/tavern/types.ts'

export interface PartyCardProps {
  party: TavernParty
  selected: boolean
  disabled: boolean
  onClick: () => void
}

export function PartyCard({
  party,
  selected,
  disabled,
  onClick,
}: PartyCardProps) {
  const { party: ap } = party
  const leader = ap.members.find((m) => m.id === ap.leaderId)

  const status = party.acceptedRequestId ? '受諾済み' : '受諾可能'

  return (
    <div
      className={`tavern-card party-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
    >
      <div className="party-header">
        <h4>《{ap.name}》</h4>
        <span className={`rank-badge rank-${ap.rank}`}>{ap.rank}</span>
      </div>
      <div className="party-leader">
        Leader: {leader?.name ?? '—'} ({leader?.role ?? '—'})
      </div>
      <div className="party-members">
        {ap.members.map((m) => (
          <span key={m.id} className="party-member">
            {m.name}{' '}
            <small>
              ({m.rank} {m.role})
            </small>
          </span>
        ))}
      </div>
      <div className="party-status">{status}</div>
    </div>
  )
}
