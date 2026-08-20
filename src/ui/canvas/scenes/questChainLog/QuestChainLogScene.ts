import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js'
import type { TavernCampaignState } from '../../../../core/tavern/campaign/types.ts'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GamePanel } from '../../components/GamePanel.ts'
import { GameScrollView } from '../../components/GameScrollView.ts'
import { TavernListRow } from '../../components/TavernListRow.ts'
import { AudioController } from '../../audio/AudioController.ts'
import type { GameScene, GameSceneContext, GameUiState } from '../../types.ts'
import type { GameUiTheme } from '../../theme/gameTheme.ts'
import {
  buildQuestChainLogViewModel,
  createQuestChainLogSceneInput,
  type QuestChainLogRowViewModel,
  type QuestChainLogSceneInput,
  type QuestChainLogViewModel,
} from '../../viewModel/questChainLogViewModel.ts'

const MARGIN = 16
const TOP_BAR_HEIGHT = 64
const BOTTOM_BAR_HEIGHT = 72
const TAVERN_BG_URL = '/tavern-bg.jpg'

export class QuestChainLogScene implements GameScene {
  readonly id = 'questChainLog'

  private _context: GameSceneContext | null = null
  private _root: Container | null = null
  private _bgRoot: Container | null = null
  private _campaign: TavernCampaignState | null = null
  private _input: QuestChainLogSceneInput | undefined = undefined
  private _viewModel: QuestChainLogViewModel | null = null
  private _scroll: GameScrollView | null = null
  private _bgLoadToken = 0
  private _expandedRowId: string | null = null
  private _uiState: GameUiState = {
    selectedPartyId: null,
    selectedQuestId: null,
    openCharacterId: null,
    modalOpen: false,
    viewedReportIds: [],
    viewedActivityIds: [],
  }

  mount(context: GameSceneContext, input?: unknown): void {
    this._context = context
    this._input =
      (input as QuestChainLogSceneInput | undefined) ??
      createQuestChainLogSceneInput({ sceneId: 'tavern' })
    this._root = new Container()
    this._bgRoot = new Container()
    context.layers.background.addChild(this._bgRoot)
    context.layers.ui.addChild(this._root)

    void this.drawBackground(context.theme)
    AudioController.playBgm('tavern', { loop: true })

    if (this._campaign) {
      this.updateViewModel()
      this.render(context)
    }
  }

  unmount(): void {
    this._bgLoadToken++
    if (this._bgRoot && this._bgRoot.parent) {
      this._bgRoot.parent.removeChild(this._bgRoot)
    }
    this._bgRoot?.destroy({ children: true })
    this._bgRoot = null

    this.clearUi()
    if (this._root && this._root.parent) {
      this._root.parent.removeChild(this._root)
    }
    this._root?.destroy({ children: true })
    this._root = null
    this._scroll = null
    this._context = null
  }

  setCampaign(campaign: TavernCampaignState, uiState: GameUiState): void {
    this._campaign = campaign
    this._uiState = { ...uiState }
    if (this._context) {
      this.updateViewModel()
      this.render(this._context)
    }
  }

  setUiState(uiState: GameUiState): void {
    this._uiState = { ...uiState }
  }

  private updateViewModel(): void {
    if (!this._campaign) return
    this._viewModel = buildQuestChainLogViewModel(
      this._campaign,
      this._input?.returnTarget ?? { sceneId: 'tavern' },
    )
  }

  private clearUi(): void {
    if (!this._root) return
    for (const child of this._root.removeChildren()) {
      child.destroy({ children: true })
    }
    this._scroll = null
  }

  private render(context: GameSceneContext): void {
    if (!this._root || !this._viewModel) return
    this.clearUi()

    const { theme } = context

    const titleLabel = new GameLabel('依頼記録', theme, 'heading')
    titleLabel.anchor.set(0, 0.5)
    titleLabel.x = MARGIN
    titleLabel.y = TOP_BAR_HEIGHT / 2
    this._root.addChild(titleLabel)

    const contentY = TOP_BAR_HEIGHT + MARGIN
    const contentHeight =
      VIRTUAL_HEIGHT - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT - MARGIN * 2
    const contentWidth = VIRTUAL_WIDTH - MARGIN * 4
    const panel = new GamePanel({
      width: VIRTUAL_WIDTH - MARGIN * 2,
      height: contentHeight,
      theme,
      title: '連続依頼',
      alpha: 0.82,
    })
    panel.x = MARGIN
    panel.y = contentY
    this._root.addChild(panel)

    const scroll = new GameScrollView(theme, contentWidth, contentHeight - 64)
    scroll.x = MARGIN * 2
    scroll.y = contentY + 52
    this._root.addChild(scroll)
    this._scroll = scroll

    this.renderRows(contentWidth, scroll, this._viewModel.rows, theme)
    scroll.scrollToTop()

    const backButton = new GameButton({
      width: 160,
      height: 48,
      theme,
      label: '酒場へ戻る',
    })
    backButton.x = VIRTUAL_WIDTH - MARGIN - 160
    backButton.y = VIRTUAL_HEIGHT - BOTTOM_BAR_HEIGHT + 8
    backButton.onActivate = () => this.returnToTavern()
    this._root.addChild(backButton)
  }

