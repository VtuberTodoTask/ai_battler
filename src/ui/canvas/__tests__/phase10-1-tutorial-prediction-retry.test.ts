// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'

const { getExpeditionPredictionMock } = vi.hoisted(() => ({
  getExpeditionPredictionMock: vi.fn(),
}))

vi.mock('../../shared/expeditionPredictionService.ts', () => ({
  getExpeditionPrediction: getExpeditionPredictionMock,
}))

const { createTavernCampaign } =
  await import('../../../core/tavern/campaign/campaign.ts')
const { setTutorialMode } =
  await import('../../../core/tavern/campaign/tutorial.ts')
const { TavernScene } = await import('../scenes/tavern/TavernScene.ts')
const { GameAssetManager } = await import('../assets/GameAssetManager.ts')
const { GameViewport } = await import('../GameViewport.ts')
const { OverlayManager } = await import('../overlays/OverlayManager.ts')
const { DEFAULT_GAME_THEME } = await import('../theme/gameTheme.ts')
const { DEFAULT_GAME_UI_STATE } = await import('../types.ts')
type GameSceneContext = import('../types.ts').GameSceneContext
type TavernCampaignState =
  import('../../../core/tavern/campaign/types.ts').TavernCampaignState
type TutorialRuntime = import('../tutorial/tutorialRuntime.ts').TutorialRuntime
type ExpeditionPrediction =
  import('../../../core/tavern/prediction/types.ts').ExpeditionPrediction

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
  getExpeditionPredictionMock.mockReset()

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

function createSceneContext(
  scene: InstanceType<typeof TavernScene>,
  uiStateRef: { current: typeof DEFAULT_GAME_UI_STATE },
): GameSceneContext {
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
      uiStateRef.current = { ...uiStateRef.current, ...partial }
      scene.setUiState(uiStateRef.current)
    }),
    setCampaign: vi.fn((campaign: TavernCampaignState, _options?: unknown) => {
      scene.setCampaign(campaign, { ...uiStateRef.current })
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
      purchaseUpgrade: vi.fn(),
      setTutorialMode: vi.fn(() => ({ ok: true })),
      completeTutorial: vi.fn(() => ({ ok: true })),
      // Mirrors GameCanvasHost.tsx's real selectParty/selectQuest: update
      // shared uiState and resync the Scene — a bare no-op mock here
      // would silently defeat the whole retry flow this file tests.
      selectParty: vi.fn((id: string) => {
        uiStateRef.current = {
          ...uiStateRef.current,
          selectedPartyId: id,
          actionMessage: undefined,
        }
        scene.setUiState(uiStateRef.current)
      }),
      selectQuest: vi.fn((id: string) => {
        uiStateRef.current = {
          ...uiStateRef.current,
          selectedQuestId: id,
          actionMessage: undefined,
        }
        scene.setUiState(uiStateRef.current)
      }),
      openCharacter: vi.fn(),
      openActivity: vi.fn().mockResolvedValue(''),
      openSettings: vi.fn(),
      closeModal: vi.fn(),
    },
    canvasGame,
  }
}

function getRuntime(scene: InstanceType<typeof TavernScene>): TutorialRuntime {
  return (scene as unknown as { _tutorialRuntime: TutorialRuntime })
    ._tutorialRuntime
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function fakePrediction(): ExpeditionPrediction {
  return {
    requestId: 'req',
    partyId: 'party',
    modelVersion: 'v1',
    sampleCount: 200,
    estimatedSuccessRate: 0.55,
    counts: {
      completeSuccess: 20,
      success: 60,
      partialSuccess: 60,
      failedObjective: 40,
      forcedRetreat: 15,
      lostExpedition: 5,
    },
    rates: {
      completeSuccess: 0.1,
      success: 0.3,
      partialSuccess: 0.3,
      failedObjective: 0.2,
      forcedRetreat: 0.075,
      lostExpedition: 0.025,
    },
  }
}

describe('Phase 10.1 P1 fix: end-to-end Prediction retry through TavernScene', () => {
  it('recovers from a Prediction failure by re-selecting the SAME Party and continues the Tutorial', async () => {
    getExpeditionPredictionMock
      .mockRejectedValueOnce(new Error('prediction failed'))
      .mockResolvedValueOnce(fakePrediction())

    const campaign = setTutorialMode(
      createTavernCampaign('tut-retry-e2e-001'),
      'enabled',
    )
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const runtime = getRuntime(scene)
    for (let i = 0; i < 7; i++) runtime.advanceMessage()
    expect(runtime.currentTarget).toBe('quest_list')

    const questRows = (
      scene as unknown as {
        _questList: { _rows: { emit: (event: string) => void }[] }
      }
    )._questList._rows
    questRows[0]!.emit('pointertap')

    for (let i = 0; i < 4; i++) runtime.advanceMessage()
    expect(runtime.currentTarget).toBe('party_list')

    // PartyListPanel rebuilds (and destroys) its row objects on every
    // re-render, so a row reference captured once goes stale after the
    // very next selection — always re-read `_rows` fresh right before
    // emitting on it.
    const getPartyRows = () =>
      (
        scene as unknown as {
          _partyList: { _rows: { emit: (event: string) => void }[] }
        }
      )._partyList._rows

    getPartyRows()[0]!.emit('pointertap')
    const selectedPartyIdBeforeRetry = uiStateRef.current.selectedPartyId
    expect(selectedPartyIdBeforeRetry).not.toBeNull()

    // Prediction fetch #1 fails.
    await flush()
    expect(getExpeditionPredictionMock).toHaveBeenCalledTimes(1)
    expect(runtime.getSnapshot().text).toContain(
      'もう一度パーティーを選び直して',
    )

    runtime.advanceMessage()
    expect(runtime.currentTarget).toBe('party_list')

    // The Player retries with the exact SAME Party — this is the
    // deadlock scenario: without the fix, DecisionPanel's own cache key
    // would still match and no second fetch would ever be issued.
    getPartyRows()[0]!.emit('pointertap')
    expect(uiStateRef.current.selectedPartyId).toBe(selectedPartyIdBeforeRetry)

    await flush()

    expect(getExpeditionPredictionMock).toHaveBeenCalledTimes(2)
    expect(runtime.currentTarget).toBe('none')
    expect(runtime.getSnapshot().text).toBe('さて、どうでしょう？')
    expect(runtime.isBlocking).toBe(true)
  })

  it('does not automatically retry without the Player acting again', async () => {
    getExpeditionPredictionMock.mockRejectedValueOnce(
      new Error('prediction failed'),
    )

    const campaign = setTutorialMode(
      createTavernCampaign('tut-retry-e2e-002'),
      'enabled',
    )
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const runtime = getRuntime(scene)
    for (let i = 0; i < 7; i++) runtime.advanceMessage()
    const questRows = (
      scene as unknown as {
        _questList: { _rows: { emit: (event: string) => void }[] }
      }
    )._questList._rows
    questRows[0]!.emit('pointertap')
    for (let i = 0; i < 4; i++) runtime.advanceMessage()

    const partyRows = (
      scene as unknown as {
        _partyList: { _rows: { emit: (event: string) => void }[] }
      }
    )._partyList._rows
    partyRows[0]!.emit('pointertap')
    await flush()

    expect(getExpeditionPredictionMock).toHaveBeenCalledTimes(1)
    runtime.advanceMessage()
    expect(runtime.currentTarget).toBe('party_list')

    // No further Player action — just let time pass.
    await flush()
    await flush()

    expect(getExpeditionPredictionMock).toHaveBeenCalledTimes(1)
  })
})
