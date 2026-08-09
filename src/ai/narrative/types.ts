export interface NarrativeGenerationRequest {
  systemPrompt: string
  userPrompt: string
  candidateId: string
  promptVersion: string
}

export interface NarrativeGenerationResponse {
  text: string
  model?: string
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

export interface NarrativeProvider {
  readonly id: string
  generate(
    request: NarrativeGenerationRequest,
  ): Promise<NarrativeGenerationResponse>
}
