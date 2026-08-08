import type { ResolvedDispatch } from '../../core/tavern/types.ts'
import { ExpeditionResultSummary } from '../expedition/ExpeditionResultSummary.tsx'
import { ExpeditionBattlePanel } from '../expedition/ExpeditionBattlePanel.tsx'
import { ExpeditionObjectivePanel } from '../expedition/ExpeditionObjectivePanel.tsx'

export interface TavernResultDetailProps {
  resolved: ResolvedDispatch
}

export function TavernResultDetail({ resolved }: TavernResultDetailProps) {
  if (resolved.status === 'notBrokered') {
    return (
      <div className="result-detail not-brokered">
        <h3>{resolved.request.title}</h3>
        <p>この依頼には成立したパーティがありませんでした。</p>
      </div>
    )
  }

  if (!resolved.result || !resolved.report) {
    return (
      <div className="result-detail">
        <h3>{resolved.request.title}</h3>
        <p>結果がありません。</p>
      </div>
    )
  }

  const report = resolved.report
  const result = resolved.result

  return (
    <div className="result-detail">
      <h3>{resolved.request.title}</h3>

      <div className="result-sections">
        <ExpeditionResultSummary result={result} />

        <div className="result-section">
          <h4>受諾パーティ</h4>
          {resolved.partyName && <p>《{resolved.partyName}》</p>}
          {resolved.leaderName && (
            <p>
              Leader: {resolved.leaderName} ({resolved.memberIds.length}名)
            </p>
          )}
          <ul className="party-list">
            {report.party.map((p) => (
              <li key={p.adventurerId}>
                {p.name} ({p.role} {p.rank}) — HP {p.finalHp}/{p.maxHp} MP{' '}
                {p.finalMp}/{p.maxMp} Morale {p.finalMorale}
                {p.dead ? ' [死亡]' : p.incapacitated ? ' [戦闘不能]' : ''}
              </li>
            ))}
          </ul>
        </div>

        <div className="result-section">
          <h4>重要facts</h4>
          <ul>
            {report.keyFacts.map((fact, i) => (
              <li key={i}>{fact}</li>
            ))}
          </ul>
        </div>

        <ExpeditionBattlePanel result={result} />
        <ExpeditionObjectivePanel objective={result.state.objectiveState} />
      </div>
    </div>
  )
}
