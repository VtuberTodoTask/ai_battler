// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container, Graphics } from 'pixi.js'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../GameViewport.ts'
import {
  padBounds,
  surroundingRects,
  TUTORIAL_HIGHLIGHT_PADDING,
  TutorialOverlay,
} from './TutorialOverlay.ts'
import type {
  TutorialPresentationSnapshot,
  TutorialTargetBounds,
} from './types.ts'

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

function baseSnapshot(
  overrides: Partial<TutorialPresentationSnapshot> = {},
): TutorialPresentationSnapshot {
  return {
    visible: true,
    speaker: '妖精',
    text: 'テスト',
    showNextButton: true,
    target: 'none',
    highlightTarget: 'none',
    ...overrides,
  }
}

function getPrivate<T>(overlay: TutorialOverlay, key: string): T {
  return (overlay as unknown as Record<string, T>)[key]
}

const MID_SCREEN_BOUNDS: TutorialTargetBounds = {
  x: 400,
  y: 300,
  width: 200,
  height: 100,
}

describe('surroundingRects (pure geometry, item 50)', () => {
  it('produces exactly 4 strips for a target away from every edge', () => {
    const rects = surroundingRects(MID_SCREEN_BOUNDS)
    expect(rects).toHaveLength(4)
  })

  it('never produces a rect overlapping the target itself', () => {
    const rects = surroundingRects(MID_SCREEN_BOUNDS)
    for (const r of rects) {
      const overlapsX =
        r.x < MID_SCREEN_BOUNDS.x + MID_SCREEN_BOUNDS.width &&
        r.x + r.width > MID_SCREEN_BOUNDS.x
      const overlapsY =
        r.y < MID_SCREEN_BOUNDS.y + MID_SCREEN_BOUNDS.height &&
        r.y + r.height > MID_SCREEN_BOUNDS.y
      expect(overlapsX && overlapsY).toBe(false)
    }
  })

  it('together with the target, the strips cover the full virtual screen area', () => {
    const rects = surroundingRects(MID_SCREEN_BOUNDS)
    const totalArea = rects.reduce((sum, r) => sum + r.width * r.height, 0)
    const targetArea = MID_SCREEN_BOUNDS.width * MID_SCREEN_BOUNDS.height
    expect(totalArea + targetArea).toBe(VIRTUAL_WIDTH * VIRTUAL_HEIGHT)
  })

  it('drops degenerate zero-size strips for a target flush against an edge', () => {
    const rects = surroundingRects({ x: 0, y: 0, width: 200, height: 200 })
    // Top and left strips collapse to zero width/height and are filtered.
    expect(rects).toHaveLength(2)
    for (const r of rects) {
      expect(r.width).toBeGreaterThan(0)
      expect(r.height).toBeGreaterThan(0)
    }
  })
})

describe('padBounds (pure geometry, item 13)', () => {
  it('expands every side by TUTORIAL_HIGHLIGHT_PADDING', () => {
    const padded = padBounds(MID_SCREEN_BOUNDS)
    expect(padded).toEqual({
      x: MID_SCREEN_BOUNDS.x - TUTORIAL_HIGHLIGHT_PADDING,
      y: MID_SCREEN_BOUNDS.y - TUTORIAL_HIGHLIGHT_PADDING,
      width: MID_SCREEN_BOUNDS.width + TUTORIAL_HIGHLIGHT_PADDING * 2,
      height: MID_SCREEN_BOUNDS.height + TUTORIAL_HIGHLIGHT_PADDING * 2,
    })
  })

  it('clamps to the virtual screen edges instead of going negative/oversized', () => {
    const padded = padBounds({ x: 0, y: 0, width: VIRTUAL_WIDTH, height: 50 })
    expect(padded).toEqual({ x: 0, y: 0, width: VIRTUAL_WIDTH, height: 58 })
  })

  it('passes null straight through', () => {
    expect(padBounds(null)).toBeNull()
  })
})

