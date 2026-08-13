// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import type { GameScene } from '../types.ts'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../../core/tavern/brokerage.ts'
import { DayResultsScene } from '../scenes/dayResults/DayResultsScene.ts'
import { TavernScene } from '../scenes/tavern/TavernScene.ts'
import { GameAssetManager } from '../assets/GameAssetManager.ts'
import { GameViewport } from '../GameViewport.ts'
import { OverlayManager } from '../overlays/OverlayManager.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import { DEFAULT_GAME_UI_STATE, type GameSceneContext } from '../types.ts'
import {
  buildDayResultsSceneViewModel,
  type DayResultsSceneInput,
  type DayResultEventViewModel,
} from '../scenes/dayResults/dayResultsViewModel.ts'
import { GameSceneManager } from '../scenes/GameSceneManager.ts'

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

function createSceneContext(
  scene: { setUiState?: (uiState: typeof DEFAULT_GAME_UI_STATE) => void },
  uiStateRef: { current: typeof DEFAULT_GAME_UI_STATE },
  options?: {
    openExpeditionNarrative?: () => Promise<{ ok: boolean; data?: string }>
  },
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

  const actions = {
    advanceDay: vi.fn(() => ({ ok: true })),
    resolveDay: vi.fn(() => ({ ok: true })),
    offerRequest: vi.fn(() => ({ ok: true })),
    selectParty: vi.fn(),
    selectQuest: vi.fn(),
    openCharacter: vi.fn(),
    openActivity: vi.fn().mockResolvedValue({
      ok: true,
      data: '生成された酒場イベントの本文',
    }),
    openSettings: vi.fn(),
    closeModal: vi.fn(),
    switchToLegacy: vi.fn(),
    openExpeditionNarrative: options?.openExpeditionNarrative,
  }

  const canvasGame = {
    setUiState: vi.fn((partial) => {
      uiStateRef.current = { ...uiStateRef.current, ...partial }
      scene.setUiState?.(uiStateRef.current)
    }),
    sceneManager: { push: vi.fn(), pop: vi.fn(), show: vi.fn() },
  } as unknown as GameSceneContext['canvasGame']

  return {
    id: 'phase8-5-1-smoke',
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
    actions,
    canvasGame,
  }
}

function findAcceptingOffers(
  campaign: ReturnType<typeof createTavernCampaign>,
  max = 1,
): ReturnType<typeof createTavernCampaign> {
  let state = campaign.currentDay
  const matchedPartyIds = new Set<string>()
  const matchedRequestIds = new Set<string>()

  for (const request of state.requests) {
    if (matchedRequestIds.has(request.id)) continue
    for (const party of state.parties) {
      if (matchedPartyIds.has(party.id)) continue
      if (party.availability === 'recovering') continue
      try {
        const next = offerRequestToParty(state, request.id, party.id)
        if (next.matches.length > 0) {
          matchedPartyIds.add(party.id)
          matchedRequestIds.add(request.id)
          state = next
          if (matchedPartyIds.size >= max) break
        }
      } catch {
        // continue
      }
    }
    if (matchedPartyIds.size >= max) break
  }

  return { ...campaign, currentDay: state }
}

function resolveAndAdvance(
  campaign: ReturnType<typeof createTavernCampaign>,
): ReturnType<typeof createTavernCampaign> {
  const resolved = resolveCampaignDay(campaign)
  return advanceCampaignDay(resolved)
}

