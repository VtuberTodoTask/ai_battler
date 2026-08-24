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
import type { ExpeditionPrediction } from '../../../core/tavern/prediction/types.ts'
import type { BrokerageOfferAttempt } from '../../../core/tavern/types.ts'
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
    // Mirrors CanvasGame.setCampaign's contract for a Scene that stays
    // mounted throughout (the only case this Runtime ever exercises):
    // update the tracked Campaign and resync the Scene directly.
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
      // Mirrors TavernSimulator's handleSetTutorialMode/handleCompleteTutorial:
      // apply the Core transition to the freshest known Campaign, then
      // resync the Scene directly (there is no React state to flow through
      // in this test harness).
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

function fakePrediction(): ExpeditionPrediction {
  return {
    requestId: 'req',
    partyId: 'party',
    modelVersion: 'v1',
    sampleCount: 200,
    estimatedSuccessRate: 0.6,
    counts: {
      completeSuccess: 40,
      success: 80,
      partialSuccess: 40,
      failedObjective: 30,
      forcedRetreat: 8,
      lostExpedition: 2,
    },
    rates: {
      completeSuccess: 0.2,
      success: 0.4,
      partialSuccess: 0.2,
      failedObjective: 0.15,
      forcedRetreat: 0.04,
      lostExpedition: 0.01,
    },
  }
}

function fakeOffer(): BrokerageOfferAttempt {
  return {
    id: `offer-${Math.random()}`,
    requestId: 'req',
    partyId: 'party',
    decision: 'accepted',
    reason: 'appropriate',
    evaluation: {} as BrokerageOfferAttempt['evaluation'],
  }
}

/** Clicks [次へ] repeatedly for as long as the current step is an
 * advanceable `message` — avoids hand-counting every step in a linear
 * chain (including `recover_2`'s conditional branch). */
function clickThroughMessages(runtime: TutorialRuntime, maxClicks = 30): void {
  let clicks = 0
  while (runtime.getSnapshot().showNextButton && clicks < maxClicks) {
    runtime.advanceMessage()
    clicks++
  }
}

function getRuntime(scene: TavernScene): TutorialRuntime {
  return (scene as unknown as { _tutorialRuntime: TutorialRuntime })
    ._tutorialRuntime
}

function getOverlayVisible(scene: TavernScene): boolean {
  return (scene as unknown as { _tutorialOverlay: { visible: boolean } })
    ._tutorialOverlay.visible
}

