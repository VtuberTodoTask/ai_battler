import type { Adventurer, StatusEffect } from '../../core/models/types.ts'
import type { ExpeditionResult } from '../../core/expedition/types.ts'

interface ExpeditionPartyPanelProps {
  result: ExpeditionResult
}

function statusLabel(a: Adventurer, result: ExpeditionResult): string {
  if (result.state.casualties.includes(a.id)) return '死亡'
  if (result.state.incapacitated.includes(a.id)) return '戦闘不能'
  return '正常'
}

function statusEffectsText(effects: StatusEffect[] | undefined): string {
  if (!effects || effects.length === 0) return 'なし'
  return effects.map((e) => e.type).join(', ')
}

export function ExpeditionPartyPanel({ result }: ExpeditionPartyPanelProps) {
  return (
    <div className="side-panel party-final-panel">
      <h3>パーティ最終状態</h3>
      <ul className="member-list">
        {result.party.map((a) => (
          <li key={a.id}>
            <strong>{a.name}</strong> / {a.role} / {a.rank}
            <br />
            HP {result.state.partyHp[a.id] ?? a.currentHp} / {a.maxHp}
            <br />
            MP {result.state.partyMp[a.id] ?? a.currentMp} / {a.maxMp}
            <br />
            Morale {result.state.partyMorale[a.id] ?? a.morale}
            <br />
            状態：{statusLabel(a, result)}
            <br />
            状態異常：{statusEffectsText(result.state.partyStatusEffects[a.id])}
          </li>
        ))}
      </ul>
    </div>
  )
}
