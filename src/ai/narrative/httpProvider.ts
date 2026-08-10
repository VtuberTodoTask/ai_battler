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

function isResponsesEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    return url.pathname.replace(/\/+$/, '').endsWith('/responses')
  } catch {
    return endpoint
      .replace(/\?.*$/, '')
      .replace(/\/+$/, '')
      .endsWith('/responses')
  }
}

function buildRequestBody(
  endpoint: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
) {
  const input = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
  return isResponsesEndpoint(endpoint)
    ? { model, input }
    : { model, messages: input }
}

function extractChatCompletionsText(json: unknown): string | undefined {
  const choices = (json as { choices?: { message?: { content?: string } }[] })
    .choices
  return choices?.[0]?.message?.content?.trim()
}

function extractResponsesText(json: unknown): string | undefined {
  const typed = json as {
    output_text?: string
    output?: Array<{
      type?: string
      content?: string | Array<{ type?: string; text?: string }>
    }>
  }

  if (typed.output_text) {
    return typed.output_text.trim()
  }

  const parts: string[] = []
  for (const item of typed.output ?? []) {
    if (item.type && item.type !== 'message') {
      continue
    }
    if (Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part.type === 'output_text' && part.text) {
          parts.push(part.text)
        }
      }
    } else if (typeof item.content === 'string') {
      parts.push(item.content)
    }
  }

  const text = parts.join('').trim()
  return text || undefined
}

function extractUsage(
  json: unknown,
  isResponses: boolean,
): NarrativeGenerationResponse['usage'] | undefined {
  if (isResponses) {
    const usage = (
      json as {
        usage?: {
          input_tokens?: number
          output_tokens?: number
          total_tokens?: number
        }
      }
    ).usage
    if (!usage) {
      return undefined
    }
    return {
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens,
      totalTokens: usage.total_tokens,
    }
  }

  const usage = (
    json as {
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
      }
    }
  ).usage
  if (!usage) {
    return undefined
  }
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  }
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
      const isResponses = isResponsesEndpoint(endpoint)
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(
          buildRequestBody(
            endpoint,
            model,
            request.systemPrompt,
            request.userPrompt,
          ),
        ),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`)
      }

      const json = (await response.json()) as unknown
      const text = isResponses
        ? extractResponsesText(json)
        : extractChatCompletionsText(json)

      if (!text) {
        throw new Error('AI returned empty response')
      }

      return {
        text,
        model: (json as { model?: string }).model ?? model,
        usage: extractUsage(json, isResponses),
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}
