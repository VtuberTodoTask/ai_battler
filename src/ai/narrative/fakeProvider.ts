import type {
  NarrativeGenerationRequest,
  NarrativeGenerationResponse,
  NarrativeProvider,
} from './types.ts'

export class FakeNarrativeProvider implements NarrativeProvider {
  readonly id = 'fake'
  private counter = 0

  async generate(
    request: NarrativeGenerationRequest,
  ): Promise<NarrativeGenerationResponse> {
    this.counter += 1
    const text = `【Fake生成 #${this.counter}】\n${request.userPrompt.slice(0, 80)}...`
    return {
      text,
      model: 'fake-model',
      usage: {
        promptTokens: Math.ceil(request.userPrompt.length / 4),
        completionTokens: Math.ceil(text.length / 4),
        totalTokens: Math.ceil((request.userPrompt.length + text.length) / 4),
      },
    }
  }

  get callCount(): number {
    return this.counter
  }
}
