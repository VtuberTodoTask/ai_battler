// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import GameCanvasHost from '../GameCanvasHost.tsx'
import type { GameUiActions } from '../types.ts'

const mockInit = vi.fn().mockResolvedValue(undefined)
const mockSetCampaign = vi.fn()
const mockDestroy = vi.fn()
let latestActions: GameUiActions | null = null

vi.mock('../CanvasGame.ts', () => ({
  CanvasGame: class MockCanvasGame {
    init = mockInit
    setCampaign = mockSetCampaign
    destroy = mockDestroy
    get actions(): GameUiActions | null {
      return latestActions
    }
    set actions(value: GameUiActions | null) {
      latestActions = value
    }
  },
}))

describe('GameCanvasHost lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    latestActions = null
  })

  it('renders a canvas host div and initializes CanvasGame', async () => {
    const campaign = createTavernCampaign('lifecycle-001')
    const { container } = render(
      <GameCanvasHost
        campaign={campaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: true })}
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
        onPurchaseUpgrade={() => ({ ok: true })}
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
        onPurchaseUpgrade={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() =>
      expect(mockSetCampaign).toHaveBeenLastCalledWith(nextCampaign, {
        preserveCurrentScene: false,
      }),
    )

    cleanup()
  })

  it('requests preserveCurrentScene on the campaign sync following a successful upgrade purchase (Phase 9.3.1)', async () => {
    const campaign = createTavernCampaign('lifecycle-purchase-001')
    const nextCampaign = createTavernCampaign('lifecycle-purchase-002')

    const { rerender } = render(
      <GameCanvasHost
        campaign={campaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() => expect(latestActions).not.toBeNull())
    const result = latestActions!.purchaseUpgrade('quest_board')
    expect(result.ok).toBe(true)

    rerender(
      <GameCanvasHost
        campaign={nextCampaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() =>
      expect(mockSetCampaign).toHaveBeenLastCalledWith(nextCampaign, {
        preserveCurrentScene: true,
      }),
    )

    cleanup()
  })

  it('does not request preserveCurrentScene when an upgrade purchase fails', async () => {
    const campaign = createTavernCampaign('lifecycle-purchase-fail-001')
    const nextCampaign = createTavernCampaign('lifecycle-purchase-fail-002')

    const { rerender } = render(
      <GameCanvasHost
        campaign={campaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: false, message: '資金が足りません。' })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() => expect(latestActions).not.toBeNull())
    const result = latestActions!.purchaseUpgrade('quest_board')
    expect(result.ok).toBe(false)

    rerender(
      <GameCanvasHost
        campaign={nextCampaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: false, message: '資金が足りません。' })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() =>
      expect(mockSetCampaign).toHaveBeenLastCalledWith(nextCampaign, {
        preserveCurrentScene: false,
      }),
    )

    cleanup()
  })
})
