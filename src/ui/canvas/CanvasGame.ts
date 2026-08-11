import { Application, Container, Ticker } from 'pixi.js'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'
import { GameAssetManager } from './assets/GameAssetManager.ts'
import { DEFAULT_GAME_THEME, type GameUiTheme } from './theme/gameTheme.ts'
import { GameViewport, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from './GameViewport.ts'
import { OverlayManager } from './overlays/OverlayManager.ts'
import { BootScene } from './scenes/BootScene.ts'
import { FoundationDemoScene } from './scenes/FoundationDemoScene.ts'
import { TavernScene } from './scenes/tavern/TavernScene.ts'
import { GameSceneManager } from './scenes/GameSceneManager.ts'
import {
  DEFAULT_GAME_UI_STATE,
  type GameLayers,
  type GameSceneContext,
  type GameUiActions,
  type GameUiState,
} from './types.ts'

export class CanvasGame {
  private _app: Application | null = null
  private _viewportRoot: Container | null = null
  private _viewport: GameViewport = new GameViewport()
  private _layers: GameLayers | null = null
  private _overlayManager: OverlayManager | null = null
  private _sceneManager: GameSceneManager | null = null
  private _theme: GameUiTheme = DEFAULT_GAME_THEME
  private _assetManager = new GameAssetManager()
  private _resizeObserver: ResizeObserver | null = null
  private _host: HTMLElement | null = null
  private _uiState: GameUiState = { ...DEFAULT_GAME_UI_STATE }
  private _currentCampaign: TavernCampaignState | null = null
  private _destroyRequested = false
  private _initializing = false

  actions: GameUiActions | null = null

  get sceneManager(): GameSceneManager | null {
    return this._sceneManager
  }

  get viewport(): GameViewport {
    return this._viewport
  }

  get app(): Application | null {
    return this._app
  }

  async init(host: HTMLElement): Promise<void> {
    if (this._app || this._initializing) return

    this._initializing = true
    this._destroyRequested = false
    this._host = host

    const app = new Application()

    try {
      await app.init({
        resizeTo: host,
        background: this._theme.colors.background,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
        preference: ['webgl', 'webgpu', 'canvas'],
      })
    } catch (err) {
      this._initializing = false
      this._host = null
      throw err
    }

    if (this._destroyRequested) {
      app.destroy({ removeView: true }, { children: true })
      this._initializing = false
      return
    }

    if (!host.contains(app.canvas)) {
      host.appendChild(app.canvas)
    }

    if (app.renderer.events.features) {
      app.renderer.events.features.wheel = true
    }

    this._app = app
    this._viewportRoot = new Container()
    app.stage.addChild(this._viewportRoot)

    this._layers = this.createLayers(this._viewportRoot)

    this._overlayManager = new OverlayManager(
      this._layers.overlay,
      this._layers.modal,
      this._theme,
    )

    const context = this.createSceneContext(app, this._layers)
    this._sceneManager = new GameSceneManager(context, {
      onMount: (scene) => {
        if (this._currentCampaign) {
          scene.setCampaign?.(this._currentCampaign, { ...this._uiState })
        }
      },
    })
    this._sceneManager.register(new BootScene('tavern'))
    this._sceneManager.register(new FoundationDemoScene())
    this._sceneManager.register(new TavernScene())

    app.ticker.add(this.handleTick)

    this._sceneManager.show('boot')

    app.renderer.on('resize', this.handleRendererResize)
    this._resizeObserver = new ResizeObserver(() => this.updateViewport())
    this._resizeObserver.observe(host)

    this.updateViewport()

    this._initializing = false
  }

  destroy(): void {
    this._destroyRequested = true

    if (this._initializing && !this._app) {
      return
    }

    this._resizeObserver?.disconnect()
    this._resizeObserver = null

    this._app?.renderer.off('resize', this.handleRendererResize)
    this._app?.ticker.remove(this.handleTick)

    this._sceneManager?.unmountCurrent()

    if (this._app) {
      this._app.destroy({ removeView: true }, { children: true })
      this._app = null
    }

    this._viewportRoot = null
    this._layers = null
    this._overlayManager = null
    this._sceneManager = null
    this._host = null
  }

  setCampaign(campaign: TavernCampaignState): void {
    this._currentCampaign = campaign
    const current = this._sceneManager?.current
    current?.setCampaign?.(campaign, { ...this._uiState })
  }

  setUiState(partial: Partial<GameUiState>): void {
    this._uiState = { ...this._uiState, ...partial }
    const current = this._sceneManager?.current
    current?.setUiState?.({ ...this._uiState })
  }

  private handleRendererResize = (): void => {
    this.updateViewport()
  }

  private handleTick = (ticker: Ticker): void => {
    this._sceneManager?.update(ticker.deltaMS)
  }

  private updateViewport(): void {
    if (!this._app || !this._viewportRoot) return

    const availableWidth = this._app.screen.width
    const availableHeight = this._app.screen.height

    this._viewport.resize(availableWidth, availableHeight)
    const metrics = this._viewport.metrics

    this._viewportRoot.scale.set(metrics.scale)
    this._viewportRoot.position.set(metrics.offsetX, metrics.offsetY)

    this._overlayManager?.resize(VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
  }

  private createLayers(root: Container): GameLayers {
    const background = new Container()
    const content = new Container()
    const ui = new Container()
    const overlay = new Container()
    const modal = new Container()
    const transition = new Container()
    const debug = new Container()

    root.addChild(background)
    root.addChild(content)
    root.addChild(ui)
    root.addChild(overlay)
    root.addChild(modal)
    root.addChild(transition)
    root.addChild(debug)

    return {
      background,
      content,
      ui,
      overlay,
      modal,
      transition,
      debug,
    }
  }

  private createSceneContext(
    app: Application,
    layers: GameLayers,
  ): GameSceneContext {
    return {
      id: 'foundation-demo',
      app,
      viewport: this._viewport,
      layers,
      overlayManager: this._overlayManager!,
      theme: this._theme,
      assetManager: this._assetManager,
      actions: this.actions ?? this.createNoopActions(),
      canvasGame: this,
    }
  }

  private createNoopActions(): GameUiActions {
    return {
      advanceDay: () => ({ ok: true }),
      resolveDay: () => ({ ok: true }),
      offerRequest: () => ({ ok: true, data: { decision: 'accepted' } }),
      selectParty: () => {},
      selectQuest: () => {},
      openCharacter: () => {},
      openActivity: () => Promise.resolve({ ok: true, data: '' }),
      openExpeditionNarrative: () =>
        Promise.resolve({ ok: false, message: 'AI provider not connected' }),
      openSettings: () => {},
      closeModal: () => {},
      switchToLegacy: () => {},
    }
  }
}
