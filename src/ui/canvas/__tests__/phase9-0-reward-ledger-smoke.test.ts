// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../../core/tavern/brokerage.ts'
import {
  serializeGameSave,
  deserializeGameSave,
} from '../../../core/save/serializer.ts'
import {
  applyQuestSettlement,
  buildLedgerEntryId,
  financeInvariantHolds,
  ledgerTotal,
} from '../../../core/economy/finance.ts'
import { TavernLedgerScene } from '../scenes/tavernLedger/TavernLedgerScene.ts'
import {
  buildTavernLedgerViewModel,
  createTavernLedgerSceneInput,
} from '../viewModel/tavernLedgerViewModel.ts'
import { buildTavernScreenViewModel } from '../viewModel/tavernScreenViewModel.ts'
import {
  buildDayResultsSceneViewModel,
  buildSummaryLines,
} from '../scenes/dayResults/dayResultsViewModel.ts'
import { buildExpeditionReportViewModels } from '../viewModel/expeditionReportViewModel.ts'
import { GameAssetManager } from '../assets/GameAssetManager.ts'
import { GameViewport } from '../GameViewport.ts'
import { GameScrollView } from '../components/GameScrollView.ts'
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

function findAcceptingPair(campaign: ReturnType<typeof createTavernCampaign>) {
  for (const request of campaign.currentDay.requests) {
    for (const party of campaign.currentDay.parties) {
      const next = offerRequestToParty(
        campaign.currentDay,
        request.id,
        party.id,
      )
      if (next.matches.some((m) => m.requestId === request.id)) {
        return { requestId: request.id, partyId: party.id, next }
      }
    }
  }
  return null
}

function findSuccessfulPair(campaign: ReturnType<typeof createTavernCampaign>) {
  for (const request of campaign.currentDay.requests) {
    for (const party of campaign.currentDay.parties) {
      const next = offerRequestToParty(
        campaign.currentDay,
        request.id,
        party.id,
      )
      if (!next.matches.some((m) => m.requestId === request.id)) continue
      const resolved = resolveCampaignDay({ ...campaign, currentDay: next })
      const commission = resolved.currentDay.results.find(
        (r) => r.status === 'resolved',
      )?.settlement?.tavernCommission
      if (commission && commission > 0) {
        return { requestId: request.id, partyId: party.id, next, commission }
      }
    }
  }
  return null
}

function resolveSampleDay(campaign: ReturnType<typeof createTavernCampaign>) {
  const pair = findSuccessfulPair(campaign)
  if (!pair) throw new Error('no successful pair')
  let c = { ...campaign, currentDay: pair.next }
  c = resolveCampaignDay(c)
  c = advanceCampaignDay(c)
  return c
}

