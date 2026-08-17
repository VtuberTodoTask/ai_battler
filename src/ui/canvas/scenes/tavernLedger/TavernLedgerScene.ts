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
  buildTavernLedgerViewModel,
  createTavernLedgerSceneInput,
  type TavernLedgerRowViewModel,
  type TavernLedgerSceneInput,
  type TavernLedgerViewModel,
} from '../../viewModel/tavernLedgerViewModel.ts'

const MARGIN = 16
const TOP_BAR_HEIGHT = 64
const BOTTOM_BAR_HEIGHT = 72
const TAVERN_BG_URL = '/tavern-bg.jpg'

export class TavernLedgerScene implements GameScene {
  readonly id = 'tavernLedger'

  private _context: GameSceneContext | null = null
  private _root: Container | null = null
  private _bgRoot: Container | null = null
  private _campaign: TavernCampaignState | null = null
  private _input: TavernLedgerSceneInput | undefined = undefined
  private _viewModel: TavernLedgerViewModel | null = null
  private _scroll: GameScrollView | null = null
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
      (input as TavernLedgerSceneInput | undefined) ??
      createTavernLedgerSceneInput({ sceneId: 'tavern' })
    this._root = new Container()
    this._bgRoot = new Container()
    context.layers.background.addChild(this._bgRoot)
    context.layers.ui.addChild(this._root)

    void this.loadBackground(context.theme)
    AudioController.playBgm('tavern', { loop: true })

    if (this._campaign) {
      this.updateViewModel()
      this.render(context)
    }
  }

  unmount(): void {
    if (this._bgRoot && this._bgRoot.parent) {
      this._bgRoot.parent.removeChild(this._bgRoot)
    }
    this._bgRoot?.destroy({ children: true })
    this._bgRoot = null

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
    this._viewModel = buildTavernLedgerViewModel(
      this._campaign,
      this._input?.returnTarget ?? { sceneId: 'tavern' },
    )
  }

  private render(context: GameSceneContext): void {
    if (!this._root || !this._viewModel) return
    this._root.removeChildren()

    const { theme } = context

    const titleLabel = new GameLabel('帳簿', theme, 'heading')
    titleLabel.anchor.set(0, 0.5)
    titleLabel.x = MARGIN
    titleLabel.y = TOP_BAR_HEIGHT / 2
    this._root.addChild(titleLabel)

    const fundsLabel = new GameLabel(this._viewModel.fundsLabel, theme, 'body')
    fundsLabel.anchor.set(1, 0.5)
    fundsLabel.x = VIRTUAL_WIDTH - MARGIN - 160 - MARGIN
    fundsLabel.y = TOP_BAR_HEIGHT / 2
    this._root.addChild(fundsLabel)

    const contentY = TOP_BAR_HEIGHT + MARGIN
    const contentHeight =
      VIRTUAL_HEIGHT - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT - MARGIN * 2
    const contentWidth = VIRTUAL_WIDTH - MARGIN * 4
    const panel = new GamePanel({
      width: VIRTUAL_WIDTH - MARGIN * 2,
      height: contentHeight,
      theme,
      title: '取引履歴',
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

    const backButton = new GameButton({
      width: 160,
      height: 48,
      theme,
      label: '酒場へ戻る',
    })
    backButton.x = VIRTUAL_WIDTH - MARGIN - 160
    backButton.y = 8
    backButton.onActivate = () => this.returnToTavern()
    this._root.addChild(backButton)
  }

  private renderRows(
    rowWidth: number,
    scroll: GameScrollView,
    rows: TavernLedgerRowViewModel[],
    theme: GameUiTheme,
  ): void {
    const rowHeight = 64
    const gap = 8
    let y = 0

    if (rows.length === 0) {
      const empty = new GameLabel('取引履歴はありません', theme, 'body')
      empty.y = 8
      scroll.content.addChild(empty)
      scroll.setViewportSize(scroll.width, 40)
      return
    }

    for (const row of rows) {
      const listRow = new TavernListRow({
        width: rowWidth,
        height: rowHeight,
        theme,
        title: row.title,
        subtitle: row.subtitle,
        trailing: row.amountLabel,
        disabled: true,
      })
      listRow.y = y
      scroll.content.addChild(listRow)
      y += rowHeight + gap
    }

    const totalHeight = Math.max(y - gap, 0)
    scroll.setViewportSize(rowWidth, totalHeight + 8)
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

  private async loadBackground(theme: GameUiTheme): Promise<void> {
    if (
      !this._bgRoot ||
      import.meta.env.MODE === 'test' ||
      typeof Assets.load !== 'function'
    )
      return
    try {
      const texture = (await Assets.load(TAVERN_BG_URL)) as Texture
      const sprite = Sprite.from(texture)
      sprite.width = VIRTUAL_WIDTH
      sprite.height = VIRTUAL_HEIGHT
      sprite.eventMode = 'none'
      this._bgRoot.removeChildren()
      this._bgRoot.addChild(sprite)
    } catch {
      const bg = new Graphics()
      bg.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill({
        color: theme.colors.background,
      })
      this._bgRoot.removeChildren()
      this._bgRoot.addChild(bg)
    }
  }
}
