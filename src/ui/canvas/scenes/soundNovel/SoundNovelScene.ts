import { Container, Graphics, Rectangle } from 'pixi.js'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GameScrollView } from '../../components/GameScrollView.ts'
import type { GameScene, GameSceneContext } from '../../types.ts'
import { SoundNovelPlayer } from './SoundNovelPlayer.ts'
import { resolveSoundNovelBackground } from './resolveSoundNovelBackground.ts'
import { resolveSoundNovelBgm } from './resolveSoundNovelBgm.ts'
import { AudioController } from '../../audio/AudioController.ts'
import type { SoundNovelSceneInput, SoundNovelSegment } from './types.ts'

const TEXT_X = 170
const TEXT_Y = 120
const TEXT_W = 1260
const TEXT_H = 620
const SEGMENT_SPACING = 8
const CONTROL_Y = 820

const BACKGROUND_COLORS: Record<string, number> = {
  tavern: 0x2a1d13,
  forest: 0x1a2e1a,
  road: 0x2d2a1e,
  ruins: 0x25222b,
  cave: 0x1a1a1e,
  mountain: 0x22252a,
  wetland: 0x1a2a28,
  generic: 0x1a1818,
}

export class SoundNovelScene implements GameScene {
  readonly id = 'soundNovel'

  private _context: GameSceneContext | null = null
  private _root: Container | null = null
  private _backgroundLayer: Container | null = null
  private _characterBackLayer: Container | null = null
  private _characterFrontLayer: Container | null = null
  private _effectLayer: Container | null = null
  private _dimLayer: Container | null = null
  private _textLayer: Container | null = null
  private _indicatorLayer: Container | null = null
  private _controlsLayer: Container | null = null
  private _overlayLayer: Container | null = null

  private _player: SoundNovelPlayer | null = null
  private _measureLabel: GameLabel | null = null
  private _indicator: GameLabel | null = null
  private _autoButton: GameButton | null = null
  private _logButton: GameButton | null = null
  private _returnButton: GameButton | null = null
  private _backlogPanel: Container | null = null

  private _labelMap = new Map<string, GameLabel>()
  private _renderedPageId: string | null = null
  private _lastSegmentIndex = -1
  private _lastVisibleCount = -1
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null

  mount(context: GameSceneContext, input?: unknown): void {
    const sceneInput = input as SoundNovelSceneInput | undefined
    if (!sceneInput) {
      this.returnToPrevious()
      return
    }

    this._context = context
    this._root = new Container()
    this._root.eventMode = 'static'
    this._root.hitArea = new Rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
    this._root.on('pointertap', this.handleRootTap)

    context.layers.content.addChild(this._root)

    this._backgroundLayer = new Container()
    this._characterBackLayer = new Container()
    this._effectLayer = new Container()
    this._characterFrontLayer = new Container()
    this._dimLayer = new Container()
    this._textLayer = new Container()
    this._textLayer.x = TEXT_X
    this._textLayer.y = TEXT_Y
    this._indicatorLayer = new Container()
    this._controlsLayer = new Container()
    this._controlsLayer.eventMode = 'static'
    this._controlsLayer.hitArea = new Rectangle(
      0,
      CONTROL_Y,
      VIRTUAL_WIDTH,
      VIRTUAL_HEIGHT - CONTROL_Y,
    )
    this._controlsLayer.on('pointertap', (e) => e.stopPropagation())

    this._root.addChild(this._backgroundLayer)
    this._root.addChild(this._characterBackLayer)
    this._root.addChild(this._effectLayer)
    this._root.addChild(this._characterFrontLayer)
    this._root.addChild(this._dimLayer)
    this._root.addChild(this._textLayer)
    this._root.addChild(this._indicatorLayer)
    this._root.addChild(this._controlsLayer)

    this.drawBackground(
      resolveSoundNovelBackground(sceneInput.source, sceneInput.visualContext),
    )
    AudioController.playBgm(resolveSoundNovelBgm(sceneInput))
    this.drawDimLayer()
    this.createIndicator()
    this.createControls()

    this._measureLabel = new GameLabel('', context.theme, 'narration', {
      maxWidth: TEXT_W,
      breakWords: true,
    })
    this._measureLabel.visible = false
    this._textLayer.addChild(this._measureLabel)

    const measureText = (text: string): { width: number; height: number } => {
      if (!this._measureLabel) return { width: 0, height: 0 }
      this._measureLabel.text = text
      return this._measureLabel.measure()
    }

    this._player = new SoundNovelPlayer({
      maxWidth: TEXT_W,
      maxHeight: TEXT_H,
      segmentSpacing: SEGMENT_SPACING,
      measureText,
      onChange: this.handlePlayerChange,
    })

    this._player.start(sceneInput.text, sceneInput.title)

    this._keydownHandler = (e: KeyboardEvent) => this.handleKeyDown(e)
    const doc = context.app.canvas.ownerDocument ?? document
    doc.addEventListener('keydown', this._keydownHandler)
  }

