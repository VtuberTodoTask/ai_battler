// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import type { CampaignRelationshipEvent } from '../../../core/tavern/campaign/types.ts'
import type { DowntimeEvent } from '../../../core/narrative/types.ts'
import { TavernScene } from '../scenes/tavern/TavernScene.ts'
import { GameAssetManager } from '../assets/GameAssetManager.ts'
import { GameViewport } from '../GameViewport.ts'
import { OverlayManager } from '../overlays/OverlayManager.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import { DEFAULT_GAME_UI_STATE, type GameSceneContext } from '../types.ts'

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
  scene: TavernScene,
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

  const actions = {
    advanceDay: vi.fn(() => ({ ok: true })),
    resolveDay: vi.fn(() => ({ ok: true })),
    offerRequest: vi.fn(() => ({ ok: true })),
    purchaseUpgrade: vi.fn(() => ({ ok: true })),
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
  }

  const canvasGame = {
    setUiState: vi.fn((partial) => {
      uiStateRef.current = { ...uiStateRef.current, ...partial }
      scene.setUiState(uiStateRef.current)
    }),
    sceneManager: {
      push: vi.fn(),
      pop: vi.fn(),
    },
  } as unknown as GameSceneContext['canvasGame']

  return {
    id: 'phase8-1-1-smoke',
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

describe('Phase 8.1.1 Tavern Integration Smoke', () => {
  it('A: assign button passes partyId first to offerRequest', async () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-1-offer-order')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests[0]!

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
      selectedQuestId: quest.id,
    })

    const assignButton = (
      scene as unknown as {
        _decisionPanel: { _assignButton: { emit: (event: string) => void } }
      }
    )._decisionPanel._assignButton
    assignButton.emit('pointertap')

    expect(context.actions.offerRequest).toHaveBeenCalledWith(
      party.id,
      quest.id,
    )
  })

  it('B: failed action displays an error message in the header', async () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-1-feedback')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests[0]!

    context.actions.offerRequest = vi.fn(() => ({
      ok: false,
      message: 'このパーティは療養中です',
    }))

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
      selectedQuestId: quest.id,
    })

    const assignButton = (
      scene as unknown as {
        _decisionPanel: { _assignButton: { emit: (event: string) => void } }
      }
    )._decisionPanel._assignButton
    assignButton.emit('pointertap')

    const viewModel = (
      scene as unknown as {
        _viewModel: { header: { statusMessage?: { text: string } } }
      }
    )._viewModel
    expect(viewModel.header.statusMessage?.text).toBe(
      'このパーティは療養中です',
    )
  })

  it("C: stay extension events are projected into Today's Activity", () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-1-stay')
    const party = campaign.currentDay.parties[0]!

    const stayEvent: Extract<
      CampaignRelationshipEvent,
      { type: 'stayExtended' }
    > = {
      type: 'stayExtended',
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: campaign.dayNumber,
      previousDepartureDay: campaign.dayNumber,
      newDepartureDay: campaign.dayNumber + 2,
      extensionDays: 2,
      affinity: party.relationship?.affinity ?? 0,
      primaryReason: 'training',
      secondaryReason: 'recovery',
      relevantCharacterIds: [],
      presentationPlan: {
        id: 'stay:test',
        framing: 'closeUp',
        openingCategory: 'dialogue_first',
        speakingCharacterIds: party.party.members.slice(0, 1).map((m) => m.id),
        endingStyle: 'concrete_action',
      },
    }

    campaign.history.push({
      dayNumber: campaign.dayNumber,
      daySeed: campaign.seed,
      reputationSummary: {
        beforeScore: campaign.reputation.score,
        delta: 0,
        afterScore: campaign.reputation.score,
        beforeRank: 1,
        afterRank: 1,
        promoted: false,
      },
      results: [],
      partyEvents: [],
      progressionEvents: [],
      questChainEvents: [],
      worldEventEvents: [],
      relationshipEvents: [stayEvent],
    })

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const activities = (
      scene as unknown as {
        _viewModel: {
          activities: { kind: string; title: string; summary: string }[]
        }
      }
    )._viewModel.activities
    const stayActivity = activities.find((a) => a.kind === 'stay_extension')
    expect(stayActivity).toBeDefined()
    expect(stayActivity!.title).toContain(party.party.name)
    expect(stayActivity!.summary).toContain('訓練')
    expect(stayActivity!.summary).toContain('回復')
  })

  it('D: generated activity opens without an AI call and becomes viewed', async () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-1-generated')
    const party = campaign.currentDay.parties[0]!
    const event: DowntimeEvent = {
      id: 'downtime:generated',
      day: campaign.dayNumber,
      type: 'shared_meal',
      participantIds: party.party.members.slice(0, 2).map((m) => m.id),
      valence: 'positive',
      importance: 3,
      relationshipDeltas: [],
      memoryEligible: true,
      narrativeKey: 'shared_meal',
      createdAtDay: campaign.dayNumber,
      narrativeStatus: 'generated',
      generatedText: 'すでに生成された本文',
      fallbackSummary: 'fallback',
    }
    party.downtimeEvents = [event]

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const getRows = () =>
      (
        scene as unknown as {
          _activityPanel: { _rows: { emit: (event: string) => void }[] }
        }
      )._activityPanel._rows

    getRows()[0]!.emit('pointertap')
    await Promise.resolve()

    expect(context.actions.openActivity).toHaveBeenCalledTimes(1)
    expect(context.actions.openActivity).toHaveBeenLastCalledWith(
      party.id,
      event.id,
    )
  })

  it('E: lazy generation of an unseen activity happens only once', async () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-1-lazy')
    const party = campaign.currentDay.parties[0]!
    const event: DowntimeEvent = {
      id: 'downtime:lazy',
      day: campaign.dayNumber,
      type: 'shared_meal',
      participantIds: party.party.members.slice(0, 2).map((m) => m.id),
      valence: 'positive',
      importance: 3,
      relationshipDeltas: [],
      memoryEligible: true,
      narrativeKey: 'shared_meal',
      createdAtDay: campaign.dayNumber,
      narrativeStatus: 'unseen',
      fallbackSummary: 'fallback',
    }
    party.downtimeEvents = [event]

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const getRows = () =>
      (
        scene as unknown as {
          _activityPanel: { _rows: { emit: (event: string) => void }[] }
        }
      )._activityPanel._rows

    getRows()[0]!.emit('pointertap')
    await Promise.resolve()

    // Simulate host marking the event viewed after the first open.
    event.narrativeStatus = 'viewed'
    event.generatedText = '生成された酒場イベントの本文'
    scene.setCampaign(campaign, uiStateRef.current)

    getRows()[0]!.emit('pointertap')
    await Promise.resolve()

    expect(context.actions.openActivity).toHaveBeenCalledTimes(1)
  })

  it('F: recovering party is selectable but cannot be assigned', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-1-recovering')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests[0]!
    party.availability = 'recovering'
    party.recoveryDaysRemaining = 2

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const partyRows = (
      scene as unknown as {
        _partyList: { _rows: { emit: (event: string) => void }[] }
      }
    )._partyList._rows

    expect(partyRows.length).toBeGreaterThan(0)
    partyRows[0]!.emit('pointertap')
    expect(context.actions.selectParty).toHaveBeenCalledWith(party.id)

    // Select a quest and refresh the view model to exercise assignability.
    scene.setCampaign(campaign, {
      ...uiStateRef.current,
      selectedPartyId: party.id,
      selectedQuestId: quest.id,
    })

    const summary = (
      scene as unknown as {
        _viewModel: {
          selectedParty?: {
            canAssignQuest: boolean
            assignDisabledReason?: string
          }
        }
      }
    )._viewModel.selectedParty
    expect(summary?.canAssignQuest).toBe(false)
    expect(summary?.assignDisabledReason).toContain('療養')
  })

  it('G: stale party and quest selections are cleared after advancing', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    let campaign = createTavernCampaign('phase8-1-1-reconcile')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests[0]!

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
      selectedQuestId: quest.id,
    })

    // Simulate day advance: keep the same campaign object but remove the party and quest.
    campaign = {
      ...campaign,
      currentDay: {
        ...campaign.currentDay,
        parties: campaign.currentDay.parties.slice(1),
        requests: campaign.currentDay.requests.slice(1),
      },
    }

    scene.setCampaign(campaign, uiStateRef.current)

    expect(uiStateRef.current.selectedPartyId).toBeNull()
    expect(uiStateRef.current.selectedQuestId).toBeNull()
  })

  it('H: extensionDaysRemaining uses current day, not arrival day', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-1-remaining')
    const party = campaign.currentDay.parties[0]!
    party.arrivalDay = campaign.dayNumber - 2
    party.plannedDepartureDay = campaign.dayNumber + 3

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const partyRow = (
      scene as unknown as {
        _viewModel: { parties: { extensionDaysRemaining?: number }[] }
      }
    )._viewModel.parties[0]
    expect(partyRow?.extensionDaysRemaining).toBe(4)
  })
})
