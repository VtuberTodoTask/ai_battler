import { Container, Graphics } from 'pixi.js'
import type { GameUiTheme } from '../theme/gameTheme.ts'
import { GameLabel } from './GameLabel.ts'

export interface GamePanelOptions {
  width: number
  height: number
  theme: GameUiTheme
  title?: string
  color?: number
  borderColor?: number
  radius?: number
}

export class GamePanel extends Container {
  private readonly _graphics: Graphics
  private readonly _theme: GameUiTheme
  private _titleLabel?: GameLabel
  private _width: number
  private _height: number
  private _color: number
  private _borderColor: number
  private _radius: number

  constructor(options: GamePanelOptions) {
    super()

    this._width = options.width
    this._height = options.height
    this._theme = options.theme
    this._color = options.color ?? this._theme.colors.panel
    this._borderColor = options.borderColor ?? this._theme.colors.panelBorder
    this._radius = options.radius ?? this._theme.radius.medium

    this._graphics = new Graphics()
    this.addChild(this._graphics)

    if (options.title) {
      this._titleLabel = new GameLabel(options.title, this._theme, 'caption')
      this._titleLabel.x = this._theme.spacing.s16
      this._titleLabel.y = this._theme.spacing.s12
      this.addChild(this._titleLabel)
    }

    this.draw()
  }

  get panelWidth(): number {
    return this._width
  }

  get panelHeight(): number {
    return this._height
  }

  setSize(width: number, height: number): void {
    if (this._width === width && this._height === height) return
    this._width = width
    this._height = height
    this.draw()
  }

  setColor(color: number, borderColor?: number): void {
    this._color = color
    if (borderColor !== undefined) {
      this._borderColor = borderColor
    }
    this.draw()
  }

  setTitle(title: string): void {
    if (!this._titleLabel) {
      this._titleLabel = new GameLabel(title, this._theme, 'caption')
      this._titleLabel.x = this._theme.spacing.s16
      this._titleLabel.y = this._theme.spacing.s12
      this.addChild(this._titleLabel)
    } else {
      this._titleLabel.text = title
    }
    this.draw()
  }

  private draw(): void {
    this._graphics.clear()

    this._graphics
      .roundRect(0, 0, this._width, this._height, this._radius)
      .fill({ color: this._color })
      .stroke({ width: 2, color: this._borderColor })
  }
}