describe('Phase 10.1 Tutorial <-> TavernScene wiring', () => {
  it('shows the Consent Overlay on the very first Day-1 render', () => {
    const campaign = createTavernCampaign('tut-scene-001')
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: null,
    }
    const context = createSceneContext(scene, uiStateRef, campaignRef)

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    expect(getOverlayVisible(scene)).toBe(true)
    expect(
      getRuntime(scene)
        .getSnapshot()
        .choices?.map((c) => c.id),
    ).toEqual(['yes', 'no'])
  })

  it('suppresses Party auto-select while Consent is pending, then runs it once after declining', () => {
    const campaign = createTavernCampaign('tut-scene-002')
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: null,
    }
    const context = createSceneContext(scene, uiStateRef, campaignRef)

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })
    campaignRef.current = campaign
    expect(uiStateRef.current.selectedPartyId).toBeNull()

    getRuntime(scene).selectChoice('no')
    // 3 decline lines, then the closing advance.
    getRuntime(scene).advanceMessage()
    getRuntime(scene).advanceMessage()
    getRuntime(scene).advanceMessage()

    expect(campaignRef.current?.tutorial.mode).toBe('disabled')
    const firstParty = campaign.currentDay.parties[0]!
    expect(uiStateRef.current.selectedPartyId).toBe(firstParty.id)
  })

  it('does not re-show Consent or restart the step sequence on a same-Campaign resync', () => {
    const campaign = createTavernCampaign('tut-scene-003')
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: null,
    }
    const context = createSceneContext(scene, uiStateRef, campaignRef)

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })
    campaignRef.current = campaign
    getRuntime(scene).selectChoice('yes')
    getRuntime(scene).advanceMessage() // -> intro_2
    const runtimeBefore = getRuntime(scene)
    const textBefore = runtimeBefore.getSnapshot().text

    // An unrelated resync of the SAME Campaign (identical seed).
    scene.setCampaign(campaignRef.current!, { ...uiStateRef.current })

    expect(getRuntime(scene)).toBe(runtimeBefore)
    expect(getRuntime(scene).getSnapshot().text).toBe(textBefore)
  })

  it('never re-shows the Overlay once the Basic Tutorial has completed', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('tut-scene-004'),
      'enabled',
    )
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
    for (let i = 0; i < 7; i++) runtime.advanceMessage()
    runtime.dispatch({ type: 'quest_selected', questId: 'q' })
    for (let i = 0; i < 4; i++) runtime.advanceMessage()
    runtime.dispatch({ type: 'party_selected', partyId: 'p' })
    runtime.dispatch({ type: 'prediction_ready', prediction: fakePrediction() })
    for (let i = 0; i < 11; i++) runtime.advanceMessage()
    runtime.dispatch({ type: 'request_offered', decision: 'accepted' })
    // Mirrors the real app's async post-offer Campaign resync landing
    // before `recover_2` is reached: `hasAcceptedOfferToday()` reads
    // straight from `currentDay.offers`, never a Tutorial-side counter.
    const withOffer: TavernCampaignState = {
      ...campaignRef.current!,
      currentDay: {
        ...campaignRef.current!.currentDay,
        offers: [...campaignRef.current!.currentDay.offers, fakeOffer()],
      },
    }
    campaignRef.current = withOffer
    scene.setCampaign(withOffer, { ...uiStateRef.current })

    clickThroughMessages(runtime)
    expect(runtime.currentTarget).toBe('next_day_button')

    runtime.dispatch({ type: 'day_advanced' })

    expect(getOverlayVisible(scene)).toBe(false)
    expect(campaignRef.current?.tutorial.completedTutorialIds).toEqual([
      'basic_request_assignment',
    ])

    // A later, unrelated resync (e.g. a day advance further down the line)
    // must not resurrect a completed Tutorial.
    scene.setCampaign(campaignRef.current!, { ...uiStateRef.current })
    expect(getOverlayVisible(scene)).toBe(false)
  })

  it("suppresses the decline Modal during the Tutorial's request_offered wait", () => {
    const campaign = setTutorialMode(
      createTavernCampaign('tut-scene-005'),
      'enabled',
    )
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests[0]!
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: null,
    }
    const context = createSceneContext(scene, uiStateRef, campaignRef)

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const runtime = getRuntime(scene)
    for (let i = 0; i < 7; i++) runtime.advanceMessage()
    runtime.dispatch({ type: 'quest_selected', questId: quest.id })
    for (let i = 0; i < 4; i++) runtime.advanceMessage()
    runtime.dispatch({ type: 'party_selected', partyId: party.id })
    runtime.dispatch({ type: 'prediction_ready', prediction: fakePrediction() })
    for (let i = 0; i < 11; i++) runtime.advanceMessage()
    expect(runtime.currentTarget).toBe('assign_button')

    scene.setUiState({
      ...uiStateRef.current,
      selectedPartyId: party.id,
      selectedQuestId: quest.id,
    })

    const openModalSpy = vi.spyOn(context.overlayManager, 'openModal')
    ;(context.actions.offerRequest as ReturnType<typeof vi.fn>).mockReturnValue(
      {
        ok: true,
        data: {
          decision: 'declined',
          reason: 'risk',
          reasonText: '危険すぎる',
        },
      },
    )

    ;(scene as unknown as { handleAssign: () => void }).handleAssign()

    expect(openModalSpy).not.toHaveBeenCalled()
    expect(uiStateRef.current.actionMessage?.kind).toBe('info')
    expect(uiStateRef.current.actionMessage?.text).toContain('危険すぎる')
    // The decision still reaches the Runtime, advancing past the wait.
    expect(runtime.currentTarget).toBe('none')
    expect(runtime.getSnapshot().text).toBe(
      'ありゃりゃ。断られちゃいましたね……',
    )
  })

  it('leaves the traditional decline Modal untouched outside the Tutorial', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('tut-scene-006'),
      'disabled',
    )
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests[0]!
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const campaignRef: { current: TavernCampaignState | null } = {
      current: null,
    }
    const context = createSceneContext(scene, uiStateRef, campaignRef)

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
      selectedQuestId: quest.id,
    })

    const openModalSpy = vi.spyOn(context.overlayManager, 'openModal')
    ;(context.actions.offerRequest as ReturnType<typeof vi.fn>).mockReturnValue(
      {
        ok: true,
        data: {
          decision: 'declined',
          reason: 'risk',
          reasonText: '危険すぎる',
        },
      },
    )

    ;(scene as unknown as { handleAssign: () => void }).handleAssign()

    expect(openModalSpy).toHaveBeenCalled()
  })
})
