import { Container, Graphics } from 'pixi.js'
import type { GameUiTheme } from '../theme/gameTheme.ts'
import { GameLabel } from './GameLabel.ts'
import { buildRadarPoints, type RadarPoint } from '../utils/radarProjection.ts'

export interface CharacterAbilityRadarOptions {
  width: number
  height: number
  theme: GameUiTheme
  stats: { name: string; value: number }[]
  min: number
  max: number
}

const GRID_LEVELS = [0.25, 0.5, 0.75, 1.0]

export class CharacterAbilityRadar extends Container {
  private readonly _theme: GameUiTheme
  private readonly _grid: Graphics
  private readonly _valuePolygon: Graphics
  private readonly _labelLayer: Container
  private readonly _centerX: number
  private readonly _centerY: number
  private readonly _radius: number
  private _lastStats: { name: string; value: number }[] = []
  private _lastPoints: RadarPoint[] = []

  constructor(options: CharacterAbilityRadarOptions) {
    super()

    this._theme = options.theme
    const padding = 28
    this._centerX = options.width / 2
    this._centerY = options.height / 2
    this._radius = Math.min(options.width, options.height) / 2 - padding

    this._grid = new Graphics()
    this.addChild(this._grid)

    this._valuePolygon = new Graphics()
    this.addChild(this._valuePolygon)

    this._labelLayer = new Container()
    this.addChild(this._labelLayer)

    this.setStats(options.stats, options.min, options.max)
  }

  setStats(
    stats: { name: string; value: number }[],
    min: number,
    max: number,
  ): void {
    this.drawGrid(stats)
    this.drawValuePolygon(stats, min, max)
    this.drawLabels(stats)
  }

  private drawGrid(stats: { name: string }[]): void {
    this._grid.clear()
    const count = stats.length
    if (count < 2) return

    for (const level of GRID_LEVELS) {
      const points: { x: number; y: number }[] = []
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count
        points.push({
          x: this._centerX + Math.cos(angle) * this._radius * level,
          y: this._centerY + Math.sin(angle) * this._radius * level,
        })
      }

      this._grid.moveTo(points[0]!.x, points[0]!.y)
      for (let i = 1; i < points.length; i++) {
        this._grid.lineTo(points[i]!.x, points[i]!.y)
      }
      this._grid.closePath()
      this._grid.stroke({
        color: this._theme.colors.panelBorder,
        width: 1,
        alpha: 0.5,
      })
    }

    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count
      const x = this._centerX + Math.cos(angle) * this._radius
      const y = this._centerY + Math.sin(angle) * this._radius
      this._grid.moveTo(this._centerX, this._centerY).lineTo(x, y).stroke({
        color: this._theme.colors.panelBorder,
        width: 1,
        alpha: 0.5,
      })
    }
  }

  private drawValuePolygon(
    stats: { name: string; value: number }[],
    min: number,
    max: number,
  ): void {
    this._valuePolygon.clear()
    this._lastStats = stats
    const count = stats.length
    if (count < 2) {
      this._lastPoints = []
      return
    }

    this._lastPoints = buildRadarPoints(
      stats,
      this._centerX,
      this._centerY,
      this._radius,
      min,
      max,
    )

    this._valuePolygon.moveTo(this._lastPoints[0]!.x, this._lastPoints[0]!.y)
    for (let i = 1; i < this._lastPoints.length; i++) {
      this._valuePolygon.lineTo(this._lastPoints[i]!.x, this._lastPoints[i]!.y)
    }
    this._valuePolygon.closePath()
    this._valuePolygon.fill({
      color: this._theme.colors.accent,
      alpha: 0.35,
    })
    this._valuePolygon.stroke({
      color: this._theme.colors.accent,
      width: 2,
      alpha: 0.9,
    })
  }

  private drawLabels(stats: { name: string; value: number }[]): void {
    for (const child of [...this._labelLayer.children]) {
      this._labelLayer.removeChild(child)
      child.destroy({ children: true })
    }

    const count = stats.length
    if (count < 2) return

    const points = buildRadarPoints(
      stats,
      this._centerX,
      this._centerY,
      this._radius,
      0,
      1,
    )

    points.forEach((point, index) => {
      const stat = stats[index]!
      const label = new GameLabel(
        `${stat.name} ${stat.value}`,
        this._theme,
        'caption',
      )
      label.anchor.set(0.5)
      label.x = point.x
      label.y = point.y
      this._labelLayer.addChild(label)
    })
  }

  getAxisCount(): number {
    return this._lastStats.length
  }

  getValuePolygonPoints(): RadarPoint[] {
    return this._lastPoints
  }
}
