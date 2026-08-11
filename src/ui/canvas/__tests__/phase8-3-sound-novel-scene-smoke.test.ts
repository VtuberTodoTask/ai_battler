// @vitest-environment jsdom
import { Container } from 'pixi.js'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../../core/tavern/brokerage.ts'
import { GameAssetManager } from '../assets/GameAssetManager.ts'
import { GameViewport } from '../GameViewport.ts'
import { OverlayManager } from '../overlays/OverlayManager.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import {
  DEFAULT_GAME_UI_STATE,
  type GameSceneContext,
  type GameUiActions,
} from '../types.ts'
import { TavernScene } from '../scenes/tavern/TavernScene.ts'
import { SoundNovelScene } from '../scenes/soundNovel/SoundNovelScene.ts'
import { SoundNovelPlayer } from '../scenes/soundNovel/SoundNovelPlayer.ts'
import { resolveSoundNovelBackground } from '../scenes/soundNovel/resolveSoundNovelBackground.ts'
import { parseSoundNovelText } from '../scenes/soundNovel/SoundNovelParser.ts'
import { paginateSoundNovelSegments } from '../scenes/soundNovel/SoundNovelPaginator.ts'

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

function createSceneContext(
  scene: TavernScene | SoundNovelScene,
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

  const sceneManager = {
    push: vi.fn(),
    pop: vi.fn(),
  }

  const canvasGame = {
    setUiState: vi.fn((partial: unknown) => {
      if ('setUiState' in scene && typeof scene.setUiState === 'function') {
        scene.setUiState({ ...DEFAULT_GAME_UI_STATE, ...(partial as object) })
      }
    }),
    sceneManager,
  } as unknown as GameSceneContext['canvasGame']

  return {
    id: 'phase8-3-smoke',
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
}

function makePlayer(text: string, maxHeight = 1000): SoundNovelPlayer {
  return new SoundNovelPlayer({
    maxWidth: 1000,
    maxHeight,
    segmentSpacing: 4,
    measureText: (t) => ({ width: t.length * 10, height: 12 + t.length * 2 }),
    timing: {
      textSpeedMs: 1,
      punctuationPauseMs: {},
      autoBaseMs: 1,
      autoPerCharMs: 0,
      autoMinMs: 1,
      autoMaxMs: 10,
      autoPageEndExtraMs: 0,
    },
  })
}

describe('Phase 8.3 SoundNovel Scene Smoke', () => {
  it('A: parser splits narrative into ordered segments', () => {
    const segments = parseSoundNovelText('A\n\nB')
    expect(segments.map((s) => s.text)).toEqual(['A', 'B'])
  })

  it('B: paginator breaks segments into pages when overflowing', () => {
    const segments = parseSoundNovelText(
      'Long first segment.\n\nLong second segment.',
    )
    const pages = paginateSoundNovelSegments(segments, {
      maxWidth: 1000,
      maxHeight: 20,
      segmentSpacing: 4,
      measureText: (t) => ({ width: t.length * 10, height: 18 + t.length }),
    })

    expect(pages.length).toBeGreaterThanOrEqual(2)
  })

  it('C: background resolver maps sources and environments', () => {
    expect(
      resolveSoundNovelBackground('expedition', { environment: 'forest' }),
    ).toBe('forest')
    expect(
      resolveSoundNovelBackground('expedition', { environment: 'ruins' }),
    ).toBe('ruins')
    expect(resolveSoundNovelBackground('downtime', {})).toBe('tavern')
    expect(resolveSoundNovelBackground('stay_extension', {})).toBe('tavern')
    expect(
      resolveSoundNovelBackground('expedition', { environment: 'unknown' }),
    ).toBe('generic')
  })

  it('D: typewriter reveals graphemes over time', () => {
    const player = makePlayer('Reveal me')
    player.start('Reveal me')
    expect(player.visibleText).toBe('')
    player.update(20)
    expect(player.visibleText.length).toBeGreaterThan(0)
  })

  it('E: click completes the typing segment', () => {
    const player = makePlayer('Click to complete')
    player.start('Click to complete')
    player.click()
    expect(player.visibleText).toBe('Click to complete')
    expect(player.state.playbackState).toBe('page_wait')
  })

  it('F: click advances to the next segment', () => {
    const player = makePlayer('First\n\nSecond')
    player.start('First\n\nSecond')
    player.click()
    player.click()
    expect(player.state.segmentIndex).toBe(1)
    expect(player.state.playbackState).toBe('typing')
  })

  it('G: page break advances to the next page', () => {
    const player = makePlayer('Only one page', 1)
    player.start('Only one page')
    player.click()
    expect(player.state.playbackState).toBe('page_wait')
    player.click()
    expect(player.state.playbackState).toBe('finished')
  })

  it('H: AUTO mode advances without manual click', () => {
    const player = makePlayer('A\n\nB')
    player.start('A\n\nB')
    player.toggleAuto()
    player.click()
    player.update(20)
    expect(player.state.segmentIndex).toBe(1)
  })

  it('I: backlog accumulates advanced segments', () => {
    const player = makePlayer('A\n\nB\n\nC')
    player.start('A\n\nB\n\nC')
    player.click()
    player.click()
    player.click()
    player.click()
    expect(player.backlog.map((e) => e.text)).toEqual(['A', 'B'])
  })

  it('J: opening LOG pauses playback', () => {
    const player = makePlayer('A')
    player.start('A')
    player.setLogOpen(true)
    player.update(100)
    expect(player.visibleText).toBe('')
  })

  it('K: SoundNovelScene mounts and unmounts cleanly', () => {
    const scene = new SoundNovelScene()
    const context = createSceneContext(scene)
    scene.mount(context, {
      narrativeId: 'n1',
      source: 'expedition',
      text: 'Lifecycle test.',
      visualContext: {},
      returnTarget: { sceneId: 'tavern' },
    })

    expect(context.layers.content.children.length).toBeGreaterThan(0)
    scene.update(16)
    scene.unmount()
    expect(context.layers.content.children.length).toBe(0)
  })

  it('L: return pops the scene manager on Escape', () => {
    const scene = new SoundNovelScene()
    const context = createSceneContext(scene)
    scene.mount(context, {
      narrativeId: 'n2',
      source: 'downtime',
      text: 'Return test.',
      visualContext: {},
      returnTarget: { sceneId: 'tavern' },
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(context.canvasGame.sceneManager!.pop).toHaveBeenCalled()
    scene.unmount()
  })

  it('M: cached expedition narrative pushes SoundNovelScene without AI call', async () => {
    const scene = new TavernScene()
    const context = createSceneContext(scene)
    let campaign = createTavernCampaign('phase8-3-cache')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests.find((r) => {
      const offered = offerRequestToParty(campaign.currentDay, r.id, party.id)
      return offered.results.some((res) => res.partyId === party.id)
    })
    if (!quest) return

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }
    const resolved = resolveCampaignDay(campaign)

    scene.mount(context)
    scene.setCampaign(resolved, { ...DEFAULT_GAME_UI_STATE })

    const state = scene as unknown as {
      _viewModel: {
        reports: {
          id: string
          narrativeTargetId?: string
          generatedText?: string
        }[]
      }
    }
    const report = state._viewModel.reports[0]!

    const scenePrivate = scene as unknown as {
      openNarrativeModal: (report: {
        id: string
        narrativeTargetId?: string
        generatedText?: string
      }) => void
    }
    scenePrivate.openNarrativeModal({
      ...report,
      generatedText: 'cached story',
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(context.actions.openExpeditionNarrative).not.toHaveBeenCalled()
    expect(context.canvasGame.sceneManager!.push).toHaveBeenCalledWith(
      'soundNovel',
      expect.objectContaining({ source: 'expedition', text: 'cached story' }),
    )
  })

  it('N: provider failure is surfaced without an exception', async () => {
    const scene = new TavernScene()
    const context = createSceneContext(scene)
    context.actions.openExpeditionNarrative = vi.fn().mockResolvedValue({
      ok: false,
      message: 'AI provider not connected',
    })

    let campaign = createTavernCampaign('phase8-3-fail')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests.find((r) => {
      const offered = offerRequestToParty(campaign.currentDay, r.id, party.id)
      return offered.results.some((res) => res.partyId === party.id)
    })
    if (!quest) return

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }
    const resolved = resolveCampaignDay(campaign)

    scene.mount(context)
    scene.setCampaign(resolved, { ...DEFAULT_GAME_UI_STATE })

    const state = scene as unknown as {
      _viewModel: { reports: { id: string; narrativeTargetId?: string }[] }
    }
    const report = state._viewModel.reports[0]!

    const scenePrivate = scene as unknown as {
      openNarrativeModal: (report: {
        id: string
        narrativeTargetId?: string
      }) => void
    }

    await expect(
      new Promise<void>((resolve) => {
        scenePrivate.openNarrativeModal(report)
        setTimeout(resolve, 0)
      }),
    ).resolves.toBeUndefined()
  })
})
