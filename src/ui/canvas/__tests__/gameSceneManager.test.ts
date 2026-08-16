// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { GameSceneManager } from '../scenes/GameSceneManager.ts'
import type { GameScene, GameSceneContext } from '../types.ts'

function createFakeContext(): GameSceneContext {
  return {
    id: 'test',
    app: {} as GameSceneContext['app'],
    viewport: {} as GameSceneContext['viewport'],
    layers: {
      background: {
        removeChildren: vi.fn(),
      } as unknown as GameSceneContext['layers']['background'],
      content: {
        removeChildren: vi.fn(),
      } as unknown as GameSceneContext['layers']['content'],
      ui: {
        removeChildren: vi.fn(),
      } as unknown as GameSceneContext['layers']['ui'],
      overlay: {
        removeChildren: vi.fn(),
      } as unknown as GameSceneContext['layers']['overlay'],
      modal: {
        removeChildren: vi.fn(),
      } as unknown as GameSceneContext['layers']['modal'],
      transition: {
        addChild: vi.fn(),
        removeChildren: vi.fn(),
      } as unknown as GameSceneContext['layers']['transition'],
      debug: {
        removeChildren: vi.fn(),
      } as unknown as GameSceneContext['layers']['debug'],
    },
    overlayManager: {} as GameSceneContext['overlayManager'],
    theme: {} as GameSceneContext['theme'],
    assetManager: {} as GameSceneContext['assetManager'],
    actions: {} as GameSceneContext['actions'],
    canvasGame: {} as GameSceneContext['canvasGame'],
  }
}

function createFakeScene(id: string): GameScene {
  return {
    id,
    mount: vi.fn(),
    unmount: vi.fn(),
    update: vi.fn(),
    setCampaign: vi.fn(),
    setUiState: vi.fn(),
  }
}

describe('GameSceneManager', () => {
  it('mounts a scene when shown', () => {
    const context = createFakeContext()
    const manager = new GameSceneManager(context)
    const scene = createFakeScene('a')

    manager.register(scene)
    const result = manager.show('a')

    expect(result).toBe(scene)
    expect(scene.mount).toHaveBeenCalledWith(context)
    expect(scene.unmount).not.toHaveBeenCalled()
  })

  it('unmounts the previous scene before mounting a new one', () => {
    const context = createFakeContext()
    const manager = new GameSceneManager(context)
    const a = createFakeScene('a')
    const b = createFakeScene('b')

    manager.register(a)
    manager.register(b)
    manager.show('a')
    manager.show('b')

    expect(a.unmount).toHaveBeenCalled()
    expect(b.mount).toHaveBeenCalledWith(context)
    expect(manager.current).toBe(b)
  })

  it('does not remount the same scene', () => {
    const context = createFakeContext()
    const manager = new GameSceneManager(context)
    const a = createFakeScene('a')

    manager.register(a)
    manager.show('a')
    manager.show('a')

    expect(a.mount).toHaveBeenCalledTimes(1)
    expect(a.unmount).not.toHaveBeenCalled()
  })

  it('returns the current scene when an unknown scene is requested', () => {
    const context = createFakeContext()
    const manager = new GameSceneManager(context)
    const a = createFakeScene('a')

    manager.register(a)
    manager.show('a')
    const result = manager.show('unknown')

    expect(result).toBe(a)
    expect(a.unmount).not.toHaveBeenCalled()
  })

  it('calls update on the current scene', () => {
    const context = createFakeContext()
    const manager = new GameSceneManager(context)
    const a = createFakeScene('a')

    manager.register(a)
    manager.show('a')
    manager.update(16.6)

    expect(a.update).toHaveBeenCalledWith(16.6)
  })

  it('unmounts the current scene', () => {
    const context = createFakeContext()
    const manager = new GameSceneManager(context)
    const a = createFakeScene('a')

    manager.register(a)
    manager.show('a')
    manager.unmountCurrent()

    expect(a.unmount).toHaveBeenCalled()
    expect(manager.current).toBeNull()
  })

  it('invokes onMount callback when a scene is mounted', () => {
    const context = createFakeContext()
    const onMount = vi.fn()
    const manager = new GameSceneManager(context, { onMount })
    const a = createFakeScene('a')

    manager.register(a)
    manager.show('a')

    expect(onMount).toHaveBeenCalledWith(a)
  })
})
