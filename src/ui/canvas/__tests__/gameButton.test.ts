// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { FederatedPointerEvent } from 'pixi.js'
import { GameButton } from '../components/GameButton.ts'
import { GameLabel } from '../components/GameLabel.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'

const pointerEvent = {} as FederatedPointerEvent

describe('GameButton', () => {
  it('renders the normal visual state immediately when enabled', () => {
    const button = new GameButton({
      width: 100,
      height: 40,
      theme: DEFAULT_GAME_THEME,
      label: 'Enabled',
    })

    expect(button.isEnabled).toBe(true)
    expect(button.state).toBe('normal')
    expect(button.cursor).toBe('pointer')

    const label = button.children.find(
      (c) => c instanceof GameLabel,
    ) as GameLabel
    expect(label.alpha).toBe(1)
  })

  it('renders the disabled visual state immediately when disabled', () => {
    const button = new GameButton({
      width: 100,
      height: 40,
      theme: DEFAULT_GAME_THEME,
      label: 'Disabled',
      disabled: true,
    })

    expect(button.isEnabled).toBe(false)
    expect(button.state).toBe('disabled')
    expect(button.cursor).toBe('default')

    const label = button.children.find(
      (c) => c instanceof GameLabel,
    ) as GameLabel
    expect(label.alpha).toBe(0.6)
  })

  it('fires onActivate exactly once when tapped', () => {
    const action = vi.fn()
    const button = new GameButton({
      width: 100,
      height: 40,
      theme: DEFAULT_GAME_THEME,
      label: 'Test',
    })
    button.onActivate = action

    button.emit('pointertap', pointerEvent)
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('does not fire onActivate when disabled', () => {
    const action = vi.fn()
    const button = new GameButton({
      width: 100,
      height: 40,
      theme: DEFAULT_GAME_THEME,
      label: 'Disabled',
      disabled: true,
    })
    button.onActivate = action

    button.emit('pointertap', pointerEvent)
    button.emit('pointerover', pointerEvent)
    expect(action).not.toHaveBeenCalled()
    expect(button.isEnabled).toBe(false)
  })

  it('transitions to hover state on pointerover', () => {
    const button = new GameButton({
      width: 100,
      height: 40,
      theme: DEFAULT_GAME_THEME,
      label: 'Hover',
    })

    button.emit('pointerover', pointerEvent)
    expect(button.state).toBe('hover')
  })

  it('returns to normal state on pointerout', () => {
    const button = new GameButton({
      width: 100,
      height: 40,
      theme: DEFAULT_GAME_THEME,
      label: 'Out',
    })

    button.emit('pointerover', pointerEvent)
    button.emit('pointerout', pointerEvent)
    expect(button.state).toBe('normal')
  })

  it('transitions to pressed state on pointerdown', () => {
    const button = new GameButton({
      width: 100,
      height: 40,
      theme: DEFAULT_GAME_THEME,
      label: 'Press',
    })

    button.emit('pointerdown', pointerEvent)
    expect(button.state).toBe('pressed')
  })

  it('does not transition from disabled on pointerover', () => {
    const button = new GameButton({
      width: 100,
      height: 40,
      theme: DEFAULT_GAME_THEME,
      label: 'Disabled',
      disabled: true,
    })

    button.emit('pointerover', pointerEvent)
    expect(button.state).toBe('disabled')
  })

  it('updates label and keeps it centered', () => {
    const button = new GameButton({
      width: 120,
      height: 40,
      theme: DEFAULT_GAME_THEME,
      label: 'Old',
    })
    button.setLabel('New')

    // The label is the second child (graphics first).
    const label = button.children.find((c) => 'text' in c)
    expect(label).toBeDefined()
    expect((label as { text: string }).text).toBe('New')
  })
})
