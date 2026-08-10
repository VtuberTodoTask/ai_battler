import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest'
import { HttpNarrativeProvider } from './httpProvider.ts'

describe('HttpNarrativeProvider', () => {
  let fetchMock: Mock<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >

  beforeEach(() => {
    fetchMock =
      vi.fn<
        (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const baseRequest = {
    systemPrompt: 'system',
    userPrompt: 'user',
    candidateId: 'c1',
    promptVersion: 'v1',
  }

  it('sends messages and parses chat completions response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'chat-1',
          model: 'gpt-4o-1',
          choices: [
            {
              message: { role: 'assistant', content: '  hello  ' },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const provider = new HttpNarrativeProvider({
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o',
      apiKey: 'sk-test',
    })

    const result = await provider.generate(baseRequest)
    expect(result.text).toBe('hello')
    expect(result.model).toBe('gpt-4o-1')
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    })

    const [_, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init?.body as string)
    expect(body.messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'user' },
    ])
    expect(body.input).toBeUndefined()
  })

  it('sends input and parses Responses API output_text', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'resp-1',
          model: 'gpt-5.6-1',
          output_text: '  response text  ',
          usage: { input_tokens: 12, output_tokens: 6, total_tokens: 18 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const provider = new HttpNarrativeProvider({
      endpoint: 'https://api.openai.com/v1/responses',
      model: 'gpt-5.6',
      apiKey: 'sk-test',
    })

    const result = await provider.generate(baseRequest)
    expect(result.text).toBe('response text')
    expect(result.model).toBe('gpt-5.6-1')
    expect(result.usage).toEqual({
      promptTokens: 12,
      completionTokens: 6,
      totalTokens: 18,
    })

    const [_, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init?.body as string)
    expect(body.input).toEqual([
      { role: 'system', content: 'system' },
      { role: 'user', content: 'user' },
    ])
    expect(body.messages).toBeUndefined()
  })

  it('parses Responses API output array with output_text items', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'resp-2',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [
                { type: 'output_text', text: 'part one ' },
                { type: 'other', text: 'ignored' },
                { type: 'output_text', text: 'part two' },
              ],
            },
            { type: 'reasoning', summary: 'ignored' },
          ],
          usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const provider = new HttpNarrativeProvider({
      endpoint: 'https://api.openai.com/v1/responses',
      model: 'gpt-5.6',
    })

    const result = await provider.generate(baseRequest)
    expect(result.text).toBe('part one part two')
    expect(result.usage).toEqual({
      promptTokens: 1,
      completionTokens: 2,
      totalTokens: 3,
    })
  })

  it('throws on HTTP error', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('bad request', { status: 400 }),
    )

    const provider = new HttpNarrativeProvider({
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o',
    })

    await expect(provider.generate(baseRequest)).rejects.toThrow('HTTP 400')
  })

  it('throws on empty response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ output: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const provider = new HttpNarrativeProvider({
      endpoint: 'https://api.openai.com/v1/responses',
      model: 'gpt-5.6',
    })

    await expect(provider.generate(baseRequest)).rejects.toThrow(
      'AI returned empty response',
    )
  })
})
