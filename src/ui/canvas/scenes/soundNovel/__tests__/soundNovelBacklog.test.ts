import { describe, expect, it } from 'vitest'
import { SoundNovelPlayer } from '../SoundNovelPlayer.ts'

function measureText(text: string): { width: number; height: number } {
  return { width: text.length * 10, height: 12 + text.length }
}

describe('SoundNovelPlayer backlog', () => {
  it('records completed segments in backlog when advancing', () => {
    const player = new SoundNovelPlayer({
      maxWidth: 1000,
      maxHeight: 400,
      segmentSpacing: 4,
      measureText,
      timing: {
        textSpeedMs: 1,
        punctuationPauseMs: {},
        autoBaseMs: 1,
        autoPerCharMs: 0,
        autoMinMs: 1,
        autoMaxMs: 10,
        autoPageEndExtraMs: 0,
      },
    })

    player.start('First\n\nSecond')
    player.click()
    expect(player.backlog.length).toBe(0)

    player.click()
    expect(player.backlog.length).toBe(1)
    expect(player.backlog[0]!.text).toBe('First')
  })

  it('records backlog entries for each advanced segment', () => {
    const player = new SoundNovelPlayer({
      maxWidth: 1000,
      maxHeight: 400,
      segmentSpacing: 4,
      measureText,
      timing: {
        textSpeedMs: 1,
        punctuationPauseMs: {},
        autoBaseMs: 1,
        autoPerCharMs: 0,
        autoMinMs: 1,
        autoMaxMs: 10,
        autoPageEndExtraMs: 0,
      },
    })

    player.start('A\n\nB\n\nC')
    player.click()
    player.click()
    player.click()
    player.click()

    expect(player.backlog.length).toBe(2)
    expect(player.backlog[0]!.text).toBe('A')
    expect(player.backlog[1]!.text).toBe('B')
  })

  it('does not record duplicate entries when staying on the same segment', () => {
    const player = new SoundNovelPlayer({
      maxWidth: 1000,
      maxHeight: 400,
      segmentSpacing: 4,
      measureText,
      timing: {
        textSpeedMs: 5000,
        punctuationPauseMs: {},
        autoBaseMs: 1,
        autoPerCharMs: 0,
        autoMinMs: 1,
        autoMaxMs: 10,
        autoPageEndExtraMs: 0,
      },
    })

    player.start('Only')
    player.click()
    player.click()
    player.click()

    expect(player.backlog.length).toBeLessThanOrEqual(1)
  })
})
