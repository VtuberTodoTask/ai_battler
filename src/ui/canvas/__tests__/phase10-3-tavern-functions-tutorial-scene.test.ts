// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import {
  completeTutorial,
  setTutorialMode,
  type TutorialId,
} from '../../../core/tavern/campaign/tutorial.ts'
import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import { TavernScene } from '../scenes/tavern/TavernScene.ts'
import type { TutorialRuntime } from '../tutorial/tutorialRuntime.ts'
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
  scene: TavernScene,
  uiStateRef: { current: typeof DEFAULT_GAME_UI_STATE },
  campaignRef: { current: TavernCampaignState | null },
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
      campaignRef.current = campaign
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
      setTutorialMode: vi.fn((mode: 'enabled' | 'disabled') => {
        const next = setTutorialMode(campaignRef.current!, mode)
        campaignRef.current = next
        scene.setCampaign(next, { ...uiStateRef.current })
        return { ok: true }
      }),
      completeTutorial: vi.fn((tutorialId: TutorialId) => {
        const next = completeTutorial(campaignRef.current!, tutorialId)
        campaignRef.current = next
        scene.setCampaign(next, { ...uiStateRef.current })
        return { ok: true }
      }),
      selectParty: vi.fn(),
      selectQuest: vi.fn(),
      openCharacter: vi.fn(),
      openActivity: vi.fn().mockResolvedValue(''),
      openSettings: vi.fn(),
      closeModal: vi.fn(),
      switchToLegacy: vi.fn(),
    },
    canvasGame,
  }
}

function enabledAfterDayResults(seed: string): TavernCampaignState {
  const enabled = setTutorialMode(createTavernCampaign(seed), 'enabled')
  const withBasic = completeTutorial(enabled, 'basic_request_assignment')
  return completeTutorial(withBasic, 'day_results')
}

function getRuntime(scene: TavernScene): TutorialRuntime {
  return (scene as unknown as { _tutorialRuntime: TutorialRuntime })
    ._tutorialRuntime
}

function getOverlayVisible(scene: TavernScene): boolean {
  return (scene as unknown as { _tutorialOverlay: { visible: boolean } })
    ._tutorialOverlay.visible
}

/** See the identical helper's doc comment elsewhere in the Phase 10.x
 * test suite — sidesteps a TS getter-narrowing quirk across statements. */
function stepId(runtime: TutorialRuntime): string | null {
  return runtime.currentStepId
}

