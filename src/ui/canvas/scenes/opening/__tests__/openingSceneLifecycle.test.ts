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
import { OpeningScene, type OpeningSceneInput } from '../OpeningScene.ts'
import { OPENING_SCRIPT } from '../../../../../data/opening.ts'

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
  push: ReturnType<typeof vi.fn>
  show: ReturnType<typeof vi.fn>
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
  const show = vi.fn()
  const canvasGame = {
    setUiState: vi.fn(),
    sceneManager: { push, show, pop: vi.fn() },
  } as unknown as GameSceneContext['canvasGame']

  const context: GameSceneContext = {
    id: 'opening-lifecycle',
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

  return { context, push, show }
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

function tapButton(root: Container, label?: string): void {
  const button = findButton(root, label) as unknown as {
    emit: (event: string) => void
  }
  button.emit('pointertap')
}

describe('OpeningScene lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fresh mount renders a 始める/スキップ choice and never touches Campaign-mutating actions', () => {
    const scene = new OpeningScene()
    const { context } = createSceneContext()

    scene.mount(context)

    expect(context.layers.ui.children.length).toBeGreaterThan(0)
    const root = context.layers.ui.children[0] as Container
    expect(() => findButton(root, '始める')).not.toThrow()
    expect(() => findButton(root, 'スキップ')).not.toThrow()
  })

  it('始める pushes SoundNovelScene with the hand-authored OPENING_SCRIPT and mutates the input in place', () => {
    const scene = new OpeningScene()
    const { context, push } = createSceneContext()
    const input: OpeningSceneInput = { started: false }

    scene.mount(context, input)
    const root = context.layers.ui.children[0] as Container
    tapButton(root, '始める')

    expect(push).toHaveBeenCalledTimes(1)
    const [sceneId, soundNovelInput] = push.mock.calls[0] as [
      string,
      { source: string; text: string; returnTarget: { sceneId: string } },
    ]
    expect(sceneId).toBe('soundNovel')
    expect(soundNovelInput.source).toBe('opening')
    expect(soundNovelInput.text).toBe(OPENING_SCRIPT)
    expect(soundNovelInput.returnTarget).toEqual({ sceneId: 'opening' })
    expect(input.started).toBe(true)
  })

  it('re-mounting with started:true (simulating SoundNovelScene popping back) transitions straight to the Tavern', () => {
    const scene = new OpeningScene()
    const { context, show } = createSceneContext()
    const input: OpeningSceneInput = { started: true }

    scene.mount(context, input)

    expect(show).toHaveBeenCalledWith('tavern')
    // Nothing is rendered for this re-mount — Opening has nothing left to
    // show once the script has been read (or bailed out of).
    expect(context.layers.ui.children.length).toBe(0)
  })

  it('スキップ transitions straight to the Tavern without ever pushing SoundNovelScene', () => {
    const scene = new OpeningScene()
    const { context, push, show } = createSceneContext()

    scene.mount(context)
    const root = context.layers.ui.children[0] as Container
    tapButton(root, 'スキップ')

    expect(show).toHaveBeenCalledWith('tavern')
    expect(push).not.toHaveBeenCalled()
  })

  it('unmount removes the scene root', () => {
    const scene = new OpeningScene()
    const { context } = createSceneContext()

    scene.mount(context)
    expect(context.layers.ui.children.length).toBeGreaterThan(0)

    scene.unmount()
    expect(context.layers.ui.children.length).toBe(0)
  })
})
