import { Container } from 'pixi.js'
import type { GameUiTheme } from '../theme/gameTheme.ts'
import { GameModal } from '../components/GameModal.ts'
import { GameTooltip } from '../components/GameTooltip.ts'

export class OverlayManager {
  private readonly _overlayLayer: Container
  private readonly _modalLayer: Container
  private readonly _theme: GameUiTheme
  private readonly _tooltip: GameTooltip
  private readonly _modal: GameModal
  private _onClose?: () => void

  constructor(
    overlayLayer: Container,
    modalLayer: Container,
    theme: GameUiTheme,
  ) {
    this._overlayLayer = overlayLayer
    this._modalLayer = modalLayer
    this._theme = theme

    this._tooltip = new GameTooltip(theme)
    this._overlayLayer.addChild(this._tooltip)

    this._modal = new GameModal(theme, () => this.closeModal())
    this._modalLayer.addChild(this._modal)
  }

  showTooltip(text: string, x: number, y: number): void {
    this._tooltip.show(text, x, y)
  }

  hideTooltip(): void {
    this._tooltip.hide()
  }

  openModal(title: string, content: Container | string): void {
    this._modal.open(title, content)
  }

  closeModal(): void {
    this._modal.close()
    this._onClose?.()
  }

  onClose(callback: () => void): void {
    this._onClose = callback
  }

  resize(availableWidth: number, availableHeight: number): void {
    this._modal.resize(availableWidth, availableHeight)
  }
}
