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
import { ExpeditionResultsScene } from '../scenes/expeditionResults/ExpeditionResultsScene.ts'
import { TavernScene } from '../scenes/tavern/TavernScene.ts'
import { GameAssetManager } from '../assets/GameAssetManager.ts'
import { GameViewport } from '../GameViewport.ts'
import { OverlayManager } from '../overlays/OverlayManager.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import { DEFAULT_GAME_UI_STATE, type GameSceneContext } from '../types.ts'
import {
  buildExpeditionResultsSceneViewModel,
  type ExpeditionResultsSceneInput,
} from '../scenes/expeditionResults/expeditionResultsViewModel.ts'
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
    id: 'phase8-5-smoke',
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

describe('Phase 8.5 Expedition Results Scene Smoke', () => {
  it('A: day advance with one expedition result transitions to ExpeditionResultsScene', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const initial = createTavernCampaign('phase8-5-smoke-a')
    const prepared = findAcceptingOffers(initial, 1)
    const advanced = resolveAndAdvance(prepared)

    scene.mount(context)
    scene.setCampaign(prepared, { ...DEFAULT_GAME_UI_STATE })
    scene.setCampaign(advanced, { ...DEFAULT_GAME_UI_STATE })

    const push = context.canvasGame.sceneManager!.push as ReturnType<
      typeof vi.fn
    >
    expect(push).toHaveBeenCalledWith(
      'expeditionResults',
      expect.objectContaining({
        dayNumber: advanced.dayNumber - 1,
        selectedResultId: expect.any(String),
      }),
    )
  })

  it('B: day advance with multiple expedition results keeps stable ordering', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const initial = createTavernCampaign('phase8-5-smoke-b')
    const prepared = findAcceptingOffers(initial, 2)
    const advanced = resolveAndAdvance(prepared)

    scene.mount(context)
    scene.setCampaign(prepared, { ...DEFAULT_GAME_UI_STATE })
    scene.setCampaign(advanced, { ...DEFAULT_GAME_UI_STATE })

    const push = context.canvasGame.sceneManager!.push as ReturnType<
      typeof vi.fn
    >
    expect(push).toHaveBeenCalledWith('expeditionResults', expect.any(Object))
    const input = push.mock.calls[0]![1] as ExpeditionResultsSceneInput
    const vm = buildExpeditionResultsSceneViewModel(input, [])
    expect(vm.results.length).toBeGreaterThanOrEqual(2)
    const ids = vm.results.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('C: zero results does not open ExpeditionResultsScene', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const initial = createTavernCampaign('phase8-5-smoke-c')
    const advanced = resolveAndAdvance(initial)

    scene.mount(context)
    scene.setCampaign(initial, { ...DEFAULT_GAME_UI_STATE })
    scene.setCampaign(advanced, { ...DEFAULT_GAME_UI_STATE })

    const push = context.canvasGame.sceneManager!.push as ReturnType<
      typeof vi.fn
    >
    expect(push).not.toHaveBeenCalledWith(
      'expeditionResults',
      expect.any(Object),
    )
  })

  it('D: structured summary lines are visible and deterministic', () => {
    const initial = createTavernCampaign('phase8-5-smoke-d')
    const prepared = findAcceptingOffers(initial, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const vm = buildExpeditionResultsSceneViewModel(
      {
        campaign: advanced,
        dayNumber: previousRecord.dayNumber,
      },
      [],
    )

    expect(vm.results.length).toBeGreaterThan(0)
    const first = vm.results[0]!
    expect(first.summaryLines.length).toBeGreaterThan(0)
    expect(first.summaryLines.some((l) => l.includes('結果：'))).toBe(true)
    expect(first.summaryLines.some((l) => l.includes('生還：'))).toBe(true)
    expect(first.summaryLines.some((l) => l.includes('報酬：'))).toBe(true)

    const secondVm = buildExpeditionResultsSceneViewModel(
      {
        campaign: advanced,
        dayNumber: previousRecord.dayNumber,
      },
      [],
    )
    expect(secondVm.results[0]!.summaryLines).toEqual(first.summaryLines)
  })

  it('E: open structured report overlay and return to results scene', () => {
    const scene = new ExpeditionResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const initial = createTavernCampaign('phase8-5-smoke-e')
    const prepared = findAcceptingOffers(initial, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const input: ExpeditionResultsSceneInput = {
      campaign: advanced,
      dayNumber: previousRecord.dayNumber,
    }

    scene.mount(context, input)
    scene.setCampaign(advanced, { ...DEFAULT_GAME_UI_STATE })

    const result = (
      scene as unknown as { _viewModel: { results: { id: string }[] } }
    )._viewModel.results[0]
    expect(result).toBeDefined()

    ;(
      scene as unknown as {
        openReportOverlay: (result: { id: string }) => void
      }
    ).openReportOverlay(result as { id: string })

    const modal = context.layers.modal.children.find(
      (c) => c.constructor.name === 'GameModal',
    )
    expect(modal).toBeDefined()
  })

  it('F: open narrative first time triggers lazy generation', async () => {
    const scene = new ExpeditionResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const generate = vi.fn().mockResolvedValue({
      ok: true,
      data: '生成された遠征物語',
    })
    const context = createSceneContext(scene, uiStateRef, {
      openExpeditionNarrative: generate,
    })
    const initial = createTavernCampaign('phase8-5-smoke-f')
    const prepared = findAcceptingOffers(initial, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const input: ExpeditionResultsSceneInput = {
      campaign: advanced,
      dayNumber: previousRecord.dayNumber,
    }

    scene.mount(context, input)
    scene.setCampaign(advanced, { ...DEFAULT_GAME_UI_STATE })

    const result = (
      scene as unknown as { _viewModel: { results: { id: string }[] } }
    )._viewModel.results[0]
    expect(result).toBeDefined()

    ;(
      scene as unknown as {
        openNarrative: (result: { id: string }) => void
      }
    ).openNarrative(result as { id: string })

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
          sceneId: 'expeditionResults',
        }),
      }),
    )
  })

  it('G: reopen cached narrative does not call AI', async () => {
    const scene = new ExpeditionResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const generate = vi.fn()
    const context = createSceneContext(scene, uiStateRef, {
      openExpeditionNarrative: generate,
    })
    const initial = createTavernCampaign('phase8-5-smoke-g')
    const prepared = findAcceptingOffers(initial, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!
    const resolvedResult = previousRecord.results.find(
      (r) => r.status === 'resolved' && r.report,
    )
    expect(resolvedResult).toBeDefined()

    const existingCandidate = advanced.narrativeCandidates.find(
      (c) =>
        c.category === 'expedition' &&
        c.dayNumber === previousRecord.dayNumber &&
        c.partyId === (resolvedResult!.partyId ?? '') &&
        c.requestId === resolvedResult!.requestId,
    )
    expect(existingCandidate).toBeDefined()

    const cachedCandidates = advanced.narrativeCandidates.map((c) =>
      c === existingCandidate
        ? {
            ...c,
            state: 'generated' as const,
            activeGenerationId: 'cached-generation',
          }
        : c,
    )

    const cachedCampaign = {
      ...advanced,
      narrativeCandidates: cachedCandidates,
      narrativeGenerations: [
        ...advanced.narrativeGenerations,
        {
          id: 'cached-generation',
          candidateId: existingCandidate!.id,
          dayNumber: previousRecord.dayNumber,
          generatedText: '既存の遠征物語',
          promptVersion: 'test',
          providerId: 'test',
          createdAt: new Date().toISOString(),
        },
      ],
    }

    const input: ExpeditionResultsSceneInput = {
      campaign: cachedCampaign,
      dayNumber: previousRecord.dayNumber,
    }

    scene.mount(context, input)
    scene.setCampaign(cachedCampaign, { ...DEFAULT_GAME_UI_STATE })

    const result = (
      scene as unknown as { _viewModel: { results: { id: string }[] } }
    )._viewModel.results[0]
    expect(result).toBeDefined()

    ;(
      scene as unknown as {
        openNarrative: (result: { id: string }) => void
      }
    ).openNarrative(result as { id: string })

    await new Promise((r) => setTimeout(r, 0))
    expect(generate).not.toHaveBeenCalled()

    const push = context.canvasGame.sceneManager!.push as ReturnType<
      typeof vi.fn
    >
    expect(push).toHaveBeenCalledWith(
      'soundNovel',
      expect.objectContaining({
        source: 'expedition',
        text: '既存の遠征物語',
        returnTarget: expect.objectContaining({
          sceneId: 'expeditionResults',
        }),
      }),
    )
  })

  it('H: GameSceneManager.pop restores ExpeditionResultsScene with its input', () => {
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
    const results = {
      id: 'expeditionResults',
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
    manager.register(results as unknown as GameScene)
    manager.register(soundNovel as unknown as GameScene)

    manager.show('tavern')
    expect(tavern.mount).toHaveBeenCalledTimes(1)

    const input = { dayNumber: 5, campaign: {} as unknown }
    manager.push('expeditionResults', input)
    expect(results.mount).toHaveBeenCalledWith(context, input)

    manager.push('soundNovel', { text: 'foo' })
    manager.pop()

    expect(results.mount).toHaveBeenCalledTimes(2)
    expect(results.mount).toHaveBeenLastCalledWith(context, input)
  })

  it('I: return to tavern button shows TavernScene', () => {
    const scene = new ExpeditionResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const initial = createTavernCampaign('phase8-5-smoke-i')
    const prepared = findAcceptingOffers(initial, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const input: ExpeditionResultsSceneInput = {
      campaign: advanced,
      dayNumber: previousRecord.dayNumber,
    }

    scene.mount(context, input)
    scene.setCampaign(advanced, { ...DEFAULT_GAME_UI_STATE })

    ;(scene as unknown as { returnToTavern: () => void }).returnToTavern()

    const show = context.canvasGame.sceneManager!.show as ReturnType<
      typeof vi.fn
    >
    expect(show).toHaveBeenCalledWith('tavern')
  })

  it('J: view model generation triggers zero AI calls', () => {
    const generate = vi.fn()
    const initial = createTavernCampaign('phase8-5-smoke-j')
    const prepared = findAcceptingOffers(initial, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    buildExpeditionResultsSceneViewModel(
      {
        campaign: advanced,
        dayNumber: previousRecord.dayNumber,
      },
      [],
    )

    expect(generate).not.toHaveBeenCalled()
  })
})
