// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../core/tavern/campaign/campaign.ts'
import { deepClone } from '../../../core/util.ts'
import { buildTavernDay } from '../../../core/tavern/campaign/generators.ts'
import { buildTavernScreenViewModel } from '../viewModel/tavernScreenViewModel.ts'
import {
  buildPartyDetailSceneViewModel,
  type PartyDetailSceneInput,
} from '../viewModel/partyDetailViewModel.ts'
import {
  buildVisitorRegistryViewModel,
  createVisitorRegistrySceneInput,
} from '../viewModel/visitorRegistryViewModel.ts'
import { VisitorRegistryScene } from '../scenes/visitorRegistry/VisitorRegistryScene.ts'
import { PartyDetailScene } from '../scenes/partyDetail/PartyDetailScene.ts'
import { TavernScene } from '../scenes/tavern/TavernScene.ts'
import { GameAssetManager } from '../assets/GameAssetManager.ts'
import { GameViewport } from '../GameViewport.ts'
import { OverlayManager } from '../overlays/OverlayManager.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import { DEFAULT_GAME_UI_STATE, type GameSceneContext } from '../types.ts'
import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'

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
  actionsOverride: Partial<GameSceneContext['actions']> = {},
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

  return {
    id: 'phase9-4-ui-smoke',
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
      advanceDay: vi.fn(() => ({ ok: true })),
      resolveDay: vi.fn(() => ({ ok: true })),
      offerRequest: vi.fn(() => ({ ok: true })),
      purchaseUpgrade: vi.fn(() => ({ ok: true })),
      selectParty: vi.fn(),
      selectQuest: vi.fn(),
      openCharacter: vi.fn(),
      openActivity: vi.fn().mockResolvedValue({ ok: true, data: '' }),
      openSettings: vi.fn(),
      closeModal: vi.fn(),
      switchToLegacy: vi.fn(),
      ...actionsOverride,
    },
    canvasGame: {
      setUiState: vi.fn((partial) => {
        uiStateRef.current = { ...uiStateRef.current, ...partial }
        scene.setUiState?.(uiStateRef.current)
      }),
      sceneManager: { push: vi.fn(), pop: vi.fn(), show: vi.fn() },
    } as unknown as GameSceneContext['canvasGame'],
  }
}

/** Forces a specific staying party to depart on the next advance, bypassing
 * the random 3-6 day stay window so lifecycle-state fixtures are
 * deterministic (mirrors the same helper used in the core phase9-4 tests). */
function forceImmediateDeparture(
  campaign: TavernCampaignState,
  partyId: string,
): TavernCampaignState {
  const next = deepClone(campaign)
  const party = next.parties.find((p) => p.id === partyId)!
  party.plannedDepartureDay = next.dayNumber
  party.recoveringThroughDay = undefined
  party.relationship.affinity = 0
  return next
}

function campaignWithAwayParty(seed: string): {
  campaign: TavernCampaignState
  partyId: string
} {
  let campaign = createTavernCampaign(seed)
  const partyId = campaign.parties[0]!.id
  campaign = forceImmediateDeparture(campaign, partyId)
  campaign = resolveCampaignDay(campaign)
  campaign = advanceCampaignDay(campaign)
  return { campaign, partyId }
}

const RAW_LIFECYCLE_TOKENS = ['staying', 'away', 'retired']