describe('TutorialOverlay Spotlight rendering (item 50)', () => {
  function createOverlay(): TutorialOverlay {
    return new TutorialOverlay({
      theme: DEFAULT_GAME_THEME,
      onAdvance: () => {},
      onChoice: () => {},
    })
  }

  it('with no highlight target, dims the entire screen in one rect and draws no border', () => {
    const overlay = createOverlay()
    const rectSpy = vi.spyOn(Graphics.prototype, 'rect')
    const roundRectSpy = vi.spyOn(Graphics.prototype, 'roundRect')

    overlay.update(
      baseSnapshot({ target: 'none', highlightTarget: 'none' }),
      null,
      null,
    )

    const dim = getPrivate<Graphics>(overlay, '_dim')
    const highlightBorder = getPrivate<Graphics>(overlay, '_highlightBorder')
    // The dim Graphics itself received exactly one full-screen `.rect()`
    // call this update — never four strips when there is nothing to
    // spotlight.
    const dimRectCalls = rectSpy.mock.calls.filter(
      (_, i) => rectSpy.mock.instances[i] === dim,
    )
    expect(dimRectCalls).toHaveLength(1)
    expect(dimRectCalls[0]).toEqual([0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT])
    expect(
      roundRectSpy.mock.instances.some((inst) => inst === highlightBorder),
    ).toBe(false)
  })

  it('with a highlight target, cuts the dim layer into 4 strips and draws a border around the padded bounds', () => {
    const overlay = createOverlay()
    const rectSpy = vi.spyOn(Graphics.prototype, 'rect')
    const roundRectSpy = vi.spyOn(Graphics.prototype, 'roundRect')

    overlay.update(
      baseSnapshot({ target: 'none', highlightTarget: 'prediction_rate' }),
      null,
      MID_SCREEN_BOUNDS,
    )

    const dim = getPrivate<Graphics>(overlay, '_dim')
    const highlightBorder = getPrivate<Graphics>(overlay, '_highlightBorder')
    const dimRectCalls = rectSpy.mock.calls.filter(
      (_, i) => rectSpy.mock.instances[i] === dim,
    )
    expect(dimRectCalls).toHaveLength(4)
    // None of the 4 dim strips is the old single full-screen rect.
    for (const call of dimRectCalls) {
      expect(call).not.toEqual([0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT])
    }

    const borderCall = roundRectSpy.mock.calls.find(
      (_, i) => roundRectSpy.mock.instances[i] === highlightBorder,
    )
    expect(borderCall).toBeDefined()
    const padded = padBounds(MID_SCREEN_BOUNDS)!
    expect(borderCall).toEqual([
      padded.x,
      padded.y,
      padded.width,
      padded.height,
      expect.any(Number),
    ])
  })

  it('a highlighted-but-non-interactive target still fully blocks input (item 21/26)', () => {
    const overlay = createOverlay()

    overlay.update(
      baseSnapshot({ target: 'none', highlightTarget: 'prediction_rate' }),
      null,
      MID_SCREEN_BOUNDS,
    )

    const blockerLayer = getPrivate<Container>(overlay, '_blockerLayer')
    // `target: 'none'` blocks the WHOLE screen with one blocker rect,
    // completely independent of the Spotlight's 4-strip dim cutout.
    expect(blockerLayer.children).toHaveLength(1)
  })

  it('an operable target carves a 4-rect input-blocker cutout at its exact (unpadded) bounds', () => {
    const overlay = createOverlay()

    overlay.update(
      baseSnapshot({ target: 'party_list', highlightTarget: 'party_list' }),
      MID_SCREEN_BOUNDS,
      MID_SCREEN_BOUNDS,
    )

    const blockerLayer = getPrivate<Container>(overlay, '_blockerLayer')
    expect(blockerLayer.children).toHaveLength(4)
  })

  it('hides everything when the snapshot is not visible', () => {
    const overlay = createOverlay()
    overlay.update(baseSnapshot({ visible: false }), null, null)
    expect(overlay.visible).toBe(false)
  })
})
