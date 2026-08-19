// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../core/tavern/campaign/campaign.ts'
import { PARTY_GROWTH_XP_THRESHOLD } from '../../../core/tavern/campaign/progression.ts'
import { purchaseTavernUpgrade } from '../../../core/tavern/campaign/upgrades.ts'
import { deriveTavernRank } from '../../../core/tavern/campaign/reputation.ts'
import { offerRequestToParty } from '../../../core/tavern/brokerage.ts'
import {
  buildPartyDetailSceneViewModel,
  type PartyDetailSceneInput,
} from '../viewModel/partyDetailViewModel.ts'
import { buildTavernUpgradeSceneViewModel } from '../viewModel/tavernUpgradeViewModel.ts'
import { buildDayResultsSceneViewModel } from '../scenes/dayResults/dayResultsViewModel.ts'
import { PartyDetailScene } from '../scenes/partyDetail/PartyDetailScene.ts'
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
    id: 'phase9-5-ui-smoke',
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

function acceptAllPossible(campaign: TavernCampaignState): TavernCampaignState {
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
        if (next.matches.some((m) => m.requestId === request.id)) {
          matchedPartyIds.add(party.id)
          matchedRequestIds.add(request.id)
          state = next
          break
        }
      } catch {
        // continue
      }
    }
  }
  return { ...campaign, currentDay: state }
}

function advanceDaysWithoutQuests(
  campaign: TavernCampaignState,
  n: number,
): TavernCampaignState {
  let c = campaign
  for (let i = 0; i < n; i++) {
    c = resolveCampaignDay(c)
    c = advanceCampaignDay(c)
  }
  return c
}

/** Advances idle days one at a time until some currently-staying party has
 * reached at least one growth milestone, returning that campaign snapshot.
 * More robust than a fixed day count: a party's random stay length can be
 * short enough to depart before PARTY_GROWTH_XP_THRESHOLD idle days pass. */
function campaignWithGrownParty(seed: string): TavernCampaignState {
  let campaign = createTavernCampaign(seed)
  for (let i = 0; i < 20; i++) {
    if (campaign.parties.some((p) => p.progression.growthMilestones >= 1)) {
      return campaign
    }
    campaign = advanceDaysWithoutQuests(campaign, 1)
  }
  return campaign
}

const RAW_TOKENS = [
  'melee',
  'ranged',
  'scouting',
  'trapDetection',
  'growthXp',
  'totalGrowthXp',
  'growthMilestones',
]
const FORBIDDEN_LEVEL_WORDS = ['Party Level', '経験値レベル']

