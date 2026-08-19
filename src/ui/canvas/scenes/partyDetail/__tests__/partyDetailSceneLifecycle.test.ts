// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import { createTavernCampaign } from '../../../../../core/tavern/campaign/campaign.ts'
import { PartyDetailScene } from '../PartyDetailScene.ts'
import { GameAssetManager } from '../../../assets/GameAssetManager.ts'
import { GameViewport } from '../../../GameViewport.ts'
import { OverlayManager } from '../../../overlays/OverlayManager.ts'
import { DEFAULT_GAME_THEME } from '../../../theme/gameTheme.ts'
import { DEFAULT_GAME_UI_STATE, type GameSceneContext } from '../../../types.ts'

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

function createSceneContext(scene: PartyDetailScene): GameSceneContext {
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

  const pop = vi.fn()
  const setUiState = vi.fn((partial) => {
    scene.setUiState({ ...DEFAULT_GAME_UI_STATE, ...partial })
  })

  return {
    id: 'party-detail-lifecycle',
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
      setUiState,
      sceneManager: { push: vi.fn(), pop },
    } as unknown as GameSceneContext['canvasGame'],
  }
}

describe('PartyDetailScene lifecycle', () => {
  it('mounts and renders selected character from input', () => {
    const scene = new PartyDetailScene()
    const context = createSceneContext(scene)
    const campaign = createTavernCampaign('party-detail-lifecycle-1')
    const party = campaign.parties[0]!
    const member = party.party.members[1]!

    scene.mount(context, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, DEFAULT_GAME_UI_STATE)

    const internal = scene as unknown as {
      _viewModel: { selectedCharacter?: { id: string } }
    }
    expect(internal._viewModel.selectedCharacter?.id).toBe(member.id)
    expect(context.layers.ui.children.length).toBeGreaterThan(0)
    expect(context.layers.background.children.length).toBeGreaterThan(0)
  })

  it('falls back to first member when initial character id is invalid', () => {
    const scene = new PartyDetailScene()
    const context = createSceneContext(scene)
    const campaign = createTavernCampaign('party-detail-lifecycle-2')
    const party = campaign.parties[0]!

    scene.mount(context, {
      partyId: party.id,
      initialCharacterId: 'missing-character',
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, DEFAULT_GAME_UI_STATE)

    const internal = scene as unknown as {
      _viewModel: { selectedCharacter?: { id: string } }
    }
    expect(internal._viewModel.selectedCharacter?.id).toBe(
      party.party.members[0]!.id,
    )
  })

  it('switches selected character and updates view model without calling actions', () => {
    const scene = new PartyDetailScene()
    const context = createSceneContext(scene)
    const campaign = createTavernCampaign('party-detail-lifecycle-3')
    const party = campaign.parties[0]!
    const [, second] = party.party.members

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, DEFAULT_GAME_UI_STATE)

    const internal = scene as unknown as {
      selectCharacter: (id: string) => void
    }
    internal.selectCharacter(second!.id)

    const vm = scene as unknown as {
      _viewModel: { selectedCharacter?: { id: string } }
    }
    expect(vm._viewModel.selectedCharacter?.id).toBe(second!.id)
    expect(context.actions.openCharacter).not.toHaveBeenCalled()
    expect(context.actions.offerRequest).not.toHaveBeenCalled()
  })

  it('returns to tavern preserving selected party and quest', () => {
    const scene = new PartyDetailScene()
    const context = createSceneContext(scene)
    const campaign = createTavernCampaign('party-detail-lifecycle-4')
    const party = campaign.parties[0]!
    const request = campaign.currentDay.requests[0]!

    scene.mount(context, {
      partyId: party.id,
      returnTarget: {
        sceneId: 'tavern',
        selectedPartyId: party.id,
        selectedQuestId: request.id,
      },
    })
    scene.setCampaign(campaign, DEFAULT_GAME_UI_STATE)

    const internal = scene as unknown as { returnToTavern: () => void }
    internal.returnToTavern()

    expect(context.canvasGame.setUiState).toHaveBeenCalledWith({
      selectedPartyId: party.id,
      selectedQuestId: request.id,
    })
    expect(context.canvasGame.sceneManager?.pop).toHaveBeenCalled()
  })

  it('does not mutate campaign state', () => {
    const scene = new PartyDetailScene()
    const context = createSceneContext(scene)
    const campaign = createTavernCampaign('party-detail-lifecycle-5')
    const party = campaign.parties[0]!
    const serialized = JSON.stringify(campaign)

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, DEFAULT_GAME_UI_STATE)

    const internal = scene as unknown as {
      selectCharacter: (id: string) => void
    }
    internal.selectCharacter(
      party.party.members[1]?.id ?? party.party.members[0]!.id,
    )
    scene.unmount()

    expect(JSON.stringify(campaign)).toBe(serialized)
  })

  it('can be mounted and unmounted repeatedly without leaking ui roots', () => {
    const scene = new PartyDetailScene()
    const context = createSceneContext(scene)
    const campaign = createTavernCampaign('party-detail-lifecycle-6')
    const party = campaign.parties[0]!

    for (let i = 0; i < 5; i++) {
      scene.mount(context, {
        partyId: party.id,
        returnTarget: { sceneId: 'tavern' },
      })
      scene.setCampaign(campaign, DEFAULT_GAME_UI_STATE)
      scene.unmount()
    }

    expect(context.layers.ui.children.length).toBe(0)
    expect(context.layers.background.children.length).toBe(0)
  })
})
