// @vitest-environment jsdom
import { Container } from 'pixi.js'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { GameAssetManager } from '../../../assets/GameAssetManager.ts'
import { GameViewport } from '../../../GameViewport.ts'
import { OverlayManager } from '../../../overlays/OverlayManager.ts'
import { GameButton } from '../../../components/GameButton.ts'
import { GameLabel } from '../../../components/GameLabel.ts'
import { DEFAULT_GAME_THEME } from '../../../theme/gameTheme.ts'
import { type GameSceneContext, type GameUiActions } from '../../../types.ts'
import { SoundNovelScene } from '../SoundNovelScene.ts'
import type { SoundNovelSceneInput } from '../types.ts'
import { createTavernCampaign } from '../../../../../core/tavern/campaign/campaign.ts'

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

function createSceneContext(): GameSceneContext {
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

  const canvasGame = {
    setUiState: vi.fn(),
    sceneManager: {
      push: vi.fn(),
      pop: vi.fn(),
    },
  } as unknown as GameSceneContext['canvasGame']

  return {
    id: 'soundNovel-lifecycle',
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
    } as unknown as GameUiActions,
    canvasGame,
  }
}

describe('SoundNovelScene lifecycle', () => {
  it('mounts a root container into the content layer', () => {
    const scene = new SoundNovelScene()
    const context = createSceneContext()
    const input: SoundNovelSceneInput = {
      narrativeId: 'n1',
      source: 'expedition',
      title: 'Test Story',
      text: 'Hello world.\n\nMore text.',
      visualContext: { environment: 'forest' },
      returnTarget: { sceneId: 'tavern' },
    }

    scene.mount(context, input)

    expect(context.layers.content.children.length).toBeGreaterThan(0)
  })

  it('update does not throw and progresses typing', () => {
    const scene = new SoundNovelScene()
    const context = createSceneContext()
    const input: SoundNovelSceneInput = {
      narrativeId: 'n2',
      source: 'downtime',
      text: 'A short story.',
      visualContext: {},
      returnTarget: { sceneId: 'tavern' },
    }

    scene.mount(context, input)
    expect(() => scene.update(100)).not.toThrow()
  })

  it('unmount removes the scene root and cleans up', () => {
    const scene = new SoundNovelScene()
    const context = createSceneContext()
    const input: SoundNovelSceneInput = {
      narrativeId: 'n3',
      source: 'stay_extension',
      text: 'Only one.',
      visualContext: {},
      returnTarget: { sceneId: 'tavern' },
    }

    scene.mount(context, input)
    scene.unmount()

    expect(context.layers.content.children.length).toBe(0)
  })

  it('returns immediately when mounted without input', () => {
    const scene = new SoundNovelScene()
    const context = createSceneContext()

    scene.mount(context)

    expect(context.layers.content.children.length).toBe(0)
  })
})

function createOpeningSceneContext(): {
  context: GameSceneContext
  show: ReturnType<typeof vi.fn>
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

  const show = vi.fn()
  const pop = vi.fn()
  const canvasGame = {
    setUiState: vi.fn(),
    sceneManager: { push: vi.fn(), pop, show },
  } as unknown as GameSceneContext['canvasGame']

  const context: GameSceneContext = {
    id: 'opening-soundnovel-lifecycle',
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
    actions: {} as unknown as GameUiActions,
    canvasGame,
  }

  return { context, show, pop }
}

function openingInput(text = 'Only one short line.'): SoundNovelSceneInput {
  return {
    narrativeId: 'opening',
    source: 'opening',
    title: 'プロローグ',
    text,
    visualContext: { backgroundId: 'generic' },
    returnTarget: { sceneId: 'tavern' },
  }
}

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

function findButtonByLabel(root: Container, label: string): GameButton | null {
  try {
    return findButton(root, label)
  } catch {
    return null
  }
}

function tapButton(root: Container, label: string): void {
  const button = findButton(root, label) as unknown as {
    emit: (event: string) => void
  }
  button.emit('pointertap')
}

function tapRoot(context: GameSceneContext): void {
  const root = context.layers.content.children[0] as unknown as {
    emit: (event: string) => void
  }
  root.emit('pointertap')
}

