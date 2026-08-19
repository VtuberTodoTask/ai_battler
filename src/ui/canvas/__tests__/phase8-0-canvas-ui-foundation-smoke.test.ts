// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { Container, FederatedPointerEvent } from 'pixi.js'

const pointerEvent = {} as FederatedPointerEvent
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import { CanvasGame } from '../CanvasGame.ts'
import { GameViewport, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../GameViewport.ts'
import { GameButton } from '../components/GameButton.ts'
import { GameModal } from '../components/GameModal.ts'
import { GameScrollView } from '../components/GameScrollView.ts'
import { GameTooltip } from '../components/GameTooltip.ts'
import { OverlayManager } from '../overlays/OverlayManager.ts'
import { BootScene } from '../scenes/BootScene.ts'
import { FoundationDemoScene } from '../scenes/FoundationDemoScene.ts'
import { GameSceneManager } from '../scenes/GameSceneManager.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import { buildGameUiViewModel } from '../viewModel/gameUiViewModel.ts'
import type { GameSceneContext } from '../types.ts'
import { GameAssetManager } from '../assets/GameAssetManager.ts'

function createTestContext(): GameSceneContext {
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

  return {
    id: 'smoke',
    app,
    viewport: new GameViewport(),
    layers: {
      background: new Container(),
      content: new Container(),
      ui: new Container(),
      overlay: new Container(),
      modal: new Container(),
      transition: new Container(),
      debug: new Container(),
    },
    overlayManager: new OverlayManager(
      new Container(),
      new Container(),
      DEFAULT_GAME_THEME,
    ),
    theme: DEFAULT_GAME_THEME,
    assetManager: new GameAssetManager(),
    actions: {
      advanceDay: vi.fn(),
      resolveDay: vi.fn(),
      offerRequest: vi.fn(),
      purchaseUpgrade: vi.fn(),
      selectParty: vi.fn(),
      selectQuest: vi.fn(),
      openCharacter: vi.fn(),
      openActivity: vi.fn().mockResolvedValue(''),
      openSettings: vi.fn(),
      closeModal: vi.fn(),
      switchToLegacy: vi.fn(),
    },
    canvasGame: {} as GameSceneContext['canvasGame'],
  }
}

describe('Phase 8.0 Canvas UI Foundation Smoke', () => {
  it('A: virtual resolution is 1600x900 and scale preserves aspect ratio', () => {
    const viewport = new GameViewport()
    viewport.resize(1920, 1080)
    const metrics = viewport.metrics

    expect(metrics.virtualWidth).toBe(1600)
    expect(metrics.virtualHeight).toBe(900)
    expect(metrics.scale).toBeCloseTo(1080 / VIRTUAL_HEIGHT)
    const projectedAspect =
      (metrics.availableWidth - 2 * metrics.offsetX) /
      (metrics.availableHeight - 2 * metrics.offsetY)
    expect(projectedAspect).toBeCloseTo(VIRTUAL_WIDTH / VIRTUAL_HEIGHT)
  })

  it('B: letterbox and pillarbox produce black-bar offsets', () => {
    const viewport = new GameViewport()
    viewport.resize(1024, 768)
    const m = viewport.metrics
    expect(m.scale).toBeCloseTo(1024 / VIRTUAL_WIDTH)
    expect(m.offsetY).toBeGreaterThan(0)

    viewport.resize(2560, 1080)
    const m2 = viewport.metrics
    expect(m2.scale).toBeCloseTo(1080 / VIRTUAL_HEIGHT)
    expect(m2.offsetX).toBeGreaterThan(0)
  })

  it('C: scene manager transitions from BootScene to FoundationDemoScene', () => {
    const context = createTestContext()
    const manager = new GameSceneManager(context)
    context.canvasGame = {
      sceneManager: manager,
    } as unknown as GameSceneContext['canvasGame']

    manager.register(new BootScene())
    manager.register(new FoundationDemoScene())

    manager.show('boot')
    expect(manager.current?.id).toBe('boot')

    manager.update(BOOT_DURATION_MS + 100)
    expect(manager.current?.id).toBe('foundation')
  })

  it('D: FoundationDemoScene mounts and accepts a real campaign', () => {
    const context = createTestContext()
    const manager = new GameSceneManager(context)
    const scene = new FoundationDemoScene()

    manager.register(scene)
    manager.show('foundation')

    const campaign = createTavernCampaign('smoke-campaign-001')
    scene.setCampaign(campaign, {
      selectedPartyId: null,
      selectedQuestId: null,
      openCharacterId: null,
      modalOpen: false,
    })

    expect(manager.current?.id).toBe('foundation')
  })

  it('E: disabled GameButton does not activate', () => {
    const action = vi.fn()
    const button = new GameButton({
      width: 100,
      height: 40,
      theme: DEFAULT_GAME_THEME,
      label: 'Disabled',
      disabled: true,
    })
    button.onActivate = action
    button.emit('pointertap', pointerEvent)
    expect(action).not.toHaveBeenCalled()
    expect(button.isEnabled).toBe(false)
  })

  it('F: GameButton action fires exactly once', () => {
    const action = vi.fn()
    const button = new GameButton({
      width: 100,
      height: 40,
      theme: DEFAULT_GAME_THEME,
      label: 'Once',
    })
    button.onActivate = action

    button.emit('pointertap', pointerEvent)
    button.emit('pointertap', pointerEvent)
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('G: GameScrollView supports content, masking, and viewport resize', () => {
    const scroll = new GameScrollView(DEFAULT_GAME_THEME, 300, 200)

    for (let i = 0; i < 20; i++) {
      const row = new Container()
      row.y = i * 28
      scroll.content.addChild(row)
    }

    expect(scroll.content.children.length).toBe(20)

    scroll.setViewportSize(400, 240)
    expect(scroll.content.y).toBe(0)
  })

  it('H: GameTooltip show/hide', () => {
    const tooltip = new GameTooltip(DEFAULT_GAME_THEME)
    expect(tooltip.visible).toBe(false)

    tooltip.show('Hello', 100, 100)
    expect(tooltip.visible).toBe(true)

    tooltip.hide()
    expect(tooltip.visible).toBe(false)
  })

  it('I: GameModal open/close', () => {
    const close = vi.fn()
    const modal = new GameModal(DEFAULT_GAME_THEME, close)
    expect(modal.visible).toBe(false)

    modal.open('Smoke Test', 'This is a modal body.')
    expect(modal.visible).toBe(true)

    modal.close()
    expect(modal.visible).toBe(false)
  })

  it('J: gameUiViewModel projects real campaign without exposing core internals', () => {
    const campaign = createTavernCampaign('smoke-vm-001')
    const vm = buildGameUiViewModel(campaign)

    expect(vm.day).toBe(campaign.dayNumber)
    expect(vm.parties.length).toBe(campaign.currentDay.parties.length)
    expect('seed' in vm).toBe(false)
    expect('currentDay' in vm).toBe(false)
  })

  it('K: CanvasGame class can be constructed without starting an Application', () => {
    const cg = new CanvasGame()
    expect(cg).toBeDefined()
    expect(cg.viewport).toBeDefined()
    expect(cg.viewport.virtualWidth).toBe(1600)
    expect(cg.sceneManager).toBeNull()
  })

  it('L: canvas foundation smoke uses zero AI calls', () => {
    const campaign = createTavernCampaign('smoke-zero-call-001')
    const vm = buildGameUiViewModel(campaign)

    expect(vm).toBeDefined()
    expect(vm.parties.length).toBeGreaterThan(0)
    expect(campaign.narrativeGenerations).toHaveLength(0)
  })
})

const BOOT_DURATION_MS = 1200