  unmount(): void {
    if (this._keydownHandler) {
      const doc = this._context?.app.canvas.ownerDocument ?? document
      doc.removeEventListener('keydown', this._keydownHandler)
      this._keydownHandler = null
    }

    this._player?.close()
    this._player = null

    this._labelMap.clear()
    this._renderedPageId = null
    this._lastSegmentIndex = -1
    this._lastVisibleCount = -1

    if (this._backlogPanel) {
      this._backlogPanel.parent?.removeChild(this._backlogPanel)
      this._backlogPanel.destroy({ children: true })
      this._backlogPanel = null
    }

    if (this._root) {
      this._root.parent?.removeChild(this._root)
      this._root.destroy({ children: true })
      this._root = null
    }

    AudioController.stopBgm()
    this._context = null
  }

  update(dt: number): void {
    this._player?.update(dt)
    this.syncToPlayer()
  }

  private drawBackground(backgroundId: string): void {
    if (!this._backgroundLayer) return
    const color = BACKGROUND_COLORS[backgroundId] ?? BACKGROUND_COLORS.generic
    const bg = new Graphics()
    bg.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill({ color })
    this._backgroundLayer.addChild(bg)

    const label = new GameLabel(
      `BG: ${backgroundId}`,
      this._context!.theme,
      'caption',
    )
    label.x = 16
    label.y = VIRTUAL_HEIGHT - 28
    label.alpha = 0.4
    this._backgroundLayer.addChild(label)
  }

  private drawDimLayer(): void {
    if (!this._dimLayer || !this._context) return
    const dim = new Graphics()
    dim
      .rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
      .fill({ color: 0x000000, alpha: 0.35 })
    this._dimLayer.addChild(dim)
  }

  private createIndicator(): void {
    if (!this._indicatorLayer || !this._context) return
    this._indicator = new GameLabel('▼', this._context.theme, 'body')
    this._indicator.x = TEXT_X + TEXT_W - 40
    this._indicator.y = TEXT_Y + TEXT_H - 40
    this._indicator.visible = false
    this._indicatorLayer.addChild(this._indicator)
  }

  private createControls(): void {
    if (!this._controlsLayer || !this._context) return
    const theme = this._context.theme
    const spacing = theme.spacing.s8

    this._autoButton = new GameButton({
      width: 120,
      height: 44,
      theme,
      label: 'AUTO',
    })
    this._autoButton.onActivate = () => this._player?.toggleAuto()

    this._logButton = new GameButton({
      width: 120,
      height: 44,
      theme,
      label: 'LOG',
    })
    this._logButton.onActivate = () => this.openLog()

    this._returnButton = new GameButton({
      width: 120,
      height: 44,
      theme,
      label: '戻る',
    })
    this._returnButton.onActivate = () => this.returnToPrevious()

    const totalWidth =
      this._autoButton.width +
      this._logButton.width +
      this._returnButton.width +
      spacing * 2
    const startX = (VIRTUAL_WIDTH - totalWidth) / 2

    this._autoButton.x = startX
    this._autoButton.y = CONTROL_Y
    this._logButton.x = startX + this._autoButton.width + spacing
    this._logButton.y = CONTROL_Y
    this._returnButton.x =
      startX + this._autoButton.width + this._logButton.width + spacing * 2
    this._returnButton.y = CONTROL_Y

    this._controlsLayer.addChild(this._autoButton)
    this._controlsLayer.addChild(this._logButton)
    this._controlsLayer.addChild(this._returnButton)
  }