  private renderRows(
    rowWidth: number,
    scroll: GameScrollView,
    rows: QuestChainLogRowViewModel[],
    theme: GameUiTheme,
  ): void {
    const rowHeight = 64
    const stepRowHeight = 48
    const gap = 8
    let y = 0

    if (rows.length === 0) {
      const empty = new GameLabel(
        'まだ連続依頼は発生していません',
        theme,
        'body',
      )
      empty.y = 8
      scroll.content.addChild(empty)
    } else {
      for (const row of rows) {
        const expanded = row.rowId === this._expandedRowId
        const listRow = new TavernListRow({
          width: rowWidth,
          height: rowHeight,
          theme,
          title: row.definitionTitle,
          subtitle: `${row.statusLabel} · ${row.progressLabel} · 開始 ${row.startedDayLabel}`,
          selected: expanded,
        })
        listRow.y = y
        listRow.onActivate = () => this.toggleExpanded(row.rowId)
        scroll.content.addChild(listRow)
        y += rowHeight + gap

        if (expanded) {
          for (const step of row.steps) {
            const stepLine = step.title
              ? `${step.progressLabel} / ${step.dayLabel} / 「${step.title}」 / ${step.statusLabel}`
              : `${step.progressLabel} / ${step.statusLabel}`
            const stepRow = new TavernListRow({
              width: rowWidth - 24,
              height: stepRowHeight,
              theme,
              title: stepLine,
              disabled: true,
            })
            stepRow.x = 24
            stepRow.y = y
            scroll.content.addChild(stepRow)
            y += stepRowHeight + 4
          }
          y += gap
        }
      }
    }

    const spacer = new Graphics()
    spacer.rect(0, 0, rowWidth, gap).fill({ color: 0xffffff, alpha: 0 })
    spacer.y = y
    scroll.content.addChild(spacer)
  }

  private toggleExpanded(rowId: string): void {
    this._expandedRowId = this._expandedRowId === rowId ? null : rowId
    if (this._context) this.render(this._context)
  }

  private returnToTavern(): void {
    if (!this._context) return
    const returnTarget = this._viewModel?.returnTarget ?? { sceneId: 'tavern' }
    this._context.canvasGame.setUiState({
      selectedPartyId: returnTarget.selectedPartyId ?? null,
      selectedQuestId: returnTarget.selectedQuestId ?? null,
    })
    this._context.canvasGame.sceneManager?.pop()
  }

  private async drawBackground(theme: GameUiTheme): Promise<void> {
    if (!this._bgRoot) return

    const base = new Graphics()
    base.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill({
      color: theme.colors.background,
    })
    this._bgRoot.removeChildren()
    this._bgRoot.addChild(base)

    if (import.meta.env.MODE === 'test' || typeof Assets.load !== 'function') {
      return
    }

    const token = ++this._bgLoadToken
    try {
      const texture = (await Assets.load(TAVERN_BG_URL)) as Texture
      if (!this._bgRoot || token !== this._bgLoadToken) return
      const sourceWidth = texture.width
      const sourceHeight = texture.height
      const scale = Math.max(
        VIRTUAL_WIDTH / sourceWidth,
        VIRTUAL_HEIGHT / sourceHeight,
      )
      const sprite = new Sprite(texture)
      sprite.anchor.set(0.5)
      sprite.scale.set(scale)
      sprite.x = VIRTUAL_WIDTH / 2
      sprite.y = VIRTUAL_HEIGHT / 2
      sprite.alpha = 1
      base.clear()
      this._bgRoot.removeChild(base)
      base.destroy()
      this._bgRoot.addChild(sprite)
    } catch {
      // Keep base color if loading fails.
    }
  }
}
