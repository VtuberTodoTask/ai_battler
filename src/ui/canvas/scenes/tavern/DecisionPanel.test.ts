// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DEFAULT_GAME_THEME } from '../../theme/gameTheme.ts'
import type {
  TavernParty,
  TavernRequestOffer,
} from '../../../../core/tavern/types.ts'
import type { ExpeditionPrediction } from '../../../../core/tavern/prediction/types.ts'

const { getExpeditionPredictionMock } = vi.hoisted(() => ({
  getExpeditionPredictionMock: vi.fn(),
}))

vi.mock('../../../shared/expeditionPredictionService.ts', () => ({
  getExpeditionPrediction: getExpeditionPredictionMock,
}))

// Imported AFTER the mock so DecisionPanel picks up the mocked service.
const { DecisionPanel } = await import('./DecisionPanel.ts')

function createFakeCanvasContext(): CanvasRenderingContext2D {
  const emptyMetrics = () =>
    ({
      width: 0,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 0,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
      alphabeticBaseline: 0,
      emHeightAscent: 0,
      emHeightDescent: 0,
      fontBoundingBoxAscent: 0,
      fontBoundingBoxDescent: 0,
      hangingBaseline: 0,
      ideographicBaseline: 0,
    }) as TextMetrics

  return {
    canvas: null as unknown as HTMLCanvasElement,
    font: '10px sans-serif',
    fillStyle: '#000',
    strokeStyle: '#000',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    direction: 'ltr',
    save: () => {},
    restore: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: emptyMetrics,
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    rect: () => {},
    arc: () => {},
    arcTo: () => {},
    ellipse: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    fill: () => {},
    stroke: () => {},
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(0) }) as ImageData,
    putImageData: () => {},
    drawImage: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
    createRadialGradient: () => ({ addColorStop: () => {} }),
  } as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  if (
    typeof (globalThis as unknown as { CanvasRenderingContext2D?: unknown })
      .CanvasRenderingContext2D === 'undefined'
  ) {
    ;(
      globalThis as unknown as { CanvasRenderingContext2D: unknown }
    ).CanvasRenderingContext2D = class FakeCanvasRenderingContext2D {}
  }

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((
    type: string,
  ) =>
    type === '2d'
      ? createFakeCanvasContext()
      : null) as unknown as typeof HTMLCanvasElement.prototype.getContext)
})

function fakePrediction(): ExpeditionPrediction {
  return {
    requestId: 'req',
    partyId: 'party',
    modelVersion: 'v1',
    sampleCount: 200,
    estimatedSuccessRate: 0.5,
    counts: {
      completeSuccess: 20,
      success: 60,
      partialSuccess: 60,
      failedObjective: 40,
      forcedRetreat: 15,
      lostExpedition: 5,
    },
    rates: {
      completeSuccess: 0.1,
      success: 0.3,
      partialSuccess: 0.3,
      failedObjective: 0.2,
      forcedRetreat: 0.075,
      lostExpedition: 0.025,
    },
  }
}

function makeParty(id: string): TavernParty {
  return { id } as unknown as TavernParty
}

function makeQuest(id: string): TavernRequestOffer {
  return { id } as unknown as TavernRequestOffer
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  getExpeditionPredictionMock.mockReset()
})

