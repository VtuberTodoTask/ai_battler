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
import {
  buildTavernUpgradeSceneViewModel,
  createTavernUpgradeSceneInput,
  tavernUpgradeBlockReasonText,
  type TavernUpgradeEntryViewModel,
  type TavernUpgradeSceneInput,
  type TavernUpgradeSceneViewModel,
} from '../../viewModel/tavernUpgradeViewModel.ts'

const MARGIN = 16
const TOP_BAR_HEIGHT = 64
const BOTTOM_BAR_HEIGHT = 72
const LEFT_WIDTH = 420
const TAVERN_BG_URL = '/tavern-bg.jpg'

export class TavernUpgradeScene implements GameScene {
  readonly id = 'tavernUpgrade'

  private _context: GameSceneContext | null = null
  private _root: Container | null = null
  private _bgRoot: Container | null = null
  private _campaign: TavernCampaignState | null = null
  private _input: TavernUpgradeSceneInput | undefined = undefined
  private _viewModel: TavernUpgradeSceneViewModel | null = null
  private _selectedUpgradeId: string | null = null
  private _statusMessage: string | null = null
  private _bgLoadToken = 0
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
      (input as TavernUpgradeSceneInput | undefined) ??
      createTavernUpgradeSceneInput({ sceneId: 'tavern' })
    this._root = new Container()
    this._bgRoot = new Container()
    context.layers.background.addChild(this._bgRoot)
    context.layers.ui.addChild(this._root)

