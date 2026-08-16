import { Container, Graphics } from 'pixi.js'
import type { GameUiTheme } from '../theme/gameTheme.ts'
import { GameButton } from './GameButton.ts'
import { GameLabel } from './GameLabel.ts'
import { GamePanel } from './GamePanel.ts'
import { GameScrollingLabel } from './GameScrollingLabel.ts'

const VIRTUAL_WIDTH = 1600
const VIRTUAL_HEIGHT = 900

function destroyChildren(container: Container): void {
  const children = container.removeChildren()
  for (const child of children) {
    child.destroy({ children: true })
  }
}

export class GameModal extends Container {
  private readonly _dim: Graphics
  private readonly _panel: GamePanel
  private readonly _titleLabel: GameScrollingLabel
  private readonly _bodyContainer: Container
  private readonly _closeButton: GameButton
  private readonly _theme: GameUiTheme
  private _width = 600
  private _height = 360
  private _footer?: Container

  constructor(theme: GameUiTheme, onClose: () => void) {
    super()

    this._theme = theme
    this.visible = false
    this.eventMode = 'static'

    this._dim = new Graphics()
    this._dim.eventMode = 'static'
    this.addChild(this._dim)

    this._panel = new GamePanel({
      width: this._width,
      height: this._height,
      theme,
      color: theme.colors.panel,
      borderColor: theme.colors.brass,
      radius: theme.radius.large,
    })
    this._panel.x = (VIRTUAL_WIDTH - this._width) / 2
    this._panel.y = (VIRTUAL_HEIGHT - this._height) / 2
    this.addChild(this._panel)

    this._titleLabel = new GameScrollingLabel({
      text: '',
      theme,
      kind: 'heading',
      maxWidth: this._width - this._theme.spacing.s48,
      align: 'center',
    })
    this._titleLabel.x = this._panel.x + this._theme.spacing.s24
    this._titleLabel.y = this._panel.y + this._theme.spacing.s24
    this.addChild(this._titleLabel)

    this._bodyContainer = new Container()
    this._bodyContainer.x = this._panel.x + this._theme.spacing.s24
    this._bodyContainer.y = this._panel.y + this._theme.spacing.s48
    this.addChild(this._bodyContainer)

    this._closeButton = new GameButton({
      width: 120,
      height: 40,
      theme,
      label: '閉じる',
    })
    this._closeButton.x =
      this._panel.x + this._width - 120 - this._theme.spacing.s24
    this._closeButton.y =
      this._panel.y + this._height - 40 - this._theme.spacing.s24
    this._closeButton.onActivate = onClose
    this.addChild(this._closeButton)
  }

  open(title: string, content: Container | string, footer?: Container): void {
    this._titleLabel.text = title
    destroyChildren(this._bodyContainer)
    if (this._footer) {
      this.removeChild(this._footer)
      this._footer.destroy({ children: true })
      this._footer = undefined
    }

    const titleBottom =
      this._titleLabel.y +
      (this._titleLabel.textHeight || this._theme.spacing.s32)
    this._bodyContainer.y = titleBottom + this._theme.spacing.s16

    if (typeof content === 'string') {
      const label = new GameLabel(content, this._theme, 'body', {
        maxWidth: this._width - this._theme.spacing.s48,
        align: 'left',
      })
      this._bodyContainer.addChild(label)
    } else {
      this._bodyContainer.addChild(content)
    }

    if (footer) {
      this._footer = footer
      const footerHeight = footer.height || 40
      footer.x = this._panel.x + this._theme.spacing.s24
      footer.y =
        this._panel.y + this._height - footerHeight - this._theme.spacing.s24
      this.addChild(footer)
    }

    this.visible = true
  }

  close(): void {
    this.visible = false
  }

  resize(availableWidth: number, availableHeight: number): void {
    this._dim.clear()
    this._dim
      .rect(0, 0, availableWidth, availableHeight)
      .fill({ color: this._theme.colors.dim, alpha: 0.7 })
  }
}