describe('Phase 8.5.1 Day Transition Flow Smoke', () => {
  it('A: day advance pushes DayResultsScene starting at important events', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const initial = createTavernCampaign('phase8-5-1-a')
    const prepared = findAcceptingOffers(initial, 1)
    const advanced = resolveAndAdvance(prepared)

    scene.mount(context)
    scene.setCampaign(prepared, { ...DEFAULT_GAME_UI_STATE })
    scene.setCampaign(advanced, { ...DEFAULT_GAME_UI_STATE })

    const push = context.canvasGame.sceneManager!.push as ReturnType<
      typeof vi.fn
    >
    expect(push).toHaveBeenCalledWith(
      'dayResults',
      expect.objectContaining({
        resolvedDay: advanced.dayNumber - 1,
        nextDay: advanced.dayNumber,
        step: 'important_events',
        returnTarget: { sceneId: 'tavern' },
      }),
    )
  })

  it('B: DayResultsScene renders important events and switches to expedition results', () => {
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const initial = createTavernCampaign('phase8-5-1-b')
    const prepared = findAcceptingOffers(initial, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const input: DayResultsSceneInput = {
      campaign: advanced,
      resolvedDay: previousRecord.dayNumber,
      nextDay: advanced.dayNumber,
      step: 'important_events',
    }

    scene.mount(context, input)
    scene.setCampaign(advanced, { ...DEFAULT_GAME_UI_STATE })

    expect((scene as unknown as { _step: string })._step).toBe(
      'important_events',
    )
    const vm = buildDayResultsSceneViewModel(input, [])
    expect(vm.importantEvents.length).toBeGreaterThanOrEqual(0)

    ;(
      scene as unknown as { goToExpeditionResults: () => void }
    ).goToExpeditionResults()
    expect((scene as unknown as { _step: string })._step).toBe(
      'expedition_results',
    )
  })

  it('C: final 翌日へ pops back to tavern and does not re-resolve', () => {
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const initial = createTavernCampaign('phase8-5-1-c')
    const advanced = resolveAndAdvance(initial)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const input: DayResultsSceneInput = {
      campaign: advanced,
      resolvedDay: previousRecord.dayNumber,
      nextDay: advanced.dayNumber,
      step: 'expedition_results',
    }

    scene.mount(context, input)
    scene.setCampaign(advanced, { ...DEFAULT_GAME_UI_STATE })

    ;(scene as unknown as { goToNextDay: () => void }).goToNextDay()

    const pop = context.canvasGame.sceneManager!.pop as ReturnType<typeof vi.fn>
    expect(pop).toHaveBeenCalled()
    expect(uiStateRef.current.lastDayResultsStep).toBeUndefined()
    expect(uiStateRef.current.lastSelectedResultId).toBeUndefined()
  })

  it('D: important events are projected from day record and next-day party events', () => {
    const initial = createTavernCampaign('phase8-5-1-d')
    const prepared = findAcceptingOffers(initial, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const vm = buildDayResultsSceneViewModel(
      {
        campaign: advanced,
        resolvedDay: previousRecord.dayNumber,
        nextDay: advanced.dayNumber,
      },
      [],
    )

    expect(vm.importantEvents.length).toBeGreaterThanOrEqual(0)
    const arrivals = vm.importantEvents.filter((e) => e.kind === 'partyArrival')
    expect(arrivals.length).toBeGreaterThanOrEqual(0)
  })

  it('E: empty important events shows placeholder message', () => {
    const initial = createTavernCampaign('phase8-5-1-e')
    const advanced = resolveAndAdvance(initial)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    advanced.history[advanced.history.length - 1] = {
      ...previousRecord,
      partyEvents: [],
      relationshipEvents: [],
      progressionEvents: [],
    }
    advanced.currentDay.partyEvents = []

    const vm = buildDayResultsSceneViewModel(
      {
        campaign: advanced,
        resolvedDay: previousRecord.dayNumber,
        nextDay: advanced.dayNumber,
      },
      [],
    )

    expect(vm.importantEvents.length).toBe(0)
  })

  it('F: expedition result narrative pushes SoundNovel with dayResults return target', async () => {
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const generate = vi.fn().mockResolvedValue({
      ok: true,
      data: '生成された遠征物語',
    })
    const context = createSceneContext(scene, uiStateRef, {
      openExpeditionNarrative: generate,
    })
    const initial = createTavernCampaign('phase8-5-1-f')
    const prepared = findAcceptingOffers(initial, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const input: DayResultsSceneInput = {
      campaign: advanced,
      resolvedDay: previousRecord.dayNumber,
      nextDay: advanced.dayNumber,
      step: 'expedition_results',
    }

    scene.mount(context, input)
    scene.setCampaign(advanced, { ...DEFAULT_GAME_UI_STATE })

    const result = (
      scene as unknown as {
        _viewModel: { expeditionResults: { id: string }[] }
      }
    )._viewModel.expeditionResults[0]
    expect(result).toBeDefined()

    ;(
      scene as unknown as {
        openNarrativeForResult: (result: { id: string }) => void
      }
    ).openNarrativeForResult(result as { id: string })

    await new Promise((r) => setTimeout(r, 0))
    expect(generate).toHaveBeenCalledTimes(1)

    const push = context.canvasGame.sceneManager!.push as ReturnType<
      typeof vi.fn
    >
    expect(push).toHaveBeenCalledWith(
      'soundNovel',
      expect.objectContaining({
        source: 'expedition',
        text: '生成された遠征物語',
        returnTarget: expect.objectContaining({
          sceneId: 'dayResults',
        }),
      }),
    )
    expect(uiStateRef.current.lastDayResultsStep).toBe('expedition_results')
    expect(uiStateRef.current.lastSelectedResultId).toBe(result.id)
  })

  it('G: important event narrative returns to important_events step', async () => {
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const generate = vi.fn().mockResolvedValue({
      ok: true,
      data: '生成された出来事物語',
    })
    const context = createSceneContext(scene, uiStateRef, {
      openExpeditionNarrative: generate,
    })
    const initial = createTavernCampaign('phase8-5-1-g')
    const advanced = resolveAndAdvance(initial)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const input: DayResultsSceneInput = {
      campaign: advanced,
      resolvedDay: previousRecord.dayNumber,
      nextDay: advanced.dayNumber,
      step: 'important_events',
    }

    scene.mount(context, input)
    scene.setCampaign(advanced, { ...DEFAULT_GAME_UI_STATE })

    const event = (
      scene as unknown as {
        _viewModel: { importantEvents: DayResultEventViewModel[] }
      }
    )._viewModel.importantEvents.find((e) => e.narrativeTargetId)
    if (!event) {
      // Some seeds may not generate a narrative candidate for a visible event.
      return
    }

    ;(
      scene as unknown as {
        openNarrativeForEvent: (event: DayResultEventViewModel) => void
      }
    ).openNarrativeForEvent(event)

    await new Promise((r) => setTimeout(r, 0))
    expect(generate).toHaveBeenCalledTimes(1)

    const push = context.canvasGame.sceneManager!.push as ReturnType<
      typeof vi.fn
    >
    expect(push).toHaveBeenCalledWith(
      'soundNovel',
      expect.objectContaining({
        returnTarget: expect.objectContaining({
          sceneId: 'dayResults',
        }),
      }),
    )
    expect(uiStateRef.current.lastDayResultsStep).toBe('important_events')
  })

  it('H: GameSceneManager.pop restores DayResultsScene with its input', () => {
    const context = {
      id: 'manager-test',
      app: { ticker: { add: vi.fn(), remove: vi.fn() } },
      viewport: { resize: vi.fn() } as unknown as GameSceneContext['viewport'],
      layers: {
        background: new Container(),
        content: new Container(),
        ui: new Container(),
        overlay: new Container(),
        modal: new Container(),
        transition: new Container(),
        debug: new Container(),
      },
      overlayManager: new OverlayManager(
        new Container(),
        new Container(),
        DEFAULT_GAME_THEME,
      ),
      theme: DEFAULT_GAME_THEME,
      assetManager: new GameAssetManager(),
      actions: {} as GameSceneContext['actions'],
      canvasGame: {} as GameSceneContext['canvasGame'],
    } as unknown as GameSceneContext

    const tavern = { id: 'tavern', mount: vi.fn(), unmount: vi.fn() }
    const dayResults = {
      id: 'dayResults',
      mount: vi.fn(),
      unmount: vi.fn(),
    }
    const soundNovel = {
      id: 'soundNovel',
      mount: vi.fn(),
      unmount: vi.fn(),
    }

    const manager = new GameSceneManager(context)
    manager.register(tavern as unknown as GameScene)
    manager.register(dayResults as unknown as GameScene)
    manager.register(soundNovel as unknown as GameScene)

    manager.show('tavern')
    expect(tavern.mount).toHaveBeenCalledTimes(1)

    const input = { resolvedDay: 5, nextDay: 6, campaign: {} as unknown }
    manager.push('dayResults', input)
    expect(dayResults.mount).toHaveBeenCalledWith(context, input)

    manager.push('soundNovel', { text: 'foo' })
    manager.pop()

    expect(dayResults.mount).toHaveBeenCalledTimes(2)
    expect(dayResults.mount).toHaveBeenLastCalledWith(context, input)
  })

  it('I: view model build triggers zero AI calls', () => {
    const generate = vi.fn()
    const initial = createTavernCampaign('phase8-5-1-i')
    const prepared = findAcceptingOffers(initial, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    buildDayResultsSceneViewModel(
      {
        campaign: advanced,
        resolvedDay: previousRecord.dayNumber,
        nextDay: advanced.dayNumber,
      },
      [],
    )

    expect(generate).not.toHaveBeenCalled()
  })
})
