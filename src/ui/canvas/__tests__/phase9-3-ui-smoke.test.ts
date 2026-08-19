// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import { purchaseTavernUpgrade } from '../../../core/tavern/campaign/upgrades.ts'
import { deepClone } from '../../../core/util.ts'
import {
  buildTavernUpgradeSceneViewModel,
  buildUpgradePurchaseSuccessMessage,
  createTavernUpgradeSceneInput,
  tavernUpgradeBlockReasonText,
} from '../viewModel/tavernUpgradeViewModel.ts'
import { TavernUpgradeScene } from '../scenes/tavernUpgrade/TavernUpgradeScene.ts'
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
    id: 'phase9-3-ui-smoke',
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

const RAW_ID_PATTERNS = [
  'quest_board',
  'intel_archive',
  'recovery_room',
  'upgrade_purchase',
]

describe('phase9-3-ui-smoke', () => {
  it('A: viewModel reports day/rank/funds labels and one entry per facility', () => {
    const campaign = createTavernCampaign('phase9-3-ui-a')
    const vm = buildTavernUpgradeSceneViewModel(campaign, { sceneId: 'tavern' })
    expect(vm.dayLabel).toBe('DAY 1')
    expect(vm.tavernRankLabel).toBe('酒場ランク 1')
    expect(vm.fundsLabel).toBe('資金 100')
    expect(vm.entries.map((e) => e.id).sort()).toEqual(
      ['intel_archive', 'quest_board', 'recovery_room'].sort(),
    )

    const questBoard = vm.entries.find((e) => e.id === 'quest_board')!
    expect(questBoard.canPurchase).toBe(true)
    expect(questBoard.cost).toBe(60)
    expect(questBoard.requiredRank).toBe(1)

    const intelArchive = vm.entries.find((e) => e.id === 'intel_archive')!
    expect(intelArchive.canPurchase).toBe(false)
    expect(intelArchive.blockedReason).toBe('rank_locked')
  })

  it('B: viewModel reflects an applied purchase (level, effect text, next target)', () => {
    const campaign = createTavernCampaign('phase9-3-ui-b')
    const purchase = purchaseTavernUpgrade(campaign, 'quest_board')
    expect(purchase.ok).toBe(true)

    const vm = buildTavernUpgradeSceneViewModel(purchase.campaign, {
      sceneId: 'tavern',
    })
    const questBoard = vm.entries.find((e) => e.id === 'quest_board')!
    expect(questBoard.currentLevel).toBe(1)
    expect(questBoard.currentEffectText).toContain('+1')
    expect(questBoard.nextLevel).toBe(2)
    // Level 2 needs tavern rank 3; still rank 1 at this point.
    expect(questBoard.canPurchase).toBe(false)
    expect(questBoard.blockedReason).toBe('rank_locked')
  })

  it('C: tavernUpgradeBlockReasonText maps every blocking reason to player-facing text', () => {
    expect(tavernUpgradeBlockReasonText('rank_locked')).toBe(
      '酒場ランクが不足しています。',
    )
    expect(tavernUpgradeBlockReasonText('insufficient_funds')).toBe(
      '資金が足りません。',
    )
    expect(tavernUpgradeBlockReasonText('not_planning')).toContain('翌日以降')
    expect(tavernUpgradeBlockReasonText('max_level')).toBeUndefined()
    expect(tavernUpgradeBlockReasonText(undefined)).toBeUndefined()
  })

  it('C2: buildUpgradePurchaseSuccessMessage is structured (no AI) and player-facing', () => {
    expect(buildUpgradePurchaseSuccessMessage('quest_board', 1)).toBe(
      '依頼掲示板をLv1へ改装しました。',
    )
    expect(buildUpgradePurchaseSuccessMessage('intel_archive', 1)).toBe(
      '調査資料棚をLv1へ改装しました。',
    )
    expect(buildUpgradePurchaseSuccessMessage('recovery_room', 2)).toBe(
      '療養室をLv2へ改装しました。',
    )
  })

  it('D: no player-facing viewModel text ever exposes a raw internal id', () => {
    const campaign = deepClone(createTavernCampaign('phase9-3-ui-d'))
    campaign.finance.funds = 100000
    campaign.reputation.peakScore = 1000
    const vm = buildTavernUpgradeSceneViewModel(campaign, { sceneId: 'tavern' })
    for (const entry of vm.entries) {
      const texts = [
        entry.title,
        entry.description,
        entry.currentEffectText,
        entry.nextEffectText ?? '',
        entry.timingNote,
      ]
      for (const text of texts) {
        for (const raw of RAW_ID_PATTERNS) {
          expect(text).not.toContain(raw)
        }
      }
    }
  })

  it('E: TavernUpgradeScene mounts, renders the campaign, and unmounts cleanly', () => {
    const campaign = createTavernCampaign('phase9-3-ui-e')
    const scene = new TavernUpgradeScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)

    scene.mount(context, createTavernUpgradeSceneInput({ sceneId: 'tavern' }))
    scene.setCampaign(campaign, uiStateRef.current)

    expect(context.layers.ui.children.length).toBeGreaterThan(0)

    scene.unmount()
    expect(context.layers.ui.children.length).toBe(0)
    expect(context.layers.background.children.length).toBe(0)
  })

  it('F: purchasing dispatches context.actions.purchaseUpgrade with the correct upgrade id', () => {
    const campaign = createTavernCampaign('phase9-3-ui-f')
    const scene = new TavernUpgradeScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const purchaseUpgrade = vi.fn(() => ({ ok: true }))
    const context = createSceneContext(scene, uiStateRef, { purchaseUpgrade })

    scene.mount(context, createTavernUpgradeSceneInput({ sceneId: 'tavern' }))
    scene.setCampaign(campaign, uiStateRef.current)

    const vm = buildTavernUpgradeSceneViewModel(campaign, { sceneId: 'tavern' })
    const questBoard = vm.entries.find((e) => e.id === 'quest_board')!

    ;(
      scene as unknown as {
        handlePurchase: (entry: typeof questBoard) => void
      }
    ).handlePurchase(questBoard)

    expect(purchaseUpgrade).toHaveBeenCalledWith('quest_board')
  })

  it('F2: a failed purchase surfaces the block reason instead of throwing', () => {
    const campaign = createTavernCampaign('phase9-3-ui-f2')
    const scene = new TavernUpgradeScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const purchaseUpgrade = vi.fn(() => ({
      ok: false,
      message: '資金が足りません。',
    }))
    const context = createSceneContext(scene, uiStateRef, { purchaseUpgrade })

    scene.mount(context, createTavernUpgradeSceneInput({ sceneId: 'tavern' }))
    scene.setCampaign(campaign, uiStateRef.current)

    const vm = buildTavernUpgradeSceneViewModel(campaign, { sceneId: 'tavern' })
    const questBoard = vm.entries.find((e) => e.id === 'quest_board')!

    expect(() =>
      (
        scene as unknown as {
          handlePurchase: (entry: typeof questBoard) => void
        }
      ).handlePurchase(questBoard),
    ).not.toThrow()
    expect(
      (scene as unknown as { _statusMessage: string | null })._statusMessage,
    ).toBe('資金が足りません。')
  })

  it('F3: a successful purchase shows a structured Japanese success message, not raw ids', () => {
    const campaign = createTavernCampaign('phase9-3-ui-f3')
    const scene = new TavernUpgradeScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const purchaseUpgrade = vi.fn(() => ({ ok: true }))
    const context = createSceneContext(scene, uiStateRef, { purchaseUpgrade })

    scene.mount(context, createTavernUpgradeSceneInput({ sceneId: 'tavern' }))
    scene.setCampaign(campaign, uiStateRef.current)

    const vm = buildTavernUpgradeSceneViewModel(campaign, { sceneId: 'tavern' })
    const questBoard = vm.entries.find((e) => e.id === 'quest_board')!

    ;(
      scene as unknown as {
        handlePurchase: (entry: typeof questBoard) => void
      }
    ).handlePurchase(questBoard)

    expect(
      (scene as unknown as { _statusMessage: string | null })._statusMessage,
    ).toBe('依頼掲示板をLv1へ改装しました。')
  })

  it('G: returning to the tavern restores the return target and pops the scene', () => {
    const campaign = createTavernCampaign('phase9-3-ui-g')
    const scene = new TavernUpgradeScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)

    const input = createTavernUpgradeSceneInput({
      sceneId: 'tavern',
      selectedPartyId: 'party-1',
      selectedQuestId: 'quest-1',
    })
    scene.mount(context, input)
    scene.setCampaign(campaign, uiStateRef.current)

    ;(scene as unknown as { returnToTavern: () => void }).returnToTavern()

    expect(context.canvasGame.setUiState).toHaveBeenCalledWith({
      selectedPartyId: 'party-1',
      selectedQuestId: 'quest-1',
    })
    expect(context.canvasGame.sceneManager?.pop).toHaveBeenCalled()
  })

  it('H: the tavern header wires 設備 navigation to push the tavernUpgrade scene', () => {
    const campaign = createTavernCampaign('phase9-3-ui-h')
    const scene = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)

    scene.mount(context)
    scene.setCampaign(campaign, uiStateRef.current)

    const header = (
      scene as unknown as {
        _header: { _onOpenUpgrade?: () => void }
      }
    )._header
    expect(header).toBeTruthy()
    header._onOpenUpgrade?.()

    expect(context.canvasGame.sceneManager?.push).toHaveBeenCalledWith(
      'tavernUpgrade',
      expect.objectContaining({
        returnTarget: expect.objectContaining({ sceneId: 'tavern' }),
      }),
    )

    scene.unmount()
  })
})
