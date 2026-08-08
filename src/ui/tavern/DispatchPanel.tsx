import type {
  TavernAdventurer,
  TavernRequestOffer,
} from '../../core/tavern/types.ts'
import { OBJECTIVE_LABELS } from '../expedition/labels.ts'

export interface DispatchPanelProps {
  selectedRequest: TavernRequestOffer | null
  assignedAdventurers: TavernAdventurer[]
  canResolve: boolean
  warning?: string
  error?: string | null
  onResolve: () => void
}

export function DispatchPanel({
  selectedRequest,
  assignedAdventurers,
  canResolve,
  warning,
  error,
  onResolve,
}: DispatchPanelProps) {
  if (!selectedRequest) {
    return (
      <div className="dispatch-panel" data-testid="dispatch-panel">
        <p>依頼を選択して、編成する冒険者を選んでください。</p>
      </div>
    )
  }

  const roles = assignedAdventurers.map((a) => a.adventurer.role)

  return (
    <div className="dispatch-panel" data-testid="dispatch-panel">
      <h3>派遣編成: {selectedRequest.title}</h3>
      <div className="dispatch-meta">
        <span>{OBJECTIVE_LABELS[selectedRequest.objectiveType]}</span>
        <span className={`rank-badge rank-${selectedRequest.rank}`}>
          {selectedRequest.rank}
        </span>
        <span>
          編成: {assignedAdventurers.length} /{' '}
          {selectedRequest.recommendedPartySize}
        </span>
      </div>
      <div className="party-composition">
        <strong>パーティ構成:</strong>{' '}
        {assignedAdventurers.length === 0
          ? '未編成'
          : assignedAdventurers.map((a) => a.adventurer.name).join('、')}
      </div>
      <div className="party-roles">
        <strong>役割:</strong> {roles.join('、') || '—'}
      </div>
      {warning && <div className="dispatch-warning">{warning}</div>}
      {error && <div className="dispatch-error">{error}</div>}
      <button onClick={onResolve} disabled={!canResolve}>
        本日の派遣を実行
      </button>
    </div>
  )
}