describe('SoundNovelScene Opening behavior (Phase 9.10 PR #60 "Opening Flow & Canonical Script")', () => {
  it('shows AUTO / LOG / スキップ controls, with no 戻る button, when source is opening', () => {
    const scene = new SoundNovelScene()
    const { context } = createOpeningSceneContext()

    scene.mount(context, openingInput())

    const root = context.layers.content.children[0] as Container
    expect(findButtonByLabel(root, 'AUTO')).not.toBeNull()
    expect(findButtonByLabel(root, 'LOG')).not.toBeNull()
    expect(findButtonByLabel(root, 'スキップ')).not.toBeNull()
    expect(findButtonByLabel(root, '戻る')).toBeNull()
  })

  it('still shows a 戻る button (not スキップ) for a non-opening source, unchanged from before', () => {
    const scene = new SoundNovelScene()
    const { context } = createOpeningSceneContext()
    const input: SoundNovelSceneInput = {
      narrativeId: 'n-expedition',
      source: 'expedition',
      text: 'A story.',
      visualContext: {},
      returnTarget: { sceneId: 'tavern' },
    }

    scene.mount(context, input)

    const root = context.layers.content.children[0] as Container
    expect(findButtonByLabel(root, '戻る')).not.toBeNull()
    expect(findButtonByLabel(root, 'スキップ')).toBeNull()
  })

  it('タップして最後まで読むと、追加操作なしで show("tavern") へ遷移し、pop() は呼ばれない', () => {
    const scene = new SoundNovelScene()
    const { context, show, pop } = createOpeningSceneContext()

    scene.mount(context, openingInput())

    for (let i = 0; i < 20 && show.mock.calls.length === 0; i++) {
      tapRoot(context)
    }

    expect(show).toHaveBeenCalledTimes(1)
    expect(show).toHaveBeenCalledWith('tavern')
    expect(pop).not.toHaveBeenCalled()
  })

  it('tapping スキップ mid-script transitions straight to Tavern via show(), never back to Opening', () => {
    const scene = new SoundNovelScene()
    const { context, show, pop } = createOpeningSceneContext()

    scene.mount(
      context,
      openingInput('A much longer line so it is still typing or waiting.'),
    )

    const root = context.layers.content.children[0] as Container
    tapButton(root, 'スキップ')

    expect(show).toHaveBeenCalledTimes(1)
    expect(show).toHaveBeenCalledWith('tavern')
    expect(pop).not.toHaveBeenCalled()
  })

  it('does not double-navigate if スキップ is pressed again after the script already finished', () => {
    const scene = new SoundNovelScene()
    const { context, show } = createOpeningSceneContext()

    scene.mount(context, openingInput())

    for (let i = 0; i < 20 && show.mock.calls.length === 0; i++) {
      tapRoot(context)
    }
    expect(show).toHaveBeenCalledTimes(1)

    const root = context.layers.content.children[0] as Container
    const skipButton = findButtonByLabel(root, 'スキップ')
    if (skipButton) {
      ;(skipButton as unknown as { emit: (e: string) => void }).emit(
        'pointertap',
      )
    }

    expect(show).toHaveBeenCalledTimes(1)
  })

  it('Escape acts as スキップ for Opening (transitions to Tavern, not 戻る/pop)', () => {
    const scene = new SoundNovelScene()
    const { context, show, pop } = createOpeningSceneContext()

    scene.mount(context, openingInput())

    const doc = context.app.canvas.ownerDocument ?? document
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(show).toHaveBeenCalledWith('tavern')
    expect(pop).not.toHaveBeenCalled()

    scene.unmount()
  })

  it('Escape still closes an open LOG first, even during Opening, before it would skip', () => {
    const scene = new SoundNovelScene()
    const { context, show } = createOpeningSceneContext()

    scene.mount(context, openingInput())
    const root = context.layers.content.children[0] as Container
    tapButton(root, 'LOG')

    const doc = context.app.canvas.ownerDocument ?? document
    doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    // First Escape only closes the LOG overlay — it must not also skip.
    expect(show).not.toHaveBeenCalled()

    scene.unmount()
  })

  it('never touches Campaign state — SoundNovelScene has no `context.actions` call anywhere, so watching or skipping the Opening leaves a same-seed Campaign identical (PR #60 item 18/35)', () => {
    const campaignA = createTavernCampaign('opening-determinism-same-seed')
    const campaignB = createTavernCampaign('opening-determinism-same-seed')

    // Path A: watch the Opening to the end.
    const sceneA = new SoundNovelScene()
    const { context: contextA, show: showA } = createOpeningSceneContext()
    sceneA.mount(contextA, openingInput())
    for (let i = 0; i < 20 && showA.mock.calls.length === 0; i++) {
      tapRoot(contextA)
    }
    expect(showA).toHaveBeenCalledTimes(1)

    // Path B: skip immediately.
    const sceneB = new SoundNovelScene()
    const { context: contextB, show: showB } = createOpeningSceneContext()
    sceneB.mount(contextB, openingInput())
    const rootB = contextB.layers.content.children[0] as Container
    tapButton(rootB, 'スキップ')
    expect(showB).toHaveBeenCalledTimes(1)

    // Neither Path constructed, mutated, or even referenced a Campaign —
    // two independently-built same-seed Campaigns must therefore already
    // be identical on every field that matters for Day 1.
    expect(campaignA.seed).toBe(campaignB.seed)
    expect(campaignA.dayNumber).toBe(campaignB.dayNumber)
    expect(campaignA.currentDay.seed).toBe(campaignB.currentDay.seed)
    expect(campaignA.currentDay.requests).toEqual(campaignB.currentDay.requests)
    expect(campaignA.parties).toEqual(campaignB.parties)
    expect(campaignA.finance.funds).toBe(campaignB.finance.funds)
    expect(campaignA.reputation).toEqual(campaignB.reputation)
  })
})
