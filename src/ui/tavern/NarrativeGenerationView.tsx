import { useState } from 'react'
import type { NarrativeGenerationRecord } from '../../core/narrative/types.ts'

export interface NarrativeGenerationViewProps {
  generation: NarrativeGenerationRecord
}

export function NarrativeGenerationView({
  generation,
}: NarrativeGenerationViewProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generation.generatedText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // ignore
    }
  }

  return (
    <div className="narrative-generation" data-testid="narrative-generation">
      <div className="narrative-generation-text">
        {generation.generatedText.split('\n').map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
      <div className="narrative-generation-actions">
        <button type="button" onClick={handleCopy}>
          {copied ? 'コピーしました' : 'コピー'}
        </button>
      </div>
      {generation.model && (
        <div className="narrative-usage">
          model: {generation.model} | provider: {generation.providerId}
          {generation.usage?.totalTokens !== undefined &&
            ` | tokens: ${generation.usage.totalTokens}`}
        </div>
      )}
    </div>
  )
}
