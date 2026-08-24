import { Container, Graphics } from 'pixi.js'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../GameViewport.ts'
import type { GameUiTheme } from '../theme/gameTheme.ts'
import { TutorialDialoguePanel } from './TutorialDialoguePanel.ts'
import type {
  TutorialPresentationSnapshot,
  TutorialTargetBounds,
} from './types.ts'

/** Named constant, never a per-Scene magic number (item 34). */
export const TUTORIAL_OVERLAY_ALPHA = 0.45
/** Breathing room around a Spotlight target's real bounds — the dim
 * cutout and the highlight border sit this many px outside it, so the
 * emphasis doesn't hug the content pixel-for-pixel. Only affects the
 * VISUAL cutout/border, never the input-blocker cutout (see
 * `drawBlockers`), so padding can never make more of the screen clickable
 * than the actual target. */
export const TUTORIAL_HIGHLIGHT_PADDING = 8
export const TUTORIAL_HIGHLIGHT_BORDER_WIDTH = 3
export const TUTORIAL_HIGHLIGHT_BORDER_RADIUS = 8

export interface TutorialOverlayOptions {
  theme: GameUiTheme
  onAdvance: () => void
  onChoice: (optionId: string) => void
}

const DIALOGUE_HEIGHT = 160
const DIALOGUE_MARGIN = 16
/** Fully-transparent fill — same "invisible but still hit-testable"
 * pattern `TavernHeader`'s settings-gear hit area already uses. */
const BLOCKER_FILL_ALPHA = 0
const VIEWPORT_RECT: TutorialTargetBounds = {
  x: 0,
  y: 0,
  width: VIRTUAL_WIDTH,
  height: VIRTUAL_HEIGHT,
}

/**
 * Phase 10.1/10.2 Tutorial Overlay: a dim visual layer + a set of
 * transparent, input-blocking rectangles that carve cutouts around
 * whichever Game UI region(s) the current `wait_for_action` step allows
 * (or block everything when there are none), Spotlight highlight
 * borders around whichever region(s) the current step wants the Player
 * to look at (independent of what's operable), plus the bottom-of-screen
 * Dialogue Panel. Mounted directly into `context.layers.overlay`, above
 * the current Scene's own UI — this is never a Scene switch.
 *
 * Phase 10.2 Multi-target extension (Day Results review items 10-14):
 * `update()` takes one bounds ARRAY per axis (interaction/highlight)
 * rather than a single bounds value, so a step like Day Results' closing
 * choice — where both "物語として読む" and "翌日へ" are simultaneously
 * valid — can cut TWO independent holes rather than one bounding box
 * spanning (and wrongly unblocking) everything between them. Every
 * single-target Phase 10.1 call site keeps working unchanged: a
 * single-element array behaves identically to the old single-bounds
 * signature (see `subtractRects`).
 *
 * The dim layer (`eventMode: 'none'`) and the blocker rectangles
 * (`eventMode: 'static'`, invisible) are deliberately separate Graphics:
 * the dim layer is purely visual and must never intercept a pointer, and
 * the blockers must never visually darken a cutout region twice. The
 * highlight borders are visual-only too (`eventMode: 'none'`) — Spotlight
 * never grants interaction on its own; only the (separately-tracked)
 * interaction-target cutouts do that. Layer order (bottom to top): dim,
 * blockers (invisible), highlight borders, Dialogue Panel — the Panel
 * must never sit behind a Spotlight target it might otherwise visually
 * clip.
 */
export class TutorialOverlay extends Container {
  private readonly _theme: GameUiTheme
  private readonly _dim: Graphics
  private readonly _blockerLayer: Container
  private readonly _highlightBorder: Graphics
  private readonly _dialoguePanel: TutorialDialoguePanel

