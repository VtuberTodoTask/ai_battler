// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import GameCanvasHost from '../GameCanvasHost.tsx'

const mockInit = vi.fn().mockResolvedValue(undefined)
const mockSetCampaign = vi.fn()
const mockDestroy = vi.fn()

vi.mock('../CanvasGame.ts', () => ({
  CanvasGame: class MockCanvasGame {
    actions: unknown = null
    init = mockInit
    setCampaign = mockSetCampaign
    destroy = mockDestroy
  },
}))

describe('GameCanvasHost lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a canvas host div and initializes CanvasGame', async () => {
    const campaign = createTavernCampaign('lifecycle-001')
    const { container } = render(
      <GameCanvasHost
        campaign={campaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onSwitchToLegacy={() => {}}
      />,
    )

    expect(container.querySelector('.game-canvas-host')).toBeTruthy()

    await waitFor(() => expect(mockInit).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockSetCampaign).toHaveBeenCalledWith(campaign))

    cleanup()
    await waitFor(() => expect(mockDestroy).toHaveBeenCalledTimes(1))
  })

  it('updates CanvasGame when campaign changes', async () => {
    const campaign = createTavernCampaign('lifecycle-002')
    const nextCampaign = createTavernCampaign('lifecycle-003')

    const { rerender } = render(
      <GameCanvasHost
        campaign={campaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() => expect(mockSetCampaign).toHaveBeenCalled())

    rerender(
      <GameCanvasHost
        campaign={nextCampaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() =>
      expect(mockSetCampaign).toHaveBeenLastCalledWith(nextCampaign),
    )

    cleanup()
  })
})
