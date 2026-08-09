import { useState } from 'react'
import { FakeNarrativeProvider } from '../../ai/narrative/fakeProvider.ts'
import { HttpNarrativeProvider } from '../../ai/narrative/httpProvider.ts'
import type { NarrativeProvider } from '../../ai/narrative/types.ts'

export interface NarrativeProviderConfig {
  endpoint: string
  model: string
  apiKey: string
}

export interface NarrativeSettingsProps {
  provider: NarrativeProvider | null
  config: NarrativeProviderConfig
  onChange: (config: NarrativeProviderConfig) => void
  onProviderChange: (provider: NarrativeProvider | null) => void
}

export function NarrativeSettings({
  provider,
  config,
  onChange,
  onProviderChange,
}: NarrativeSettingsProps) {
  const [showKey, setShowKey] = useState(false)

  const handleConnect = () => {
    if (!config.endpoint.trim() || !config.model.trim()) {
      onProviderChange(null)
      return
    }
    onProviderChange(
      new HttpNarrativeProvider({
        endpoint: config.endpoint.trim(),
        model: config.model.trim(),
        apiKey: config.apiKey.trim() || undefined,
      }),
    )
  }

  const handleUseFake = () => {
    onProviderChange(new FakeNarrativeProvider())
  }

  const handleDisconnect = () => {
    onProviderChange(null)
  }

  const statusText = provider ? provider.id : 'AI未接続'

  return (
    <div className="narrative-settings" data-testid="narrative-settings">
      <h4>AI 接続設定</h4>
      <div className="narrative-status">状態: {statusText}</div>

      <div className="narrative-inputs">
        <label>
          エンドポイント
          <input
            type="text"
            value={config.endpoint}
            onChange={(e) => onChange({ ...config, endpoint: e.target.value })}
            placeholder="https://api.example.com/v1/chat/completions"
          />
        </label>
        <label>
          モデル
          <input
            type="text"
            value={config.model}
            onChange={(e) => onChange({ ...config, model: e.target.value })}
            placeholder="gpt-4o"
          />
        </label>
        <label>
          API Key（ページを更新すると消えます）
          <input
            type={showKey ? 'text' : 'password'}
            value={config.apiKey}
            onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
            placeholder="sk-..."
          />
          <button
            type="button"
            className="narrative-toggle-key"
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey ? '隠す' : '表示'}
          </button>
        </label>
      </div>

      <div className="narrative-actions">
        <button type="button" onClick={handleConnect}>
          HTTP Provider で接続
        </button>
        <button
          type="button"
          className="narrative-fake"
          onClick={handleUseFake}
        >
          開発用 Fake Provider を使う
        </button>
        <button
          type="button"
          className="narrative-disconnect"
          onClick={handleDisconnect}
        >
          切断
        </button>
      </div>

      <p className="narrative-warning">
        API Key はブラウザのメモリにのみ保持され、リロードで消えます。
      </p>
    </div>
  )
}
