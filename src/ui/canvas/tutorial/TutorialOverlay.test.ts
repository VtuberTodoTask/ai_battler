// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container, Graphics } from 'pixi.js'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../GameViewport.ts'
import {
  chooseTutorialDialoguePlacement,
  padBounds,
  rectanglesIntersect,
  subtractRects,
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
  const target = overrides.target ?? 'none'
  const highlightTarget = overrides.highlightTarget ?? 'none'
  return {
    visible: true,
    speaker: '妖精',
    text: 'テスト',
    showNextButton: true,
    target,
    targets: target === 'none' ? [] : [target],
    highlightTarget,
    highlightTargets: highlightTarget === 'none' ? [] : [highlightTarget],
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

describe('subtractRects (pure geometry, Phase 10.2 Multi-target item 13/15/73)', () => {
  const VIEWPORT = { x: 0, y: 0, width: VIRTUAL_WIDTH, height: VIRTUAL_HEIGHT }
  const HOLE_A = { x: 100, y: 100, width: 100, height: 80 }
  const HOLE_B = { x: 800, y: 500, width: 120, height: 90 }

  it('is equivalent to surroundingRects for a single hole', () => {
    expect(subtractRects(VIEWPORT, [HOLE_A])).toEqual(surroundingRects(HOLE_A))
  })

  it('with two disjoint holes, never produces a rect overlapping either hole', () => {
    const rects = subtractRects(VIEWPORT, [HOLE_A, HOLE_B])
    const overlaps = (
      r: { x: number; y: number; width: number; height: number },
      hole: { x: number; y: number; width: number; height: number },
    ) =>
      r.x < hole.x + hole.width &&
      r.x + r.width > hole.x &&
      r.y < hole.y + hole.height &&
      r.y + r.height > hole.y

    for (const r of rects) {
      expect(overlaps(r, HOLE_A)).toBe(false)
      expect(overlaps(r, HOLE_B)).toBe(false)
    }
  })

  it('together with both holes, the remaining rects cover the full viewport area (never a merged bounding box)', () => {
    const rects = subtractRects(VIEWPORT, [HOLE_A, HOLE_B])
    const totalArea = rects.reduce((sum, r) => sum + r.width * r.height, 0)
    const holesArea =
      HOLE_A.width * HOLE_A.height + HOLE_B.width * HOLE_B.height
    expect(totalArea + holesArea).toBe(VIRTUAL_WIDTH * VIRTUAL_HEIGHT)
  })

  it('is order-independent — subtracting the same holes in either order yields the same total remaining area', () => {
    const forward = subtractRects(VIEWPORT, [HOLE_A, HOLE_B])
    const backward = subtractRects(VIEWPORT, [HOLE_B, HOLE_A])
    const area = (rects: readonly { width: number; height: number }[]) =>
      rects.reduce((sum, r) => sum + r.width * r.height, 0)
    expect(area(forward)).toBe(area(backward))
  })

  it('handles overlapping holes without double-subtracting their intersection', () => {
    const overlapping = { x: 150, y: 120, width: 100, height: 80 }
    const rects = subtractRects(VIEWPORT, [HOLE_A, overlapping])
    const totalArea = rects.reduce((sum, r) => sum + r.width * r.height, 0)
    // The union's area is less than the sum of the two holes' areas, since
    // they overlap — computed independently of `subtractRects` itself to
    // avoid a tautological assertion.
    const unionArea =
      HOLE_A.width * HOLE_A.height +
      overlapping.width * overlapping.height -
      // intersection: x in [150,200], y in [120,180] -> 50 x 60
      50 * 60
    expect(totalArea + unionArea).toBe(VIRTUAL_WIDTH * VIRTUAL_HEIGHT)
  })

  it('returns the full viewport unchanged when there are no holes', () => {
    expect(subtractRects(VIEWPORT, [])).toEqual([VIEWPORT])
  })
})

describe('chooseTutorialDialoguePlacement (PR #63 review, items 16-21)', () => {
  // The Dialogue's fixed bottom docking bounds: DIALOGUE_MARGIN=16,
  // DIALOGUE_HEIGHT=160, VIRTUAL_HEIGHT=900 -> y 724-884 (item 17).
  const BOTTOM_TARGET: TutorialTargetBounds = {
    x: 900,
    y: 824,
    width: 200,
    height: 48,
  }
  const CENTER_TARGET: TutorialTargetBounds = {
    x: 700,
    y: 400,
    width: 200,
    height: 100,
  }

  it('rectanglesIntersect: overlapping rects intersect, edge-touching ones do not', () => {
    expect(
      rectanglesIntersect(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 50, y: 50, width: 100, height: 100 },
      ),
    ).toBe(true)
    expect(
      rectanglesIntersect(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 100, y: 0, width: 100, height: 100 },
      ),
    ).toBe(false)
  })

  it('item 17: a target under the bottom Dialogue (Y 824-872) chooses top', () => {
    expect(chooseTutorialDialoguePlacement([BOTTOM_TARGET])).toBe('top')
  })

  it('item 18: a target that never reaches the bottom Dialogue (e.g. Prediction/Finance) chooses bottom', () => {
    expect(chooseTutorialDialoguePlacement([CENTER_TARGET])).toBe('bottom')
  })

  it('item 19: multi-target — one bottom, one center — still chooses top', () => {
    expect(
      chooseTutorialDialoguePlacement([CENTER_TARGET, BOTTOM_TARGET]),
    ).toBe('top')
  })

  it('item 20: highlight-only targets (no interaction target) still choose top when they overlap the bottom Dialogue', () => {
    // Simulates the Overlay's own call site: highlightTargets alone can
    // drive the union passed in, independent of interactionTargets.
    const highlightOnlyUnion: TutorialTargetBounds[] = [BOTTOM_TARGET]
    expect(chooseTutorialDialoguePlacement(highlightOnlyUnion)).toBe('top')
  })

  it('item 21: interaction-only targets (no highlight target) still choose top when they overlap the bottom Dialogue', () => {
    const interactionOnlyUnion: TutorialTargetBounds[] = [BOTTOM_TARGET]
    expect(chooseTutorialDialoguePlacement(interactionOnlyUnion)).toBe('top')
  })

  it('an empty target list (fully-blocked message step) chooses bottom', () => {
    expect(chooseTutorialDialoguePlacement([])).toBe('bottom')
  })

  it('a target only touching the Dialogue edge (no true overlap) still chooses bottom', () => {
    const edgeTouching: TutorialTargetBounds = {
      x: 900,
      y: 884,
      width: 200,
      height: 48,
    }
    expect(chooseTutorialDialoguePlacement([edgeTouching])).toBe('bottom')
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
      [],
      [],
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
      [],
      [MID_SCREEN_BOUNDS],
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
      [],
      [MID_SCREEN_BOUNDS],
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
      [MID_SCREEN_BOUNDS],
      [MID_SCREEN_BOUNDS],
    )

    const blockerLayer = getPrivate<Container>(overlay, '_blockerLayer')
    expect(blockerLayer.children).toHaveLength(4)
  })

  it('hides everything when the snapshot is not visible', () => {
    const overlay = createOverlay()
    overlay.update(baseSnapshot({ visible: false }), [], [])
    expect(overlay.visible).toBe(false)
  })

  it('Phase 10.2 Multi-target: two simultaneous targets carve two independent cutouts, never one merged bounding box', () => {
    const overlay = createOverlay()
    const roundRectSpy = vi.spyOn(Graphics.prototype, 'roundRect')
    const SECOND_BOUNDS: TutorialTargetBounds = {
      x: 900,
      y: 50,
      width: 150,
      height: 60,
    }

    overlay.update(
      baseSnapshot({
        target: 'none',
        targets: [
          'day_results_narrative_button',
          'day_results_next_day_button',
        ],
        highlightTarget: 'none',
        highlightTargets: [
          'day_results_narrative_button',
          'day_results_next_day_button',
        ],
      }),
      [MID_SCREEN_BOUNDS, SECOND_BOUNDS],
      [MID_SCREEN_BOUNDS, SECOND_BOUNDS],
    )

    const highlightBorder = getPrivate<Graphics>(overlay, '_highlightBorder')
    const borderCalls = roundRectSpy.mock.calls.filter(
      (_, i) => roundRectSpy.mock.instances[i] === highlightBorder,
    )
    // One border per target — never a single border spanning both.
    expect(borderCalls).toHaveLength(2)

    const blockerLayer = getPrivate<Container>(overlay, '_blockerLayer')
    // Each target's exact bounds is subtracted independently. A merged
    // bounding box spanning both targets would carve exactly one 4-rect
    // cutout (like the single-target case above); two genuinely
    // independent cutouts instead split each other's strips, producing
    // more pieces — the space between the two targets stays blocked
    // (Day Results review item 12), which the geometry test above
    // already verifies precisely via `subtractRects` directly.
    expect(blockerLayer.children.length).toBeGreaterThan(4)
    expect(
      subtractRects(
        { x: 0, y: 0, width: VIRTUAL_WIDTH, height: VIRTUAL_HEIGHT },
        [MID_SCREEN_BOUNDS, SECOND_BOUNDS],
      ),
    ).toHaveLength(blockerLayer.children.length)
  })

  it('PR #63 P1: docks the Dialogue Panel to bottom by default, and moves it to top when the target sits under it', () => {
    const overlay = createOverlay()
    const dialoguePanel = getPrivate<{ y: number }>(overlay, '_dialoguePanel')

    // A center target (e.g. Prediction/Finance) — Dialogue stays bottom.
    overlay.update(
      baseSnapshot({ target: 'none', highlightTarget: 'prediction_rate' }),
      [],
      [MID_SCREEN_BOUNDS],
    )
    const bottomY = dialoguePanel.y
    expect(bottomY).toBeGreaterThan(VIRTUAL_HEIGHT / 2)

    // A Footer-bottom target (e.g. Day Results' 次へ) — Dialogue moves
    // to top so it never covers the very button it's pointing at.
    const FOOTER_BUTTON: TutorialTargetBounds = {
      x: 1300,
      y: 824,
      width: 160,
      height: 48,
    }
    overlay.update(
      baseSnapshot({
        target: 'next_day_button',
        highlightTarget: 'next_day_button',
      }),
      [FOOTER_BUTTON],
      [FOOTER_BUTTON],
    )
    expect(dialoguePanel.y).toBeLessThan(bottomY)
    expect(dialoguePanel.y).toBe(16)

    // Back to a non-overlapping target — Dialogue returns to bottom, not
    // stuck at its last position (item 14: no stale placement).
    overlay.update(
      baseSnapshot({ target: 'none', highlightTarget: 'prediction_rate' }),
      [],
      [MID_SCREEN_BOUNDS],
    )
    expect(dialoguePanel.y).toBe(bottomY)
  })

  it('PR #63 item 35: a fully-blocked step (Consent-style, no targets at all) keeps the Dialogue at bottom', () => {
    const overlay = createOverlay()
    const dialoguePanel = getPrivate<{ y: number }>(overlay, '_dialoguePanel')
    overlay.update(
      baseSnapshot({ target: 'none', highlightTarget: 'none' }),
      [],
      [],
    )
    expect(dialoguePanel.y).toBeGreaterThan(VIRTUAL_HEIGHT / 2)
  })
})
