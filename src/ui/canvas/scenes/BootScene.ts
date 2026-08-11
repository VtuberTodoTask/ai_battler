import { Container, Text } from 'pixi.js'
import { GamePanel } from '../components/GamePanel.ts'
import type { GameScene, GameSceneContext } from '../types.ts'

const BOOT_DURATION_MS = 1200

export class BootScene implements GameScene {
  readonly id = 'boot'

  private _context: GameSceneContext | null = null
  private _elapsed = 0
  private _container: Container | null = null
  private _label: Text | null = null

  mount(context: GameSceneContext): void {
    this._context = context
    this._elapsed = 0

    this._container = new Container()
    context.layers.ui.addChild(this._container)

    const { theme, viewport } = context
    const panel = new GamePanel({
      width: 400,
      height: 160,
      theme,
      color: theme.colors.panel,
      borderColor: theme.colors.brass,
      radius: theme.radius.large,
    })
    panel.x = (viewport.virtualWidth - 400) / 2
    panel.y = (viewport.virtualHeight - 160) / 2
    this._container.addChild(panel)

    this._label = new Text({
      text: 'Loading...',
      style: {
        fontFamily: theme.typography.heading,
        fontSize: 32,
        fill: theme.colors.textPrimary,
        align: 'center',
      },
    })
    this._label.anchor.set(0.5)
    this._label.x = viewport.virtualWidth / 2
    this._label.y = viewport.virtualHeight / 2
    this._container.addChild(this._label)
  }

  update(dt: number): void {
    if (!this._context) return

    this._elapsed += dt

    if (this._label) {
      const dots = Math.min(3, Math.floor(this._elapsed / 400) % 4)
      this._label.text = `Loading${'.'.repeat(dots)}`
    }

    if (this._elapsed >= BOOT_DURATION_MS && this._context) {
      this._context.canvasGame.sceneManager?.show('foundation')
    }
  }

  unmount(): void {
    if (this._container) {
      this._container.parent?.removeChild(this._container)
      this._container.destroy({ children: true })
      this._container = null
    }
    this._label = null
    this._context = null
  }
}
