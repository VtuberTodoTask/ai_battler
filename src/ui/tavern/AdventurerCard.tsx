import type { TavernAdventurer } from '../../core/tavern/types.ts'

export interface AdventurerCardProps {
  tavernAdventurer: TavernAdventurer
  assignedRequestTitle?: string
  selected: boolean
  disabled: boolean
  onClick: () => void
}

export function AdventurerCard({
  tavernAdventurer,
  assignedRequestTitle,
  selected,
  disabled,
  onClick,
}: AdventurerCardProps) {
  const { adventurer, assignedRequestId } = tavernAdventurer
  const roleLabel = `${adventurer.role}`
  const status = assignedRequestId
    ? assignedRequestTitle
      ? `${assignedRequestTitle}へ編成済み`
      : '他の依頼へ編成済み'
    : '未編成'

  return (
    <div
      className={`tavern-card adventurer-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
    >
      <div className="adventurer-header">
        <h4>{adventurer.name}</h4>
        <span className={`rank-badge rank-${adventurer.rank}`}>
          {adventurer.rank}
        </span>
      </div>
      <div className="adventurer-role">{roleLabel}</div>
      <div className="adventurer-stats">
        HP {adventurer.currentHp}/{adventurer.maxHp} | MP {adventurer.currentMp}
        /{adventurer.maxMp} | 士気 {adventurer.morale}
      </div>
      <div className="adventurer-skills">
        <small>
          STR{adventurer.stats.str} CON{adventurer.stats.con} DEX
          {adventurer.stats.dex} INT{adventurer.stats.int} PER
          {adventurer.stats.per} WIL{adventurer.stats.wil} SOC
          {adventurer.stats.soc}
        </small>
      </div>
      <div className="assignment-status">{status}</div>
    </div>
  )
}
