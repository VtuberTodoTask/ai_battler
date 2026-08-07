import type { ReplayItem } from './replay.ts'
import {
  buildAdventurerMap,
  buildTargetNameMap,
  resolveActorName,
  resolveTargetName,
} from './names.ts'
import { CHECK_RESULT_LABELS, PHASE_LABELS } from './labels.ts'
import type { ExpeditionResult } from '../../core/expedition/types.ts'

interface ExpeditionEventDetailProps {
  item: ReplayItem | null
  result: ExpeditionResult
}

export function ExpeditionEventDetail({
  item,
  result,
}: ExpeditionEventDetailProps) {
  const partyMap = buildAdventurerMap(result.party)
  const targetMap = buildTargetNameMap(result.state.objectiveState)

  if (!item) {
    return (
      <div className="detail-panel">
        <h3>イベント詳細</h3>
        <p>イベントを選択してください</p>
      </div>
    )
  }

  if (item.kind === 'summary') {
    return (
      <div className="detail-panel">
        <h3>最終結果</h3>
        <p>Outcome: {item.outcome}</p>
        <p>Objective completed: {item.completed ? 'はい' : 'いいえ'}</p>
        <p>Objective progress: {item.progress}%</p>
      </div>
    )
  }

  const event = item.event
  const actors = event.actorIds.map((id) => resolveActorName(id, partyMap))
  const targets = event.targetIds.map((id) => resolveTargetName(id, targetMap))

  return (
    <div className="detail-panel">
      <h3>イベント詳細</h3>
      <p className="event-phase">{PHASE_LABELS[event.phase] ?? event.phase}</p>
      <p className="event-type">{event.type}</p>

      <div className="event-actors">
        <h4>Actor</h4>
        {actors.length === 0 ? <p>なし</p> : <p>{actors.join(', ')}</p>}
      </div>

      <div className="event-targets">
        <h4>Target</h4>
        {targets.length === 0 ? <p>なし</p> : <p>{targets.join(', ')}</p>}
      </div>

      <div className="event-facts">
        <h4>Facts</h4>
        {event.facts.length === 0 ? (
          <p>なし</p>
        ) : (
          <ul>
            {event.facts.map((fact, i) => (
              <li key={i}>{fact}</li>
            ))}
          </ul>
        )}
      </div>

      {event.check && (
        <div className="check-detail">
          <h4>判定</h4>
          <p>使用技能: {event.check.skill}</p>
          <p>有効値: {event.check.effectiveValue}</p>
          <p>Roll: {event.check.roll}</p>
          <p>
            結果: {CHECK_RESULT_LABELS[event.check.result]} (
            {event.check.result})
          </p>
        </div>
      )}

      <div className="event-effects">
        <h4>Effects</h4>
        {event.effects.length === 0 ? (
          <p>なし</p>
        ) : (
          <ul className="effect-list">
            {event.effects.map((effect, i) => (
              <li key={i}>
                {effect.type} = {String(effect.value)}{' '}
                {effect.targetId
                  ? `(target: ${resolveTargetName(effect.targetId, targetMap)})`
                  : ''}
                {effect.metadata && (
                  <details>
                    <summary>metadata</summary>
                    <pre>{JSON.stringify(effect.metadata, null, 2)}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
