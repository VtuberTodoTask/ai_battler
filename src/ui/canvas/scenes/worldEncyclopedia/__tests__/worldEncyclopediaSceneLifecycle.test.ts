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

  const pop = vi.fn()

  return {
    id: 'world-encyclopedia-lifecycle',
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
      sceneManager: { push: vi.fn(), pop },
    } as unknown as GameSceneContext['canvasGame'],
  }
}

describe('WorldEncyclopediaScene lifecycle', () => {
  it('mounts with the default world entry', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, {
      returnTarget: { sceneId: 'tavern' },
    })

    const internal = scene as unknown as {
      _category: string
      _entryId: string
      _viewModel: { article: { title: string } } | null
    }
    expect(internal._category).toBe('world')
    expect(internal._entryId).toBe('seven-kingdoms-world')
    expect(internal._viewModel?.article.title).toBe('七国世界')
    expect(context.layers.ui.children.length).toBeGreaterThan(0)
    expect(context.layers.background.children.length).toBeGreaterThan(0)
  })

  it('mounts with the requested initial entry', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, {
      initialCategory: 'species',
      initialEntryId: 'goblinfolk',
      returnTarget: { sceneId: 'tavern' },
    })

    const internal = scene as unknown as {
      _category: string
      _entryId: string
      _viewModel: { article: { title: string } } | null
    }
    expect(internal._category).toBe('species')
    expect(internal._entryId).toBe('goblinfolk')
    expect(internal._viewModel?.article.title).toBe('小鬼族')
  })

  it('falls back to the first valid entry when initialEntryId is invalid', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, {
      initialCategory: 'countries',
      initialEntryId: 'no-such-country',
      returnTarget: { sceneId: 'tavern' },
    })

    const internal = scene as unknown as {
      _entryId: string
      _viewModel: { article: { title: string } } | null
    }
    expect(internal._entryId).toBe('alden')
    expect(internal._viewModel?.article.title).toBe('アルデン王国')
  })

  it('unmounts cleanly and calls scene manager pop on return', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, { returnTarget: { sceneId: 'tavern' } })
    const internal = scene as unknown as {
      _returnButton: { activate: () => void }
    }
    internal._returnButton.activate()

    expect(context.canvasGame.sceneManager?.pop).toHaveBeenCalled()
  })

  it('sets selectedPartyId and selectedQuestId before returning', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, {
      returnTarget: {
        sceneId: 'tavern',
        selectedPartyId: 'party-1',
        selectedQuestId: 'quest-1',
      },
    })
    const internal = scene as unknown as {
      _returnButton: { activate: () => void }
    }
    internal._returnButton.activate()

    expect(context.canvasGame.setUiState).toHaveBeenCalledWith({
      selectedPartyId: 'party-1',
      selectedQuestId: 'quest-1',
    })
    expect(context.canvasGame.sceneManager?.pop).toHaveBeenCalled()
  })

  it('does not set UI state when return target has no selection', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, { returnTarget: { sceneId: 'tavern' } })
    const internal = scene as unknown as {
      _returnButton: { activate: () => void }
    }
    internal._returnButton.activate()

    expect(context.canvasGame.setUiState).not.toHaveBeenCalled()
    expect(context.canvasGame.sceneManager?.pop).toHaveBeenCalled()
  })

  it('creates rows for more than 15 entries', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, { returnTarget: { sceneId: 'tavern' } })

    const entries = Array.from({ length: 25 }, (_, i) => ({
      id: `entry-${i}`,
      title: `Entry ${i}`,
      shortDescription: '',
      selected: i === 0,
    }))
    const viewModel = {
      category: 'world' as const,
      categories: [] as { id: string; label: string; selected: boolean }[],
      entryList: entries,
      article: {
        id: 'entry-0',
        title: 'Entry 0',
        shortDescription: '',
        category: 'world' as const,
        sections: [{ id: 'overview', heading: '概要', body: 'body text' }],
      },
      returnTarget: { sceneId: 'tavern' as const },
    }
    ;(
      scene as unknown as {
        applyViewModel: (vm: unknown, reset?: boolean) => void
      }
    ).applyViewModel(viewModel, true)

    const internal = scene as unknown as {
      _entryRows: { visible: boolean }[]
      _entryListScroll: { content: { children: unknown[] } }
    }
    expect(internal._entryRows.length).toBe(25)
    expect(internal._entryListScroll.content.children.length).toBe(25)
  })
})
