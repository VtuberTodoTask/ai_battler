import { describe, expect, it } from 'vitest'
import { SoundNovelPlayer } from '../SoundNovelPlayer.ts'

function measureText(text: string): { width: number; height: number } {
  return { width: text.length * 10, height: 12 + text.length }
}

const fastTiming = {
  textSpeedMs: 1,
  punctuationPauseMs: {},
  autoBaseMs: 1,
  autoPerCharMs: 0,
  autoMinMs: 1,
  autoMaxMs: 10,
  autoPageEndExtraMs: 5,
}

describe('SoundNovelPlayer auto mode', () => {
  it('auto advances from waiting to the next segment', () => {
    const player = new SoundNovelPlayer({
      maxWidth: 1000,
      maxHeight: 400,
      segmentSpacing: 4,
      measureText,
      timing: fastTiming,
      initialAutoMode: true,
    })

    player.start('A\n\nB')
    player.click()
    expect(player.state.playbackState).toBe('waiting')

    player.update(50)

    expect(player.state.segmentIndex).toBe(1)
  })

  it('auto advances from page_wait to the next page', () => {
    const player = new SoundNovelPlayer({
      maxWidth: 1000,
      maxHeight: 400,
      segmentSpacing: 4,
      measureText,
      timing: fastTiming,
      initialAutoMode: true,
    })

    player.start('Only')
    player.click()
    expect(player.state.playbackState).toBe('page_wait')

    player.update(50)

    expect(player.state.playbackState).toBe('finished')
  })

  it('does not disable auto on manual click', () => {
    const player = new SoundNovelPlayer({
      maxWidth: 1000,
      maxHeight: 400,
      segmentSpacing: 4,
      measureText,
      timing: fastTiming,
      initialAutoMode: true,
    })

    player.start('A\n\nB')
    player.click()
    player.click()
    player.click()

    expect(player.state.autoMode).toBe(true)
  })

  it('waits extra time at page end', () => {
    const player = new SoundNovelPlayer({
      maxWidth: 1000,
      maxHeight: 400,
      segmentSpacing: 4,
      measureText,
      timing: {
        ...fastTiming,
        autoPageEndExtraMs: 100,
      },
      initialAutoMode: true,
    })

    player.start('Only')
    player.click()
    expect(player.state.playbackState).toBe('page_wait')

    player.update(10)
    expect(player.state.playbackState).toBe('page_wait')

    player.update(150)
    expect(player.state.playbackState).toBe('finished')
  })
})
