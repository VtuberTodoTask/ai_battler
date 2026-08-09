import type { NarrativeProvider } from '../../ai/narrative/types.ts'
import type { NarrativeCandidate, NarrativeGenerationRecord } from './types.ts'
import { buildNarrativePrompt, NARRATIVE_PROMPT_VERSION } from './prompt.ts'

export interface GenerateNarrativeResult {
  candidate: NarrativeCandidate
  record: NarrativeGenerationRecord
}

interface GenerationResponseLike {
  text: string
  model?: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

function createGenerationRecord(
  candidateId: string,
  response: GenerationResponseLike,
  providerId: string,
): NarrativeGenerationRecord {
  const timestamp = new Date().toISOString()
  return {
    id: `gen:${providerId}:${candidateId}:${Date.now()}`,
    candidateId,
    generatedText: response.text,
    promptVersion: NARRATIVE_PROMPT_VERSION,
    providerId,
    model: response.model,
    createdAt: timestamp,
    usage: response.usage
      ? {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
        }
      : undefined,
  }
}

export async function generateNarrative(
  candidate: NarrativeCandidate,
  provider: NarrativeProvider,
): Promise<GenerateNarrativeResult> {
  const prompt = buildNarrativePrompt(candidate.context)
  const response = await provider.generate({
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    candidateId: candidate.id,
    promptVersion: NARRATIVE_PROMPT_VERSION,
  })

  if (!response.text || response.text.trim().length === 0) {
    throw new Error('AI returned empty response')
  }

  if (response.text.length > 8000) {
    throw new Error('AI response is too large')
  }

  const record = createGenerationRecord(candidate.id, response, provider.id)
  const updatedCandidate: NarrativeCandidate = {
    ...candidate,
    state: 'generated',
    activeGenerationId: record.id,
  }

  return { candidate: updatedCandidate, record }
}
