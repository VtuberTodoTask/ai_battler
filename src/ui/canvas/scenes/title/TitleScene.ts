import { Assets, Container, Graphics, Sprite, Text } from 'pixi.js'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import { AudioController } from '../../audio/AudioController.ts'
import { GAME_VERSION } from '../../../../version.ts'
import type { GameScene, GameSceneContext } from '../../types.ts'

const BACKGROUND_URL = '/assets/title/title_background.jpeg'
const LOGO_URL = '/assets/title/title_logo.png'

export class TitleScene implements GameScene {
  readonly id = 'title'

  private _context: GameSceneContext | null = null
  private _root: Container | null = null
  private _buttons: GameButton[] = []
  private _loaded = false

  mount(context: GameSceneContext): void {
    this._context = context
    this._root = new Container()
    context.layers.background.addChild(this._root)

    this.drawLoading()

    void this.loadAssets().then(() => {
      this._loaded = true
      this.drawScene(context)
      AudioController.playBgm('tavern')
    })
  }

  unmount(): void {
    if (this._root) {
      this._root.parent?.removeChild(this._root)
      this._root.destroy({ children: true })
      this._root = null
    }
    this._buttons = []
    this._context = null
    this._loaded = false
  }

  update(): void {}

  private drawLoading(): void {
    if (!this._root) return
    const label = new Text({
      text: 'Loading...',
      style: {
        fontFamily: this._context?.theme.typography.heading,
        fontSize: 28,
        fill: this._context?.theme.colors.textPrimary,
        align: 'center',
      },
    })
    label.anchor.set(0.5)
    label.x = VIRTUAL_WIDTH / 2
    label.y = VIRTUAL_HEIGHT / 2
    this._root.addChild(label)
  }

  private async loadAssets(): Promise<void> {
    if (typeof Assets.load !== 'function') return
    try {
      await Assets.load([BACKGROUND_URL, LOGO_URL])
    } catch {
      // Ignore asset load failures (e.g., in test environments).
    }
  }

  private drawScene(context: GameSceneContext): void {
    if (!this._root) return
    this._root.removeChildren()

    this.drawBackground(context)
    this.drawDimOverlay(context)
    this.drawLogo(context)
    this.drawMenu(context)
    this.drawVersion(context)
  }

  private drawBackground(_context: GameSceneContext): void {
    if (typeof Assets.load !== 'function') return
    const texture = Assets.get(BACKGROUND_URL)
    if (!texture) return

    const bg = new Sprite(texture)
    const naturalWidth = bg.width
    const naturalHeight = bg.height
    const scale = Math.max(
      VIRTUAL_WIDTH / naturalWidth,
      VIRTUAL_HEIGHT / naturalHeight,
    )
    bg.scale.set(scale)
    bg.x = (VIRTUAL_WIDTH - naturalWidth * scale) / 2
    bg.y = (VIRTUAL_HEIGHT - naturalHeight * scale) / 2
    this._root?.addChild(bg)
  }

  private drawDimOverlay(context: GameSceneContext): void {
    const graphics = new Graphics()
    graphics
      .rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
      .fill({ color: context.theme.colors.background, alpha: 0.35 })
    this._root?.addChild(graphics)
  }

  private drawLogo(_context: GameSceneContext): void {
    if (typeof Assets.load !== 'function') return
    const texture = Assets.get(LOGO_URL)
    if (!texture) return

    const logo = new Sprite(texture)
    logo.anchor.set(0.5)
    const maxWidth = VIRTUAL_WIDTH * 0.55
    const scale = Math.min(maxWidth / logo.width, 1)
    logo.scale.set(scale)
    logo.x = VIRTUAL_WIDTH / 2
    logo.y = 210
    this._root?.addChild(logo)
  }

  private drawMenu(context: GameSceneContext): void {
    const buttonWidth = 320
    const buttonHeight = 56
    const centerX = VIRTUAL_WIDTH / 2 - buttonWidth / 2
    const startY = 420
    const gap = 24

    const newGameButton = new GameButton({
      width: buttonWidth,
      height: buttonHeight,
      theme: context.theme,
      label: 'ニューゲーム',
    })
    newGameButton.x = centerX
    newGameButton.y = startY
    newGameButton.onActivate = () => {
      context.actions.newGame?.()
    }

    const loadGameButton = new GameButton({
      width: buttonWidth,
      height: buttonHeight,
      theme: context.theme,
      label: 'ロードゲーム',
    })
    loadGameButton.x = centerX
    loadGameButton.y = startY + buttonHeight + gap
    loadGameButton.onActivate = () => {
      context.actions.openSaveLoad?.('load')
    }

    const legacyButton = new GameButton({
      width: buttonWidth,
      height: buttonHeight,
      theme: context.theme,
      label: 'Legacy UIへ',
    })
    legacyButton.x = centerX
    legacyButton.y = startY + (buttonHeight + gap) * 2
    legacyButton.onActivate = () => {
      context.actions.switchToLegacy?.()
    }

    this._root?.addChild(newGameButton, loadGameButton, legacyButton)
    this._buttons = [newGameButton, loadGameButton, legacyButton]
  }

  private drawVersion(context: GameSceneContext): void {
    const label = new GameLabel(
      `Version ${GAME_VERSION}`,
      context.theme,
      'caption',
    )
    label.x = VIRTUAL_WIDTH - label.textWidth - context.theme.spacing.s16
    label.y = VIRTUAL_HEIGHT - 28
    this._root?.addChild(label)
  }
}
