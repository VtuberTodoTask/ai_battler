// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Container } from 'pixi.js'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import { PartyDetailScene } from '../scenes/partyDetail/PartyDetailScene.ts'
import { TavernScene } from '../scenes/tavern/TavernScene.ts'
import { GameAssetManager } from '../assets/GameAssetManager.ts'
import { GameViewport } from '../GameViewport.ts'
import { OverlayManager } from '../overlays/OverlayManager.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import { DEFAULT_GAME_UI_STATE, type GameSceneContext } from '../types.ts'
import {
  buildPartyDetailHeader,
  buildPartyDetailSceneViewModel,
} from '../viewModel/partyDetailViewModel.ts'

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
  scene: PartyDetailScene | TavernScene,
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
    id: 'phase8-8-smoke',
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
      selectParty: vi.fn((id) => {
        uiStateRef.current.selectedPartyId = id
      }),
      selectQuest: vi.fn((id) => {
        uiStateRef.current.selectedQuestId = id
      }),
      openCharacter: vi.fn(),
      openActivity: vi.fn().mockResolvedValue({ ok: true, data: '' }),
      openExpeditionNarrative: vi
        .fn()
        .mockResolvedValue({ ok: true, data: '' }),
      openSettings: vi.fn(),
      closeModal: vi.fn(),
      switchToLegacy: vi.fn(),
    },
    canvasGame: {
      setUiState: vi.fn((partial) => {
        uiStateRef.current = { ...uiStateRef.current, ...partial }
        scene.setUiState(uiStateRef.current)
      }),
      sceneManager: { push: vi.fn(), pop: vi.fn() },
    } as unknown as GameSceneContext['canvasGame'],
  }
}

