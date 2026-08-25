// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../core/tavern/campaign/campaign.ts'
import {
  completeTutorial,
  setTutorialMode,
  type TutorialId,
} from '../../../core/tavern/campaign/tutorial.ts'
import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import { DayResultsScene } from '../scenes/dayResults/DayResultsScene.ts'
import type {
  DayResultsSceneInput,
  ExpeditionResultItemViewModel,
} from '../scenes/dayResults/dayResultsViewModel.ts'
import type { TutorialRuntime } from '../tutorial/tutorialRuntime.ts'
import { GameAssetManager } from '../assets/GameAssetManager.ts'
import { GameViewport } from '../GameViewport.ts'
import { OverlayManager } from '../overlays/OverlayManager.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import {
  DEFAULT_GAME_UI_STATE,
  type GameSceneContext,
  type GameUiState,
} from '../types.ts'

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
  scene: DayResultsScene,
  uiStateRef: { current: GameUiState },
  campaignRef: { current: TavernCampaignState | null },
) {
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

  const sceneManager = { push: vi.fn(), pop: vi.fn() }

  const canvasGame = {
    setUiState: vi.fn((partial: Partial<GameUiState>) => {
      uiStateRef.current = { ...uiStateRef.current, ...partial }
      scene.setUiState(uiStateRef.current)
    }),
    setCampaign: vi.fn((campaign: TavernCampaignState) => {
      campaignRef.current = campaign
      scene.setCampaign(campaign, { ...uiStateRef.current })
    }),
    sceneManager,
  } as unknown as GameSceneContext['canvasGame']

  const context = {
    id: 'day-results-test',
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
      openExpeditionNarrative: vi.fn(),
      openSettings: vi.fn(),
      closeModal: vi.fn(),
      switchToLegacy: vi.fn(),
    },
    canvasGame,
  } as GameSceneContext

  return { context, sceneManager }
}

/** A campaign that has resolved one day with zero accepted offers — the
 * only genuinely deterministic (seed-independent) way to guarantee
 * `expeditionResults.length === 0`, i.e. the `no_results` outcome. */
function noResultsCampaign(seed: string): {
  campaign: TavernCampaignState
  input: DayResultsSceneInput
} {
  const campaign = setTutorialMode(createTavernCampaign(seed), 'enabled')
  const advanced = advanceCampaignDay(resolveCampaignDay(campaign))
  const previousRecord = advanced.history[advanced.history.length - 1]!
  return {
    campaign: advanced,
    input: {
      campaign: advanced,
      resolvedDay: previousRecord.dayNumber,
      nextDay: advanced.dayNumber,
      step: 'important_events',
      returnTarget: { sceneId: 'tavern' },
    },
  }
}

function fakeResult(
  overrides: Partial<ExpeditionResultItemViewModel> = {},
): ExpeditionResultItemViewModel {
  return {
    id: 'result-1',
    day: 1,
    questTitle: 'テスト依頼',
    partyName: 'テストパーティ',
    partyId: undefined,
    outcome: 'success',
    outcomeLabel: '成功',
    objectiveSummary: '',
    survivalText: '',
    casualties: [],
    injuries: [],
    injuryRecordMissing: false,
    majorEvents: [],
    narrativeStatus: 'unseen',
    canGenerateNarrative: true,
    tone: 'good',
    summaryLines: [],
    seen: true,
    ...overrides,
  }
}

/** See the identical helper's doc comment in `dayResultsTutorialRuntime.test.ts`
 * — sidesteps a TS getter-narrowing quirk across unrelated statements. */
function stepId(runtime: TutorialRuntime): string | null {
  return runtime.currentStepId
}

function getRuntime(scene: DayResultsScene): TutorialRuntime {
  return (scene as unknown as { _tutorialRuntime: TutorialRuntime })
    ._tutorialRuntime
}

function getOverlayVisible(scene: DayResultsScene): boolean {
  return (scene as unknown as { _tutorialOverlay: { visible: boolean } })
    ._tutorialOverlay.visible
}

