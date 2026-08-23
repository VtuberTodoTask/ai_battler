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
 * everything when there is no such cutout), plus the bottom-of-screen
 * Dialogue Panel. Mounted directly into `context.layers.overlay`, above
 * the current Scene's own UI — this is never a Scene switch.
 *
 * The dim layer (`eventMode: 'none'`) and the blocker rectangles
 * (`eventMode: 'static'`, invisible) are deliberately separate Graphics:
 * the dim layer is purely visual and must never intercept a pointer, and
 * the blockers must never visually darken the cutout region twice.
 */
export class TutorialOverlay extends Container {
  private readonly _theme: GameUiTheme
  private readonly _dim: Graphics
  private readonly _blockerLayer: Container
  private readonly _dialoguePanel: TutorialDialoguePanel

  constructor(options: TutorialOverlayOptions) {
    super()
    this._theme = options.theme

    this._dim = new Graphics()
    this._dim.eventMode = 'none'
    this.addChild(this._dim)

    this._blockerLayer = new Container()
    this.addChild(this._blockerLayer)

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

  update(
    snapshot: TutorialPresentationSnapshot,
    targetBounds: TutorialTargetBounds | null,
  ): void {
    this.visible = snapshot.visible
    if (!snapshot.visible) return

    this._dialoguePanel.update(snapshot)
    this.drawDim()
    this.drawBlockers(snapshot.target === 'none' ? null : targetBounds)
  }

  private drawDim(): void {
    this._dim.clear()
    this._dim.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill({
      color: this._theme.colors.dim,
      alpha: TUTORIAL_OVERLAY_ALPHA,
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
    // never a single rect covering the target itself.
    const rects: TutorialTargetBounds[] = [
      { x: 0, y: 0, width: VIRTUAL_WIDTH, height: targetBounds.y },
      {
        x: 0,
        y: targetBounds.y + targetBounds.height,
        width: VIRTUAL_WIDTH,
        height: VIRTUAL_HEIGHT - (targetBounds.y + targetBounds.height),
      },
      {
        x: 0,
        y: targetBounds.y,
        width: targetBounds.x,
        height: targetBounds.height,
      },
      {
        x: targetBounds.x + targetBounds.width,
        y: targetBounds.y,
        width: VIRTUAL_WIDTH - (targetBounds.x + targetBounds.width),
        height: targetBounds.height,
      },
    ]

    for (const r of rects) {
      if (r.width <= 0 || r.height <= 0) continue
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
