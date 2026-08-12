import { useState } from 'react'
import { AudioController } from './AudioController.ts'

export function AudioSettings() {
  const [volume, setVolume] = useState(AudioController.volume)

  const handleChange = (value: number) => {
    setVolume(value)
    AudioController.setVolume(value)
  }

  return (
    <div className="audio-settings" data-testid="audio-settings">
      <h4>音声設定</h4>
      <label className="audio-volume-label">
        BGM / SE 音量: {Math.round(volume * 100)}%
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => handleChange(Number.parseFloat(e.target.value))}
          data-testid="audio-volume-slider"
        />
      </label>
    </div>
  )
}
