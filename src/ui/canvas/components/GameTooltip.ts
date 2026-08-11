import { Container } from 'pixi.js'
import type { GameUiTheme } from '../theme/gameTheme.ts'
import { GameLabel } from './GameLabel.ts'
import { GamePanel } from './GamePanel.ts'

export class GameTooltip extends Container {
  private readonly _panel: GamePanel
  private readonly _label: GameLabel
  private readonly _theme: GameUiTheme

  constructor(theme: GameUiTheme) {
    super()

    this._theme = theme
    this.visible = false

    this._panel = new GamePanel({
      width: 240,
      height: 40,
      theme,
      color: theme.colors.wood,
      borderColor: theme.colors.brass,
      radius: theme.radius.small,
    })
    this.addChild(this._panel)

    this._label = new GameLabel('', theme, 'caption', {
      maxWidth: 220,
      align: 'left',
    })
    this._label.x = this._theme.spacing.s12
    this._label.y = this._theme.spacing.s8
    this.addChild(this._label)
  }

  show(text: string, x: number, y: number): void {
    this._label.text = text

    const padding = this._theme.spacing.s12
    const width = Math.min(
      320,
      Math.max(120, this._label.textWidth + padding * 2),
    )
    const height = Math.max(40, this._label.textHeight + padding * 2)

    this._panel.setSize(width, height)
    this._label.x = padding
    this._label.y = padding / 2

    this.x = x + 12
    this.y = y + 12
    this.visible = true
  }

  hide(): void {
    this.visible = false
  }
}
