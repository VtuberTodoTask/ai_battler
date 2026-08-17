import { Container, Graphics } from 'pixi.js'
import type { GameUiTheme } from '../theme/gameTheme.ts'
import { GameLabel } from './GameLabel.ts'
import { projectStatusGauge } from '../utils/statusGaugeProjection.ts'

export interface StatusGaugeOptions {
  label: string
  current: number
  max: number
  width: number
  height: number
  theme: GameUiTheme
  showNumbers?: boolean
  showPercent?: boolean
}

export class StatusGauge extends Container {
  private readonly _theme: GameUiTheme
  private readonly _track: Graphics
  private readonly _fill: Graphics
  private readonly _labelText: GameLabel
  private readonly _valueText: GameLabel
  private readonly _trackWidth: number
  private readonly _gaugeHeight: number
  private _current = 0
  private _max = 0

  constructor(options: StatusGaugeOptions) {
    super()

    this._theme = options.theme
    this._trackWidth = options.width
    this._gaugeHeight = options.height

    this._labelText = new GameLabel(options.label, options.theme, 'body')
    this._labelText.x = 0
    this._labelText.y = 0
    this.addChild(this._labelText)

    this._valueText = new GameLabel('', options.theme, 'numeric')
    this._valueText.x = options.width
    this._valueText.y = 0
    this._valueText.anchor.set(1, 0)
    this.addChild(this._valueText)

    const trackY = Math.max(this._labelText.textHeight, 18) + 4

    this._track = new Graphics()
    this._track
      .rect(0, trackY, options.width, options.height)
      .fill({ color: this._theme.colors.panelTitle, alpha: 0.6 })
    this.addChild(this._track)

    this._fill = new Graphics()
    this._fill.y = trackY
    this.addChild(this._fill)

    this.setValues(options.current, options.max)
  }

  setValues(current: number, max: number): void {
    this._current = current
    this._max = max
    this.redraw()
  }

  private redraw(): void {
    const projection = projectStatusGauge(this._current, this._max)

    let valueString = projection.display
    if (this._max === 0) {
      valueString = '—'
    }
    this._valueText.text = valueString

    this._fill.clear()
    const fillWidth = this._trackWidth * projection.ratio
    if (Number.isFinite(fillWidth) && fillWidth > 0) {
      this._fill
        .rect(0, 0, fillWidth, this._gaugeHeight)
        .fill({ color: this._theme.colors.accent, alpha: 0.9 })
    }
  }

  get current(): number {
    return this._current
  }

  get max(): number {
    return this._max
  }
}
