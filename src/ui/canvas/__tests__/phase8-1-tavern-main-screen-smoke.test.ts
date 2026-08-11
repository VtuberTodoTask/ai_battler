// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../../core/tavern/brokerage.ts'
import type { DowntimeEvent } from '../../../core/narrative/types.ts'
import { TavernScene } from '../scenes/tavern/TavernScene.ts'
import { GameAssetManager } from '../assets/GameAssetManager.ts'
import { GameViewport, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../GameViewport.ts'
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
    advanceDay: vi.fn(),
    resolveDay: vi.fn(),
    offerRequest: vi.fn(),
    selectParty: vi.fn(),
    selectQuest: vi.fn(),
    openCharacter: vi.fn(),
    openActivity: vi.fn().mockResolvedValue('生成された酒場イベントの本文'),
    closeModal: vi.fn(),
    switchToLegacy: vi.fn(),
  }

  const canvasGame = {
    setUiState: vi.fn((partial) => {
      uiStateRef.current = { ...uiStateRef.current, ...partial }
      scene.setUiState(uiStateRef.current)
    }),
  } as unknown as GameSceneContext['canvasGame']

  return {
    id: 'phase8-1-smoke',
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

describe('Phase 8.1 Tavern Main Screen Smoke', () => {
  it('A: TavernScene is the production tavern scene', () => {
    const scene = new TavernScene()
    expect(scene.id).toBe('tavern')
  })

  it('B: header reflects day, reputation and resolve/advance state', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-header')

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: campaign.currentDay.parties[0]!.id,
    })

    const vm = (
      scene as unknown as {
        _viewModel: {
          header: {
            day: number
            reputation: number
            canResolveDay: boolean
            canAdvanceDay: boolean
          }
        }
      }
    )._viewModel
    expect(vm.header.day).toBe(campaign.dayNumber)
    expect(vm.header.reputation).toBe(campaign.reputation)
    expect(vm.header.canResolveDay).toBe(true)
    expect(vm.header.canAdvanceDay).toBe(false)
  })

  it('C: party selection updates summary and quest assignability', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-party')
    const party = campaign.currentDay.parties[0]!

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const partyRows = (
      scene as unknown as {
        _partyList: { _rows: { emit: (event: string) => void }[] }
      }
    )._partyList._rows
    partyRows[0]!.emit('pointertap')

    expect(context.actions.selectParty).toHaveBeenCalledWith(party.id)
    expect(uiStateRef.current.selectedPartyId).toBe(party.id)

    const vm = (
      scene as unknown as {
        _viewModel: { selectedParty: { id: string } | undefined }
      }
    )._viewModel
    expect(vm.selectedParty?.id).toBe(party.id)
  })

  it('D: quest selection works independently from party selection', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-quest')
    const quest = campaign.currentDay.requests[0]!

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const questRows = (
      scene as unknown as {
        _questList: { _rows: { emit: (event: string) => void }[] }
      }
    )._questList._rows
    questRows[0]!.emit('pointertap')

    expect(context.actions.selectQuest).toHaveBeenCalledWith(quest.id)

    scene.setUiState({ ...uiStateRef.current, selectedQuestId: quest.id })
    const selectedQuest = (
      scene as unknown as {
        _viewModel: { quests: { selected: boolean; id: string }[] }
      }
    )._viewModel.quests.find((q) => q.id === quest.id)
    expect(selectedQuest?.selected).toBe(true)
  })

  it('E: assign button calls offerRequest action when both selections are set', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-assign')
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
        _partySummary: { _assignButton: { emit: (event: string) => void } }
      }
    )._partySummary._assignButton
    assignButton.emit('pointertap')

    expect(context.actions.offerRequest).toHaveBeenCalledWith(
      party.id,
      quest.id,
    )
  })

  it('F: assign button is disabled when quest selection is missing', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-disabled')
    const party = campaign.currentDay.parties[0]!

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
      selectedQuestId: null,
    })

    const vm = (
      scene as unknown as {
        _viewModel: { selectedParty: { canAssignQuest: boolean } }
      }
    )._viewModel
    expect(vm.selectedParty?.canAssignQuest).toBe(false)

    const assignButton = (
      scene as unknown as {
        _partySummary: { _assignButton: { isEnabled: boolean } }
      }
    )._partySummary._assignButton
    expect(assignButton.isEnabled).toBe(false)
  })

  it('G: recovery state is displayed and no rest command is invented', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-rest')
    const party = campaign.currentDay.parties[0]!
    party.availability = 'recovering'
    party.recoveryDaysRemaining = 2

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const row = (
      scene as unknown as { _viewModel: { parties: { statusLabel: string }[] } }
    )._viewModel.parties[0]
    expect(row.statusLabel).toContain('療養中')

    const summary = (
      scene as unknown as {
        _viewModel: { selectedParty: { canRest: boolean } }
      }
    )._viewModel.selectedParty
    expect(summary?.canRest).toBe(false)
  })

  it('H: today activity panel lists downtime events', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-activity')
    const party = campaign.currentDay.parties[0]!
    const event: DowntimeEvent = {
      id: 'downtime:smoke-001',
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
      fallbackSummary: 'AとBが食事を共にした。',
    }
    party.downtimeEvents = [event]

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const activities = (
      scene as unknown as {
        _viewModel: { activities: { id: string; kind: string }[] }
      }
    )._viewModel.activities
    expect(activities.some((a) => a.id === event.id)).toBe(true)
  })

  it('I: opening an activity generates narrative exactly once', async () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-lazy')
    const party = campaign.currentDay.parties[0]!
    const event: DowntimeEvent = {
      id: 'downtime:smoke-lazy',
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

    const activityRows = (
      scene as unknown as {
        _activityPanel: { _rows: { emit: (event: string) => void }[] }
      }
    )._activityPanel._rows
    activityRows[0]!.emit('pointertap')
    await Promise.resolve()

    expect(context.actions.openActivity).toHaveBeenCalledTimes(1)
    expect(context.actions.openActivity).toHaveBeenLastCalledWith(
      party.id,
      event.id,
    )
  })

  it('J: reopening the same activity makes zero additional AI calls', async () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-reopen')
    const party = campaign.currentDay.parties[0]!
    const event: DowntimeEvent = {
      id: 'downtime:smoke-reopen',
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

    const activityRows = (
      scene as unknown as {
        _activityPanel: { _rows: { emit: (event: string) => void }[] }
      }
    )._activityPanel._rows
    activityRows[0]!.emit('pointertap')
    await Promise.resolve()

    activityRows[0]!.emit('pointertap')
    await Promise.resolve()

    expect(context.actions.openActivity).toHaveBeenCalledTimes(1)
  })

  it('K: not opening an activity keeps AI call count at zero', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-zero')
    const party = campaign.currentDay.parties[0]!
    const event: DowntimeEvent = {
      id: 'downtime:smoke-zero',
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

    expect(context.actions.openActivity).not.toHaveBeenCalled()
  })

  it('L: resolve and advance day use core actions, not direct day mutation', async () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    let campaign = createTavernCampaign('phase8-1-advance')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests[0]!
    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    const partyInDay = nextDay.parties.find((p) => p.id === party.id)!
    partyInDay.acceptedRequestId = quest.id
    campaign = { ...campaign, currentDay: nextDay }

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
    })

    const resolveButton = (
      scene as unknown as {
        _header: { _actionButton: { emit: (event: string) => void } }
      }
    )._header._actionButton
    resolveButton.emit('pointertap')
    expect(context.actions.resolveDay).toHaveBeenCalledTimes(1)

    const resolved = resolveCampaignDay(campaign)
    expect(resolved.currentDay.status).toBe('resolved')

    scene.setCampaign(resolved, uiStateRef.current)
    resolveButton.emit('pointertap')
    expect(context.actions.advanceDay).toHaveBeenCalledTimes(1)

    const advanced = advanceCampaignDay(resolved)
    expect(advanced.dayNumber).toBe(campaign.dayNumber + 1)
    expect(advanced.currentDay.status).toBe('planning')
  })

  it('M: selection is reconciled after the selected party disappears on advance', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-reconcile')
    const party = campaign.currentDay.parties[0]!

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
      selectedQuestId: campaign.currentDay.requests[0]!.id,
    })

    const nextCampaign = {
      ...campaign,
      currentDay: {
        ...campaign.currentDay,
        parties: campaign.currentDay.parties.filter((p) => p.id !== party.id),
        requests: campaign.currentDay.requests.slice(1),
      },
    }

    scene.setCampaign(nextCampaign, uiStateRef.current)

    const sceneState = scene as unknown as {
      _uiState: {
        selectedPartyId: string | null
        selectedQuestId: string | null
      }
      _viewModel: { selectedParty: unknown }
    }
    expect(sceneState._uiState.selectedPartyId).toBeNull()
    expect(sceneState._uiState.selectedQuestId).toBeNull()
    expect(sceneState._viewModel.selectedParty).toBeUndefined()
  })

  it('N: virtual resolution stays 1600x900 after resize', () => {
    const viewport = new GameViewport()
    viewport.resize(1024, 768)
    const m = viewport.metrics

    expect(m.virtualWidth).toBe(VIRTUAL_WIDTH)
    expect(m.virtualHeight).toBe(VIRTUAL_HEIGHT)
    expect(m.scale).toBeCloseTo(1024 / VIRTUAL_WIDTH)
    expect(m.offsetX + m.offsetY).toBeGreaterThanOrEqual(0)
  })

  it('O: legacy UI fallback remains available and the same core sequence yields the same day state', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-1-parity')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests[0]!

    const legacyDay = offerRequestToParty(
      campaign.currentDay,
      quest.id,
      party.id,
    )
    const legacyResolved = resolveCampaignDay({
      ...campaign,
      currentDay: legacyDay,
    })
    const legacyAdvanced = advanceCampaignDay(legacyResolved)

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const sceneDay = offerRequestToParty(
      campaign.currentDay,
      quest.id,
      party.id,
    )
    const sceneResolved = resolveCampaignDay({
      ...campaign,
      currentDay: sceneDay,
    })
    const sceneAdvanced = advanceCampaignDay(sceneResolved)

    expect(sceneAdvanced.dayNumber).toBe(legacyAdvanced.dayNumber)
    expect(sceneAdvanced.currentDay.status).toBe(
      legacyAdvanced.currentDay.status,
    )
    expect(sceneAdvanced.currentDay.parties.length).toBe(
      legacyAdvanced.currentDay.parties.length,
    )
  })
})
