export interface TavernControlsProps {
  seed: string
  onSeedChange: (seed: string) => void
  onNewCampaign: (seed: string) => void
  disabled?: boolean
}

export function TavernControls({
  seed,
  onSeedChange,
  onNewCampaign,
  disabled,
}: TavernControlsProps) {
  return (
    <div className="tavern-controls controls">
      <label>
        Campaign Seed
        <input
          type="text"
          value={seed}
          onChange={(e) => onSeedChange(e.target.value)}
          disabled={disabled}
        />
      </label>
      <button onClick={() => onNewCampaign(seed)} disabled={disabled || !seed}>
        新しいキャンペーン
      </button>
    </div>
  )
}
