import { describe, expect, it } from 'vitest'
import { resolveSoundNovelBackground } from '../resolveSoundNovelBackground.ts'
import type { SoundNovelVisualContext } from '../types.ts'

describe('resolveSoundNovelBackground', () => {
  it('maps stay_extension to tavern', () => {
    expect(resolveSoundNovelBackground('stay_extension', {})).toBe('tavern')
  })

  it('maps downtime to tavern', () => {
    expect(resolveSoundNovelBackground('downtime', {})).toBe('tavern')
  })

  it('trusts an explicit backgroundId on the visual context', () => {
    const context: SoundNovelVisualContext = { backgroundId: 'ruins' }
    expect(resolveSoundNovelBackground('expedition', context)).toBe('ruins')
  })

  it('maps expedition with forest environment to forest', () => {
    const context: SoundNovelVisualContext = { environment: 'forest' }
    expect(resolveSoundNovelBackground('expedition', context)).toBe('forest')
  })

  it('maps expedition with ruins environment to ruins', () => {
    const context: SoundNovelVisualContext = { environment: 'ruins' }
    expect(resolveSoundNovelBackground('expedition', context)).toBe('ruins')
  })

  it('falls back to generic for unknown environments', () => {
    const context: SoundNovelVisualContext = { environment: 'void' }
    expect(resolveSoundNovelBackground('expedition', context)).toBe('generic')
  })

  it('matches partial environment names', () => {
    expect(
      resolveSoundNovelBackground('expedition', { environment: 'deep cave' }),
    ).toBe('cave')
    expect(
      resolveSoundNovelBackground('expedition', {
        environment: 'ancient ruins of X',
      }),
    ).toBe('ruins')
  })
})
