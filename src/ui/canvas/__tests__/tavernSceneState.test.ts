// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import { TavernScene } from '../scenes/tavern/TavernScene.ts'
import { GameAssetManager } from '../assets/GameAssetManager.ts'
import { GameViewport } from '../GameViewport.ts'
import { OverlayManager } from '../overlays/OverlayManager.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import { DEFAULT_GAME_UI_STATE, type GameSceneContext } from '../types.ts'

function createFakeCanvasContext(): CanvasRenderingContext2D {
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
    canvas: null as unknown as HTMLCanvasElement,
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
    getImageData: () => ({ data: new Uint8ClampedArray(0) }) as ImageData,
    putImageData: () => {},
    drawImage: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
    createRadialGradient: () => ({ addColorStop: () => {} }),
  } as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  // jsdom does not expose CanvasRenderingContext2D, but Pixi text metrics
  // checks the global class at runtime.
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
      ? createFakeCanvasContext()
      : null) as unknown as typeof HTMLCanvasElement.prototype.getContext)
})

function createSceneContext(uiStateRef?: {
  current: typeof DEFAULT_GAME_UI_STATE
}): GameSceneContext {
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
    setUiState: vi.fn((partial) => {
      if (uiStateRef) {
        uiStateRef.current = { ...uiStateRef.current, ...partial }
      }
    }),
  } as unknown as GameSceneContext['canvasGame']

  return {
    id: 'tavern-test',
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
      openActivity: vi.fn().mockResolvedValue(''),
      closeModal: vi.fn(),
      switchToLegacy: vi.fn(),
    },
    canvasGame,
  }
}

describe('TavernScene state management', () => {
  it('auto-selects the first available party on mount', () => {
    const campaign = createTavernCampaign('scene-auto-001')
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(uiStateRef)

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const firstParty = campaign.currentDay.parties[0]!
    expect(uiStateRef.current.selectedPartyId).toBe(firstParty.id)
  })

  it('reconciles selection when the selected party disappears', () => {
    const campaign = createTavernCampaign('scene-reconcile-001')
    const party = campaign.currentDay.parties[0]!
    const scene = new TavernScene()
    const context = createSceneContext()

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
    })

    const nextCampaign = {
      ...campaign,
      currentDay: {
        ...campaign.currentDay,
        parties: campaign.currentDay.parties.filter((p) => p.id !== party.id),
      },
    }

    scene.setCampaign(nextCampaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
    })

    expect(context.actions.selectParty).not.toHaveBeenCalled()
  })

  it('updates selected quest through setUiState', () => {
    const campaign = createTavernCampaign('scene-quest-001')
    const scene = new TavernScene()
    const context = createSceneContext()

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })
    const quest = campaign.currentDay.requests[0]!

    scene.setUiState({
      ...DEFAULT_GAME_UI_STATE,
      selectedQuestId: quest.id,
    })

    expect(scene).toBeDefined()
  })

  it('destroys all scene-owned objects on unmount', () => {
    const campaign = createTavernCampaign('scene-cleanup-001')
    const scene = new TavernScene()
    const context = createSceneContext()

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })
    scene.unmount()

    expect(context.layers.ui.children.length).toBe(0)
    expect(context.layers.background.children.length).toBe(0)
  })
})
