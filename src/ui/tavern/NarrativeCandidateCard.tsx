import { useState } from 'react'
import { buildNarrativePrompt } from '../../core/narrative/prompt.ts'
import type {
  NarrativeCandidate,
  NarrativeGenerationRecord,
} from '../../core/narrative/types.ts'
import { NarrativeGenerationView } from './NarrativeGenerationView.tsx'

function formatContext(context: NarrativeCandidate['context']): string {
  return JSON.stringify(context, null, 2)
}

export interface NarrativeCandidateCardProps {
  candidate: NarrativeCandidate
  generation: NarrativeGenerationRecord | undefined
  selected: boolean
  generating: boolean
  onToggle: () => void
  onGenerate: () => void
  onRegenerate: () => void
  onDismiss: () => void
  onRestore: () => void
}

const STATE_LABELS = {
  available: '未生成',
  generated: '生成済み',
  dismissed: '非表示',
}

export function NarrativeCandidateCard({
  candidate,
  generation,
  selected,
  generating,
  onToggle,
  onGenerate,
  onRegenerate,
  onDismiss,
  onRestore,
}: NarrativeCandidateCardProps) {
  const [showPrompt, setShowPrompt] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  const prompt = buildNarrativePrompt(candidate.context)
  const rawContext = formatContext(candidate.context)

  const canSelect = candidate.state === 'available' && !generating

  return (
    <div
      className={`narrative-candidate ${candidate.state} ${generating ? 'generating' : ''}`}
      data-testid="narrative-candidate"
      data-candidate-id={candidate.id}
    >
      <div className="narrative-candidate-header">
        <input
          type="checkbox"
          checked={selected}
          onChange={canSelect ? onToggle : undefined}
          disabled={!canSelect}
          data-testid="narrative-candidate-checkbox"
        />
        <span className="narrative-candidate-title" title={candidate.title}>
          {candidate.title}
        </span>
        <span className={`narrative-state state-${candidate.state}`}>
          {STATE_LABELS[candidate.state]}
          {generating && '（生成中）'}
        </span>
      </div>

      <div className="narrative-candidate-meta">
        <span>{candidate.category}</span>
        {candidate.eventType && <span>{candidate.eventType}</span>}
        <span>Day {candidate.dayNumber}</span>
        {candidate.requestTitle && <span>依頼: {candidate.requestTitle}</span>}
        <span>Party: {candidate.partyName}</span>
      </div>

      {generation && (
        <>
          <NarrativeGenerationView generation={generation} />
          <div className="narrative-generation-actions">
            <button
              type="button"
              onClick={onRegenerate}
              disabled={generating}
              data-testid="narrative-regenerate"
            >
              再生成
            </button>
          </div>
        </>
      )}

      <details className="narrative-prompt">
        <summary onClick={() => setShowPrompt((v) => !v)}>
          AIへ送る内容（compressed v4 prompt）を{showPrompt ? '隠す' : '見る'}
        </summary>
        <div className="narrative-prompt-content">
          <h5>System Prompt</h5>
          <pre>{prompt.system}</pre>
          <h5>User Prompt</h5>
          <pre>{prompt.user}</pre>
        </div>
      </details>

      <details className="narrative-raw-context">
        <summary onClick={() => setShowRaw((v) => !v)}>
          Raw Narrative Contextを{showRaw ? '隠す' : '見る'}
        </summary>
        <div className="narrative-raw-context-content">
          <pre>{rawContext}</pre>
        </div>
      </details>

      <div className="narrative-candidate-actions">
        {candidate.state === 'available' && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            data-testid="narrative-generate"
          >
            {candidate.category === 'expedition' ? '遠征物語を生成' : '生成'}
          </button>
        )}
        {candidate.state !== 'dismissed' && (
          <button
            type="button"
            onClick={onDismiss}
            disabled={generating}
            data-testid="narrative-dismiss"
          >
            非表示
          </button>
        )}
        {candidate.state === 'dismissed' && (
          <button
            type="button"
            onClick={onRestore}
            data-testid="narrative-restore"
          >
            復元
          </button>
        )}
      </div>
    </div>
  )
}
