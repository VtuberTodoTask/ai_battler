import {
  getAffinityTier,
  getFinancialPressureTier,
  getPositiveBrokerageText,
} from '../../core/tavern/campaign/relationship.ts'
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

  const isRecovering = party.availability === 'recovering'
  const isAccepted = party.acceptedRequestId !== undefined
  const isDisabled = disabled || isRecovering || isAccepted

  let status = '受諾可能'
  if (isRecovering) {
    status = `療養中${party.recoveryDaysRemaining !== undefined ? `（あと${party.recoveryDaysRemaining}日）` : ''}`
  } else if (isAccepted) {
    status = '受諾済み'
  }

  const relationship = party.relationship

  return (
    <div
      className={`tavern-card party-card ${selected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
      onClick={isDisabled ? undefined : onClick}
    >
      <div className="party-header">
        <h4>
          {party.isNew && <span className="new-badge">NEW </span>}《{ap.name}》
        </h4>
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
              ({m.rank} {m.role}) HP {m.currentHp}/{m.maxHp} MP {m.currentMp}/
              {m.maxMp} M {m.morale}
            </small>
          </span>
        ))}
      </div>
      <div className="party-meta">
        {party.arrivalDay !== undefined &&
          party.plannedDepartureDay !== undefined && (
            <span className="party-stay">
              滞在 {party.arrivalDay}〜{party.plannedDepartureDay}日
            </span>
          )}
        <span className={`party-status ${isRecovering ? 'recovering' : ''}`}>
          {status}
        </span>
      </div>
      {party.progression && (
        <div className="party-progression">
          成長 XP {party.progression.growthXp}/4 · 成長{' '}
          {party.progression.growthMilestones}回 · 鍛錬{' '}
          {party.progression.trainingDays}日
        </div>
      )}
      {relationship && (
        <div className="party-relationship">
          <div>
            お気に入り {relationship.affinity}/100（
            {getAffinityTier(relationship.affinity)}）
          </div>
          <div>
            懐事情 {relationship.financialPressure}/100（
            {getFinancialPressureTier(relationship.financialPressure)}）
          </div>
          <div>
            危険志向：
            {relationship.riskTolerance === 'cautious'
              ? '慎重'
              : relationship.riskTolerance === 'bold'
                ? '大胆'
                : '標準'}
          </div>
        </div>
      )}
      {party.stats && (
        <div className="party-brokerage-record">
          {getPositiveBrokerageText(party.stats)}
        </div>
      )}
    </div>
  )
}
