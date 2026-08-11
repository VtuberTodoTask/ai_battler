// @vitest-environment jsdom
import { Container } from 'pixi.js'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { GameAssetManager } from '../../../assets/GameAssetManager.ts'
import { GameViewport } from '../../../GameViewport.ts'
import { OverlayManager } from '../../../overlays/OverlayManager.ts'
import { DEFAULT_GAME_THEME } from '../../../theme/gameTheme.ts'
import { type GameSceneContext, type GameUiActions } from '../../../types.ts'
import { SoundNovelScene } from '../SoundNovelScene.ts'
import type { SoundNovelSceneInput } from '../types.ts'

function createFakeCanvasContext(): unknown {
  const emptyMetrics = () =>
    ({
      width: 0,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 0,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
      alphabeticBaseline: 0,
      emHeightAscent: 0,
      emHeightDescent: 0,
    }) as TextMetrics

  return {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    strokeText: vi.fn(),
    measureText: emptyMetrics,
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  }
}

beforeAll(() => {
  if (!('CanvasRenderingContext2D' in globalThis)) {
    ;(
      globalThis as unknown as { CanvasRenderingContext2D: unknown }
    ).CanvasRenderingContext2D = class FakeCanvasRenderingContext2D {}
  }

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((
    type: string,
  ) =>
    type === '2d'
      ? (createFakeCanvasContext() as unknown as CanvasRenderingContext2D)
      : null) as unknown as typeof HTMLCanvasElement.prototype.getContext)
})

function createSceneContext(): GameSceneContext {
  const app = {
    renderer: {
      on: vi.fn(),
      off: vi.fn(),
      events: { features: { wheel: false } },
    },
    stage: new Container(),
    screen: { width: 1600, height: 900 },
    canvas: document.createElement('canvas'),
    ticker: { add: vi.fn(), remove: vi.fn() },
    init: vi.fn(),
  } as unknown as GameSceneContext['app']

  const layers = {
    background: new Container(),
    content: new Container(),
    ui: new Container(),
    overlay: new Container(),
    modal: new Container(),
    transition: new Container(),
    debug: new Container(),
  }

  const canvasGame = {
    setUiState: vi.fn(),
    sceneManager: {
      push: vi.fn(),
      pop: vi.fn(),
    },
  } as unknown as GameSceneContext['canvasGame']

  return {
    id: 'soundNovel-lifecycle',
    app,
    viewport: new GameViewport(),
    layers,
    overlayManager: new OverlayManager(
      layers.overlay,
      layers.modal,
      DEFAULT_GAME_THEME,
    ),
    theme: DEFAULT_GAME_THEME,
    assetManager: new GameAssetManager(),
    actions: {
      advanceDay: vi.fn(),
      resolveDay: vi.fn(),
      offerRequest: vi.fn(),
      selectParty: vi.fn(),
      selectQuest: vi.fn(),
      openCharacter: vi.fn(),
      openActivity: vi.fn(),
      openExpeditionNarrative: vi.fn(),
      openSettings: vi.fn(),
      closeModal: vi.fn(),
      switchToLegacy: vi.fn(),
    } as unknown as GameUiActions,
    canvasGame,
  }
}

describe('SoundNovelScene lifecycle', () => {
  it('mounts a root container into the content layer', () => {
    const scene = new SoundNovelScene()
    const context = createSceneContext()
    const input: SoundNovelSceneInput = {
      narrativeId: 'n1',
      source: 'expedition',
      title: 'Test Story',
      text: 'Hello world.\n\nMore text.',
      visualContext: { environment: 'forest' },
      returnTarget: { sceneId: 'tavern' },
    }

    scene.mount(context, input)

    expect(context.layers.content.children.length).toBeGreaterThan(0)
  })

  it('update does not throw and progresses typing', () => {
    const scene = new SoundNovelScene()
    const context = createSceneContext()
    const input: SoundNovelSceneInput = {
      narrativeId: 'n2',
      source: 'downtime',
      text: 'A short story.',
      visualContext: {},
      returnTarget: { sceneId: 'tavern' },
    }

    scene.mount(context, input)
    expect(() => scene.update(100)).not.toThrow()
  })

  it('unmount removes the scene root and cleans up', () => {
    const scene = new SoundNovelScene()
    const context = createSceneContext()
    const input: SoundNovelSceneInput = {
      narrativeId: 'n3',
      source: 'stay_extension',
      text: 'Only one.',
      visualContext: {},
      returnTarget: { sceneId: 'tavern' },
    }

    scene.mount(context, input)
    scene.unmount()

    expect(context.layers.content.children.length).toBe(0)
  })

  it('returns immediately when mounted without input', () => {
    const scene = new SoundNovelScene()
    const context = createSceneContext()

    scene.mount(context)

    expect(context.layers.content.children.length).toBe(0)
  })
})
