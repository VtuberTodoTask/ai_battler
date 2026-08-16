import type { Container } from 'pixi.js'
import type { GameScene, GameSceneContext } from '../types.ts'
import { TransitionLayer } from './TransitionLayer.ts'

export class GameSceneManager {
  private readonly _context: GameSceneContext
  private readonly _onMount?: (scene: GameScene) => void
  private readonly _scenes = new Map<string, GameScene>()
  private _current: GameScene | null = null
  private _currentInput: unknown = undefined
  private _previous: GameScene | null = null
  private readonly _stack: GameScene[] = []
  private readonly _stackInputs: unknown[] = []
  private readonly _transition: TransitionLayer

  constructor(
    context: GameSceneContext,
    options?: { onMount?: (scene: GameScene) => void },
  ) {
    this._context = context
    this._onMount = options?.onMount
    this._transition = new TransitionLayer(context.layers.transition)
  }

  register(scene: GameScene): void {
    this._scenes.set(scene.id, scene)
  }

  show(sceneId: string): GameScene | null {
    const next = this._scenes.get(sceneId) ?? null
    if (!next || next === this._current) return this._current

    const old = this._current
    if (old) {
      this._stack.length = 0
      this._stackInputs.length = 0
      this._previous = old
      this.unmountPrevious()
    }

    this._current = next
    this._currentInput = undefined
    this._stack.push(next)

    next.mount(this._context)
    this._onMount?.(next)

    if (old) {
      this._transition.start()
    }

    return this._current
  }

  push(sceneId: string, input?: unknown): GameScene | null {
    const next = this._scenes.get(sceneId) ?? null
    if (!next || next === this._current) return this._current

    const old = this._current
    if (old) {
      this._stack.push(old)
      this._stackInputs.push(this._currentInput)
      this._previous = old
      this.unmountPrevious()
    }

    this._current = next
    this._currentInput = input

    next.mount(this._context, input)
    this._onMount?.(next)

    if (old) {
      this._transition.start()
    }

    return this._current
  }

  pop(): GameScene | null {
    const previous = this._stack.pop()
    const previousInput = this._stackInputs.pop()
    if (!previous) {
      this._current?.unmount()
      this._current = null
      this._currentInput = undefined
      return null
    }

    const old = this._current
    if (old) {
      this._previous = old
      this.unmountPrevious()
    }

    this._current = previous
    this._currentInput = previousInput

    previous.mount(this._context, previousInput)
    this._onMount?.(previous)

    if (old) {
      this._transition.start()
    }

    return this._current
  }

  update(dt: number): void {
    this._transition.update(dt)
    this._current?.update?.(dt)
  }

  unmountCurrent(): void {
    this._previous?.unmount()
    this._previous = null
    this._current?.unmount()
    this._current = null
    this._currentInput = undefined
    this._stack.length = 0
    this._stackInputs.length = 0
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

  private unmountPrevious(): void {
    this._previous?.unmount()
    this._previous = null
  }
}
