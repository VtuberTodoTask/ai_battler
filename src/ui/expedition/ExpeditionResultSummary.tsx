import type { ExpeditionResult } from '../../core/expedition/types.ts'
import { BATTLE_OUTCOME_LABELS, OUTCOME_LABELS } from './labels.ts'

interface ExpeditionResultSummaryProps {
  result: ExpeditionResult
}

export function ExpeditionResultSummary({
  result,
}: ExpeditionResultSummaryProps) {
  const state = result.state
  const survivors = result.party.filter(
    (a) => !state.casualties.includes(a.id),
  ).length
  const dead = state.casualties.length
  const incapacitated = state.incapacitated.length
  const battleOutcome = state.battles[0]?.outcome

  return (
    <div className="final-result">
      <h3>最終結果</h3>
      <p>依頼タイプ: {result.request.objectiveType}</p>
      <p>
        依頼結果:{' '}
        <span className={`outcome-badge ${result.outcome}`}>
          {OUTCOME_LABELS[result.outcome]}
        </span>{' '}
        ({result.outcome})
      </p>
      <p>Objective completed: {state.objectiveCompleted ? 'はい' : 'いいえ'}</p>
      <p>Objective progress: {state.objectiveProgress}%</p>
      {battleOutcome && (
        <p>
          戦闘結果: {battleOutcome} {BATTLE_OUTCOME_LABELS[battleOutcome]}
        </p>
      )}
      <p>経過時間: {state.elapsedTime}</p>
      <p>
        食料: {state.supplies.food} / 薬: {state.supplies.medicine} / 道具:{' '}
        {state.supplies.tools}
      </p>
      <p>
        生存者数: {survivors} / 戦闘不能: {incapacitated} / 死亡: {dead}
      </p>
      <p>
        負傷一覧:{' '}
        {state.injuries.length === 0
          ? 'なし'
          : state.injuries
              .map((i) => `${i.adventurerId}(${i.type})`)
              .join(', ')}
      </p>
    </div>
  )
}
