// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App.tsx'

vi.mock('./ui/tavern/TavernGame.tsx', () => ({
  TavernGame: () => <div data-testid="game-runtime" />,
}))

describe('Phase 11.1 Direct Game Boot', () => {
  it('renders the Game runtime directly on mount, with no Simulator mode selection', () => {
    render(<App />)

    expect(screen.getByTestId('game-runtime')).toBeTruthy()
  })

  it('never shows the old dev-Simulator tabs or the Canvas/Legacy UI switch', () => {
    render(<App />)

    expect(screen.queryByText('戦闘シミュレーター')).toBeNull()
    expect(screen.queryByText('遠征シミュレーター')).toBeNull()
    expect(screen.queryByText('酒場キャンペーン')).toBeNull()
    expect(screen.queryByText('Canvas UI')).toBeNull()
    expect(screen.queryByText('Legacy UIへ')).toBeNull()
  })
})
