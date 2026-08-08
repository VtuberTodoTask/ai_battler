import type { ReplayItem } from './replay.ts'
import { PHASE_LABELS } from './labels.ts'

interface ExpeditionTimelineProps {
  items: ReplayItem[]
  currentIndex: number
  playing: boolean
  playDisabled?: boolean
  onSelect: (index: number) => void
  onFirst: () => void
  onPrev: () => void
  onNext: () => void
  onLast: () => void
  onPlayPause: () => void
}

function itemLabel(item: ReplayItem): string {
  if (item.kind === 'summary') return '最終結果'
  const fact = item.event.facts[0]
  return fact ?? item.event.type
}

function itemPhase(item: ReplayItem): string {
  if (item.kind === 'summary') return 'summary'
  return PHASE_LABELS[item.event.phase] ?? item.event.phase
}

export function ExpeditionTimeline({
  items,
  currentIndex,
  playing,
  playDisabled,
  onSelect,
  onFirst,
  onPrev,
  onNext,
  onLast,
  onPlayPause,
}: ExpeditionTimelineProps) {
  if (items.length === 0) return null

  return (
    <div className="timeline-panel">
      <h3>タイムライン</h3>
      <ul className="timeline-list" data-testid="expedition-timeline">
        {items.map((item, index) => (
          <li
            key={index}
            className={`timeline-item ${index === currentIndex ? 'active' : ''} ${item.kind === 'summary' ? 'summary' : ''}`}
            onClick={() => onSelect(index)}
            data-testid={`timeline-item-${index}`}
          >
            <span className="timeline-phase">{itemPhase(item)}</span>
            <span className="timeline-fact">{itemLabel(item)}</span>
            {item.kind === 'engineLog' && item.event.check && (
              <span className="timeline-check">{item.event.check.result}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="timeline-controls">
        <button onClick={onFirst}>最初へ</button>
        <button onClick={onPrev}>前へ</button>
        <button onClick={onPlayPause} disabled={playDisabled}>
          {playing ? '停止' : '再生'}
        </button>
        <button onClick={onNext}>次へ</button>
        <button onClick={onLast}>最後へ</button>
      </div>
    </div>
  )
}
