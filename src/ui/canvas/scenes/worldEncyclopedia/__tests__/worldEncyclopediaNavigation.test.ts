// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import { GameAssetManager } from '../../../assets/GameAssetManager.ts'
import { GameViewport } from '../../../GameViewport.ts'
import { OverlayManager } from '../../../overlays/OverlayManager.ts'
import { DEFAULT_GAME_THEME } from '../../../theme/gameTheme.ts'
import { type GameSceneContext } from '../../../types.ts'
import { WorldEncyclopediaScene } from '../WorldEncyclopediaScene.ts'

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
      fontBoundingBoxAscent: 0,
      fontBoundingBoxDescent: 0,
      hangingBaseline: 0,
      ideographicBaseline: 0,
    }) as TextMetrics

  return {
    canvas: null,
    font: '10px sans-serif',
    fillStyle: '#000',
    strokeStyle: '#000',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    direction: 'ltr',
    save: () => {},
    restore: () => {},
    fillText: () => {},
    strokeText: () => {},
    measureText: emptyMetrics,
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    rect: () => {},
    arc: () => {},
    arcTo: () => {},
    ellipse: () => {},
    bezierCurveTo: () => {},
    quadraticCurveTo: () => {},
    fill: () => {},
    stroke: () => {},
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    setTransform: () => {},
    resetTransform: () => {},
    scale: () => {},
    translate: () => {},
    rotate: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(0) }),
    putImageData: () => {},
    drawImage: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
    createRadialGradient: () => ({ addColorStop: () => {} }),
  }
}

beforeEach(() => {
  if (
    typeof (globalThis as unknown as { CanvasRenderingContext2D?: unknown })
      .CanvasRenderingContext2D === 'undefined'
  ) {
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

function createSceneContext(_scene: WorldEncyclopediaScene): GameSceneContext {
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

  return {
    id: 'world-encyclopedia-navigation',
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
      advanceDay: vi.fn(() => ({ ok: true })),
      resolveDay: vi.fn(() => ({ ok: true })),
      offerRequest: vi.fn(() => ({ ok: true })),
      selectParty: vi.fn(),
      selectQuest: vi.fn(),
      openCharacter: vi.fn(),
      openActivity: vi.fn().mockResolvedValue({ ok: true, data: '' }),
      openSettings: vi.fn(),
      closeModal: vi.fn(),
      switchToLegacy: vi.fn(),
    },
    canvasGame: {
      setUiState: vi.fn(),
      sceneManager: { push: vi.fn(), pop: vi.fn() },
    } as unknown as GameSceneContext['canvasGame'],
  }
}

describe('WorldEncyclopediaScene navigation', () => {
  it('switches category and auto-selects the first entry', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, { returnTarget: { sceneId: 'tavern' } })

    const internal = scene as unknown as {
      _category: string
      _entryId: string
      _tabButtons: { id: string; onActivate?: () => void }[]
      _viewModel: { article: { title: string } } | null
    }
    expect(internal._category).toBe('world')

    const speciesTab = internal._tabButtons.find(
      (button) => button.id === 'species',
    )
    expect(speciesTab).toBeDefined()
    speciesTab!.onActivate?.()

    expect(internal._category).toBe('species')
    expect(internal._entryId).toBe('human')
    expect(internal._viewModel?.article.title).toBe('人族')
  })

  it('switches entry and updates the article', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, { returnTarget: { sceneId: 'tavern' } })

    const internal = scene as unknown as {
      _entryId: string
      _entryRows: {
        setTitle: (title: string) => void
        onActivate?: () => void
        visible: boolean
      }[]
      _viewModel: { article: { title: string } } | null
    }

    // Trigger the first visible entry row (七国世界). Find a row whose title is set later.
    const row = internal._entryRows.find((r) => r.visible)
    expect(row).toBeDefined()
    expect(internal._viewModel?.article.title).toBe('七国世界')

    // Switch category to countries and select the first entry.
    const tabInternal = scene as unknown as {
      _tabButtons: { id: string; onActivate?: () => void }[]
      _category: string
    }
    tabInternal._tabButtons.find((b) => b.id === 'countries')!.onActivate?.()
    expect(internal._viewModel?.article.title).toBe('アルデン王国')

    const countryRow = internal._entryRows.find(
      (r) => r.visible && r.onActivate,
    )!
    countryRow.onActivate?.()
    expect(internal._viewModel?.article.title).toBe('アルデン王国')
  })

  it('resets article scroll to top when the entry changes', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, { returnTarget: { sceneId: 'tavern' } })

    const internal = scene as unknown as {
      _articleScroll: { scrollToTop: () => void; content: { y: number } }
      _entryRows: { visible: boolean; onActivate?: () => void }[]
      _viewModel: { article: { title: string } } | null
    }

    // Simulate a non-zero scroll offset.
    internal._articleScroll.content.y = -50

    const secondRow = internal._entryRows.filter((r) => r.visible)[1]!
    expect(secondRow).toBeDefined()
    secondRow.onActivate?.()

    expect(internal._articleScroll.content.y).toBe(0)
    expect(internal._viewModel?.article.title).toBe('冒険者')
  })
})