describe('Phase 8.8 Party & Character Detail Smoke', () => {
  it('A: mounts PartyDetailScene and selects initial character', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-a')
    const party = campaign.parties[0]!
    const member = party.party.members[1]!

    scene.mount(context, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const vm = (
      scene as unknown as { _viewModel: { selectedCharacter?: { id: string } } }
    )._viewModel
    expect(vm.selectedCharacter?.id).toBe(member.id)
    expect(context.layers.ui.children.length).toBeGreaterThan(0)
  })

  it('B: header shows idle, recovering and dispatched statuses', () => {
    const campaign = createTavernCampaign('phase8-8-b')
    const party = campaign.parties[0]!

    const idle = buildPartyDetailHeader(party, campaign)
    expect(idle.statusLabel).toBe('待機中')

    party.recoveringThroughDay = campaign.dayNumber + 2
    const recovering = buildPartyDetailHeader(party, campaign)
    expect(recovering.statusLabel).toBe('療養中')

    party.recoveringThroughDay = undefined
    const request = campaign.currentDay.requests[0]!
    const tavernParty = campaign.currentDay.parties.find(
      (p) => p.id === party.id,
    )!
    tavernParty.acceptedRequestId = request.id
    const dispatched = buildPartyDetailHeader(party, campaign)
    expect(dispatched.statusLabel).toBe('遠征中')
    expect(dispatched.currentQuestLabel).toBe(request.title)
  })

  it('C: member list shows role and condition labels', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-c')
    const party = campaign.parties[0]!

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const vm = (
      scene as unknown as {
        _viewModel: { members: { roleLabel: string; conditionLabel: string }[] }
      }
    )._viewModel
    expect(vm.members.length).toBe(party.party.members.length)
    expect(vm.members[0]!.roleLabel).toBeTruthy()
    expect(vm.members[0]!.conditionLabel).toMatch(/HP/)
  })

  it('D: profile tab exposes identity, abilities and personality', () => {
    const campaign = createTavernCampaign('phase8-8-d')
    const party = campaign.parties[0]!
    const member = party.party.members[0]!

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })

    const char = vm.selectedCharacter!
    expect(char.name).toBe(member.name)
    expect(char.abilities.some((a) => a.name === 'STR')).toBe(true)
    expect(char.condition.hp).toMatch(/\//)
    expect(char.personality.lines.length).toBeGreaterThan(0)
  })

  it('E: relationship tab provides directional labels and milestones', () => {
    const campaign = createTavernCampaign('phase8-8-e')
    const party = campaign.parties[0]!
    const [a, b] = party.party.members

    party.memberRelationships = {
      [`${a!.id}:${b!.id}`]: {
        sourceCharacterId: a!.id,
        targetCharacterId: b!.id,
        affinity: 75,
        trust: 70,
        respect: 60,
        tension: 20,
        recentEvents: [
          {
            id: 'rm-e',
            sourceCharacterId: a!.id,
            targetCharacterId: b!.id,
            day: 1,
            type: 'shared_success',
            summary: '共に勝利を収めた',
            importance: 5,
            valence: 'positive',
          },
        ],
      },
    }

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: a!.id,
      returnTarget: { sceneId: 'tavern' },
    })
    const rel = vm.selectedCharacter!.relationships.find(
      (r) => r.targetId === b!.id,
    )!
    expect(rel).toBeDefined()
    expect(rel.recentMemories.length).toBeGreaterThan(0)
  })

  it('F: history tab includes recent events and expedition records', () => {
    const campaign = createTavernCampaign('phase8-8-f')
    const party = campaign.parties[0]!
    const member = party.party.members[0]!

    party.characterMemories = {
      [member.id]: [
        {
          id: 'cm-f',
          characterId: member.id,
          day: 1,
          type: 'major_success',
          summary: '遺跡の謎を解いた',
          importance: 5,
          valence: 'positive',
        },
      ],
    }

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })
    expect(vm.selectedCharacter!.recentEvents.length).toBeGreaterThan(0)
    expect(vm.selectedCharacter!.expeditions).toBeDefined()
  })

  it('G: invalid party id shows empty fallback and invalid character falls back to first member', () => {
    const campaign = createTavernCampaign('phase8-8-g')

    const invalidParty = buildPartyDetailSceneViewModel(campaign, {
      partyId: 'missing',
      returnTarget: { sceneId: 'tavern' },
    })
    expect(invalidParty.emptyMessage).toBeTruthy()

    const party = campaign.parties[0]!
    const invalidChar = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: 'missing',
      returnTarget: { sceneId: 'tavern' },
    })
    expect(invalidChar.selectedCharacter?.id).toBe(party.party.members[0]!.id)
  })

  it('H: switching characters does not call AI or mutate campaign', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-h')
    const party = campaign.parties[0]!
    const before = JSON.stringify(campaign)

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)
    const internal = scene as unknown as {
      selectCharacter: (id: string) => void
    }
    internal.selectCharacter(party.party.members[1]!.id)

    expect(context.actions.openExpeditionNarrative).not.toHaveBeenCalled()
    expect(JSON.stringify(campaign)).toBe(before)
  })

  it('I: return to tavern preserves selected party and quest', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-i')
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
    scene.setCampaign(campaign, uiStateRef.current)
    const internal = scene as unknown as { returnToTavern: () => void }
    internal.returnToTavern()

    expect(context.canvasGame.setUiState).toHaveBeenCalledWith({
      selectedPartyId: party.id,
      selectedQuestId: request.id,
    })
    expect(context.canvasGame.sceneManager?.pop).toHaveBeenCalled()
  })

  it('J: TavernScene can push PartyDetailScene with selected party', () => {
    const tavern = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(tavern, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-j')
    const party = campaign.parties[0]!

    tavern.mount(context)
    tavern.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
    })
    tavern.setUiState({
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
    })

    const internal = tavern as unknown as { openPartyDetail: () => void }
    internal.openPartyDetail()

    expect(context.canvasGame.sceneManager?.push).toHaveBeenCalledWith(
      'partyDetail',
      expect.objectContaining({
        partyId: party.id,
        returnTarget: expect.anything(),
      }),
    )
  })
})