    void this.drawBackground(context)
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
    this._context = null
    this._statusMessage = null
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
    this._viewModel = buildTavernUpgradeSceneViewModel(
      this._campaign,
      this._input?.returnTarget ?? { sceneId: 'tavern' },
    )
    if (
      !this._selectedUpgradeId ||
      !this._viewModel.entries.some((e) => e.id === this._selectedUpgradeId)
    ) {
      this._selectedUpgradeId = this._viewModel.entries[0]?.id ?? null
    }
  }

  private clearUi(): void {
    if (!this._root) return
    for (const child of this._root.removeChildren()) {
      child.destroy({ children: true })
    }
  }

  private render(context: GameSceneContext): void {
    if (!this._root || !this._viewModel) return
    this.clearUi()

    const { theme } = context

    const titleLabel = new GameLabel('設備', theme, 'heading')
    titleLabel.anchor.set(0, 0.5)
    titleLabel.x = MARGIN
    titleLabel.y = TOP_BAR_HEIGHT / 2
    this._root.addChild(titleLabel)

    const dayLabel = new GameLabel(this._viewModel.dayLabel, theme, 'body')
    dayLabel.anchor.set(0, 0.5)
    dayLabel.x = 160
    dayLabel.y = TOP_BAR_HEIGHT / 2
    this._root.addChild(dayLabel)

    const rankLabel = new GameLabel(
      this._viewModel.tavernRankLabel,
      theme,
      'body',
    )
    rankLabel.anchor.set(0, 0.5)
    rankLabel.x = 320
    rankLabel.y = TOP_BAR_HEIGHT / 2
    this._root.addChild(rankLabel)

    const fundsLabel = new GameLabel(this._viewModel.fundsLabel, theme, 'body')
    fundsLabel.anchor.set(1, 0.5)
    fundsLabel.x = VIRTUAL_WIDTH - MARGIN - 160 - MARGIN
    fundsLabel.y = TOP_BAR_HEIGHT / 2
    this._root.addChild(fundsLabel)

    const contentY = TOP_BAR_HEIGHT + MARGIN
    const contentHeight =
      VIRTUAL_HEIGHT - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT - MARGIN * 2
    const rightX = MARGIN + LEFT_WIDTH + MARGIN
    const rightWidth = VIRTUAL_WIDTH - MARGIN - rightX

    this.renderList(contentY, contentHeight, theme)
    this.renderDetail(rightX, contentY, rightWidth, contentHeight, theme)

    const backButton = new GameButton({
      width: 160,
      height: 48,
      theme,
      label: '酒場へ戻る',
    })
    backButton.x = VIRTUAL_WIDTH - MARGIN - 160
    backButton.y = VIRTUAL_HEIGHT - BOTTOM_BAR_HEIGHT + 8
    backButton.onActivate = () => this.returnToTavern()
    this._root!.addChild(backButton)
  }

  private renderList(
    contentY: number,
    contentHeight: number,
    theme: GameSceneContext['theme'],
  ): void {
    if (!this._root || !this._viewModel) return

    const panel = new GamePanel({
      width: LEFT_WIDTH,
      height: contentHeight,
      theme,
      title: '設備一覧',
      alpha: 0.82,
    })
    panel.x = MARGIN
    panel.y = contentY
    this._root.addChild(panel)

    const scroll = new GameScrollView(
      theme,
      LEFT_WIDTH - MARGIN * 2,
      contentHeight - 64,
    )
    scroll.x = MARGIN + MARGIN / 2
    scroll.y = contentY + 52
    this._root.addChild(scroll)

    const rowHeight = 76
    const gap = 8
    let y = 0
    for (const entry of this._viewModel.entries) {
      const row = new TavernListRow({
        width: LEFT_WIDTH - MARGIN * 3,
        height: rowHeight,
        theme,
        title: entry.title,
        subtitle: `Lv ${entry.currentLevel} / ${entry.maxLevel}  ${entry.currentEffectText}`,
        selected: entry.id === this._selectedUpgradeId,
      })
      row.y = y
      row.onActivate = () => {
        this._selectedUpgradeId = entry.id
        this._statusMessage = null
        if (this._context) this.render(this._context)
      }
      scroll.content.addChild(row)
      y += rowHeight + gap
    }
  }

  private renderDetail(
    x: number,
    contentY: number,
    width: number,
    contentHeight: number,
    theme: GameSceneContext['theme'],
  ): void {
    if (!this._root || !this._viewModel) return

    const entry = this._viewModel.entries.find(
      (e) => e.id === this._selectedUpgradeId,
    )

    const panel = new GamePanel({
      width,
      height: contentHeight,
      theme,
      title: entry ? entry.title : '設備の詳細',
      alpha: 0.82,
    })
    panel.x = x
    panel.y = contentY
    this._root.addChild(panel)

    if (!entry) return

    const scroll = new GameScrollView(
      theme,
      width - MARGIN * 2,
      contentHeight - 64 - 64,
    )
    scroll.x = x + MARGIN
    scroll.y = contentY + 52
    this._root.addChild(scroll)

    let y = 0
    const add = (
      text: string,
      kind: 'heading' | 'body' | 'caption' = 'body',
    ) => {
      const label = new GameLabel(text, theme, kind, {
        maxWidth: width - MARGIN * 2,
      })
      label.y = y
      scroll.content.addChild(label)
      y += label.textHeight + 8
    }

    add(entry.description, 'body')
    add(`現在のレベル：Lv ${entry.currentLevel} / ${entry.maxLevel}`)
    add(`現在の効果：${entry.currentEffectText}`)

    if (entry.nextLevel !== undefined) {
      add(`次のレベル：Lv ${entry.nextLevel}`, 'heading')
      add(`次の効果：${entry.nextEffectText}`)
      add(`必要酒場ランク：${entry.requiredRank}`)
      add(`費用：${entry.cost}`)
    } else {
      add('整備済み（最大レベルです）', 'heading')
    }

    add(entry.timingNote, 'caption')

    if (this._statusMessage) {
      add(this._statusMessage, 'caption')
    }

    const buttonY = contentY + contentHeight - 64 + 8
    const purchaseLabel =
      entry.nextLevel !== undefined ? `購入する（${entry.cost}）` : '整備済み'
    const purchaseButton = new GameButton({
      width: 220,
      height: 48,
      theme,
      label: purchaseLabel,
      disabled: !entry.canPurchase,
    })
    purchaseButton.x = x
    purchaseButton.y = buttonY
    purchaseButton.onActivate = () => this.handlePurchase(entry)
    this._root.addChild(purchaseButton)

    if (!entry.canPurchase && entry.blockedReason) {
      const reasonText = tavernUpgradeBlockReasonText(entry.blockedReason)
      if (reasonText) {
        const reasonLabel = new GameLabel(reasonText, theme, 'caption', {
          maxWidth: width - 220 - MARGIN * 2,
        })
        reasonLabel.x = x + 220 + MARGIN
        reasonLabel.y = buttonY + 14
        this._root.addChild(reasonLabel)
      }
    }
  }

  private handlePurchase(entry: TavernUpgradeEntryViewModel): void {
    if (!this._context) return
    const result = this._context.actions.purchaseUpgrade(entry.id)
    if (!result.ok) {
      this._statusMessage = result.message ?? '設備の購入に失敗しました'
      this.render(this._context)
      return
    }
    this._statusMessage = null
    AudioController.playSe('shopBell')
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

  private async drawBackground(context: GameSceneContext): Promise<void> {
    if (!this._bgRoot) return
    const { theme } = context

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