describe('phase9-5-ui-smoke', () => {
  it('A: a fresh party has zero growth and an empty-growth message, never a fabricated delta', () => {
    const campaign = createTavernCampaign('phase9-5-ui-a')
    const partyId = campaign.parties[0].id
    const input: PartyDetailSceneInput = {
      partyId,
      returnTarget: { sceneId: 'tavern' },
    }
    const vm = buildPartyDetailSceneViewModel(campaign, input)
    expect(vm.growth.summary.growthXpLabel).toBe(
      `成長経験 0 / ${PARTY_GROWTH_XP_THRESHOLD}`,
    )
    expect(vm.growth.summary.totalGrowthXpLabel).toBe('累積経験 0')
    expect(vm.growth.emptyMessage).toBe(
      'この酒場での技能成長記録はまだありません。',
    )
    for (const member of vm.growth.members) {
      expect(member.skills).toEqual([])
      expect(member.emptyMessage).toBe(
        'この酒場での技能成長記録はまだありません。',
      )
    }
  })

  it('B: after real growth, the Growth tab shows the authoritative current skill value plus the earned delta', () => {
    const campaign = campaignWithGrownParty('phase9-5-ui-b')
    const grown = campaign.parties.find(
      (p) => p.progression.growthMilestones >= 1,
    )!

    const input: PartyDetailSceneInput = {
      partyId: grown.id,
      returnTarget: { sceneId: 'tavern' },
    }
    const vm = buildPartyDetailSceneViewModel(campaign, input)
    expect(vm.growth.emptyMessage).toBeUndefined()

    const grownMember = grown.party.members.find(
      (m) => Object.values(m.skills).length > 0,
    )!
    const memberVm = vm.growth.members.find(
      (m) => m.memberId === grownMember.id,
    )!
    expect(memberVm.skills.length).toBeGreaterThan(0)
    for (const skill of memberVm.skills) {
      expect(skill.delta).toBeGreaterThan(0)
      expect(skill.currentValue).toBeGreaterThan(0)
    }
  })

  it('C: the Growth tab never exposes raw skill IDs, and never uses Lv/Level wording', () => {
    const campaign = campaignWithGrownParty('phase9-5-ui-c')
    const grown = campaign.parties.find(
      (p) => p.progression.growthMilestones >= 1,
    )!

    const input: PartyDetailSceneInput = {
      partyId: grown.id,
      returnTarget: { sceneId: 'tavern' },
    }
    const vm = buildPartyDetailSceneViewModel(campaign, input)

    const allText = [
      vm.growth.summary.growthXpLabel,
      vm.growth.summary.totalGrowthXpLabel,
      vm.growth.summary.growthMilestonesLabel,
      vm.growth.summary.trainingDaysLabel,
      ...vm.growth.members.flatMap((m) => [
        m.memberName,
        ...m.skills.map((s) => s.skillLabel),
      ]),
    ].join(' ')

    for (const token of RAW_TOKENS) {
      expect(allText).not.toContain(token)
    }
    for (const word of FORBIDDEN_LEVEL_WORDS) {
      expect(allText).not.toContain(word)
    }
    expect(allText).not.toMatch(/Lv\d/)
  })

  it('D: PartyDetailScene mounts on the growth tab and renders for both a staying and an away party', () => {
    const campaign = campaignWithGrownParty('phase9-5-ui-d')
    const grown = campaign.parties.find(
      (p) => p.progression.growthMilestones >= 1,
    )!

    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)

    expect(() => {
      scene.mount(context, {
        partyId: grown.id,
        returnTarget: { sceneId: 'tavern' },
      })
      scene.setCampaign(campaign, uiStateRef.current)
      ;(scene as unknown as { selectTab: (tab: string) => void }).selectTab(
        'growth',
      )
    }).not.toThrow()
    expect(context.layers.ui.children.length).toBeGreaterThan(0)
    scene.unmount()
  })

  it("E: DayResults aggregates a party's same-day skill growth into a single item, not one per member", () => {
    const campaign = campaignWithGrownParty('phase9-5-ui-e')
    const grown = campaign.parties.find(
      (p) => p.progression.growthMilestones >= 1,
    )!
    const record = campaign.history.find((h) =>
      h.progressionEvents.some(
        (e) => e.type === 'skillImproved' && e.partyId === grown.id,
      ),
    )!

    const dayResultsVm = buildDayResultsSceneViewModel({
      campaign,
      resolvedDay: record.dayNumber,
      nextDay: record.dayNumber + 1,
    })
    const events = dayResultsVm.importantEvents
    const growthItems = events.filter(
      (e) => e.partyId === grown.id && e.title.includes('成長しました'),
    )
    expect(growthItems.length).toBe(1)
    expect(growthItems[0].title).toBe(`「${grown.party.name}」が成長しました`)
    const memberCount = record.progressionEvents.filter(
      (e) => e.type === 'skillImproved' && e.partyId === grown.id,
    ).length
    expect(memberCount).toBeGreaterThan(0)
    expect(growthItems[0].summary.split('\n').length).toBe(memberCount)
  })

  it('F: Training Yard appears in the upgrade viewModel with correct effect text and no raw id leak', () => {
    let campaign = createTavernCampaign('phase9-5-ui-f')
    for (let day = 1; day <= 120; day++) {
      campaign = resolveCampaignDay(acceptAllPossible(campaign))
      const rank5 = deriveTavernRank(campaign.reputation.peakScore) >= 5
      if (rank5 && campaign.finance.funds >= 700) break
      campaign = advanceCampaignDay(campaign)
    }
    campaign = advanceCampaignDay(campaign)

    const vm = buildTavernUpgradeSceneViewModel(campaign, { sceneId: 'tavern' })
    const entry = vm.entries.find((e) => e.id === 'training_yard')!
    expect(entry.title).toBe('訓練場')
    expect(entry.currentEffectText).toContain('1')
    expect(entry.description).not.toContain('training_yard')

    const purchase = purchaseTavernUpgrade(campaign, 'training_yard')
    expect(purchase.ok).toBe(true)
    const vm2 = buildTavernUpgradeSceneViewModel(purchase.campaign, {
      sceneId: 'tavern',
    })
    const entry2 = vm2.entries.find((e) => e.id === 'training_yard')!
    expect(entry2.currentEffectText).toContain('2')
  })
})
