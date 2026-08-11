import type { Container } from 'pixi.js'
import type { GameScene, GameSceneContext } from '../types.ts'

export class GameSceneManager {
  private readonly _context: GameSceneContext
  private readonly _onMount?: (scene: GameScene) => void
  private readonly _scenes = new Map<string, GameScene>()
  private _current: GameScene | null = null

  constructor(
    context: GameSceneContext,
    options?: { onMount?: (scene: GameScene) => void },
  ) {
    this._context = context
    this._onMount = options?.onMount
  }

  register(scene: GameScene): void {
    this._scenes.set(scene.id, scene)
  }

  show(sceneId: string): GameScene | null {
    const next = this._scenes.get(sceneId) ?? null
    if (!next || next === this._current) return this._current

    this._current?.unmount()
    this._current = next
    this._current.mount(this._context)
    this._onMount?.(this._current)
    return this._current
  }

  update(dt: number): void {
    this._current?.update?.(dt)
  }

  unmountCurrent(): void {
    this._current?.unmount()
    this._current = null
  }

  get current(): GameScene | null {
    return this._current
  }

  clearLayers(layers: Record<string, Container>): void {
    for (const layer of Object.values(layers)) {
      layer.removeChildren()
    }
  }
}
