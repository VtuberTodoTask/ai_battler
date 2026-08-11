// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'

class FakeResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

globalThis.ResizeObserver =
  FakeResizeObserver as unknown as typeof ResizeObserver

vi.mock('pixi.js', () => {
  class FakeObservablePoint {
    set() {}
  }

  class FakeTicker {
    callbacks: Array<(ticker: { deltaMS: number }) => void> = []
    add(cb: (ticker: { deltaMS: number }) => void): this {
      this.callbacks.push(cb)
      return this
    }
    remove(cb: (ticker: { deltaMS: number }) => void): this {
      const i = this.callbacks.indexOf(cb)
      if (i >= 0) this.callbacks.splice(i, 1)
      return this
    }
    get deltaMS(): number {
      return 16
    }
  }

  class FakeRenderer {
    events = { features: {} }
    _onResize: (() => void) | null = null
    on = vi.fn((event: string, cb: () => void) => {
      if (event === 'resize') this._onResize = cb
    })
    off = vi.fn((event: string, cb: () => void) => {
      if (event === 'resize' && this._onResize === cb) this._onResize = null
    })
    resize = vi.fn()
  }

  class FakeContainer {
    children: FakeContainer[] = []
    parent: FakeContainer | null = null
    destroyed = false
    visible = true
    eventMode: string | 'static' | 'passive' = 'passive'
    hitArea: unknown = null
    mask: FakeContainer | null = null
    alpha = 1
    x = 0
    y = 0
    scale = { set: vi.fn() }
    position = { set: vi.fn() }
    anchor = { set: vi.fn() }
    addChild(child: FakeContainer): FakeContainer {
      child.parent = this
      this.children.push(child)
      return child
    }
    removeChild(child: FakeContainer): FakeContainer {
      const i = this.children.indexOf(child)
      if (i >= 0) this.children.splice(i, 1)
      child.parent = null
      return child
    }
    removeChildren(): FakeContainer[] {
      const removed = this.children.slice()
      this.children.length = 0
      for (const c of removed) c.parent = null
      return removed
    }
    destroy(options?: { children?: boolean }): void {
      if (this.destroyed) return
      if (options?.children) {
        for (const child of [...this.children]) child.destroy?.(options)
      }
      this.removeChildren()
      this.destroyed = true
    }
    on = vi.fn()
    off = vi.fn()
    emit = vi.fn()
    width = 0
    height = 0
  }

  class FakeGraphics extends FakeContainer {
    rect(): this {
      return this
    }
    roundRect(): this {
      return this
    }
    fill(): this {
      return this
    }
    stroke(): this {
      return this
    }
    clear(): this {
      return this
    }
  }

  class FakeText extends FakeContainer {
    text = ''
    style: unknown = {}
    width = 0
    height = 0
    anchor = { set: vi.fn() }
    constructor(options?: { text?: string; style?: unknown }) {
      super()
      this.text = options?.text ?? ''
      this.style = options?.style ?? {}
    }
  }

  class FakeTexture {
    static WHITE = new FakeTexture()
  }

  class FakeRectangle {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
  }

  class FakeApplication {
    canvas = document.createElement('canvas')
    stage = new FakeContainer()
    renderer = new FakeRenderer()
    ticker = new FakeTicker()
    screen = { width: 1024, height: 768 }
    destroyed = false
    init = vi.fn().mockResolvedValue(undefined)
    destroy = vi.fn(
      (_rendererOpts?: unknown, opts?: { children?: boolean }) => {
        this.destroyed = true
        this.canvas.remove()
        this.stage.destroy(opts)
        this.ticker.callbacks = []
      },
    )
  }

  const FakeAssets = {
    init: vi.fn().mockResolvedValue(undefined),
    loadBundle: vi.fn().mockResolvedValue({}),
  }

  class FakeFederatedPointerEvent {}
  class FakeFederatedWheelEvent {
    deltaY = 0
  }

  return {
    Application: FakeApplication,
    Container: FakeContainer,
    Graphics: FakeGraphics,
    Text: FakeText,
    Texture: FakeTexture,
    Assets: FakeAssets,
    Ticker: FakeTicker,
    Rectangle: FakeRectangle,
    ObservablePoint: FakeObservablePoint,
    FederatedPointerEvent: FakeFederatedPointerEvent,
    FederatedWheelEvent: FakeFederatedWheelEvent,
  }
})

describe('CanvasGame lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('appends the Pixi canvas to the host element on init', async () => {
    const { CanvasGame } = await import('../CanvasGame.ts')
    const cg = new CanvasGame()
    const host = document.createElement('div')

    await cg.init(host)

    expect(host.querySelector('canvas')).toBeTruthy()
    cg.destroy()
  })

  it('does not append more than one canvas when init is called twice', async () => {
    const { CanvasGame } = await import('../CanvasGame.ts')
    const cg = new CanvasGame()
    const host = document.createElement('div')

    await cg.init(host)
    await cg.init(host)

    expect(host.querySelectorAll('canvas').length).toBe(1)
    cg.destroy()
  })

  it('removes the canvas and cleans up on destroy', async () => {
    const { CanvasGame } = await import('../CanvasGame.ts')
    const cg = new CanvasGame()
    const host = document.createElement('div')

    await cg.init(host)
    const app = cg.app as unknown as {
      destroy: ReturnType<typeof vi.fn>
      ticker: { callbacks: unknown[] }
    }
    cg.destroy()

    expect(host.querySelector('canvas')).toBeNull()
    expect(app.destroy).toHaveBeenCalledWith(
      { removeView: true },
      { children: true },
    )
    expect(app.ticker.callbacks.length).toBe(0)
  })

  it('cancels init when destroy is called before init completes', async () => {
    const { CanvasGame } = await import('../CanvasGame.ts')
    const cg = new CanvasGame()
    const host = document.createElement('div')

    const initPromise = cg.init(host)
    cg.destroy()
    await initPromise

    expect(host.querySelector('canvas')).toBeNull()
    expect(cg.app).toBeNull()
  })

  it('wires the Pixi ticker to GameSceneManager.update', async () => {
    const { CanvasGame } = await import('../CanvasGame.ts')
    const cg = new CanvasGame()
    const host = document.createElement('div')

    await cg.init(host)
    const app = cg.app as unknown as {
      ticker: { callbacks: Array<(t: { deltaMS: number }) => void> }
    }

    expect(app.ticker.callbacks.length).toBe(1)

    app.ticker.callbacks[0]!({ deltaMS: 1300 })

    expect(cg.sceneManager?.current?.id).toBe('foundation')
    cg.destroy()
  })

  it('feeds campaign state to a scene mounted after setCampaign', async () => {
    const { CanvasGame } = await import('../CanvasGame.ts')
    const cg = new CanvasGame()
    const host = document.createElement('div')
    const campaign = createTavernCampaign('canvas-game-campaign-001')

    await cg.init(host)
    cg.setCampaign(campaign)
    cg.sceneManager?.show('foundation')

    const foundation = cg.sceneManager?.current
    expect(foundation?.id).toBe('foundation')

    const dayLabel = (foundation as unknown as { _dayLabel?: { text: string } })
      ._dayLabel
    expect(dayLabel?.text).toBe(`DAY ${campaign.dayNumber}`)

    cg.destroy()
  })
})
