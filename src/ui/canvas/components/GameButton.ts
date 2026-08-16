import { Container, Graphics, Rectangle } from 'pixi.js'
import type { GameUiTheme } from '../theme/gameTheme.ts'
import { AudioController } from '../audio/AudioController.ts'
import { GameLabel } from './GameLabel.ts'

export type ButtonState =
  'normal' | 'hover' | 'pressed' | 'disabled' | 'focused'

export interface GameButtonOptions {
  width: number
  height: number
  theme: GameUiTheme
  label: string
  disabled?: boolean
}

export class GameButton extends Container {
  private readonly _graphics: Graphics
  private readonly _label: GameLabel
  private readonly _theme: GameUiTheme
  private readonly _width: number
  private readonly _height: number
  private _state: ButtonState = 'normal'
  private _isEnabled = true
  private _onActivate?: () => void

  constructor(options: GameButtonOptions) {
    super()

    this._width = options.width
    this._height = options.height
    this._theme = options.theme

    this._graphics = new Graphics()
    this.addChild(this._graphics)

    this._label = new GameLabel(options.label, this._theme, 'button')
    this.addChild(this._label)

    this.eventMode = 'static'
    this.hitArea = new Rectangle(0, 0, this._width, this._height)

    this.on('pointerover', this.onPointerOver)
    this.on('pointerout', this.onPointerOut)
    this.on('pointerdown', this.onPointerDown)
    this.on('pointerup', this.onPointerUp)
    this.on('pointertap', this.onPointerTap)

    this._isEnabled = !options.disabled
    this._state = this._isEnabled ? 'normal' : 'disabled'
    this.cursor = this._isEnabled ? 'pointer' : 'default'
    this.draw()
    this.centerLabel()
  }

  get state(): ButtonState {
    return this._state
  }

  get isEnabled(): boolean {
    return this._isEnabled
  }

  setLabel(label: string): void {
    this._label.text = label
    this.centerLabel()
  }

  setEnabled(enabled: boolean): void {
    if (this._isEnabled === enabled) return
    this._isEnabled = enabled
    this.cursor = enabled ? 'pointer' : 'default'
    this._state = enabled ? 'normal' : 'disabled'
    this.draw()
  }

  set onActivate(callback: (() => void) | undefined) {
    this._onActivate = callback
  }

  focus(): void {
    if (!this._isEnabled) return
    this._state = 'focused'
    this.draw()
  }

  blur(): void {
    if (!this._isEnabled) return
    this._state = 'normal'
    this.draw()
  }

  activate(): void {
    if (!this._isEnabled) return
    this._onActivate?.()
  }

  private onPointerOver = (): void => {
    if (!this._isEnabled) return
    if (this._state !== 'hover') {
      AudioController.playSe('cursor')
    }
    this._state = 'hover'
    this.draw()
  }

  private onPointerOut = (): void => {
    if (!this._isEnabled) return
    this._state = 'normal'
    this.draw()
  }

  private onPointerDown = (): void => {
    if (!this._isEnabled) return
    this._state = 'pressed'
    this.draw()
  }

  private onPointerUp = (): void => {
    if (!this._isEnabled) return
    this._state = 'hover'
    this.draw()
  }

  private onPointerTap = (): void => {
    if (!this._isEnabled) return
    AudioController.playSe('decision')
    this.activate()
  }

  private draw(): void {
    const colors = this._theme.colors
    let fill = colors.accent
    let stroke = colors.brass

    switch (this._state) {
      case 'hover':
        fill = colors.accentHover
        break
      case 'pressed':
        fill = colors.accentPressed
        break
      case 'disabled':
        fill = colors.panel
        stroke = colors.panelBorder
        break
      case 'focused':
        stroke = colors.parchment
        break
      default:
        fill = colors.accent
    }

    this._graphics.clear()
    this._graphics
      .roundRect(0, 0, this._width, this._height, this._theme.radius.medium)
      .fill({ color: fill })
      .stroke({ width: 2, color: stroke })

    this._label.alpha = this._isEnabled ? 1 : 0.6
  }

  private centerLabel(): void {
    this._label.x = this._width / 2 - this._label.textWidth / 2
    this._label.y = this._height / 2 - this._label.textHeight / 2
  }
}
