import type { ExpeditionResult } from '../../core/expedition/types.ts'
import { BATTLE_OUTCOME_LABELS } from './labels.ts'

interface ExpeditionBattlePanelProps {
  result: ExpeditionResult
}

export function ExpeditionBattlePanel({ result }: ExpeditionBattlePanelProps) {
  if (result.state.battles.length === 0) return null

  return (
    <div className="side-panel battle-panel">
      <h3>戦闘結果</h3>
      {result.state.battles.map((battle) => (
        <div key={battle.id} className="battle-summary">
          <div>
            <strong>敵編成</strong>
            <p>{battle.enemyComposition}</p>
          </div>
          <div>
            <strong>戦闘Outcome</strong>
            <p>
              {battle.outcome} {BATTLE_OUTCOME_LABELS[battle.outcome]}
            </p>
          </div>
          <div>
            <strong>ラウンド</strong>
            <p>{battle.rounds}</p>
          </div>
          <div>
            <strong>接敵</strong>
            <p>{battle.entrySnapshot.surprise}</p>
          </div>
          <div>
            <strong>生存者</strong>
            <p>{battle.survivingAdventurerIds.join(', ') || 'なし'}</p>
          </div>
          <div>
            <strong>戦闘不能</strong>
            <p>{battle.incapacitatedAdventurerIds.join(', ') || 'なし'}</p>
          </div>
          <div>
            <strong>戦死</strong>
            <p>{battle.deadAdventurerIds.join(', ') || 'なし'}</p>
          </div>
          <div>
            <strong>一致弱点</strong>
            <p>
              {battle.matchedWeaknessIntel.map((i) => i.name).join(', ') ||
                'なし'}
            </p>
          </div>
          <div>
            <strong>不一致弱点</strong>
            <p>
              {battle.unmatchedWeaknessIntel.map((i) => i.name).join(', ') ||
                'なし'}
            </p>
          </div>
          <div>
            <strong>一致能力</strong>
            <p>
              {battle.matchedAbilityIntel.map((i) => i.name).join(', ') ||
                'なし'}
            </p>
          </div>
          <div>
            <strong>不一致能力</strong>
            <p>
              {battle.unmatchedAbilityIntel.map((i) => i.name).join(', ') ||
                'なし'}
            </p>
          </div>
          <details>
            <summary>戦闘ログを開く</summary>
            <pre>{battle.result.logs.map((l) => l.result).join('\n')}</pre>
          </details>
        </div>
      ))}
    </div>
  )
}