  private handleRootTap = (): void => {
    this._player?.click()
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      if (this._player?.logOpen) {
        this.closeLog()
      } else {
        this.returnToPrevious()
      }
      return
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      if (this._player?.logOpen) return
      e.preventDefault()
      this._player?.click()
    }
  }

  private handlePlayerChange = (): void => {
    this.syncToPlayer()
  }

  private syncToPlayer(): void {
    const player = this._player
    if (!player || !this._textLayer) return

    this._autoButton?.setLabel(player.state.autoMode ? 'AUTO:ON' : 'AUTO')

    const page = player.currentPage
    if (!page) return

    if (this._renderedPageId !== page.id) {
      this.clearTextLayer()
      this._renderedPageId = page.id
      this._lastSegmentIndex = -1
      this._lastVisibleCount = -1
    }

    const currentSegmentIndex = player.state.segmentIndex
    const visibleCount = player.state.visibleGraphemeCount

    for (let i = 0; i <= currentSegmentIndex; i++) {
      const segment = page.segments[i]
      const isCurrent = i === currentSegmentIndex
      const text = isCurrent ? player.visibleText : segment.text
      const existing = this._labelMap.get(segment.id)

      if (existing) {
        if (isCurrent && existing.text !== text) {
          existing.text = text
        }
      } else {
        const kind = segment.kind === 'dialogue' ? 'body' : 'narration'
        const label = new GameLabel(text, this._context!.theme, kind, {
          maxWidth: TEXT_W,
          breakWords: true,
        })
        label.x = segment.kind === 'dialogue' ? 24 : 0
        this._labelMap.set(segment.id, label)
        this._textLayer.addChild(label)
      }
    }

    this.layoutTextLayer(page)

    if (
      player.state.playbackState === 'waiting' ||
      player.state.playbackState === 'page_wait'
    ) {
      this._indicator!.visible = true
    } else {
      this._indicator!.visible = false
    }

    if (player.state.playbackState === 'finished') {
      this._indicator!.visible = false
    }

    this._lastSegmentIndex = currentSegmentIndex
    this._lastVisibleCount = visibleCount
  }

  private layoutTextLayer(page: { segments: SoundNovelSegment[] }): void {
    if (!this._textLayer) return
    let y = 0
    for (const segment of page.segments) {
      const label = this._labelMap.get(segment.id)
      if (!label) continue
      label.y = y
      const { height } = label.measure()
      y += height + SEGMENT_SPACING
    }
  }

  private clearTextLayer(): void {
    if (!this._textLayer) return
    for (const child of [...this._textLayer.children]) {
      if (child === this._measureLabel) continue
      this._textLayer.removeChild(child)
      child.destroy({ children: true })
    }
    this._labelMap.clear()
    if (this._measureLabel) {
      this._textLayer.addChild(this._measureLabel)
    }
  }

  private openLog(): void {
    if (!this._context || !this._player || this._backlogPanel) return
    this._player.setLogOpen(true)

    const panel = new Container()
    panel.eventMode = 'static'
    panel.hitArea = new Rectangle(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
    panel.on('pointertap', (e) => e.stopPropagation())

    const dim = new Graphics()
    dim
      .rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
      .fill({ color: 0x000000, alpha: 0.6 })
    panel.addChild(dim)

    const bg = new Graphics()
    const panelW = 900
    const panelH = 700
    const panelX = (VIRTUAL_WIDTH - panelW) / 2
    const panelY = (VIRTUAL_HEIGHT - panelH) / 2
    bg.roundRect(
      panelX,
      panelY,
      panelW,
      panelH,
      this._context.theme.radius.large,
    )
      .fill({ color: this._context.theme.colors.panel })
      .stroke({ width: 2, color: this._context.theme.colors.panelBorder })
    panel.addChild(bg)

    const title = new GameLabel('LOG', this._context.theme, 'heading')
    title.x = panelX + 24
    title.y = panelY + 24
    panel.addChild(title)

    const scroll = new GameScrollView(
      this._context.theme,
      panelW - 48,
      panelH - 120,
    )
    scroll.x = panelX + 24
    scroll.y = panelY + 70

    let y = 0
    for (const entry of this._player.backlog) {
      const prefix = entry.speakerName ? `${entry.speakerName}: ` : ''
      const text = `${prefix}${entry.text}`
      const line = new GameLabel(text, this._context.theme, 'body', {
        maxWidth: panelW - 80,
        breakWords: true,
      })
      line.x = 0
      line.y = y
      scroll.content.addChild(line)
      y += line.textHeight + 12
    }

    if (this._player.backlog.length === 0) {
      const empty = new GameLabel(
        'まだログがありません。',
        this._context.theme,
        'body',
      )
      empty.y = 0
      scroll.content.addChild(empty)
    }

    panel.addChild(scroll)

    const closeButton = new GameButton({
      width: 120,
      height: 40,
      theme: this._context.theme,
      label: '閉じる',
    })
    closeButton.x = panelX + panelW - 144
    closeButton.y = panelY + 24
    closeButton.onActivate = () => this.closeLog()
    panel.addChild(closeButton)

    this._context.layers.overlay.addChild(panel)
    this._backlogPanel = panel
  }

  private closeLog(): void {
    this._player?.setLogOpen(false)
    if (this._backlogPanel) {
      this._backlogPanel.parent?.removeChild(this._backlogPanel)
      this._backlogPanel.destroy({ children: true })
      this._backlogPanel = null
    }
  }

  private returnToPrevious(): void {
    this._context?.canvasGame.sceneManager?.pop()
  }
}
