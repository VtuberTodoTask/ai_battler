export const VIRTUAL_WIDTH = 1600
export const VIRTUAL_HEIGHT = 900
export const MAX_DEVICE_PIXEL_RATIO = 2

export interface ViewportMetrics {
  virtualWidth: number
  virtualHeight: number
  scale: number
  offsetX: number
  offsetY: number
  availableWidth: number
  availableHeight: number
}

export class GameViewport {
  private _metrics: ViewportMetrics

  constructor() {
    this._metrics = {
      virtualWidth: VIRTUAL_WIDTH,
      virtualHeight: VIRTUAL_HEIGHT,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      availableWidth: VIRTUAL_WIDTH,
      availableHeight: VIRTUAL_HEIGHT,
    }
  }

  get metrics(): ViewportMetrics {
    return { ...this._metrics }
  }

  get virtualWidth(): number {
    return this._metrics.virtualWidth
  }

  get virtualHeight(): number {
    return this._metrics.virtualHeight
  }

  get scale(): number {
    return this._metrics.scale
  }

  get offsetX(): number {
    return this._metrics.offsetX
  }

  get offsetY(): number {
    return this._metrics.offsetY
  }

  resize(availableWidth: number, availableHeight: number): void {
    const scale = Math.min(
      availableWidth / VIRTUAL_WIDTH,
      availableHeight / VIRTUAL_HEIGHT,
    )
    const offsetX = (availableWidth - VIRTUAL_WIDTH * scale) / 2
    const offsetY = (availableHeight - VIRTUAL_HEIGHT * scale) / 2

    this._metrics = {
      virtualWidth: VIRTUAL_WIDTH,
      virtualHeight: VIRTUAL_HEIGHT,
      scale,
      offsetX,
      offsetY,
      availableWidth,
      availableHeight,
    }
  }

  toVirtualX(screenX: number): number {
    return (screenX - this._metrics.offsetX) / this._metrics.scale
  }

  toVirtualY(screenY: number): number {
    return (screenY - this._metrics.offsetY) / this._metrics.scale
  }

  toScreenX(virtualX: number): number {
    return virtualX * this._metrics.scale + this._metrics.offsetX
  }

  toScreenY(virtualY: number): number {
    return virtualY * this._metrics.scale + this._metrics.offsetY
  }
}
