import type { Container } from 'pixi.js'
import type { GameScene, GameSceneContext } from '../types.ts'

export class GameSceneManager {
  private readonly _context: GameSceneContext
  private readonly _onMount?: (scene: GameScene) => void
  private readonly _scenes = new Map<string, GameScene>()
  private _current: GameScene | null = null
  private readonly _stack: GameScene[] = []

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
    this._stack.length = 0
    this._stack.push(next)
    this._current = next
    this._current.mount(this._context)
    this._onMount?.(this._current)
    return this._current
  }

  push(sceneId: string, input?: unknown): GameScene | null {
    const next = this._scenes.get(sceneId) ?? null
    if (!next || next === this._current) return this._current

    this._current?.unmount()
    if (this._current) {
      this._stack.push(this._current)
    }
    this._current = next
    this._current.mount(this._context, input)
    this._onMount?.(this._current)
    return this._current
  }

  pop(): GameScene | null {
    this._current?.unmount()
    const previous = this._stack.pop()
    if (!previous) {
      this._current = null
      return null
    }
    this._current = previous
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
    this._stack.length = 0
  }

  get current(): GameScene | null {
    return this._current
  }

  get stack(): readonly GameScene[] {
    return this._stack
  }

  clearLayers(layers: Record<string, Container>): void {
    for (const layer of Object.values(layers)) {
      layer.removeChildren()
    }
  }
}
