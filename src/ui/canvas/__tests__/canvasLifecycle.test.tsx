// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import GameCanvasHost from '../GameCanvasHost.tsx'
import type { GameUiActions } from '../types.ts'
import type { NarrativeCandidate } from '../../../core/narrative/types.ts'
import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'

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

  it('advanceDay propagates a failure UiActionResult from the callback unchanged, and a success one too', async () => {
    const campaign = createTavernCampaign('lifecycle-advance-001')

    const { rerender } = render(
      <GameCanvasHost
        campaign={campaign}
        onAdvanceDay={() => ({ ok: false, message: 'advance failed' })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() => expect(latestActions).not.toBeNull())
    const failure = latestActions!.advanceDay()
    expect(failure.ok).toBe(false)
    expect(failure.message).toBe('advance failed')

    rerender(
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
    const success = latestActions!.advanceDay()
    expect(success.ok).toBe(true)

    cleanup()
  })

  it('resolveDay propagates a failure UiActionResult from the callback unchanged, and a success one too', async () => {
    const campaign = createTavernCampaign('lifecycle-resolve-001')

    const { rerender } = render(
      <GameCanvasHost
        campaign={campaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: false, message: 'resolve failed' })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() => expect(latestActions).not.toBeNull())
    const failure = latestActions!.resolveDay()
    expect(failure.ok).toBe(false)
    expect(failure.message).toBe('resolve failed')

    rerender(
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
    const success = latestActions!.resolveDay()
    expect(success.ok).toBe(true)

    cleanup()
  })

  it('advanceDay/resolveDay convert a thrown callback error into { ok: false, message } instead of letting it escape the bridge', async () => {
    const campaign = createTavernCampaign('lifecycle-throw-001')

    render(
      <GameCanvasHost
        campaign={campaign}
        onAdvanceDay={() => {
          throw new Error('boom')
        }}
        onResolveDay={() => {
          throw new Error('boom')
        }}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() => expect(latestActions).not.toBeNull())

    let advanceResult: ReturnType<GameUiActions['advanceDay']> | undefined
    expect(() => {
      advanceResult = latestActions!.advanceDay()
    }).not.toThrow()
    expect(advanceResult).toEqual({ ok: false, message: 'boom' })

    let resolveResult: ReturnType<GameUiActions['resolveDay']> | undefined
    expect(() => {
      resolveResult = latestActions!.resolveDay()
    }).not.toThrow()
    expect(resolveResult).toEqual({ ok: false, message: 'boom' })

    cleanup()
  })

  function withCandidate(
    campaign: TavernCampaignState,
    candidate: NarrativeCandidate,
  ): TavernCampaignState {
    return { ...campaign, narrativeCandidates: [candidate] }
  }

  function pendingCandidate(id: string): NarrativeCandidate {
    return {
      id,
      state: 'available',
    } as unknown as NarrativeCandidate
  }

  function generatedCandidate(id: string): NarrativeCandidate {
    return {
      id,
      state: 'generated',
    } as unknown as NarrativeCandidate
  }

  it('requests preserveCurrentScene on the campaign sync following a first-time narrative generation (Hotfix: Narrative Generation Scene Preservation)', async () => {
    const campaign = withCandidate(
      createTavernCampaign('lifecycle-narrative-001'),
      pendingCandidate('candidate-1'),
    )
    const nextCampaign = createTavernCampaign('lifecycle-narrative-002')
    const onOpenExpeditionNarrative = vi
      .fn()
      .mockResolvedValue({ ok: true, data: '生成された物語' })

    const { rerender } = render(
      <GameCanvasHost
        campaign={campaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onOpenExpeditionNarrative={onOpenExpeditionNarrative}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() => expect(latestActions).not.toBeNull())
    const result = await latestActions!.openExpeditionNarrative!('candidate-1')
    expect(result.ok).toBe(true)

    rerender(
      <GameCanvasHost
        campaign={nextCampaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onOpenExpeditionNarrative={onOpenExpeditionNarrative}
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

  it('does not request preserveCurrentScene when narrative generation fails, and does not leak into the following sync', async () => {
    const campaign = withCandidate(
      createTavernCampaign('lifecycle-narrative-fail-001'),
      pendingCandidate('candidate-1'),
    )
    const nextCampaign = createTavernCampaign('lifecycle-narrative-fail-002')
    const afterNextCampaign = createTavernCampaign(
      'lifecycle-narrative-fail-003',
    )
    const onOpenExpeditionNarrative = vi
      .fn()
      .mockResolvedValue({ ok: false, message: 'AI生成に失敗しました' })

    const { rerender } = render(
      <GameCanvasHost
        campaign={campaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onOpenExpeditionNarrative={onOpenExpeditionNarrative}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() => expect(latestActions).not.toBeNull())
    const result = await latestActions!.openExpeditionNarrative!('candidate-1')
    expect(result.ok).toBe(false)

    // Generation failed, so no Campaign mutation happened for it — but a
    // later, unrelated Campaign sync (e.g. a normal day advance) must not
    // inherit a stale preserve flag from the failed attempt.
    rerender(
      <GameCanvasHost
        campaign={nextCampaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onOpenExpeditionNarrative={onOpenExpeditionNarrative}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() =>
      expect(mockSetCampaign).toHaveBeenLastCalledWith(nextCampaign, {
        preserveCurrentScene: false,
      }),
    )

    rerender(
      <GameCanvasHost
        campaign={afterNextCampaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onOpenExpeditionNarrative={onOpenExpeditionNarrative}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() =>
      expect(mockSetCampaign).toHaveBeenLastCalledWith(afterNextCampaign, {
        preserveCurrentScene: false,
      }),
    )

    cleanup()
  })

  it('does not request preserveCurrentScene when opening an already-generated narrative (no Campaign mutation expected)', async () => {
    const campaign = withCandidate(
      createTavernCampaign('lifecycle-narrative-existing-001'),
      generatedCandidate('candidate-1'),
    )
    const nextCampaign = createTavernCampaign(
      'lifecycle-narrative-existing-002',
    )
    const onOpenExpeditionNarrative = vi
      .fn()
      .mockResolvedValue({ ok: true, data: '既存の物語' })

    const { rerender } = render(
      <GameCanvasHost
        campaign={campaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onOpenExpeditionNarrative={onOpenExpeditionNarrative}
        onSwitchToLegacy={() => {}}
      />,
    )

    await waitFor(() => expect(latestActions).not.toBeNull())
    const result = await latestActions!.openExpeditionNarrative!('candidate-1')
    expect(result.ok).toBe(true)

    rerender(
      <GameCanvasHost
        campaign={nextCampaign}
        onAdvanceDay={() => ({ ok: true })}
        onResolveDay={() => ({ ok: true })}
        onOfferRequest={() => ({ ok: true })}
        onPurchaseUpgrade={() => ({ ok: true })}
        onOpenActivity={() => Promise.resolve({ ok: true, data: '' })}
        onOpenExpeditionNarrative={onOpenExpeditionNarrative}
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