function createSceneContext(
  scene: TavernLedgerScene,
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

  return {
    id: 'phase9-0-smoke',
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
      selectParty: vi.fn(),
      selectQuest: vi.fn(),
      openCharacter: vi.fn(),
      openActivity: vi.fn().mockResolvedValue({ ok: true, data: '' }),
      openSettings: vi.fn(),
      closeModal: vi.fn(),
      switchToLegacy: vi.fn(),
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

describe('phase9-0-reward-ledger-smoke', () => {
  it('A: tavern screen view model shows funds and quest reward labels', () => {
    const campaign = createTavernCampaign('phase9-0-a-001')
    const firstQuestId = campaign.currentDay.requests[0]?.id ?? null
    const uiState = { ...DEFAULT_GAME_UI_STATE, selectedQuestId: firstQuestId }
    const viewModel = buildTavernScreenViewModel(campaign, uiState)
    expect(viewModel.header.moneyLabel).toBe('資金 0')
    for (const quest of viewModel.quests) {
      expect(quest.rewardLabel).toMatch(/^報酬 \d+$/)
    }
    const detail = viewModel.decision?.selectedQuest
    expect(detail).toBeDefined()
    expect(detail?.promisedRewardLabel).toMatch(/^依頼報酬 \d+$/)
    expect(detail?.successCommissionLabel).toMatch(/^成功時手数料 \d+$/)
  })

  it('B: resolving a day computes settlement and funds', () => {
    const campaign = resolveSampleDay(createTavernCampaign('phase9-0-b-001'))
    expect(campaign.finance.funds).toBeGreaterThan(0)
    expect(campaign.finance.ledgerEntries.length).toBeGreaterThan(0)
    expect(financeInvariantHolds(campaign.finance)).toBe(true)
  })

  it('C: ledger view model lists entries newest-first and preserves funds label', () => {
    const campaign = resolveSampleDay(createTavernCampaign('phase9-0-c-001'))
    const input = createTavernLedgerSceneInput({ sceneId: 'tavern' })
    const vm = buildTavernLedgerViewModel(campaign, input.returnTarget)
    expect(vm.fundsLabel).toBe(
      `資金 ${campaign.finance.funds.toLocaleString('ja-JP')}`,
    )
    expect(vm.rows.length).toBe(campaign.finance.ledgerEntries.length)
    let previousDay = Number.POSITIVE_INFINITY
    for (const row of vm.rows) {
      expect(row.day).toBeLessThanOrEqual(previousDay)
      previousDay = row.day
      expect(row.amountLabel).toMatch(/^\+\d+$/)
    }
  })

  it('D: building expedition reports and day results does not mutate campaign finance', () => {
    const campaign = resolveSampleDay(createTavernCampaign('phase9-0-d-001'))
    const fundsBefore = campaign.finance.funds
    const ledgerBefore = ledgerTotal(campaign.finance.ledgerEntries)

    buildExpeditionReportViewModels(campaign)
    buildDayResultsSceneViewModel({
      campaign,
      resolvedDay: campaign.dayNumber - 1,
      nextDay: campaign.dayNumber,
    })

    expect(campaign.finance.funds).toBe(fundsBefore)
    expect(ledgerTotal(campaign.finance.ledgerEntries)).toBe(ledgerBefore)
  })

  it('E: day results summary lines include settlement block when available', () => {
    const campaign = resolveSampleDay(createTavernCampaign('phase9-0-e-001'))
    const reports = buildExpeditionReportViewModels(campaign)
    expect(reports.length).toBeGreaterThan(0)
    const report = reports[0]
    expect(report?.settlement).toBeDefined()
    const lines = buildSummaryLines(report)
    expect(lines).toContain('精算')
    expect(lines.some((l) => l.startsWith('提示報酬 '))).toBe(true)
    expect(lines.some((l) => l.startsWith('支払額 '))).toBe(true)
    expect(lines.some((l) => l.startsWith('酒場収入 '))).toBe(true)
  })

  it('F: ledger scene mounts with fixed viewport and scrollable content for 30+ entries', () => {
    const campaign = createTavernCampaign('phase9-0-f-001')
    const entries = []
    let total = 0
    for (let i = 1; i <= 35; i++) {
      const entry = {
        id: buildLedgerEntryId(i, `req-${i}`, `party-${i}`),
        day: i,
        kind: 'quest_commission' as const,
        amount: 10,
        source: {
          type: 'expedition' as const,
          requestId: `req-${i}`,
          partyId: `party-${i}`,
        },
      }
      entries.push(entry)
      total += entry.amount
    }
    campaign.finance.ledgerEntries = entries
    campaign.finance.funds = total

    const scene = new TavernLedgerScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const fundsBefore = campaign.finance.funds

    scene.mount(context, createTavernLedgerSceneInput({ sceneId: 'tavern' }))
    scene.setCampaign(campaign, uiStateRef.current)

    const scroll = (scene as unknown as { _scroll: GameScrollView })._scroll
    expect(scroll).not.toBeNull()
    expect(scroll.viewportHeight).toBeGreaterThan(0)
    expect(scroll.contentHeight).toBeGreaterThan(scroll.viewportHeight)
    expect(scroll.maxScroll).toBeGreaterThan(0)
    expect(campaign.finance.funds).toBe(fundsBefore)

    scene.unmount()
    expect(context.layers.ui.children.length).toBe(0)
  })

  it('G: save and load preserve finance, ledger, and settlement', () => {
    const campaign = resolveSampleDay(createTavernCampaign('phase9-0-g-001'))
    const saved = serializeGameSave({ campaign })
    const loaded = deserializeGameSave(saved)
    expect(loaded.campaign.finance.funds).toBe(campaign.finance.funds)
    expect(loaded.campaign.finance.ledgerEntries).toEqual(
      campaign.finance.ledgerEntries,
    )
    const resolvedResult =
      campaign.history[0]?.results[0] ?? campaign.currentDay.results[0]
    const loadedResult =
      loaded.campaign.history[0]?.results[0] ??
      loaded.campaign.currentDay.results[0]
    expect(loadedResult?.settlement).toEqual(resolvedResult?.settlement)
    expect(loaded.campaign.currentDay.requests[0]?.rewardTerms).toEqual(
      campaign.currentDay.requests[0]?.rewardTerms,
    )
  })

  it('H: applying the same settlement twice is idempotent', () => {
    const campaign = createTavernCampaign('phase9-0-h-001')
    const pair = findAcceptingPair(campaign)
    expect(pair).not.toBeNull()
    if (!pair) return
    const resolved = resolveCampaignDay({ ...campaign, currentDay: pair.next })
    const settlement = resolved.currentDay.results[0]?.settlement
    expect(settlement).toBeDefined()
    const before = resolved.finance
    const after = applyQuestSettlement(
      before,
      settlement!,
      resolved.dayNumber,
      {
        requestId: resolved.currentDay.results[0]!.requestId,
        partyId: resolved.currentDay.results[0]!.partyId,
      },
    )
    expect(after).toBe(before)
  })

  it('I: ledger entries have stable ids and player-facing labels do not expose raw UI ids', () => {
    const campaign = resolveSampleDay(createTavernCampaign('phase9-0-i-001'))
    const input = createTavernLedgerSceneInput({ sceneId: 'tavern' })
    const vm = buildTavernLedgerViewModel(campaign, input.returnTarget)
    const ids = new Set(vm.rows.map((row) => row.id))
    expect(ids.size).toBe(vm.rows.length)
    const rawPatterns = ['tavern-request-', 'quest-commission:', 'party-']
    for (const row of vm.rows) {
      expect(row.id.startsWith('quest-commission:')).toBe(true)
      for (const raw of rawPatterns) {
        expect(row.title).not.toContain(raw)
        expect(row.subtitle).not.toContain(raw)
        expect(row.amountLabel).not.toContain(raw)
      }
    }
  })

  it('J: finance invariant holds through full resolve and advance cycle', () => {
    let campaign = createTavernCampaign('phase9-0-j-001')
    const pair = findAcceptingPair(campaign)
    expect(pair).not.toBeNull()
    if (!pair) return
    campaign = { ...campaign, currentDay: pair.next }
    campaign = resolveCampaignDay(campaign)
    expect(financeInvariantHolds(campaign.finance)).toBe(true)
    campaign = advanceCampaignDay(campaign)
    expect(financeInvariantHolds(campaign.finance)).toBe(true)
  })

  it('K: reward/settlement/ledger view models and save/load do not trigger AI generation', () => {
    const campaign = resolveSampleDay(createTavernCampaign('phase9-0-k-001'))
    const generationsBefore = campaign.narrativeGenerations.length

    buildTavernScreenViewModel(campaign, DEFAULT_GAME_UI_STATE)
    buildExpeditionReportViewModels(campaign)
    buildDayResultsSceneViewModel({
      campaign,
      resolvedDay: campaign.dayNumber - 1,
      nextDay: campaign.dayNumber,
    })
    buildTavernLedgerViewModel(
      campaign,
      createTavernLedgerSceneInput({ sceneId: 'tavern' }).returnTarget,
    )
    serializeGameSave({ campaign })

    expect(campaign.narrativeGenerations.length).toBe(generationsBefore)
  })

  it('L: missing settlement is presented as 精算記録なし without recompute', () => {
    const campaign = resolveSampleDay(createTavernCampaign('phase9-0-l-001'))
    const dayRecord = campaign.history[0]
    const resolvedResult = dayRecord?.results[0]
    expect(resolvedResult).toBeDefined()
    if (!resolvedResult) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(resolvedResult as any).settlement = undefined

    const reports = buildExpeditionReportViewModels(campaign)
    const report = reports.find((r) => r.id.includes(resolvedResult.requestId))
    expect(report).toBeDefined()
    expect(report?.settlement).toBeUndefined()
    const lines = buildSummaryLines(report!)
    expect(lines).toContain('精算記録なし')
  })
})
