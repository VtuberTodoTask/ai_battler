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

/**
 * Phase 10.1 Tutorial Overlay: a dim visual layer + a set of transparent,
 * input-blocking rectangles that carve a cutout around whichever single
 * UI region the current `wait_for_action` step allows (or block
 * everything when there is no such cutout), a Spotlight highlight border
 * around whichever region the current step wants the Player to look at
 * (independent of what's operable), plus the bottom-of-screen Dialogue
 * Panel. Mounted directly into `context.layers.overlay`, above the
 * current Scene's own UI — this is never a Scene switch.
 *
 * The dim layer (`eventMode: 'none'`) and the blocker rectangles
 * (`eventMode: 'static'`, invisible) are deliberately separate Graphics:
 * the dim layer is purely visual and must never intercept a pointer, and
 * the blockers must never visually darken the cutout region twice. The
 * highlight border is visual-only too (`eventMode: 'none'`) — Spotlight
 * never grants interaction on its own; only the (separately-tracked)
 * interaction-target cutout does that. Layer order (bottom to top): dim,
 * blockers (invisible), highlight border, Dialogue Panel — the Panel must
 * never sit behind a Spotlight target it might otherwise visually clip.
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
   * @param interactionBounds bounds for `snapshot.target` (the region
   *   the Player may currently operate — drives the input-blocker
   *   cutout only). `null`/`snapshot.target === 'none'` blocks the whole
   *   screen, unchanged from Phase 10.1's original behavior.
   * @param highlightBounds bounds for `snapshot.highlightTarget` (the
   *   region the Player should currently look at — drives the dim
   *   cutout + highlight border only, independent of interactivity).
   */
  update(
    snapshot: TutorialPresentationSnapshot,
    interactionBounds: TutorialTargetBounds | null,
    highlightBounds: TutorialTargetBounds | null,
  ): void {
    this.visible = snapshot.visible
    if (!snapshot.visible) return

    this._dialoguePanel.update(snapshot)
    const paddedHighlight =
      snapshot.highlightTarget === 'none' ? null : padBounds(highlightBounds)
    this.drawDim(paddedHighlight)
    this.drawHighlightBorder(paddedHighlight)
    this.drawBlockers(snapshot.target === 'none' ? null : interactionBounds)
  }

  private drawDim(highlightBounds: TutorialTargetBounds | null): void {
    this._dim.clear()
    if (!highlightBounds) {
      this._dim.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill({
        color: this._theme.colors.dim,
        alpha: TUTORIAL_OVERLAY_ALPHA,
      })
      return
    }

    // Same four-strip cutout technique as `drawBlockers` below, applied
    // to the VISIBLE dim layer this time — the Spotlight target itself
    // is left completely undimmed (item 12: never merely "less dim").
    for (const r of surroundingRects(highlightBounds)) {
      this._dim.rect(r.x, r.y, r.width, r.height).fill({
        color: this._theme.colors.dim,
        alpha: TUTORIAL_OVERLAY_ALPHA,
      })
    }
  }

  private drawHighlightBorder(bounds: TutorialTargetBounds | null): void {
    this._highlightBorder.clear()
    if (!bounds) return

    this._highlightBorder
      .roundRect(
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        TUTORIAL_HIGHLIGHT_BORDER_RADIUS,
      )
      .stroke({
        width: TUTORIAL_HIGHLIGHT_BORDER_WIDTH,
        color: this._theme.colors.accent,
      })
  }

  private drawBlockers(targetBounds: TutorialTargetBounds | null): void {
    for (const child of [...this._blockerLayer.children]) {
      this._blockerLayer.removeChild(child)
      child.destroy({ children: true })
    }

    if (!targetBounds) {
      this._blockerLayer.addChild(
        this.makeBlockerRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT),
      )
      return
    }

    // Four strips surrounding the cutout: full-width above/below the
    // target's row, and left/right of the target within its own row —
    // never a single rect covering the target itself. Deliberately the
    // target's EXACT (unpadded) bounds — the clickable area must never
    // grow beyond the real UI element, even though the visual Spotlight
    // cutout above breathes a little wider around it.
    for (const r of surroundingRects(targetBounds)) {
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

/** The four strips surrounding `bounds` that, together, cover the entire
 * virtual screen minus `bounds` itself — shared by both the dim cutout
 * and the input-blocker cutout so they never drift apart. Exported for
 * direct unit testing (item 50 of the Spotlight review) without needing
 * a real Pixi/canvas environment. */
export function surroundingRects(
  bounds: TutorialTargetBounds,
): TutorialTargetBounds[] {
  return [
    { x: 0, y: 0, width: VIRTUAL_WIDTH, height: bounds.y },
    {
      x: 0,
      y: bounds.y + bounds.height,
      width: VIRTUAL_WIDTH,
      height: VIRTUAL_HEIGHT - (bounds.y + bounds.height),
    },
    { x: 0, y: bounds.y, width: bounds.x, height: bounds.height },
    {
      x: bounds.x + bounds.width,
      y: bounds.y,
      width: VIRTUAL_WIDTH - (bounds.x + bounds.width),
      height: bounds.height,
    },
  ].filter((r) => r.width > 0 && r.height > 0)
}

/** Expands `bounds` by `TUTORIAL_HIGHLIGHT_PADDING` on every side,
 * clamped to the virtual screen so a target near an edge never produces
 * a negative-origin or oversized rect. `null` in, `null` out — a missing
 * Spotlight target (e.g. a Panel not yet mounted) spotlights nothing
 * rather than falling back to some guessed rectangle. */
export function padBounds(
  bounds: TutorialTargetBounds | null,
): TutorialTargetBounds | null {
  if (!bounds) return null
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
