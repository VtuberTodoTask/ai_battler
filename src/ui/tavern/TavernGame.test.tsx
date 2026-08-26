// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { TavernGame } from './TavernGame.tsx'
import type { GameCanvasHostProps } from '../canvas/GameCanvasHost.tsx'

let lastProps: GameCanvasHostProps | null = null

vi.mock('../canvas/GameCanvasHost.tsx', () => ({
  default: (props: GameCanvasHostProps) => {
    lastProps = props
    return <div data-testid="mock-game-canvas-host" />
  },
}))

describe('Phase 11.1 TavernGame direct boot runtime', () => {
  it('renders GameCanvasHost with campaign starting at null — no auto New Game — and no Legacy UI markup', async () => {
    render(<TavernGame />)

    expect(await screen.findByTestId('mock-game-canvas-host')).toBeTruthy()
    expect(lastProps?.campaign).toBeNull()
    expect(screen.queryByTestId('request-board')).toBeNull()
    expect(screen.queryByTestId('party-board')).toBeNull()
    expect(screen.queryByTestId('campaign-header')).toBeNull()
    expect(screen.queryByText('Canvas UI')).toBeNull()
    expect(lastProps).not.toHaveProperty('onSwitchToLegacy')
  })

  it('opens and closes the Settings modal (NarrativeSettings + AudioSettings) via GameCanvasHost onOpenSettings', async () => {
    render(<TavernGame />)
    await screen.findByTestId('mock-game-canvas-host')

    expect(screen.queryByText('設定')).toBeNull()

    act(() => {
      lastProps?.onOpenSettings?.()
    })
    expect(await screen.findByText('設定')).toBeTruthy()
    expect(screen.getByTestId('narrative-settings')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '設定を閉じる' }))
    expect(screen.queryByText('設定')).toBeNull()
  })

  it('starts a New Game via GameCanvasHost onNewGame and re-syncs the campaign prop', async () => {
    render(<TavernGame />)
    await screen.findByTestId('mock-game-canvas-host')

    let result: { ok: boolean } | undefined
    act(() => {
      result = lastProps?.onNewGame?.()
    })

    expect(result?.ok).toBe(true)
    expect(lastProps?.campaign).not.toBeNull()
  })
})
