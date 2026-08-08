export interface TavernControlsProps {
  seed: string
  onSeedChange: (seed: string) => void
  onGenerate: (seed: string) => void
  onNewDay: () => void
  disabled?: boolean
}

export function TavernControls({
  seed,
  onSeedChange,
  onGenerate,
  onNewDay,
  disabled,
}: TavernControlsProps) {
  return (
    <div className="tavern-controls controls">
      <label>
        Day Seed
        <input
          type="text"
          value={seed}
          onChange={(e) => onSeedChange(e.target.value)}
          disabled={disabled}
        />
      </label>
      <button onClick={() => onGenerate(seed)} disabled={disabled || !seed}>
        このSeedで生成
      </button>
      <button onClick={onNewDay} disabled={disabled}>
        新しい日
      </button>
    </div>
  )
}
