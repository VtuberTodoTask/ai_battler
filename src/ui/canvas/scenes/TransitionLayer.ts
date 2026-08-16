import { Container, Graphics, Rectangle } from 'pixi.js'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../GameViewport.ts'

const FADE_OUT_MS = 300

export class TransitionLayer {
  private readonly _graphics: Graphics
  private _phase: 'idle' | 'out' = 'idle'
  private _elapsed = 0
  private _onComplete?: () => void

  constructor(layer: Container) {
    this._graphics = new Graphics()
    this._graphics.eventMode = 'static'
    this._graphics.hitArea = new Rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
    this._graphics.visible = false
    layer.addChild(this._graphics)
  }

  start(onComplete?: () => void): void {
    this._phase = 'out'
    this._elapsed = 0
    this._onComplete = onComplete
    this._graphics.visible = true
    this.draw(1)
  }

  update(deltaMS: number): void {
    if (this._phase === 'idle') return

    this._elapsed += deltaMS
    const progress = Math.min(1, this._elapsed / FADE_OUT_MS)
    this.draw(1 - progress)

    if (progress >= 1) {
      this._phase = 'idle'
      this._graphics.visible = false
      this._onComplete?.()
    }
  }

  private draw(alpha: number): void {
    this._graphics.clear()
    this._graphics
      .rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
      .fill({ color: 0x000000, alpha })
  }
}