describe('Phase 10.1 P1 fix: DecisionPanel Prediction retry', () => {
  it('re-fetches for the identical Party+Quest after resetPredictionForRetry', async () => {
    getExpeditionPredictionMock
      .mockRejectedValueOnce(new Error('prediction failed'))
      .mockResolvedValueOnce(fakePrediction())

    const party = makeParty('party-1')
    const quest = makeQuest('quest-1')
    const onPredictionReady = vi.fn()
    const onPredictionError = vi.fn()

    const panel = new DecisionPanel({
      theme: DEFAULT_GAME_THEME,
      width: 400,
      height: 300,
      onAssign: vi.fn(),
      onOpenPartyDetail: vi.fn(),
      getSelectedParty: () => party,
      getSelectedQuest: () => quest,
      onOpenBreakdown: vi.fn(),
      onPredictionReady,
      onPredictionError,
    })

    panel.update(undefined)
    await flush()

    expect(getExpeditionPredictionMock).toHaveBeenCalledTimes(1)
    expect(onPredictionError).toHaveBeenCalledTimes(1)
    expect(onPredictionReady).not.toHaveBeenCalled()

    // Without resetPredictionForRetry, re-calling update() for the exact
    // same Party+Quest would be a no-op (same cache key) — this is the P1
    // deadlock this fix targets.
    panel.resetPredictionForRetry()
    panel.update(undefined)
    await flush()

    expect(getExpeditionPredictionMock).toHaveBeenCalledTimes(2)
    expect(onPredictionReady).toHaveBeenCalledTimes(1)
    expect(onPredictionReady).toHaveBeenCalledWith(fakePrediction())
  })

  it('retrying with a different Party also re-fetches (no reset needed)', async () => {
    getExpeditionPredictionMock
      .mockRejectedValueOnce(new Error('prediction failed'))
      .mockResolvedValueOnce(fakePrediction())

    let party = makeParty('party-1')
    const quest = makeQuest('quest-1')
    const onPredictionReady = vi.fn()
    const onPredictionError = vi.fn()

    const panel = new DecisionPanel({
      theme: DEFAULT_GAME_THEME,
      width: 400,
      height: 300,
      onAssign: vi.fn(),
      onOpenPartyDetail: vi.fn(),
      getSelectedParty: () => party,
      getSelectedQuest: () => quest,
      onOpenBreakdown: vi.fn(),
      onPredictionReady,
      onPredictionError,
    })

    panel.update(undefined)
    await flush()
    expect(onPredictionError).toHaveBeenCalledTimes(1)

    party = makeParty('party-2')
    panel.update(undefined)
    await flush()

    expect(getExpeditionPredictionMock).toHaveBeenCalledTimes(2)
    expect(onPredictionReady).toHaveBeenCalledTimes(1)
  })

  it('never retries automatically without a new selection or explicit reset', async () => {
    getExpeditionPredictionMock.mockRejectedValueOnce(new Error('boom'))

    const party = makeParty('party-1')
    const quest = makeQuest('quest-1')
    const onPredictionError = vi.fn()

    const panel = new DecisionPanel({
      theme: DEFAULT_GAME_THEME,
      width: 400,
      height: 300,
      onAssign: vi.fn(),
      onOpenPartyDetail: vi.fn(),
      getSelectedParty: () => party,
      getSelectedQuest: () => quest,
      onOpenBreakdown: vi.fn(),
      onPredictionError,
    })

    panel.update(undefined)
    await flush()
    expect(getExpeditionPredictionMock).toHaveBeenCalledTimes(1)
    expect(onPredictionError).toHaveBeenCalledTimes(1)

    // Repeated update() calls for the SAME Party+Quest, with nobody
    // calling resetPredictionForRetry(), must never re-request on their
    // own — retry only ever happens in response to a Player action.
    panel.update(undefined)
    panel.update(undefined)
    await flush()

    expect(getExpeditionPredictionMock).toHaveBeenCalledTimes(1)
  })

  it('preserves normal same-selection cache behavior (no unrelated re-fetch)', async () => {
    getExpeditionPredictionMock.mockResolvedValueOnce(fakePrediction())

    const party = makeParty('party-1')
    const quest = makeQuest('quest-1')
    const onPredictionReady = vi.fn()

    const panel = new DecisionPanel({
      theme: DEFAULT_GAME_THEME,
      width: 400,
      height: 300,
      onAssign: vi.fn(),
      onOpenPartyDetail: vi.fn(),
      getSelectedParty: () => party,
      getSelectedQuest: () => quest,
      onOpenBreakdown: vi.fn(),
      onPredictionReady,
    })

    panel.update(undefined)
    await flush()
    expect(getExpeditionPredictionMock).toHaveBeenCalledTimes(1)
    expect(onPredictionReady).toHaveBeenCalledTimes(1)

    // Several more renders for the identical selection — the existing
    // cache-key behavior (untouched by this fix) must still hold.
    panel.update(undefined)
    panel.update(undefined)
    await flush()

    expect(getExpeditionPredictionMock).toHaveBeenCalledTimes(1)
  })
})
