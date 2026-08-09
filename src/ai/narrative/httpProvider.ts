import type {
  NarrativeGenerationRequest,
  NarrativeGenerationResponse,
  NarrativeProvider,
} from './types.ts'

export interface HttpNarrativeProviderOptions {
  endpoint: string
  model: string
  apiKey?: string
  timeoutMs?: number
}

export class HttpNarrativeProvider implements NarrativeProvider {
  readonly id = 'http'
  private options: HttpNarrativeProviderOptions

  constructor(options: HttpNarrativeProviderOptions) {
    this.options = options
  }

  async generate(
    request: NarrativeGenerationRequest,
  ): Promise<NarrativeGenerationResponse> {
    const { endpoint, model, apiKey, timeoutMs = 30000 } = this.options
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`)
      }

      const json = (await response.json()) as {
        choices?: { message?: { content?: string } }[]
        model?: string
        usage?: {
          prompt_tokens?: number
          completion_tokens?: number
          total_tokens?: number
        }
      }

      const text = json.choices?.[0]?.message?.content?.trim() ?? ''
      if (!text) {
        throw new Error('AI returned empty response')
      }

      return {
        text,
        model: json.model ?? model,
        usage: json.usage
          ? {
              promptTokens: json.usage.prompt_tokens,
              completionTokens: json.usage.completion_tokens,
              totalTokens: json.usage.total_tokens,
            }
          : undefined,
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}
