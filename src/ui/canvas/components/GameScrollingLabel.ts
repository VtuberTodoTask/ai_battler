import { Container, Graphics, Ticker } from 'pixi.js'
import type { GameUiTheme } from '../theme/gameTheme.ts'
import type { TypographyKind } from '../theme/typography.ts'
import { GameLabel } from './GameLabel.ts'

export interface GameScrollingLabelOptions {
  text: string
  theme: GameUiTheme
  kind: TypographyKind
  maxWidth: number
  align?: 'left' | 'center' | 'right'
  pause?: number
  scrollSpeed?: number
}

export class GameScrollingLabel extends Container {
  private readonly _theme: GameUiTheme
  private readonly _kind: TypographyKind
  private readonly _maxWidth: number
  private readonly _align: 'left' | 'center' | 'right'
  private readonly _pause: number
  private readonly _scrollSpeed: number
  private readonly _label: GameLabel
  private readonly _mask: Graphics
  private _elapsed = 0
  private _phase: 'hold-start' | 'scroll-end' | 'hold-end' | 'scroll-start' =
    'hold-start'
  private _ticker: ((ticker: Ticker) => void) | null = null

  constructor(options: GameScrollingLabelOptions) {
    super()

    this._theme = options.theme
    this._kind = options.kind
    this._maxWidth = options.maxWidth
    this._align = options.align ?? 'left'
    this._pause = options.pause ?? 1.5
    this._scrollSpeed = options.scrollSpeed ?? 60

    this._label = new GameLabel(options.text, this._theme, this._kind)
    this.addChild(this._label)

    this._mask = new Graphics()
    this._mask
      .rect(0, 0, this._maxWidth, this._label.textHeight || 1)
      .fill({ color: 0xffffff })
    this.mask = this._mask

    this._refreshLayout()
  }

  set text(value: string) {
    this._label.text = value
    this._elapsed = 0
    this._phase = 'hold-start'
    this._refreshLayout()
  }

  get text(): string {
    return this._label.text
  }

  get textWidth(): number {
    return this._label.textWidth
  }

  get textHeight(): number {
    return this._label.textHeight
  }

  private _refreshLayout(): void {
    this._mask.clear()
    this._mask
      .rect(0, 0, this._maxWidth, this._label.textHeight || 1)
      .fill({ color: 0xffffff })

    const textWidth = this._label.textWidth
    if (textWidth <= this._maxWidth) {
      this._stopTicker()
      if (this._align === 'center') {
        this._label.x = (this._maxWidth - textWidth) / 2
      } else if (this._align === 'right') {
        this._label.x = this._maxWidth - textWidth
      } else {
        this._label.x = 0
      }
      return
    }

    this._label.x = 0
    this._startTicker()
  }

  private _startTicker(): void {
    if (this._ticker) return
    const tick = (ticker: Ticker): void => {
      const textWidth = this._label.textWidth
      if (textWidth <= this._maxWidth) {
        this._stopTicker()
        return
      }

      const overflow = textWidth - this._maxWidth
      const travelTime = overflow / this._scrollSpeed

      this._elapsed += ticker.deltaMS / 1000

      switch (this._phase) {
        case 'hold-start':
          if (this._elapsed >= this._pause) {
            this._elapsed = 0
            this._phase = 'scroll-end'
          }
          break
        case 'scroll-end': {
          const t = Math.min(this._elapsed / travelTime, 1)
          this._label.x = -overflow * t
          if (t >= 1) {
            this._elapsed = 0
            this._phase = 'hold-end'
          }
          break
        }
        case 'hold-end':
          if (this._elapsed >= this._pause) {
            this._elapsed = 0
            this._phase = 'scroll-start'
          }
          break
        case 'scroll-start': {
          const t = Math.min(this._elapsed / travelTime, 1)
          this._label.x = -overflow * (1 - t)
          if (t >= 1) {
            this._elapsed = 0
            this._phase = 'hold-start'
          }
          break
        }
      }
    }
    this._ticker = tick
    Ticker.shared.add(tick)
  }

  private _stopTicker(): void {
    if (!this._ticker) return
    Ticker.shared.remove(this._ticker)
    this._ticker = null
    this._elapsed = 0
    this._phase = 'hold-start'
  }

  override destroy(options?: {
    children?: boolean
    texture?: boolean
    baseTexture?: boolean
  }): void {
    this._stopTicker()
    super.destroy(options)
  }
}
