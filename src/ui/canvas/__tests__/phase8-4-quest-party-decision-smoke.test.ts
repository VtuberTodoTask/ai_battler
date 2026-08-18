// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import { TavernScene } from '../scenes/tavern/TavernScene.ts'
import { GameAssetManager } from '../assets/GameAssetManager.ts'
import { GameViewport } from '../GameViewport.ts'
import { OverlayManager } from '../overlays/OverlayManager.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import { DEFAULT_GAME_UI_STATE, type GameSceneContext } from '../types.ts'
import { invalidateExpeditionPredictionCache } from '../../shared/expeditionPredictionService.ts'

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

  invalidateExpeditionPredictionCache()
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
    sceneManager: { push: vi.fn(), pop: vi.fn() },
  } as unknown as GameSceneContext['canvasGame']

  return {
    id: 'phase8-4-smoke',
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

describe('Phase 8.4 Quest & Party Decision Smoke', () => {
  it('A: decision viewModel exposes quest detail with localized terrain and combat', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-4-detail')
    const quest = campaign.currentDay.requests[0]!

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedQuestId: quest.id,
    })

    const vm = (
      scene as unknown as {
        _viewModel: {
          decision: {
            selectedQuest?: {
              id: string
              title: string
              rankLabel: string
              objectiveTypeLabel: string
              terrainLabel: string
              combatLabel: string
              description: string
              tags: string[]
              offerStatusLabel: string
            }
          }
        }
      }
    )._viewModel

    expect(vm.decision.selectedQuest).toBeDefined()
    expect(vm.decision.selectedQuest!.id).toBe(quest.id)
    expect(vm.decision.selectedQuest!.title).toBe(quest.title)
    expect(vm.decision.selectedQuest!.rankLabel).toContain('Rank')
    expect(vm.decision.selectedQuest!.objectiveTypeLabel).toBeTruthy()
    expect(vm.decision.selectedQuest!.terrainLabel).not.toMatch(
      /^(forest|mountain|cave|ruins|plains|swamp|desert|urban|magical)$/,
    )
    expect(['あり', 'なし']).toContain(vm.decision.selectedQuest!.combatLabel)
    expect(vm.decision.selectedQuest!.description).toBe(quest.briefing)
    expect(vm.decision.selectedQuest!.offerStatusLabel).toBeTruthy()
  })

  it('B: decision viewModel exposes party summary with rank, count and injury status', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-4-party')
    const party = campaign.currentDay.parties[0]!

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
    })

    const vm = (
      scene as unknown as {
        _viewModel: {
          decision: {
            selectedParty?: {
              id: string
              name: string
              rankLabel: string
              statusLabel: string
              memberCount: number
              injuryLabel: string
              members: unknown[]
            }
          }
        }
      }
    )._viewModel

    expect(vm.decision.selectedParty).toBeDefined()
    expect(vm.decision.selectedParty!.rankLabel).toContain('Rank')
    expect(vm.decision.selectedParty!.memberCount).toBe(
      party.party.members.length,
    )
    expect(vm.decision.selectedParty!.injuryLabel).toMatch(/^負傷：/)
    expect(vm.decision.selectedParty!.members.length).toBe(
      party.party.members.length,
    )
  })

  it('C: selecting both party and quest computes a prediction without mutating state', async () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-4-prediction')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests[0]!
    const hpBefore = party.party.members[0]!.currentHp

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
      selectedQuestId: quest.id,
    })

    await new Promise((r) => setTimeout(r, 0))
    const decisionPanel = (
      scene as unknown as {
        _decisionPanel: {
          currentPrediction?: {
            estimatedSuccessRate: number
            sampleCount: number
            requestId: string
            partyId: string
          }
        }
      }
    )._decisionPanel

    expect(decisionPanel.currentPrediction).toBeDefined()
    expect(decisionPanel.currentPrediction!.sampleCount).toBe(200)
    expect(decisionPanel.currentPrediction!.requestId).toBe(quest.id)
    expect(decisionPanel.currentPrediction!.partyId).toBe(party.id)
    expect(
      decisionPanel.currentPrediction!.estimatedSuccessRate,
    ).toBeGreaterThanOrEqual(0)
    expect(
      decisionPanel.currentPrediction!.estimatedSuccessRate,
    ).toBeLessThanOrEqual(1)
    expect(party.party.members[0]!.currentHp).toBe(hpBefore)
  })

  it('D: quest list items carry rank trailing and compact subtitle', () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-4-list')

    scene.mount(context)
    scene.setCampaign(campaign, { ...DEFAULT_GAME_UI_STATE })

    const rows = (
      scene as unknown as {
        _questList: {
          _rows: {
            _titleLabel: { text: string }
            _subtitleLabel: { text: string }
          }[]
        }
      }
    )._questList._rows
    const questVm = (
      scene as unknown as {
        _viewModel: {
          quests: {
            rank: string
            terrainLabel: string
            objectiveLabel: string
            statusLabel: string
          }[]
        }
      }
    )._viewModel.quests[0]!

    expect(questVm.rank).toBe(campaign.currentDay.requests[0]!.rank)
    expect(questVm.terrainLabel).toBeTruthy()
    expect(rows[0]!._subtitleLabel.text).toContain(questVm.terrainLabel)
    expect(rows[0]!._subtitleLabel.text).toContain(questVm.objectiveLabel)
    expect(rows[0]!._subtitleLabel.text).toContain(questVm.statusLabel)
  })

  it('E: switching quest before prediction resolves does not leak stale result', async () => {
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-4-stale')
    const party = campaign.currentDay.parties[0]!
    const firstQuest = campaign.currentDay.requests[0]!
    const secondQuest = campaign.currentDay.requests[1]!

    scene.mount(context)
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
      selectedQuestId: firstQuest.id,
    })

    // Immediately switch quest before the microtask can resolve.
    scene.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
      selectedQuestId: secondQuest.id,
    })

    await new Promise((r) => setTimeout(r, 0))
    const decisionPanel = (
      scene as unknown as {
        _decisionPanel: { currentPrediction?: { requestId: string } }
      }
    )._decisionPanel

    expect(decisionPanel.currentPrediction?.requestId).toBe(secondQuest.id)
  })
})
