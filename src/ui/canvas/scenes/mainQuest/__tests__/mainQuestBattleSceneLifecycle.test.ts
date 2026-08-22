// @vitest-environment jsdom
import { Container } from 'pixi.js'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { GameAssetManager } from '../../../assets/GameAssetManager.ts'
import { GameViewport } from '../../../GameViewport.ts'
import { OverlayManager } from '../../../overlays/OverlayManager.ts'
import { DEFAULT_GAME_THEME } from '../../../theme/gameTheme.ts'
import { type GameSceneContext, type GameUiActions } from '../../../types.ts'
import {
  MainQuestBattleScene,
  pickSilhouette,
} from '../MainQuestBattleScene.ts'
import type { MainQuestBattleSceneInput } from '../../../viewModel/mainQuestViewModel.ts'
import {
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../../../core/tavern/campaign/campaign.ts'
import { dispatchMainQuest } from '../../../../../core/mainQuest/dispatch.ts'
import { generateMainQuestNarrative } from '../../../../../core/mainQuest/narrative.ts'
import { applyMainQuestNarrative } from '../../../../../core/mainQuest/presentation.ts'
import {
  MAIN_QUEST_THREAT_DEFINITIONS,
  MAIN_QUEST_THREAT_DEFINITION_MAP,
} from '../../../../../core/mainQuest/threats.ts'
import type { NarrativeProvider } from '../../../../../ai/narrative/types.ts'
import type { TavernCampaignState } from '../../../../../core/tavern/campaign/types.ts'

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
    }) as TextMetrics

  return {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    strokeText: vi.fn(),
    measureText: emptyMetrics,
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  }
}

