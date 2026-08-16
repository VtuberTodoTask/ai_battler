import { Container, Graphics, Rectangle } from 'pixi.js'
import type { GameUiTheme } from '../theme/gameTheme.ts'
import { AudioController } from '../audio/AudioController.ts'
import { GameLabel } from './GameLabel.ts'

export interface TavernListRowOptions {
  width: number
  height: number
  theme: GameUiTheme
  title: string
  subtitle?: string
  trailing?: string
  selected?: boolean
  disabled?: boolean
  unread?: boolean
}

export class TavernListRow extends Container {
  private readonly _graphics: Graphics
  private readonly _titleLabel: GameLabel
  private readonly _subtitleLabel: GameLabel
  private readonly _trailingLabel?: GameLabel
  private readonly _unreadDot: Graphics
  private readonly _theme: GameUiTheme
  private readonly _width: number
  private readonly _height: number
  private _selected = false
  private _hover = false
  private _disabled = false
  private _unread = false
  onActivate?: () => void

  constructor(options: TavernListRowOptions) {
    super()

    this._width = options.width
    this._height = options.height
    this._theme = options.theme
    this._selected = options.selected ?? false
    this._disabled = options.disabled ?? false
    this._unread = options.unread ?? false

    this._graphics = new Graphics()
    this.addChild(this._graphics)

    const titleMaxWidth = options.trailing
      ? this._width - 80
      : this._width - this._theme.spacing.s24
    this._titleLabel = new GameLabel(options.title, this._theme, 'body', {
      maxWidth: titleMaxWidth,
    })
    this._titleLabel.x = this._theme.spacing.s12
    this._titleLabel.y = this._theme.spacing.s4
    this.addChild(this._titleLabel)

    if (options.trailing) {
      this._trailingLabel = new GameLabel(options.trailing, this._theme, 'body')
      this.addChild(this._trailingLabel)
    }

    this._subtitleLabel = new GameLabel(
      options.subtitle ?? '',
      this._theme,
      'caption',
      { maxWidth: this._width - this._theme.spacing.s24 },
    )
    this._subtitleLabel.x = this._theme.spacing.s12
    this._subtitleLabel.y = this._theme.spacing.s8 + this._theme.spacing.s24
    this._subtitleLabel.visible = (options.subtitle ?? '').length > 0
    this.addChild(this._subtitleLabel)

    this._unreadDot = new Graphics()
    this.addChild(this._unreadDot)

    this.eventMode = 'static'
    this.hitArea = new Rectangle(0, 0, this._width, this._height)

    this.on('pointerover', this.onPointerOver)
    this.on('pointerout', this.onPointerOut)
    this.on('pointertap', this.onPointerTap)

    this.layout()
    this.cursor = this._disabled ? 'default' : 'pointer'
    this.draw()
  }

  setTitle(value: string): void {
    this._titleLabel.text = value
    this.layout()
  }

  setSubtitle(value: string): void {
    this._subtitleLabel.text = value
    this._subtitleLabel.visible = value.length > 0
    this.draw()
  }

  setTrailing(value: string | undefined): void {
    if (!this._trailingLabel) return
    this._trailingLabel.text = value ?? ''
    this._trailingLabel.visible = (value ?? '').length > 0
    this.layout()
    this.draw()
  }

  setSelected(value: boolean): void {
    if (this._selected === value) return
    this._selected = value
    this.draw()
  }

  setEnabled(value: boolean): void {
    const disabled = !value
    if (this._disabled === disabled) return
    this._disabled = disabled
    this.cursor = disabled ? 'default' : 'pointer'
    this.alpha = disabled ? 0.6 : 1
    this.draw()
  }

  setUnread(value: boolean): void {
    this._unread = value
    this.draw()
  }

  private onPointerOver = (): void => {
    if (this._disabled) return
    if (!this._hover) {
      AudioController.playSe('pageTurn')
    }
    this._hover = true
    this.draw()
  }

  private onPointerOut = (): void => {
    this._hover = false
    this.draw()
  }

  private onPointerTap = (): void => {
    if (this._disabled) return
    AudioController.playSe('stamp')
    this.onActivate?.()
  }

  private layout(): void {
    if (!this._trailingLabel) return
    const measured = this._trailingLabel.measure()
    const trailingWidth = measured.width || this._trailingLabel.textWidth
    this._trailingLabel.x =
      this._width - trailingWidth - this._theme.spacing.s12
    this._trailingLabel.y = this._theme.spacing.s4
  }

  private draw(): void {
    const colors = this._theme.colors
    let fill = colors.panel
    let stroke = colors.panelBorder

    if (this._selected) {
      fill = colors.panelHover
      stroke = colors.parchment
    } else if (this._hover) {
      fill = colors.panelHover
      stroke = colors.brass
    }

    if (this._disabled) {
      fill = colors.panel
      stroke = colors.panelBorder
    }

    this._graphics.clear()
    this._graphics
      .roundRect(0, 0, this._width, this._height, this._theme.radius.small)
      .fill({ color: fill })
      .stroke({ width: 2, color: stroke })

    this._unreadDot.clear()
    if (this._unread) {
      this._unreadDot.circle(
        this._width - this._theme.spacing.s12,
        this._theme.spacing.s12,
        5,
      )
      this._unreadDot.fill({ color: colors.danger })
    }
  }
}
