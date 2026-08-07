import { useState } from 'react'
import type { ExpeditionResult } from '../../core/expedition/types.ts'

interface RawJsonPanelProps {
  result: ExpeditionResult
}

export function RawJsonPanel({ result }: RawJsonPanelProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="raw-json card">
      <button onClick={() => setOpen((v) => !v)}>
        {open ? 'Raw JSONを閉じる' : 'Raw JSONを表示'}
      </button>
      {open && (
        <pre>
          {JSON.stringify(
            {
              request: result.request,
              party: result.party,
              outcome: result.outcome,
              state: result.state,
            },
            null,
            2,
          )}
        </pre>
      )}
    </div>
  )
}
