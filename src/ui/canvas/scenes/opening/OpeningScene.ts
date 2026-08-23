import { Container } from 'pixi.js'
import { OPENING_SCRIPT } from '../../../../data/opening.ts'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { AudioController } from '../../audio/AudioController.ts'
import type { GameScene, GameSceneContext } from '../../types.ts'
import type {
  SoundNovelSceneInput,
  SoundNovelVisualContext,
} from '../soundNovel/types.ts'

/**
 * Phase 9.10 Opening — a hand-authored, non-AI canonical script shown once
 * between Campaign creation and the Tavern, New Game only (item 1/3).
 * Mirrors `EndingScene`'s pop/re-mount discipline: `_input` is a plain
 * object mutated in place and handed back unchanged by
 * `GameSceneManager.pop()`, so `mount()` can tell "returning fresh from
 * `CanvasGame.setCampaign`'s New Game redirect" apart from "returning after
 * `SoundNovelScene` finished" using the SAME instance across both mounts.
 *
 * Deliberately holds no Campaign reference and never touches
 * `campaign`/`commitCampaign` — Opening is pure Presentation with zero
 * effect on Campaign RNG/seed/Day-1 state (item 2), and `_input.started`
 * lives only on this scene-stack entry's input object, never in the Save
 * (item 8: no `openingViewed` field is needed).
 */
export interface OpeningSceneInput {
  started: boolean
}

export function createOpeningSceneInput(): OpeningSceneInput {
  return { started: false }
}

export class OpeningScene implements GameScene {
  readonly id = 'opening'

  private _context: GameSceneContext | null = null
  private _root: Container | null = null
  private _input: OpeningSceneInput | undefined = undefined

  mount(context: GameSceneContext, input?: unknown): void {
    this._context = context
    this._input =
      (input as OpeningSceneInput | undefined) ?? createOpeningSceneInput()

    if (this._input.started) {
      // Returning from `SoundNovelScene` — whether the player read to the
      // end or pressed 戻る partway through, Opening itself is finished
      // either way (there is nothing else to show), so proceed straight to
      // the Tavern.
      this._context.canvasGame.sceneManager?.show('tavern')
      return
    }

    this._root = new Container()
    context.layers.ui.addChild(this._root)
    AudioController.playBgm('tavern', { loop: true })
    this.render()
  }

  unmount(): void {
    if (this._root && this._root.parent) {
      this._root.parent.removeChild(this._root)
    }
    this._root?.destroy({ children: true })
    this._root = null
    this._context = null
  }

  private render(): void {
    if (!this._root || !this._context) return
    for (const child of this._root.removeChildren()) {
      child.destroy({ children: true })
    }
    const { theme } = this._context

    const titleLabel = new GameLabel('新しい酒場の日々', theme, 'heading')
    titleLabel.anchor.set(0.5)
    titleLabel.x = VIRTUAL_WIDTH / 2
    titleLabel.y = VIRTUAL_HEIGHT / 2 - 80
    this._root.addChild(titleLabel)

    const startButton = new GameButton({
      width: 240,
      height: 56,
      theme,
      label: '始める',
    })
    startButton.x = (VIRTUAL_WIDTH - 240) / 2
    startButton.y = VIRTUAL_HEIGHT / 2
    startButton.onActivate = () => this.begin()
    this._root.addChild(startButton)

    const skipButton = new GameButton({
      width: 240,
      height: 56,
      theme,
      label: 'スキップ',
    })
    skipButton.x = (VIRTUAL_WIDTH - 240) / 2
    skipButton.y = VIRTUAL_HEIGHT / 2 + 72
    skipButton.onActivate = () => this.skip()
    this._root.addChild(skipButton)
  }

  private begin(): void {
    if (!this._context || !this._input) return
    this._input.started = true
    const visualContext: SoundNovelVisualContext = { backgroundId: 'tavern' }
    const input: SoundNovelSceneInput = {
      narrativeId: 'opening',
      source: 'opening',
      title: '新しい酒場の日々',
      text: OPENING_SCRIPT,
      visualContext,
      returnTarget: { sceneId: 'opening' },
      mood: 'daily',
    }
    this._context.canvasGame.sceneManager?.push('soundNovel', input)
  }

  private skip(): void {
    this._context?.canvasGame.sceneManager?.show('tavern')
  }
}