describe('phase9-4-ui-smoke', () => {
  it("A: today's new arrivals are badged 新規, and a carried-over party has no badge", () => {
    const campaign = createTavernCampaign('phase9-4-ui-a')
    const vm = buildTavernScreenViewModel(campaign, {
      ...DEFAULT_GAME_UI_STATE,
    })
    expect(vm.parties.length).toBeGreaterThan(0)
    for (const party of vm.parties) {
      expect(party.arrivalBadge).toBe('新規')
    }

    const advanced = advanceCampaignDay(resolveCampaignDay(campaign))
    const vm2 = buildTavernScreenViewModel(advanced, {
      ...DEFAULT_GAME_UI_STATE,
    })
    const carriedOver = vm2.parties.find((p) =>
      advanced.parties.some(
        (cp) => cp.id === p.id && cp.arrivalDay !== advanced.dayNumber,
      ),
    )
    if (carriedOver) {
      expect(carriedOver.arrivalBadge).toBeUndefined()
    }
  })

  it('B: a party arriving today with visitCount >= 2 is badged 再訪, distinct from a first-time 新規 arrival', () => {
    // Directly exercises buildTavernDay's badge derivation (the same
    // function advanceCampaignDay relies on) with a fabricated
    // already-returned party, rather than waiting on a probabilistic RNG
    // return to happen to land within a bounded day budget.
    const campaign = createTavernCampaign('phase9-4-ui-b')
    const dayNumber = campaign.dayNumber
    const returning = deepClone(campaign.parties[0]!)
    returning.arrivalDay = dayNumber
    returning.lifecycle.visitCount = 2
    returning.lifecycle.firstArrivalDay = 1

    const day = buildTavernDay(
      `${campaign.seed}:badge-test`,
      campaign.currentDay.requests,
      [returning, ...campaign.parties.slice(1)],
      dayNumber,
    )

    const returningItem = day.parties.find((p) => p.id === returning.id)!
    const freshItem = day.parties.find((p) => p.id !== returning.id)!
    expect(returningItem.arrivalBadge).toBe('再訪')
    expect(freshItem.arrivalBadge).toBe('新規')
  })

  it('C: PartyDetail header for a staying party never shows the raw lifecycle status, and reports lifecycle labels', () => {
    const campaign = createTavernCampaign('phase9-4-ui-c')
    const partyId = campaign.parties[0]!.id
    const input: PartyDetailSceneInput = {
      partyId,
      returnTarget: { sceneId: 'tavern' },
    }
    const vm = buildPartyDetailSceneViewModel(campaign, input)
    expect(vm.party.firstArrivalDayLabel).toBe('初回来訪 DAY 1')
    expect(vm.party.visitCountLabel).toBe('来訪回数 1回')
    expect(vm.party.currentArrivalDayLabel).toBe('今回の来訪 DAY 1')
    expect(vm.party.lastDepartureDayLabel).toBeUndefined()
    expect(vm.party.lifecycleNote).toBeUndefined()
    for (const token of RAW_LIFECYCLE_TOKENS) {
      expect(vm.party.statusLabel).not.toContain(token)
    }
  })

  it('D: PartyDetail header for an away party shows 旅の途中 and a lifecycle note, resolvable read-only from the visitor registry entry point', () => {
    const { campaign, partyId } = campaignWithAwayParty('phase9-4-ui-d')
    const input: PartyDetailSceneInput = {
      partyId,
      returnTarget: { sceneId: 'visitorRegistry' },
    }
    const vm = buildPartyDetailSceneViewModel(campaign, input)
    expect(vm.party.statusLabel).toBe('旅の途中')
    expect(vm.party.lifecycleNote).toBe('現在は旅の途中です。')
    expect(vm.party.lastDepartureDayLabel).toBe('前回の旅立ち DAY 1')
    expect(vm.party.currentArrivalDayLabel).toBe('最終来訪 DAY 1')
    for (const token of RAW_LIFECYCLE_TOKENS) {
      expect(vm.party.statusLabel).not.toContain(token)
      expect(vm.party.lifecycleNote).not.toContain(token)
    }
  })

  it('E: the Visitor Registry viewModel lists every known party, grouped staying → away → retired, never showing raw status values', () => {
    const { campaign, partyId } = campaignWithAwayParty('phase9-4-ui-e')
    const vm = buildVisitorRegistryViewModel(campaign, { sceneId: 'tavern' })

    expect(vm.rows.length).toBe(
      campaign.parties.length +
        campaign.awayParties.length +
        campaign.retiredParties.length,
    )
    const away = vm.rows.find((r) => r.id === partyId)
    expect(away?.statusLabel).toBe('旅の途中')

    for (const row of vm.rows) {
      for (const token of RAW_LIFECYCLE_TOKENS) {
        expect(row.statusLabel).not.toContain(token)
      }
    }

    // Grouping: every staying row appears before every away row.
    const statuses = vm.rows.map((r) => r.statusLabel)
    const firstAwayIndex = statuses.indexOf('旅の途中')
    const lastStayingIndex = statuses.lastIndexOf('滞在中')
    if (firstAwayIndex !== -1 && lastStayingIndex !== -1) {
      expect(lastStayingIndex).toBeLessThan(firstAwayIndex)
    }
  })

  it('F: VisitorRegistryScene mounts, renders rows, and unmounts cleanly', () => {
    const { campaign } = campaignWithAwayParty('phase9-4-ui-f')
    const scene = new VisitorRegistryScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)

    scene.mount(context, createVisitorRegistrySceneInput({ sceneId: 'tavern' }))
    scene.setCampaign(campaign, uiStateRef.current)

    expect(context.layers.ui.children.length).toBeGreaterThan(0)

    scene.unmount()
    expect(context.layers.ui.children.length).toBe(0)
    expect(context.layers.background.children.length).toBe(0)
  })

  it('G: selecting a party in the Visitor Registry pushes PartyDetail with that partyId, and read-only navigation origin', () => {
    const { campaign, partyId } = campaignWithAwayParty('phase9-4-ui-g')
    const scene = new VisitorRegistryScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)

    scene.mount(context, createVisitorRegistrySceneInput({ sceneId: 'tavern' }))
    scene.setCampaign(campaign, uiStateRef.current)

    ;(
      scene as unknown as { openPartyDetail: (id: string) => void }
    ).openPartyDetail(partyId)

    expect(context.canvasGame.sceneManager?.push).toHaveBeenCalledWith(
      'partyDetail',
      expect.objectContaining({
        partyId,
        returnTarget: expect.objectContaining({ sceneId: 'visitorRegistry' }),
      }),
    )
  })

  it('H: the tavern header wires 来訪者台帳 navigation to push the visitorRegistry scene', () => {
    const campaign = createTavernCampaign('phase9-4-ui-h')
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)

    scene.mount(context)
    scene.setCampaign(campaign, uiStateRef.current)

    const header = (
      scene as unknown as {
        _header: { _onOpenVisitorRegistry?: () => void }
      }
    )._header
    expect(header).toBeTruthy()
    header._onOpenVisitorRegistry?.()

    expect(context.canvasGame.sceneManager?.push).toHaveBeenCalledWith(
      'visitorRegistry',
      expect.objectContaining({
        returnTarget: expect.objectContaining({ sceneId: 'tavern' }),
      }),
    )

    scene.unmount()
  })

  it('I: PartyDetailScene mounts and renders lifecycle info for an away party (via the registry entry point) without throwing', () => {
    const { campaign, partyId } = campaignWithAwayParty('phase9-4-ui-i')
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)

    expect(() => {
      scene.mount(context, {
        partyId,
        returnTarget: { sceneId: 'visitorRegistry' },
      })
      scene.setCampaign(campaign, uiStateRef.current)
    }).not.toThrow()

    expect(context.layers.ui.children.length).toBeGreaterThan(0)

    scene.unmount()
    expect(context.layers.ui.children.length).toBe(0)
  })
})