/** PR #63 review items 36-38: reads the real `TutorialOverlay`'s Dialogue
 * Panel `y` off the mounted Scene, the same way `phase10-1-tutorial-scene.test.ts`
 * does for its own regression check. */
function getDialogueY(scene: DayResultsScene): number {
  return (
    scene as unknown as {
      _tutorialOverlay: { _dialoguePanel: { y: number } }
    }
  )._tutorialOverlay._dialoguePanel.y
}

function getTutorialTargetBounds(
  scene: DayResultsScene,
  target: string,
): { x: number; y: number; width: number; height: number } | null {
  return (
    scene as unknown as {
      getTutorialTargetBounds: (
        t: string,
      ) => { x: number; y: number; width: number; height: number } | null
    }
  ).getTutorialTargetBounds(target)
}

interface ScenePrivate {
  goToExpeditionResults: () => void
  goToNextDay: () => void
  openSoundNovelForResult: (
    result: ExpeditionResultItemViewModel,
    text: string,
  ) => void
  openNarrativeForResult: (result: ExpeditionResultItemViewModel) => void
}

describe('Phase 10.2 day_results Tutorial <-> DayResultsScene wiring', () => {
  it('starts the Tutorial at intro_1 on mount, without depending on basic_request_assignment having completed', () => {
    const { campaign, input } = noResultsCampaign('dr-scene-001')
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: campaign,
    }
    const { context } = createSceneContext(scene, uiStateRef, campaignRef)

    scene.mount(context, input)

    expect(getOverlayVisible(scene)).toBe(true)
    expect(stepId(getRuntime(scene))).toBe('intro_1')
  })

  it('never starts when tutorial.mode is disabled', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('dr-scene-002'),
      'disabled',
    )
    const advanced = advanceCampaignDay(resolveCampaignDay(campaign))
    const previousRecord = advanced.history[advanced.history.length - 1]!
    const input: DayResultsSceneInput = {
      campaign: advanced,
      resolvedDay: previousRecord.dayNumber,
      nextDay: advanced.dayNumber,
    }
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: advanced,
    }
    const { context } = createSceneContext(scene, uiStateRef, campaignRef)

    scene.mount(context, input)
    expect(getOverlayVisible(scene)).toBe(false)
  })

  it('dispatches day_results_next_pressed only after the step actually changes, routing zero results to no_results', () => {
    const { campaign, input } = noResultsCampaign('dr-scene-003')
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: campaign,
    }
    const { context } = createSceneContext(scene, uiStateRef, campaignRef)
    scene.mount(context, input)

    const runtime = getRuntime(scene)
    while (stepId(runtime) !== 'wait_next') runtime.advanceMessage()

    ;(scene as unknown as ScenePrivate).goToExpeditionResults()

    expect(uiStateRef.current.lastDayResultsStep).toBe('expedition_results')
    expect(stepId(runtime)).toBe('outcome_no_results_1')
  })

  it('completes the Tutorial via day_results_closed BEFORE the Scene pops, never via day_advanced', () => {
    const { campaign, input } = noResultsCampaign('dr-scene-004')
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: campaign,
    }
    const { context, sceneManager } = createSceneContext(
      scene,
      uiStateRef,
      campaignRef,
    )
    scene.mount(context, input)

    const runtime = getRuntime(scene)
    while (stepId(runtime) !== 'wait_next') runtime.advanceMessage()
    ;(scene as unknown as ScenePrivate).goToExpeditionResults()
    while (stepId(runtime) !== 'wait_final_no_narrative') {
      runtime.advanceMessage()
    }

    const popOrder: string[] = []
    ;(
      context.actions.completeTutorial as ReturnType<typeof vi.fn>
    ).mockImplementation((tutorialId: TutorialId) => {
      popOrder.push(`complete:${tutorialId}`)
      const next = completeTutorial(campaignRef.current!, tutorialId)
      campaignRef.current = next
      scene.setCampaign(next, { ...uiStateRef.current })
      return { ok: true }
    })
    ;(sceneManager.pop as ReturnType<typeof vi.fn>).mockImplementation(() => {
      popOrder.push('pop')
    })

    ;(scene as unknown as ScenePrivate).goToNextDay()

    expect(popOrder).toEqual(['complete:day_results', 'pop'])
    expect(campaignRef.current?.tutorial.completedTutorialIds).toEqual([
      'day_results',
    ])
    expect(getOverlayVisible(scene)).toBe(false)
  })

  it('a day_advanced dispatch never completes day_results (distinct from basic_request_assignment)', () => {
    const { campaign, input } = noResultsCampaign('dr-scene-005')
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: campaign,
    }
    const { context } = createSceneContext(scene, uiStateRef, campaignRef)
    scene.mount(context, input)

    const runtime = getRuntime(scene)
    runtime.dispatch({ type: 'day_advanced' })
    expect(runtime.isBlocking).toBe(true)
    expect(context.actions.completeTutorial).not.toHaveBeenCalled()
  })

  it('never re-triggers once day_results is already completed', () => {
    const { campaign, input } = noResultsCampaign('dr-scene-006')
    const completed = completeTutorial(campaign, 'day_results')
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: completed,
    }
    const { context } = createSceneContext(scene, uiStateRef, campaignRef)

    scene.mount(context, { ...input, campaign: completed })
    expect(getOverlayVisible(scene)).toBe(false)

    // A later resync must not resurrect it.
    scene.setCampaign(completed, { ...uiStateRef.current })
    expect(getOverlayVisible(scene)).toBe(false)
  })

  it('opening an unavailable Narrative never dispatches day_results_story_opened and shows a Modal instead', () => {
    const { campaign, input } = noResultsCampaign('dr-scene-007')
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: campaign,
    }
    const { context } = createSceneContext(scene, uiStateRef, campaignRef)
    scene.mount(context, input)

    const runtime = getRuntime(scene)
    const stepBefore = stepId(runtime)
    const openModalSpy = vi.spyOn(context.overlayManager, 'openModal')

    const noNarrativeResult = fakeResult({
      canGenerateNarrative: false,
      generatedText: undefined,
      narrativeTargetId: undefined,
    })
    ;(scene as unknown as ScenePrivate).openNarrativeForResult(
      noNarrativeResult,
    )

    expect(openModalSpy).toHaveBeenCalled()
    expect(stepId(runtime)).toBe(stepBefore)
  })

  it('a failed Narrative generation never dispatches day_results_story_opened or sets a resume marker', async () => {
    const { campaign, input } = noResultsCampaign('dr-scene-008')
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: campaign,
    }
    const { context } = createSceneContext(scene, uiStateRef, campaignRef)
    scene.mount(context, input)
    campaignRef.current = { ...campaign, narrativeCandidates: [] }

    const runtime = getRuntime(scene)
    const stepBefore = stepId(runtime)
    ;(
      context.actions.openExpeditionNarrative as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ ok: false, message: 'failed' })

    const pendingResult = fakeResult({
      canGenerateNarrative: true,
      generatedText: undefined,
      narrativeTargetId: 'narrative-1',
    })
    ;(scene as unknown as ScenePrivate).openNarrativeForResult(pendingResult)
    await Promise.resolve()
    await Promise.resolve()

    expect(stepId(runtime)).toBe(stepBefore)
    expect(uiStateRef.current.tutorialResumeState).toBeUndefined()
  })

  it('opening a real Narrative dispatches day_results_story_opened, sets a TutorialResumeState marker, and the SoundNovel round-trip resumes the Runtime on remount', () => {
    const { campaign, input } = noResultsCampaign('dr-scene-009')
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: campaign,
    }
    const { context, sceneManager } = createSceneContext(
      scene,
      uiStateRef,
      campaignRef,
    )
    scene.mount(context, input)

    // Fast-forward the Runtime to the Multi-target closing step directly
    // (bypassing the real per-line click-through, which this test doesn't
    // need) — `resumeAt` is the same public mechanism the Scene itself
    // uses for the round-trip.
    const runtime = getRuntime(scene)
    runtime.resumeAt('wait_final_choice')
    expect(stepId(runtime)).toBe('wait_final_choice')

    const result = fakeResult({ generatedText: '生成済みの物語テキスト' })
    ;(scene as unknown as ScenePrivate).openSoundNovelForResult(
      result,
      result.generatedText!,
    )

    // The Narrative-open action resumes the story chain — it does NOT
    // complete the Tutorial on its own (item 10 of the review).
    expect(stepId(runtime)).toBe('after_story_1')
    expect(context.actions.completeTutorial).not.toHaveBeenCalled()
    expect(uiStateRef.current.tutorialResumeState).toEqual({
      tutorialId: 'day_results',
      stepId: 'after_story_1',
    })
    expect(sceneManager.push).toHaveBeenCalledWith(
      'soundNovel',
      expect.objectContaining({ source: 'expedition' }),
    )

    // Simulate the SoundNovel Scene popping back: DayResultsScene
    // unmounts (nulling its Runtime — Phase 10.2 never relies on
    // Scene-instance persistence to survive the round-trip) and remounts
    // with a stale `mount()` input, exactly like `GameSceneManager.pop()`.
    scene.unmount()
    scene.mount(context, input)

    expect(stepId(getRuntime(scene))).toBe('after_story_1')
    // The marker is consumed exactly once — cleared so a later, unrelated
    // remount can never re-apply it (item 45 of the review).
    expect(uiStateRef.current.tutorialResumeState).toBeUndefined()
  })

  it('the Multi-target closing step reports both buttons as simultaneously operable/highlighted', () => {
    const { campaign, input } = noResultsCampaign('dr-scene-010')
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: campaign,
    }
    const { context } = createSceneContext(scene, uiStateRef, campaignRef)
    scene.mount(context, input)

    const runtime = getRuntime(scene)
    runtime.resumeAt('wait_final_choice')
    const snapshot = runtime.getSnapshot()
    expect(snapshot.targets).toEqual([
      'day_results_narrative_button',
      'day_results_next_day_button',
    ])
  })

  it('PR #63 review item 36: the 次へ wait step docks the Dialogue to top, fully clear of the real 次へ bounds', () => {
    const { campaign, input } = noResultsCampaign('dr-scene-011')
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: campaign,
    }
    const { context } = createSceneContext(scene, uiStateRef, campaignRef)
    scene.mount(context, input)

    const runtime = getRuntime(scene)
    while (stepId(runtime) !== 'wait_next') runtime.advanceMessage()

    expect(getDialogueY(scene)).toBe(16)
    const nextButtonBounds = getTutorialTargetBounds(
      scene,
      'day_results_next_button',
    )
    expect(nextButtonBounds).not.toBeNull()
    // The bottom-docked Dialogue would span y 724-884 (item 17) — the
    // real 次へ button sits inside that range, which is exactly why the
    // Overlay moved to top (y 16, height 160 -> bottom edge 176, well
    // clear of the button).
    expect(nextButtonBounds!.y).toBeGreaterThanOrEqual(724)
    expect(16 + 160).toBeLessThanOrEqual(nextButtonBounds!.y)
  })

  it('PR #63 review item 37: the Multi-target Final Choice docks the Dialogue to top', () => {
    const { campaign, input } = noResultsCampaign('dr-scene-012')
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: campaign,
    }
    const { context } = createSceneContext(scene, uiStateRef, campaignRef)
    scene.mount(context, { ...input, step: 'expedition_results' })

    const runtime = getRuntime(scene)
    // `resumeAt` calls the Runtime's own `onChange` callback, which this
    // Scene wires straight to `renderTutorial()` — no manual re-render
    // needed to see the placement update.
    runtime.resumeAt('wait_final_choice')

    expect(getDialogueY(scene)).toBe(16)
  })

  it('PR #63 review item 38: after_story (Next Day only) still docks the Dialogue to top', () => {
    const { campaign, input } = noResultsCampaign('dr-scene-013')
    const scene = new DayResultsScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: campaign,
    }
    const { context } = createSceneContext(scene, uiStateRef, campaignRef)
    scene.mount(context, { ...input, step: 'expedition_results' })

    const runtime = getRuntime(scene)
    runtime.resumeAt('after_story_1')

    expect(getDialogueY(scene)).toBe(16)
  })
})
