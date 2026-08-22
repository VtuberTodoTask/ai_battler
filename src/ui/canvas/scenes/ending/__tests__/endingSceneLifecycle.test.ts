// @vitest-environment jsdom
import { Container } from 'pixi.js'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GameAssetManager } from '../../../assets/GameAssetManager.ts'
import { GameViewport } from '../../../GameViewport.ts'
import { OverlayManager } from '../../../overlays/OverlayManager.ts'
import { GameButton } from '../../../components/GameButton.ts'
import { GameLabel } from '../../../components/GameLabel.ts'
import { DEFAULT_GAME_THEME } from '../../../theme/gameTheme.ts'
import { type GameSceneContext, type GameUiActions } from '../../../types.ts'
import { EndingScene } from '../EndingScene.ts'
import type { EndingSceneInput } from '../../../viewModel/endingViewModel.ts'
import {
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../../../core/tavern/campaign/campaign.ts'
import { dispatchMainQuest } from '../../../../../core/mainQuest/dispatch.ts'
import { generateMainQuestNarrative } from '../../../../../core/mainQuest/narrative.ts'
import {
  applyMainQuestNarrative,
  startMainQuestPresentation,
} from '../../../../../core/mainQuest/presentation.ts'
import {
  MAIN_QUEST_THREAT_DEFINITION_MAP,
  NATIONAL_THREAT_IDS,
} from '../../../../../core/mainQuest/threats.ts'
import { completeMainQuestPresentationForCampaign } from '../../../../../core/ending/transition.ts'
import { generateEndingNarrative } from '../../../../../core/ending/narrative.ts'
import {
  applyEndingNarrative,
  completeEndingPresentation,
  startEndingPresentation,
} from '../../../../../core/ending/presentation.ts'
import { TAVERN_ECONOMY_CONFIG } from '../../../../../core/economy/economyConfig.ts'
import type { NarrativeProvider } from '../../../../../ai/narrative/types.ts'
import type { TavernCampaignState } from '../../../../../core/tavern/campaign/types.ts'

;(TAVERN_ECONOMY_CONFIG as { initialFunds: number }).initialFunds = 100000

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

// Pixi's bounds/layout calculations (e.g. `Container.height` used by
// `GameModal.open()` to position a footer) need a working Canvas2D text
// metrics path — without this, `footer.height` throws inside jsdom, which
// (since it happens inside an unawaited `.then()` chain) fails silently and
// leaves the footer never attached. Mirrors
// `mainQuestBattleSceneLifecycle.test.ts`'s setup exactly.
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

function fakeProvider(text: string): NarrativeProvider {
  return {
    id: 'fake-ending-scene-lifecycle',
    async generate() {
      return { text }
    },
  }
}

const FAKE_MAIN_QUEST_TEXT = `===PRE-BATTLE===
出発前の物語。

===POST-BATTLE===
戦いの後の物語。`

const FAKE_ENDING_TEXT = `===AFTERMATH===
戦いの直後の物語。

===TAVERN_RETURN===
酒場へ戻ってからの物語。

===CLOSING===
締めくくりの短い場面。`

function withAllNationalThreatsDefeated(
  campaign: TavernCampaignState,
): TavernCampaignState {
  const next = { ...campaign, mainQuest: { ...campaign.mainQuest } }
  next.mainQuest.threats = { ...next.mainQuest.threats }
  for (const id of NATIONAL_THREAT_IDS) {
    next.mainQuest.threats[id] = {
      ...next.mainQuest.threats[id],
      status: 'defeated',
      defeatedDay: 1,
      defeatedByPartyId: 'placeholder-party',
    }
  }
  next.mainQuest.threats.nosferatu = {
    ...next.mainQuest.threats.nosferatu,
    status: 'available',
  }
  return next
}

/** Real Nosferatu dispatch/Simulation/Narrative/Presentation on a Campaign
 * whose 7 national Threats are placeholder-defeated (this file is testing
 * Scene rendering/transitions, not Save causality, so the cheaper Core-smoke
 * placeholder fixture is appropriate here — see `phase9-9.test.ts`). Leaves
 * `ending.status === 'narrative_pending'` with Facts attached. Retries
 * seeds until the Simulation actually favors the Party. */
async function narrativePendingCampaign(
  seedPrefix: string,
): Promise<TavernCampaignState> {
  for (let s = 0; s < 60; s++) {
    const campaign = withAllNationalThreatsDefeated(
      createTavernCampaign(`${seedPrefix}-${s}`),
    )
    const definition = MAIN_QUEST_THREAT_DEFINITION_MAP.nosferatu
    const party = campaign.parties[0]
    party.party.rank = definition.requiredPartyRank
    party.relationship.affinity = definition.requiredAffinity
    campaign.currentDay.parties = campaign.currentDay.parties.map((p) =>
      p.id === party.id
        ? { ...p, party: { ...p.party, rank: definition.requiredPartyRank } }
        : p,
    )
    const dispatch = dispatchMainQuest(campaign, 'nosferatu', party.id)
    if (!dispatch.ok || !dispatch.attemptId) {
      throw new Error('test setup: dispatch failed')
    }
    const resolved = resolveCampaignDay(dispatch.campaign)
    const attempt = resolved.mainQuest.attempts.find(
      (a) => a.id === dispatch.attemptId,
    )!
    if (!attempt.result!.monsterDefeated) continue

    const campaignParty = resolved.parties.find(
      (p) => p.id === attempt.partyId,
    )!
    const { script } = await generateMainQuestNarrative(
      definition,
      attempt,
      campaignParty,
      fakeProvider(FAKE_MAIN_QUEST_TEXT),
    )
    let next = applyMainQuestNarrative(resolved, dispatch.attemptId, script)
    next = startMainQuestPresentation(next, dispatch.attemptId)
    next = completeMainQuestPresentationForCampaign(next, dispatch.attemptId)
    return next
  }
  throw new Error('no Nosferatu victory found within 60 seeds')
}

async function readyCampaign(seedPrefix: string): Promise<TavernCampaignState> {
  const pending = await narrativePendingCampaign(seedPrefix)
  const finalCampaignParty = pending.parties.find(
    (p) => p.id === pending.ending.facts!.finalParty.partyId,
  )!
  const { script } = await generateEndingNarrative(
    pending.ending.facts!,
    finalCampaignParty,
    fakeProvider(FAKE_ENDING_TEXT),
  )
  return applyEndingNarrative(pending, script)
}

async function completedCampaign(
  seedPrefix: string,
): Promise<TavernCampaignState> {
  const ready = await readyCampaign(seedPrefix)
  const viewing = startEndingPresentation(ready)
  return completeEndingPresentation(viewing)
}

function createSceneContext(): {
  context: GameSceneContext
  push: ReturnType<typeof vi.fn>
  actions: {
    generateEndingNarrative: ReturnType<typeof vi.fn>
    startEndingPresentation: ReturnType<typeof vi.fn>
    completeEndingPresentation: ReturnType<typeof vi.fn>
    returnToTitle: ReturnType<typeof vi.fn>
    openSettings: ReturnType<typeof vi.fn>
  }
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

  const push = vi.fn()
  const canvasGame = {
    setUiState: vi.fn(),
    sceneManager: { push, pop: vi.fn() },
  } as unknown as GameSceneContext['canvasGame']

  const actions = {
    generateEndingNarrative: vi.fn().mockResolvedValue({ ok: true }),
    startEndingPresentation: vi.fn().mockReturnValue({ ok: true }),
    completeEndingPresentation: vi.fn().mockReturnValue({ ok: true }),
    returnToTitle: vi.fn(),
    openSettings: vi.fn(),
  }

  const context: GameSceneContext = {
    id: 'ending-lifecycle',
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
    actions: actions as unknown as GameUiActions,
    canvasGame,
  }

  return { context, push, actions }
}

function uiState() {
  return {
    selectedPartyId: null,
    selectedQuestId: null,
    openCharacterId: null,
    modalOpen: false,
  }
}

/**
 * Finds a `GameButton` at any depth under `root` and fires its `pointertap`
 * — every Pixi `Container` has an `emit` method (from `EventEmitter`), so
 * only `GameButton` itself (which listens for `pointertap` and invokes
 * `onActivate`) can be used to identify the right node; a shallow "has
 * `.emit`" check would match any Container.
 *
 * When `label` is omitted, the first `GameButton` found (depth-first) is
 * used — fine when only one button is on screen. When a modal footer holds
 * several buttons (and `GameModal` itself prepends its own close button
 * ahead of the footer), pass the button's own label text to disambiguate,
 * found by inspecting its `GameLabel` child's `.text`.
 */
function findButton(root: Container, label?: string): GameButton {
  if (
    root instanceof GameButton &&
    (label === undefined || buttonLabelText(root) === label)
  ) {
    return root
  }
  for (const child of root.children) {
    if (child instanceof Container) {
      try {
        return findButton(child, label)
      } catch {
        // keep searching siblings
      }
    }
  }
  throw new Error(
    `test setup: no GameButton found${label ? ` with label "${label}"` : ''}`,
  )
}

function buttonLabelText(button: GameButton): string | undefined {
  const labelChild = button.children.find(
    (c): c is GameLabel => c instanceof GameLabel,
  )
  return labelChild?.text
}

function tapButton(root: Container, label?: string): void {
  const button = findButton(root, label) as unknown as {
    emit: (event: string) => void
  }
  button.emit('pointertap')
}

describe('EndingScene lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('narrative_pending: mount + setCampaign requests narrative generation exactly once and shows the waiting label', async () => {
    const scene = new EndingScene()
    const { context, actions } = createSceneContext()
    const campaign = await narrativePendingCampaign('ending-scene-pending-001')

    scene.mount(context)
    scene.setCampaign(campaign, uiState())

    expect(actions.generateEndingNarrative).toHaveBeenCalledTimes(1)
    expect(context.layers.ui.children.length).toBeGreaterThan(0)

    // A second sync with the same still-pending Campaign must not fire a
    // second, duplicate generation request (item 46).
    scene.setCampaign(campaign, uiState())
    expect(actions.generateEndingNarrative).toHaveBeenCalledTimes(1)
  })

  it('narrative_pending: a generation failure opens a retry/AI-settings modal, and retry re-requests generation', async () => {
    const scene = new EndingScene()
    const { context, actions } = createSceneContext()
    actions.generateEndingNarrative.mockResolvedValue({
      ok: false,
      message: 'AI生成に失敗しました',
    })
    const campaign = await narrativePendingCampaign('ending-scene-pending-002')
    const openModalSpy = vi.spyOn(context.overlayManager, 'openModal')

    scene.mount(context)
    scene.setCampaign(campaign, uiState())
    // Let the mocked async generateEndingNarrative's rejection settle.
    await Promise.resolve()
    await Promise.resolve()

    expect(openModalSpy).toHaveBeenCalled()

    actions.generateEndingNarrative.mockResolvedValue({ ok: true })
    // The modal is a persistent child of the modal layer (see
    // `OverlayManager`'s constructor) and also owns its own close button
    // ahead of the footer — disambiguate by label to reach the real retry
    // button rather than the modal's close ("x") button.
    tapButton(context.layers.modal.children.at(-1) as Container, '再試行')

    expect(actions.generateEndingNarrative).toHaveBeenCalledTimes(2)
  })

  it('ready: tapping the button starts the Presentation and pushes SoundNovelScene at the aftermath step', async () => {
    const scene = new EndingScene()
    const { context, actions, push } = createSceneContext()
    const campaign = await readyCampaign('ending-scene-ready-001')

    scene.mount(context)
    scene.setCampaign(campaign, uiState())

    const root = context.layers.ui.children[0] as Container
    tapButton(root)

    expect(actions.startEndingPresentation).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledTimes(1)
    const [sceneId, input] = push.mock.calls[0] as [string, EndingSceneInput]
    expect(sceneId).toBe('soundNovel')
    expect((input as unknown as { narrativeId: string }).narrativeId).toBe(
      'ending:aftermath',
    )
    expect((input as unknown as { text: string }).text).toBe(
      campaign.ending.narrative!.aftermath,
    )
  })

  it('advances aftermath -> tavernReturn -> closing -> completeEndingPresentation on successive re-mounts (simulating SoundNovelScene pop-backs)', async () => {
    const scene = new EndingScene()
    const { context, actions, push } = createSceneContext()
    const campaign = await readyCampaign('ending-scene-advance-001')

    // First mount establishes the Campaign; subsequent mounts simulate
    // `GameSceneManager.pop()` re-mounting EndingScene with a mutated
    // `presentationStep` on the SAME input object, exactly as
    // `beginPresentation`/`advancePresentation` set it in place.
    const input: EndingSceneInput = {}
    scene.mount(context, input)
    scene.setCampaign(campaign, uiState())

    input.presentationStep = 'aftermath'
    scene.mount(context, input)
    expect(push).toHaveBeenLastCalledWith(
      'soundNovel',
      expect.objectContaining({ narrativeId: 'ending:tavernReturn' }),
    )
    expect(input.presentationStep).toBe('tavernReturn')

    scene.mount(context, input)
    expect(push).toHaveBeenLastCalledWith(
      'soundNovel',
      expect.objectContaining({ narrativeId: 'ending:closing' }),
    )
    expect(input.presentationStep).toBe('closing')

    scene.mount(context, input)
    expect(actions.completeEndingPresentation).toHaveBeenCalledTimes(1)
    expect(input.presentationStep).toBeUndefined()
  })

  it('completed: renders the GAME CLEAR panel from Facts, and the title button calls actions.returnToTitle', async () => {
    const scene = new EndingScene()
    const { context, actions } = createSceneContext()
    const campaign = await completedCampaign('ending-scene-completed-001x')

    scene.mount(context)
    scene.setCampaign(campaign, uiState())

    const root = context.layers.ui.children[0] as Container
    // renderGameClear adds [panel, titleButton] as direct children of root.
    expect(root.children.length).toBe(2)
    tapButton(root)

    expect(actions.returnToTitle).toHaveBeenCalledTimes(1)
    // GAME CLEAR must never trigger AI generation.
    expect(actions.generateEndingNarrative).not.toHaveBeenCalled()
  })

  it('unmount removes the scene root', async () => {
    const scene = new EndingScene()
    const { context } = createSceneContext()
    const campaign = await narrativePendingCampaign('ending-scene-unmount-001')

    scene.mount(context)
    scene.setCampaign(campaign, uiState())
    expect(context.layers.ui.children.length).toBeGreaterThan(0)

    scene.unmount()
    expect(context.layers.ui.children.length).toBe(0)
  })
})