describe('Phase 10.3 tavern_functions Tutorial <-> TavernScene wiring', () => {
  it('item 41: starts once enabled + day_results completed + tavern_functions incomplete, on Tavern mount', () => {
    const campaign = enabledAfterDayResults('tf-scene-001')
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: null,
    }
    const context = createSceneContext(scene, uiStateRef, campaignRef)

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    expect(getOverlayVisible(scene)).toBe(true)
    expect(getRuntime(scene).tutorialId).toBe('tavern_functions')
    expect(stepId(getRuntime(scene))).toBe('intro_1')
  })

  it('item 42: does not start before day_results has completed, even with basic_request_assignment done', () => {
    const enabled = setTutorialMode(
      createTavernCampaign('tf-scene-002'),
      'enabled',
    )
    const withBasic = completeTutorial(enabled, 'basic_request_assignment')
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: null,
    }
    const context = createSceneContext(scene, uiStateRef, campaignRef)

    scene.mount(context)
    scene.setCampaign(withBasic, { ...DEFAULT_GAME_UI_STATE })

    expect(getOverlayVisible(scene)).toBe(false)
    expect(getRuntime(scene).tutorialId).toBe('basic_request_assignment')
  })

  it('item 43: never starts when tutorial.mode is disabled', () => {
    const disabled = setTutorialMode(
      createTavernCampaign('tf-scene-003'),
      'disabled',
    )
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: null,
    }
    const context = createSceneContext(scene, uiStateRef, campaignRef)

    scene.mount(context)
    scene.setCampaign(disabled, { ...DEFAULT_GAME_UI_STATE })

    expect(getOverlayVisible(scene)).toBe(false)
  })

  it('item 44: never re-displays once tavern_functions is already completed', () => {
    const campaign = completeTutorial(
      enabledAfterDayResults('tf-scene-004'),
      'tavern_functions',
    )
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: null,
    }
    const context = createSceneContext(scene, uiStateRef, campaignRef)

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    expect(getOverlayVisible(scene)).toBe(false)
  })

  it('items 9-10, 45: each section highlights the real Header bounds for its own button, one at a time', () => {
    const campaign = enabledAfterDayResults('tf-scene-005')
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: null,
    }
    const context = createSceneContext(scene, uiStateRef, campaignRef)
    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const runtime = getRuntime(scene)
    const getTutorialTargetBounds = (
      scene as unknown as {
        getTutorialTargetBounds: (
          t: string,
        ) => { x: number; y: number; width: number; height: number } | null
      }
    ).getTutorialTargetBounds.bind(scene)

    const sections: [string, string][] = [
      ['save_1', 'tavern_save_button'],
      ['library_1', 'tavern_library_button'],
      ['ledger_1', 'tavern_ledger_button'],
      ['facilities_1', 'tavern_facilities_button'],
      ['visitors_1', 'tavern_visitors_button'],
      ['request_history_1', 'tavern_request_history_button'],
      ['world_state_1', 'tavern_world_state_button'],
      ['main_quest_1', 'tavern_main_quest_button'],
    ]

    let previousX: number | null = null
    for (const [step, target] of sections) {
      while (stepId(runtime) !== step) runtime.advanceMessage()
      const bounds = getTutorialTargetBounds(target)
      expect(bounds).not.toBeNull()
      expect(bounds!.width).toBeGreaterThan(0)
      // Each button sits strictly to the right of the previous one — real
      // laid-out bounds, never a repeated/hardcoded coordinate.
      if (previousX !== null) expect(bounds!.x).toBeGreaterThan(previousX)
      previousX = bounds!.x
    }
  })

  it('item 46-47: every step blocks Game UI interaction — no interaction target is ever granted', () => {
    const campaign = enabledAfterDayResults('tf-scene-006')
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: null,
    }
    const context = createSceneContext(scene, uiStateRef, campaignRef)
    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })
    campaignRef.current = campaign

    const runtime = getRuntime(scene)
    for (let i = 0; i < 40; i++) {
      const snapshot = runtime.getSnapshot()
      expect(snapshot.targets).toEqual([])
      if (!snapshot.showNextButton) break
      runtime.advanceMessage()
    }
  })

  it('items 31, 48-49: closing line commits completeTutorial(tavern_functions) exactly once and closes the Overlay', () => {
    const campaign = enabledAfterDayResults('tf-scene-007')
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: null,
    }
    const context = createSceneContext(scene, uiStateRef, campaignRef)
    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })
    campaignRef.current = campaign

    const runtime = getRuntime(scene)
    while (stepId(runtime) !== 'ending_5') {
      runtime.advanceMessage()
    }
    expect(runtime.getSnapshot().text).toBe('打倒ノスフェラトゥ！！')

    runtime.advanceMessage()

    expect(context.actions.completeTutorial).toHaveBeenCalledTimes(1)
    expect(context.actions.completeTutorial).toHaveBeenCalledWith(
      'tavern_functions',
    )
    expect(campaignRef.current?.tutorial.completedTutorialIds).toEqual([
      'basic_request_assignment',
      'day_results',
      'tavern_functions',
    ])
    expect(getOverlayVisible(scene)).toBe(false)
  })

  it('item 33-34, 50: a later resync after completion never re-triggers or duplicates the id, and normal Tavern interaction resumes', () => {
    const campaign = enabledAfterDayResults('tf-scene-008')
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: null,
    }
    const context = createSceneContext(scene, uiStateRef, campaignRef)
    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })
    campaignRef.current = campaign

    const runtime = getRuntime(scene)
    while (stepId(runtime) !== 'ending_5') runtime.advanceMessage()
    runtime.advanceMessage()
    expect(campaignRef.current?.tutorial.completedTutorialIds).toEqual([
      'basic_request_assignment',
      'day_results',
      'tavern_functions',
    ])

    // An unrelated later resync of the SAME (now fully-completed) Campaign.
    scene.setCampaign(campaignRef.current!, { ...uiStateRef.current })
    expect(getOverlayVisible(scene)).toBe(false)
    expect(campaignRef.current?.tutorial.completedTutorialIds).toEqual([
      'basic_request_assignment',
      'day_results',
      'tavern_functions',
    ])

    // Normal Tavern actions still reach the real handlers, unblocked.
    ;(
      scene as unknown as { handleSelectParty: (id: string) => void }
    ).handleSelectParty('any-party-id')
    expect(context.actions.selectParty).toHaveBeenCalledWith('any-party-id')
  })
})
