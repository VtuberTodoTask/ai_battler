import { Container, FederatedWheelEvent, Graphics, Rectangle } from 'pixi.js'
import type { GameUiTheme } from '../theme/gameTheme.ts'

export class GameScrollView extends Container {
  private readonly _viewport: Container
  private readonly _content: Container
  private readonly _mask: Graphics
  private readonly _theme: GameUiTheme
  private _viewportWidth = 0
  private _viewportHeight = 0
  private _contentY = 0

  constructor(theme: GameUiTheme, width: number, height: number) {
    super()

    this._theme = theme
    this._viewportWidth = width
    this._viewportHeight = height

    this._viewport = new Container()
    this._viewport.eventMode = 'static'
    this._viewport.hitArea = new Rectangle(0, 0, width, height)
    this.addChild(this._viewport)

    this._content = new Container()
    this._viewport.addChild(this._content)

    this._mask = new Graphics()
    this._mask.rect(0, 0, width, height).fill({ color: 0xffffff, alpha: 1 })
    this._viewport.mask = this._mask
    this.addChild(this._mask)

    this._viewport.on('wheel', this.onWheel)
  }

  get content(): Container {
    return this._content
  }

  get viewportWidth(): number {
    return this._viewportWidth
  }

  get viewportHeight(): number {
    return this._viewportHeight
  }

  get contentHeight(): number {
    return this._content.height
  }

  get maxScroll(): number {
    return Math.max(0, this._content.height - this._viewportHeight)
  }

  setViewportSize(width: number, height: number): void {
    this._viewportWidth = width
    this._viewportHeight = height

    this._mask.clear()
    this._mask.rect(0, 0, width, height).fill({ color: 0xffffff, alpha: 1 })

    this._viewport.hitArea = new Rectangle(0, 0, width, height)

    this.clampContent()
  }

  addItem(item: Container): void {
    item.y = this._content.height
    this._content.addChild(item)
  }

  scrollToTop(): void {
    this._contentY = 0
    this.clampContent()
  }

  private onWheel = (event: FederatedWheelEvent): void => {
    this._contentY += (event.deltaY ?? 0) * 0.5
    this.clampContent()
    event.preventDefault?.()
  }

  private clampContent(): void {
    const maxScroll = Math.max(0, this._content.height - this._viewportHeight)
    this._contentY = Math.max(0, Math.min(maxScroll, this._contentY))
    this._content.y = this._contentY === 0 ? 0 : -this._contentY
  }
}
