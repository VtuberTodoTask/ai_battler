import { describe, expect, it, vi } from 'vitest'
import { SoundNovelPlayer } from '../SoundNovelPlayer.ts'

function measureText(text: string): { width: number; height: number } {
  return { width: text.length * 10, height: 12 + text.length }
}

describe('SoundNovelPlayer', () => {
  it('starts in typing state with empty visible text', () => {
    const player = new SoundNovelPlayer({
      maxWidth: 1000,
      maxHeight: 400,
      segmentSpacing: 4,
      measureText,
    })

    player.start('最初のセグメント。次のセグメント。')

    expect(player.state.playbackState).toBe('typing')
    expect(player.visibleText).toBe('')
  })

  it('reveals graphemes over time', () => {
    const player = new SoundNovelPlayer({
      maxWidth: 1000,
      maxHeight: 400,
      segmentSpacing: 4,
      measureText,
      timing: {
        textSpeedMs: 10,
        punctuationPauseMs: {},
        autoBaseMs: 100,
        autoPerCharMs: 10,
        autoMinMs: 200,
        autoMaxMs: 2000,
        autoPageEndExtraMs: 100,
      },
    })

    player.start('Hello world')
    player.update(30)

    expect(player.visibleText.length).toBeGreaterThan(0)
  })

  it('click completes the current segment', () => {
    const player = new SoundNovelPlayer({
      maxWidth: 1000,
      maxHeight: 400,
      segmentSpacing: 4,
      measureText,
      timing: {
        textSpeedMs: 5000,
        punctuationPauseMs: {},
        autoBaseMs: 100,
        autoPerCharMs: 10,
        autoMinMs: 200,
        autoMaxMs: 2000,
        autoPageEndExtraMs: 100,
      },
    })

    player.start('ABCDEFGHIJ')
    expect(player.state.playbackState).toBe('typing')

    player.click()

    expect(player.visibleText).toBe('ABCDEFGHIJ')
    expect(player.state.playbackState).toBe('page_wait')
  })

  it('click advances to the next segment when waiting', () => {
    const onChange = vi.fn()
    const player = new SoundNovelPlayer({
      maxWidth: 1000,
      maxHeight: 400,
      segmentSpacing: 4,
      measureText,
      onChange,
      timing: {
        textSpeedMs: 5000,
        punctuationPauseMs: {},
        autoBaseMs: 100,
        autoPerCharMs: 10,
        autoMinMs: 200,
        autoMaxMs: 2000,
        autoPageEndExtraMs: 100,
      },
    })

    player.start('First\n\nSecond')
    player.click()
    expect(player.state.segmentIndex).toBe(0)
    expect(player.state.playbackState).toBe('waiting')

    player.click()
    expect(player.state.segmentIndex).toBe(1)
    expect(player.state.playbackState).toBe('typing')
  })

  it('finishes at the end of the document', () => {
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

    player.start('One')
    player.click()
    expect(player.state.playbackState).toBe('page_wait')

    player.click()
    expect(player.state.playbackState).toBe('finished')
  })

  it('pauses updates while log is open', () => {
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

    player.start('One')
    player.setLogOpen(true)
    player.update(1000)

    expect(player.visibleText).toBe('')
  })
})
