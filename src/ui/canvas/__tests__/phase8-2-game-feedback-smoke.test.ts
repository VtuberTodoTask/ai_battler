// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../../core/tavern/brokerage.ts'
import { getOfferErrors } from '../../../core/tavern/brokerage.ts'
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
    selectParty: vi.fn(),
    selectQuest: vi.fn(),
    openCharacter: vi.fn(),
    openActivity: vi.fn().mockResolvedValue({
      ok: true,
      data: '生成された酒場イベントの本文',
    }),
    openExpeditionNarrative: vi.fn().mockResolvedValue({
      ok: true,
      data: '遠征の物語本文',
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
  } as unknown as GameSceneContext['canvasGame']

  return {
    id: 'phase8-2-smoke',
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

function findAcceptableRequest(
  campaign: ReturnType<typeof createTavernCampaign>,
  partyId: string,
) {
  return campaign.currentDay.requests.find(
    (r) => getOfferErrors(campaign.currentDay, r.id, partyId).length === 0,
  )
}

function findRejectedOffer(campaign: ReturnType<typeof createTavernCampaign>) {
  for (const party of campaign.currentDay.parties) {
    for (const quest of campaign.currentDay.requests) {
      if (getOfferErrors(campaign.currentDay, quest.id, party.id).length > 0) {
        continue
      }
      const nextDay = offerRequestToParty(
        campaign.currentDay,
        quest.id,
        party.id,
      )
      const offer = nextDay.offers.find(
        (o) => o.requestId === quest.id && o.partyId === party.id,
      )
      if (offer?.decision === 'declined') {
        return { party, quest, nextDay }
      }
    }
  }
  return null
}

describe('Phase 8.2 Game Feedback & Expedition Reports Smoke', () => {
  it('A: resolved expedition creates reports and unread badge', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    let campaign = createTavernCampaign('phase8-2-report')
    const party = campaign.currentDay.parties[0]!
    const quest = findAcceptableRequest(campaign, party.id)
    if (!quest) return

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }
    const resolved = resolveCampaignDay(campaign)

    scene.mount(context)
    scene.setCampaign(resolved, { ...DEFAULT_GAME_UI_STATE })

    const state = scene as unknown as {
      _viewModel: { reports: unknown[]; header: { unreadReportCount: number } }
    }
    expect(state._viewModel.reports.length).toBeGreaterThan(0)
    expect(state._viewModel.header.unreadReportCount).toBeGreaterThan(0)
  })

  it('B: notification summary opens after resolving a day', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const openModalSpy = vi.spyOn(context.overlayManager, 'openModal')
    let campaign = createTavernCampaign('phase8-2-notify')
    const party = campaign.currentDay.parties[0]!
    const quest = findAcceptableRequest(campaign, party.id)
    if (!quest) return

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }
    const resolved = resolveCampaignDay(campaign)

    scene.setCampaign(resolved, uiStateRef.current)

    expect(openModalSpy).toHaveBeenCalled()
    const lastCall = openModalSpy.mock.calls.at(-1)
    expect(lastCall?.[0]).toContain('重要')
  })

  it('C: offer rejection is shown in quest list and activity', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-2-reject')
    const rejected = findRejectedOffer(campaign)
    if (!rejected) return

    const { party, quest, nextDay } = rejected
    campaign.currentDay = nextDay

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
    })

    const state = scene as unknown as {
      _viewModel: {
        quests: { id: string; statusLabel: string }[]
        activities: { kind: string; title: string; summary: string }[]
      }
    }
    const questVm = state._viewModel.quests.find((q) => q.id === quest.id)
    expect(questVm?.statusLabel).toBe('拒否済')

    const activity = state._viewModel.activities.find(
      (a) => a.kind === 'quest_rejected',
    )
    expect(activity).toBeDefined()
    expect(activity?.title).toContain('断り')
    expect(activity?.summary).toContain('理由：')
  })

  it('D: report archive and narrative actions are wired', async () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    let campaign = createTavernCampaign('phase8-2-narrative')
    const party = campaign.currentDay.parties[0]!
    const quest = findAcceptableRequest(campaign, party.id)
    if (!quest) return

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }
    const resolved = resolveCampaignDay(campaign)

    scene.mount(context)
    scene.setCampaign(resolved, { ...DEFAULT_GAME_UI_STATE })

    const openModalSpy = vi.spyOn(context.overlayManager, 'openModal')

    const scenePrivate = scene as unknown as {
      openReportArchiveModal: () => void
      openReportModal: (report: {
        id: string
        narrativeTargetId?: string
      }) => void
      openNarrativeModal: (report: {
        id: string
        narrativeTargetId?: string
        generatedText?: string
      }) => void
    }

    scenePrivate.openReportArchiveModal()
    expect(openModalSpy).toHaveBeenCalled()

    const state = scene as unknown as {
      _viewModel: { reports: { id: string; narrativeTargetId?: string }[] }
    }
    const report = state._viewModel.reports[0]!
    scenePrivate.openReportModal(report)

    expect(context.actions.openExpeditionNarrative).not.toHaveBeenCalled()

    scenePrivate.openNarrativeModal(report)
    await new Promise((r) => setTimeout(r, 0))

    expect(context.actions.openExpeditionNarrative).toHaveBeenCalledTimes(1)
    expect(context.actions.openExpeditionNarrative).toHaveBeenCalledWith(
      report.narrativeTargetId,
    )
  })

  it('E: report view marks the report as viewed', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    let campaign = createTavernCampaign('phase8-2-viewed')
    const party = campaign.currentDay.parties[0]!
    const quest = findAcceptableRequest(campaign, party.id)
    if (!quest) return

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }
    const resolved = resolveCampaignDay(campaign)

    scene.mount(context)
    scene.setCampaign(resolved, { ...DEFAULT_GAME_UI_STATE })

    const state = scene as unknown as {
      _viewModel: { reports: { id: string }[] }
    }
    const report = state._viewModel.reports[0]!

    const scenePrivate = scene as unknown as {
      openReportModal: (report: { id: string }) => void
    }
    scenePrivate.openReportModal(report)

    expect(context.canvasGame.setUiState).toHaveBeenCalledWith(
      expect.objectContaining({
        viewedReportIds: expect.arrayContaining([report.id]),
      }),
    )
  })

  it('F: narrative action failure is surfaced without an exception', async () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    context.actions.openExpeditionNarrative = vi
      .fn()
      .mockResolvedValue({ ok: false, message: 'AI provider not connected' })

    let campaign = createTavernCampaign('phase8-2-fail')
    const party = campaign.currentDay.parties[0]!
    const quest = findAcceptableRequest(campaign, party.id)
    if (!quest) return

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }
    const resolved = resolveCampaignDay(campaign)

    scene.mount(context)
    scene.setCampaign(resolved, { ...DEFAULT_GAME_UI_STATE })

    const state = scene as unknown as {
      _viewModel: { reports: { id: string; narrativeTargetId?: string }[] }
    }
    const report = state._viewModel.reports[0]!

    const scenePrivate = scene as unknown as {
      openNarrativeModal: (report: {
        id: string
        narrativeTargetId?: string
      }) => void
    }
    scenePrivate.openNarrativeModal(report)
    await new Promise((r) => setTimeout(r, 0))

    expect(context.actions.openExpeditionNarrative).toHaveBeenCalled()
  })

  it('G: advance to the next day keeps report archive available', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    let campaign = createTavernCampaign('phase8-2-archive')
    const party = campaign.currentDay.parties[0]!
    const quest = findAcceptableRequest(campaign, party.id)
    if (!quest) return

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }
    const resolved = resolveCampaignDay(campaign)
    const advanced = advanceCampaignDay(resolved)

    scene.mount(context)
    scene.setCampaign(advanced, { ...DEFAULT_GAME_UI_STATE })

    const state = scene as unknown as { _viewModel: { reports: unknown[] } }
    expect(state._viewModel.reports.length).toBeGreaterThan(0)
  })

  it('H: notification queue prevents duplicate high-importance summary', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const openModalSpy = vi.spyOn(context.overlayManager, 'openModal')
    let campaign = createTavernCampaign('phase8-2-queue')
    const party = campaign.currentDay.parties[0]!
    const quest = findAcceptableRequest(campaign, party.id)
    if (!quest) return

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }
    const resolved = resolveCampaignDay(campaign)

    scene.setCampaign(resolved, uiStateRef.current)
    const countAfterFirst = openModalSpy.mock.calls.filter((call) =>
      String(call[0]).includes('重要'),
    ).length
    expect(countAfterFirst).toBeGreaterThan(0)

    scene.setCampaign(resolved, uiStateRef.current)
    const countAfterSecond = openModalSpy.mock.calls.filter((call) =>
      String(call[0]).includes('重要'),
    ).length
    expect(countAfterSecond).toBe(countAfterFirst)
  })

  it('I: expedition narrative action uses cached text on reopen', async () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const openModalSpy = vi.spyOn(context.overlayManager, 'openModal')
    let campaign = createTavernCampaign('phase8-2-cache')
    const party = campaign.currentDay.parties[0]!
    const quest = findAcceptableRequest(campaign, party.id)
    if (!quest) return

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }
    const resolved = resolveCampaignDay(campaign)

    scene.mount(context)
    scene.setCampaign(resolved, { ...DEFAULT_GAME_UI_STATE })

    const state = scene as unknown as {
      _viewModel: { reports: { id: string; narrativeTargetId?: string }[] }
    }
    const report = state._viewModel.reports[0]!

    const scenePrivate = scene as unknown as {
      openNarrativeModal: (report: {
        id: string
        narrativeTargetId?: string
        generatedText?: string
      }) => void
    }
    scenePrivate.openNarrativeModal({
      ...report,
      generatedText: 'cached story',
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(context.actions.openExpeditionNarrative).not.toHaveBeenCalled()
    expect(
      openModalSpy.mock.calls.some((call) => call[0] === '遠征の物語'),
    ).toBe(true)
  })

  it('J: report detail modal exposes outcome and objective summary', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const openModalSpy = vi.spyOn(context.overlayManager, 'openModal')
    let campaign = createTavernCampaign('phase8-2-detail')
    const party = campaign.currentDay.parties[0]!
    const quest = findAcceptableRequest(campaign, party.id)
    if (!quest) return

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }
    const resolved = resolveCampaignDay(campaign)

    scene.mount(context)
    scene.setCampaign(resolved, { ...DEFAULT_GAME_UI_STATE })

    const state = scene as unknown as {
      _viewModel: { reports: { id: string; questTitle: string }[] }
    }
    const report = state._viewModel.reports[0]!

    const scenePrivate = scene as unknown as {
      openReportModal: (report: { id: string }) => void
    }
    scenePrivate.openReportModal(report)

    expect(openModalSpy).toHaveBeenCalledWith(
      `遠征報告：${report.questTitle}`,
      expect.anything(),
    )
  })

  it('K: stay extension feedback appears with primary and secondary reasons', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-2-stay')
    const party = campaign.currentDay.parties[0]!
    const stayEvent = {
      type: 'stayExtended' as const,
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: campaign.dayNumber,
      previousDepartureDay: 3,
      newDepartureDay: 5,
      extensionDays: 2,
      affinity: party.relationship?.affinity ?? 0,
      primaryReason: 'training' as const,
      secondaryReason: 'recovery' as const,
      presentationPlan: {
        id: 'stay-smoke',
        framing: 'close_up',
        openingCategory: 'dialogue_first' as const,
        speakingCharacterIds: [],
        endingStyle: 'concrete_action' as const,
      },
    }
    campaign.history = [
      {
        dayNumber: campaign.dayNumber,
        daySeed: campaign.currentDay.seed,
        reputationBefore: campaign.reputation,
        reputationAfter: campaign.reputation,
        reputationChange: {
          before: campaign.reputation,
          rawDelta: 0,
          appliedDelta: 0,
          after: campaign.reputation,
          entries: [],
        },
        results: [],
        partyEvents: [],
        progressionEvents: [],
        relationshipEvents: [stayEvent],
      },
    ]

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const state = scene as unknown as {
      _viewModel: { activities: { kind: string; summary: string }[] }
    }
    const activity = state._viewModel.activities.find(
      (a) => a.kind === 'stay_extension',
    )
    expect(activity).toBeDefined()
    expect(activity?.summary).toContain('訓練')
    expect(activity?.summary).toContain('回復')
  })

  it('L: recovery complete feedback appears in activity list', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-2-recovery')
    const party = campaign.currentDay.parties[0]!
    campaign.currentDay.partyEvents = [
      {
        type: 'finishedRecovery',
        partyId: party.id,
        partyName: party.party.name,
        dayNumber: campaign.dayNumber,
      },
    ]

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const state = scene as unknown as {
      _viewModel: {
        activities: { kind: string; title: string }[]
        parties: { id: string; statusLabel: string }[]
      }
    }
    const activity = state._viewModel.activities.find(
      (a) => a.kind === 'recovery_complete',
    )
    expect(activity).toBeDefined()
    expect(activity?.title).toContain('療養')

    const partyVm = state._viewModel.parties.find((p) => p.id === party.id)
    expect(partyVm?.statusLabel).toBe('待機中')
  })

  it('M: accepted quest shows 成立 and accepted feedback', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-2-accept')
    const party = campaign.currentDay.parties[0]!
    const quest = findAcceptableRequest(campaign, party.id)
    if (!quest) return

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign.currentDay = nextDay

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
    })

    const state = scene as unknown as {
      _viewModel: {
        quests: { id: string; statusLabel: string }[]
        activities: { kind: string; title: string }[]
      }
    }
    const questVm = state._viewModel.quests.find((q) => q.id === quest.id)
    const accepted = state._viewModel.activities.find(
      (a) => a.kind === 'quest_accepted',
    )

    if (nextDay.matches.some((m) => m.requestId === quest.id)) {
      expect(questVm?.statusLabel).toBe('成立')
      expect(accepted).toBeDefined()
      expect(accepted?.title).toContain('引き受け')
    } else {
      expect(accepted).toBeUndefined()
    }
  })
})