  constructor(options: TutorialOverlayOptions) {
    super()
    this._theme = options.theme

    this._dim = new Graphics()
    this._dim.eventMode = 'none'
    this.addChild(this._dim)

    this._blockerLayer = new Container()
    this.addChild(this._blockerLayer)

    this._highlightBorder = new Graphics()
    this._highlightBorder.eventMode = 'none'
    this.addChild(this._highlightBorder)

    this._dialoguePanel = new TutorialDialoguePanel({
      theme: this._theme,
      width: VIRTUAL_WIDTH - DIALOGUE_MARGIN * 2,
      height: DIALOGUE_HEIGHT,
      onAdvance: options.onAdvance,
      onChoice: options.onChoice,
    })
    this._dialoguePanel.x = DIALOGUE_MARGIN
    this._dialoguePanel.y = VIRTUAL_HEIGHT - DIALOGUE_HEIGHT - DIALOGUE_MARGIN
    this.addChild(this._dialoguePanel)

    this.visible = false
  }

  /**
   * @param interactionBounds one entry per `snapshot.targets` (the
   *   region(s) the Player may currently operate — drives the
   *   input-blocker cutouts only), same order, `null` for any target
   *   whose bounds could not be resolved. An empty array (or all-null)
   *   blocks the whole screen, unchanged from Phase 10.1's original
   *   single-target behavior.
   * @param highlightBounds one entry per `snapshot.highlightTargets` (the
   *   region(s) the Player should currently look at — drives the dim
   *   cutouts + highlight borders only, independent of interactivity).
   */
  update(
    snapshot: TutorialPresentationSnapshot,
    interactionBounds: readonly (TutorialTargetBounds | null)[],
    highlightBounds: readonly (TutorialTargetBounds | null)[],
  ): void {
    this.visible = snapshot.visible
    if (!snapshot.visible) return

    this._dialoguePanel.update(snapshot)
    const paddedHighlights = compactBounds(highlightBounds).map(padBounds)
    this.drawDim(paddedHighlights)
    this.drawHighlightBorders(paddedHighlights)
    this.drawBlockers(compactBounds(interactionBounds))
  }

  private drawDim(highlightHoles: readonly TutorialTargetBounds[]): void {
    this._dim.clear()
    for (const r of subtractRects(VIEWPORT_RECT, highlightHoles)) {
      this._dim.rect(r.x, r.y, r.width, r.height).fill({
        color: this._theme.colors.dim,
        alpha: TUTORIAL_OVERLAY_ALPHA,
      })
    }
  }

  private drawHighlightBorders(bounds: readonly TutorialTargetBounds[]): void {
    this._highlightBorder.clear()
    for (const b of bounds) {
      this._highlightBorder
        .roundRect(
          b.x,
          b.y,
          b.width,
          b.height,
          TUTORIAL_HIGHLIGHT_BORDER_RADIUS,
        )
        .stroke({
          width: TUTORIAL_HIGHLIGHT_BORDER_WIDTH,
          color: this._theme.colors.accent,
        })
    }
  }

  private drawBlockers(targetHoles: readonly TutorialTargetBounds[]): void {
    for (const child of [...this._blockerLayer.children]) {
      this._blockerLayer.removeChild(child)
      child.destroy({ children: true })
    }

    // Deliberately the targets' EXACT (unpadded) bounds — the clickable
    // area must never grow beyond the real UI element(s), even though the
    // visual Spotlight cutout above breathes a little wider around them.
    // Each hole is subtracted independently (never merged into one
    // bounding box first — item 12 of the Day Results review), so two
    // Multi-target regions never make the space between them clickable.
    for (const r of subtractRects(VIEWPORT_RECT, targetHoles)) {
      this._blockerLayer.addChild(
        this.makeBlockerRect(r.x, r.y, r.width, r.height),
      )
    }
  }

  private makeBlockerRect(
    x: number,
    y: number,
    width: number,
    height: number,
  ): Graphics {
    const g = new Graphics()
    g.eventMode = 'static'
    g.rect(x, y, width, height).fill({ alpha: BLOCKER_FILL_ALPHA })
    return g
  }
}