beforeAll(() => {
  if (!('CanvasRenderingContext2D' in globalThis)) {
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

function createSceneContext(): {
  context: GameSceneContext
  pop: ReturnType<typeof vi.fn>
} {
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
  const canvasGame = {
    setUiState: vi.fn(),
    sceneManager: {
      push: vi.fn(),
      pop,
    },
  } as unknown as GameSceneContext['canvasGame']

  const context: GameSceneContext = {
    id: 'mainQuestBattle-lifecycle',
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
      advanceDay: vi.fn(),
      resolveDay: vi.fn(),
      offerRequest: vi.fn(),
      selectParty: vi.fn(),
      selectQuest: vi.fn(),
      openCharacter: vi.fn(),
      openActivity: vi.fn(),
      openExpeditionNarrative: vi.fn(),
      openSettings: vi.fn(),
      closeModal: vi.fn(),
      switchToLegacy: vi.fn(),
    } as unknown as GameUiActions,
    canvasGame,
  }

  return { context, pop }
}

function fakeProvider(text: string): NarrativeProvider {
  return {
    id: 'fake-mainquest-battle-scene',
    async generate() {
      return { text }
    },
  }
}

async function resolvedAttemptFixture(
  seed: string,
  withNarrative: boolean,
): Promise<{ campaign: TavernCampaignState; attemptId: string }> {
  const campaign = createTavernCampaign(seed)
  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP.alden
  const party = campaign.parties[0]
  party.party.rank = definition.requiredPartyRank
  party.relationship.affinity = definition.requiredAffinity
  campaign.currentDay.parties = campaign.currentDay.parties.map((p) =>
    p.id === party.id
      ? { ...p, party: { ...p.party, rank: definition.requiredPartyRank } }
      : p,
  )
  campaign.finance.funds = definition.fee + 1000

  const dispatch = dispatchMainQuest(campaign, 'alden', party.id)
  if (!dispatch.ok || !dispatch.attemptId) {
    throw new Error('test setup: dispatch failed')
  }
  let resolved = resolveCampaignDay(dispatch.campaign)
  const attemptId = dispatch.attemptId

  if (withNarrative) {
    const attempt = resolved.mainQuest.attempts.find((a) => a.id === attemptId)!
    const campaignParty = resolved.parties.find((p) => p.id === party.id)!
    const text = `===PRE-BATTLE===
前。

===BATTLE:battle_start speaker=monster===
「来るがいい」

===POST-BATTLE===
後。`
    const { script } = await generateMainQuestNarrative(
      definition,
      attempt,
      campaignParty,
      fakeProvider(text),
    )
    resolved = applyMainQuestNarrative(resolved, attemptId, script)
  }

  return { campaign: resolved, attemptId }
}

describe('MainQuestBattleScene lifecycle', () => {
  it('mounts and renders the Battle Playback UI into the content layer', async () => {
    const scene = new MainQuestBattleScene()
    const { context } = createSceneContext()
    const { campaign, attemptId } = await resolvedAttemptFixture(
      'mqbs-mount-001',
      false,
    )
    const input: MainQuestBattleSceneInput = {
      attemptId,
      returnTarget: { sceneId: 'mainQuest' },
    }

    scene.mount(context, input)
    scene.setCampaign(campaign, {
      selectedPartyId: null,
      selectedQuestId: null,
      openCharacterId: null,
      modalOpen: false,
    })

    expect(context.layers.content.children.length).toBeGreaterThan(0)
  })

  it('update() never throws while auto-playing through a full Battle Trace (with dialogue interludes) and eventually finishes', async () => {
    const scene = new MainQuestBattleScene()
    const { context, pop } = createSceneContext()
    const { campaign, attemptId } = await resolvedAttemptFixture(
      'mqbs-autoplay-001',
      true,
    )
    const input: MainQuestBattleSceneInput = {
      attemptId,
      returnTarget: { sceneId: 'mainQuest' },
    }

    scene.mount(context, input)
    scene.setCampaign(campaign, {
      selectedPartyId: null,
      selectedQuestId: null,
      openCharacterId: null,
      modalOpen: false,
    })

    expect(() => {
      // Generous budget: each beat takes several update(50) calls to expire
      // (durations are 120-1400ms), so a long multi-round Trace can need
      // several thousand ticks even though the simulated wall-clock time
      // (6000 * 50ms = 300s) is comfortably past any real Trace + dialogue
      // auto-timeouts.
      for (let i = 0; i < 6000; i++) {
        scene.update(50)
      }
    }).not.toThrow()

    const root = context.layers.content.children[0] as Container
    ;(root as unknown as { emit: (event: string) => void }).emit('pointertap')
    expect(pop).toHaveBeenCalled()
  })

  it('a tap during a Dialogue pause dismisses it without throwing, and playback continues to finish', async () => {
    const scene = new MainQuestBattleScene()
    const { context, pop } = createSceneContext()
    const { campaign, attemptId } = await resolvedAttemptFixture(
      'mqbs-dialogue-001',
      true,
    )
    const input: MainQuestBattleSceneInput = {
      attemptId,
      returnTarget: { sceneId: 'mainQuest' },
    }

    scene.mount(context, input)
    scene.setCampaign(campaign, {
      selectedPartyId: null,
      selectedQuestId: null,
      openCharacterId: null,
      modalOpen: false,
    })

    const root = context.layers.content.children[0] as Container
    expect(() => {
      for (let i = 0; i < 30; i++) {
        scene.update(50)
        ;(root as unknown as { emit: (event: string) => void }).emit(
          'pointertap',
        )
      }
      for (let i = 0; i < 6000; i++) {
        scene.update(50)
      }
      ;(root as unknown as { emit: (event: string) => void }).emit('pointertap')
    }).not.toThrow()
    expect(pop).toHaveBeenCalled()
  })

  it('unmount removes the scene root and cleans up', async () => {
    const scene = new MainQuestBattleScene()
    const { context } = createSceneContext()
    const { campaign, attemptId } = await resolvedAttemptFixture(
      'mqbs-unmount-001',
      false,
    )
    const input: MainQuestBattleSceneInput = {
      attemptId,
      returnTarget: { sceneId: 'mainQuest' },
    }

    scene.mount(context, input)
    scene.setCampaign(campaign, {
      selectedPartyId: null,
      selectedQuestId: null,
      openCharacterId: null,
      modalOpen: false,
    })
    scene.unmount()

    expect(context.layers.content.children.length).toBe(0)
  })

  it('returns immediately (no content mounted) when the attemptId does not resolve to a viewModel', () => {
    const scene = new MainQuestBattleScene()
    const { context, pop } = createSceneContext()
    const campaign = createTavernCampaign('mqbs-missing-001')
    const input: MainQuestBattleSceneInput = {
      attemptId: 'not-a-real-attempt',
      returnTarget: { sceneId: 'mainQuest' },
    }

    scene.mount(context, input)
    scene.setCampaign(campaign, {
      selectedPartyId: null,
      selectedQuestId: null,
      openCharacterId: null,
      modalOpen: false,
    })

    expect(pop).toHaveBeenCalled()
  })

  it('never mutates the Campaign it is given (Battle Playback has zero Campaign mutation)', async () => {
    const scene = new MainQuestBattleScene()
    const { context } = createSceneContext()
    const { campaign, attemptId } = await resolvedAttemptFixture(
      'mqbs-immutable-001',
      true,
    )
    const before = JSON.parse(JSON.stringify(campaign))
    const input: MainQuestBattleSceneInput = {
      attemptId,
      returnTarget: { sceneId: 'mainQuest' },
    }

    scene.mount(context, input)
    scene.setCampaign(campaign, {
      selectedPartyId: null,
      selectedQuestId: null,
      openCharacterId: null,
      modalOpen: false,
    })
    for (let i = 0; i < 500; i++) {
      scene.update(50)
    }

    expect(JSON.parse(JSON.stringify(campaign))).toEqual(before)
  })
})

describe('Phase 9.8.1 pickSilhouette', () => {
  it('gives every real Unique Monster a distinct shape+color combination (never a shared generic silhouette)', () => {
    const combos = MAIN_QUEST_THREAT_DEFINITIONS.map((d) => {
      const { shape, color } = pickSilhouette(
        d.uniqueMonster.visualProfile.assetKey,
      )
      return `${shape}:${color.toString(16)}`
    })
    expect(new Set(combos).size).toBe(combos.length)
  })

  it('is a pure, deterministic function of assetKey', () => {
    for (const definition of MAIN_QUEST_THREAT_DEFINITIONS) {
      const key = definition.uniqueMonster.visualProfile.assetKey
      expect(pickSilhouette(key)).toEqual(pickSilhouette(key))
    }
  })
})
