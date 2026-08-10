import {
  getAffinityTier,
  getFinancialPressureTier,
  getPositiveBrokerageText,
} from '../../core/tavern/campaign/relationship.ts'
import type { TavernParty } from '../../core/tavern/types.ts'
import type {
  CharacterMemory,
  RelationshipMemory,
} from '../../core/narrative/types.ts'
import { OBJECTIVE_LABELS } from '../expedition/labels.ts'
import {
  countryLabel,
  genderLabel,
  speciesLabel,
} from '../../core/identity/labels.ts'
import { arcSignalSummary } from '../../core/narrative/arcSignals.ts'

export interface PartyCardProps {
  party: TavernParty
  selected: boolean
  disabled: boolean
  onClick: () => void
}

function recentArcsForParty(party: TavernParty): string[] {
  const memberMap = new Map(
    party.party.members.map((m) => [m.id, m.name ?? m.id]),
  )
  const signals = (party.arcSignals ?? [])
    .filter((s) => s.status !== 'fading' || s.strength > 30)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4)
  return signals.map((s) => arcSignalSummary(s, memberMap))
}

function recentMemoriesForMember(
  memberId: string,
  party: TavernParty,
): (CharacterMemory | RelationshipMemory)[] {
  const characterMemories = party.characterMemories?.[memberId] ?? []
  const relationshipMemories: RelationshipMemory[] = []
  for (const rel of Object.values(party.memberRelationships ?? {})) {
    if (!rel) continue
    if (
      rel.sourceCharacterId !== memberId &&
      rel.targetCharacterId !== memberId
    ) {
      continue
    }
    if (rel.recentEvents) {
      relationshipMemories.push(...rel.recentEvents)
    }
  }
  return [...characterMemories, ...relationshipMemories]
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, 2)
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
              {m.identity && (
                <>
                  {' '}
                  {speciesLabel(m.identity.species)}/
                  {countryLabel(m.identity.countryOfOrigin)}/
                  {genderLabel(m.identity.gender)}
                  {m.identity.regionOfOrigin
                    ? ` · ${m.identity.regionOfOrigin}`
                    : ''}
                  {m.lifeBackground?.formerOccupation
                    ? ` · 元${m.lifeBackground.formerOccupation}`
                    : ''}
                  {m.lifeBackground?.reasonForAdventuring
                    ? ` · ${m.lifeBackground.reasonForAdventuring}`
                    : ''}
                </>
              )}
            </small>
          </span>
        ))}
      </div>
      {(party.characterMemories || party.memberRelationships) && (
        <div className="party-recent-events">
          {ap.members
            .map((m) => {
              const memories = recentMemoriesForMember(m.id, party)
              if (memories.length === 0) return null
              return (
                <div key={m.id} className="member-recent-events">
                  <strong>{m.name}</strong> 最近の出来事：
                  {memories.map((mem) => mem.summary).join('；')}
                </div>
              )
            })
            .filter(Boolean)}
        </div>
      )}
      {party.arcSignals && party.arcSignals.length > 0 && (
        <div className="party-arc-signals">
          <strong>最近の関係傾向</strong>
          {recentArcsForParty(party).map((text, i) => (
            <div key={i}>{text}</div>
          ))}
        </div>
      )}
      {ap.missionSpecialization && (
        <div className="party-specialization">
          得意：{OBJECTIVE_LABELS[ap.missionSpecialization.strongObjective]} ·
          苦手：{OBJECTIVE_LABELS[ap.missionSpecialization.weakObjective]}
        </div>
      )}
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