/** Drops `null` entries, leaving only resolved bounds. */
function compactBounds(
  bounds: readonly (TutorialTargetBounds | null)[],
): TutorialTargetBounds[] {
  return bounds.filter((b): b is TutorialTargetBounds => b !== null)
}

/** `area` minus `hole`, as the up-to-4 rectangles surrounding it — the
 * same "four strips" decomposition Phase 10.1 used for a single cutout,
 * generalized into a reusable single-hole primitive so `subtractRects`
 * can apply it repeatedly for any number of holes. Returns `[area]`
 * unchanged when `hole` doesn't overlap it at all. */
function subtractRect(
  area: TutorialTargetBounds,
  hole: TutorialTargetBounds,
): TutorialTargetBounds[] {
  const ix = Math.max(area.x, hole.x)
  const iy = Math.max(area.y, hole.y)
  const iRight = Math.min(area.x + area.width, hole.x + hole.width)
  const iBottom = Math.min(area.y + area.height, hole.y + hole.height)
  if (iRight <= ix || iBottom <= iy) return [area]

  const areaRight = area.x + area.width
  const areaBottom = area.y + area.height
  const rects: TutorialTargetBounds[] = [
    { x: area.x, y: area.y, width: area.width, height: iy - area.y },
    {
      x: area.x,
      y: iBottom,
      width: area.width,
      height: areaBottom - iBottom,
    },
    { x: area.x, y: iy, width: ix - area.x, height: iBottom - iy },
    {
      x: iRight,
      y: iy,
      width: areaRight - iRight,
      height: iBottom - iy,
    },
  ]
  return rects.filter((r) => r.width > 0 && r.height > 0)
}

/**
 * The general Multi-target cutout primitive (Day Results review item 13:
 * "汎用的なrectangle subtraction helper"): `viewport` minus every rect in
 * `holes`, as a set of non-overlapping rectangles. Holes are subtracted
 * one at a time — mathematically equivalent to subtracting their union in
 * one step (`(A\B)\C = A\(B∪C)`), so overlapping holes, holes touching an
 * edge, and a single hole (Phase 10.1's original case) are all handled by
 * the same code path without special-casing. Exported for direct unit
 * testing (item 15/73 of the Day Results review) without needing a real
 * Pixi/canvas environment. */
export function subtractRects(
  viewport: TutorialTargetBounds,
  holes: readonly TutorialTargetBounds[],
): TutorialTargetBounds[] {
  let areas: TutorialTargetBounds[] = [viewport]
  for (const hole of holes) {
    areas = areas.flatMap((area) => subtractRect(area, hole))
  }
  return areas.filter((r) => r.width > 0 && r.height > 0)
}

/** Phase 10.1-compatible single-hole convenience wrapper — the four
 * strips surrounding `bounds` alone. Equivalent to
 * `subtractRects(VIEWPORT, [bounds])`; kept as its own export since
 * several existing unit tests exercise this single-target shape
 * directly. */
export function surroundingRects(
  bounds: TutorialTargetBounds,
): TutorialTargetBounds[] {
  return subtractRects(VIEWPORT_RECT, [bounds])
}

/** Expands `bounds` by `TUTORIAL_HIGHLIGHT_PADDING` on every side,
 * clamped to the virtual screen so a target near an edge never produces
 * a negative-origin or oversized rect. */
export function padBounds(bounds: TutorialTargetBounds): TutorialTargetBounds {
  const x = Math.max(0, bounds.x - TUTORIAL_HIGHLIGHT_PADDING)
  const y = Math.max(0, bounds.y - TUTORIAL_HIGHLIGHT_PADDING)
  const right = Math.min(
    VIRTUAL_WIDTH,
    bounds.x + bounds.width + TUTORIAL_HIGHLIGHT_PADDING,
  )
  const bottom = Math.min(
    VIRTUAL_HEIGHT,
    bounds.y + bounds.height + TUTORIAL_HIGHLIGHT_PADDING,
  )
  return { x, y, width: right - x, height: bottom - y }
}
