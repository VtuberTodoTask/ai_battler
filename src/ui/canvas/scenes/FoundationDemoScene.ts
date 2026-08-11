import { Container, Graphics } from 'pixi.js'

import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import type { GameScene, GameSceneContext, GameUiState } from '../types.ts'
import {
  buildGameUiViewModel,
  type PartyListItemViewModel,
} from '../viewModel/gameUiViewModel.ts'
import { GameButton } from '../components/GameButton.ts'
import { GameLabel } from '../components/GameLabel.ts'
import { GamePanel } from '../components/GamePanel.ts'
import { GameScrollView } from '../components/GameScrollView.ts'

const TOP_BAR_H = 64
const LEFT_W = 360
const BOTTOM_BAR_H = 80
const MARGIN = 16

function destroyChildren(container: Container): void {
  const children = container.removeChildren()
  for (const child of children) {
    child.destroy({ children: true })
  }
}

export class FoundationDemoScene implements GameScene {
  readonly id = 'foundation'

  private _context: GameSceneContext | null = null
  private _bgRoot: Container | null = null
  private _uiRoot: Container | null = null
  private _partyListRoot: Container | null = null
  private _dayLabel: GameLabel | null = null
  private _reputationLabel: GameLabel | null = null
  private _selectedPartyLabel: GameLabel | null = null
  private _nextDayButton: GameButton | null = null
  private _partyButtons: GameButton[] = []
  private _viewModel: ReturnType<typeof buildGameUiViewModel> | null = null
  private _uiState: GameUiState = {
    selectedPartyId: null,
    selectedQuestId: null,
    openCharacterId: null,
    modalOpen: false,
  }

  mount(context: GameSceneContext): void {
    this._context = context

    this._bgRoot = new Container()
    context.layers.background.addChild(this._bgRoot)

    this._uiRoot = new Container()
    context.layers.ui.addChild(this._uiRoot)

    this.buildBackground(context)
    this.buildTopBar(context)
    this.buildLeftPanel(context)
    this.buildMainPanel(context)
    this.buildBottomBar(context)

    context.overlayManager.onClose(() => {
      context.canvasGame.setUiState({ modalOpen: false })
    })
  }

  setCampaign(campaign: TavernCampaignState, uiState: GameUiState): void {
    this._viewModel = buildGameUiViewModel(campaign)
    this._uiState = { ...uiState }
    this.updateFromViewModel(campaign)
    this.updateSelectedParty()
  }

  setUiState(uiState: GameUiState): void {
    this._uiState = { ...uiState }
    this.updateSelectedParty()
  }

  update(_dt: number): void {
    // Static foundation scene; no per-frame animation required.
  }

  unmount(): void {
    if (this._bgRoot) {
      this._bgRoot.parent?.removeChild(this._bgRoot)
      this._bgRoot.destroy({ children: true })
      this._bgRoot = null
    }

    if (this._uiRoot) {
      this._uiRoot.parent?.removeChild(this._uiRoot)
      this._uiRoot.destroy({ children: true })
      this._uiRoot = null
    }

    this._partyListRoot = null
    this._dayLabel = null
    this._reputationLabel = null
    this._selectedPartyLabel = null
    this._nextDayButton = null
    this._partyButtons = []
    this._context = null
  }

  private buildBackground(context: GameSceneContext): void {
    const bg = new Graphics()
    bg.rect(
      0,
      0,
      context.viewport.virtualWidth,
      context.viewport.virtualHeight,
    ).fill({ color: context.theme.colors.background })
    this._bgRoot!.addChild(bg)
  }

  private buildTopBar(context: GameSceneContext): void {
    const { theme, viewport } = context

    const topBar = new GamePanel({
      width: viewport.virtualWidth,
      height: TOP_BAR_H,
      theme,
      color: theme.colors.panelTitle,
      borderColor: theme.colors.panelBorder,
      radius: 0,
    })
    this._uiRoot!.addChild(topBar)

    this._dayLabel = new GameLabel('', theme, 'heading')
    this._dayLabel.x = MARGIN
    this._dayLabel.y = 18
    topBar.addChild(this._dayLabel)

    this._reputationLabel = new GameLabel('', theme, 'body')
    this._reputationLabel.x = 320
    this._reputationLabel.y = 20
    topBar.addChild(this._reputationLabel)

    this._nextDayButton = new GameButton({
      width: 160,
      height: 44,
      theme,
      label: 'NEXT DAY',
      disabled: true,
    })
    this._nextDayButton.x = viewport.virtualWidth - 180 - MARGIN
    this._nextDayButton.y = 10
    this._nextDayButton.onActivate = () => context.actions.advanceDay()
    topBar.addChild(this._nextDayButton)
  }

  private buildLeftPanel(context: GameSceneContext): void {
    const { theme, viewport } = context
    const height =
      viewport.virtualHeight - TOP_BAR_H - BOTTOM_BAR_H - MARGIN * 3

    const leftPanel = new GamePanel({
      width: LEFT_W - MARGIN,
      height,
      theme,
      title: 'PARTIES',
      color: theme.colors.panel,
      borderColor: theme.colors.panelBorder,
      radius: theme.radius.large,
    })
    leftPanel.x = MARGIN
    leftPanel.y = TOP_BAR_H + MARGIN
    this._uiRoot!.addChild(leftPanel)

    this._partyListRoot = new Container()
    this._partyListRoot.x = MARGIN
    this._partyListRoot.y = 48
    leftPanel.addChild(this._partyListRoot)
  }

  private buildMainPanel(context: GameSceneContext): void {
    const { theme, viewport } = context
    const x = LEFT_W + MARGIN
    const y = TOP_BAR_H + MARGIN
    const width = viewport.virtualWidth - x - MARGIN
    const height =
      viewport.virtualHeight - TOP_BAR_H - BOTTOM_BAR_H - MARGIN * 3

    const mainPanel = new GamePanel({
      width,
      height,
      theme,
      title: 'TAVERN',
      color: theme.colors.panel,
      borderColor: theme.colors.panelBorder,
      radius: theme.radius.large,
    })
    mainPanel.x = x
    mainPanel.y = y
    this._uiRoot!.addChild(mainPanel)

    const title = new GameLabel(
      'Phase 8.0 Canvas Foundation',
      theme,
      'heading',
      {
        align: 'center',
      },
    )
    title.anchor.set(0.5, 0)
    title.x = width / 2
    title.y = 80
    mainPanel.addChild(title)

    const subtitle = new GameLabel(
      'Canvas UI 表示層の基礎検証',
      theme,
      'body',
      { align: 'center' },
    )
    subtitle.anchor.set(0.5, 0)
    subtitle.x = width / 2
    subtitle.y = 130
    mainPanel.addChild(subtitle)

    this._selectedPartyLabel = new GameLabel('', theme, 'body', {
      maxWidth: width - MARGIN * 2,
      align: 'left',
    })
    this._selectedPartyLabel.x = MARGIN
    this._selectedPartyLabel.y = 220
    mainPanel.addChild(this._selectedPartyLabel)
  }

  private buildBottomBar(context: GameSceneContext): void {
    const { theme, viewport, overlayManager } = context
    const y = viewport.virtualHeight - BOTTOM_BAR_H - MARGIN

    const bottomBar = new GamePanel({
      width: viewport.virtualWidth - MARGIN * 2,
      height: BOTTOM_BAR_H,
      theme,
      color: theme.colors.panel,
      borderColor: theme.colors.panelBorder,
      radius: 0,
    })
    bottomBar.x = MARGIN
    bottomBar.y = y
    this._uiRoot!.addChild(bottomBar)

    const buttons = [
      {
        label: 'Panel',
        action: () =>
          overlayManager.openModal(
            'Panel Test',
            'パネルコンポーネントの動作確認です。',
          ),
      },
      { label: 'Tooltip', action: () => {} },
      {
        label: 'Modal',
        action: () =>
          overlayManager.openModal(
            'Modal Test',
            'モーダルウィンドウの動作確認です。',
          ),
      },
      { label: 'Scroll', action: () => this.openScrollModal(context) },
      { label: 'Legacy UI', action: () => context.actions.switchToLegacy() },
    ]

    let offsetX = MARGIN
    for (const def of buttons) {
      const button = new GameButton({
        width: 140,
        height: 48,
        theme,
        label: def.label,
      })
      button.x = offsetX
      button.y = (BOTTOM_BAR_H - 48) / 2
      button.onActivate = def.action
      bottomBar.addChild(button)

      if (def.label === 'Tooltip') {
        button.on('pointerover', (e) => {
          const pos = e.getLocalPosition(context.layers.overlay)
          overlayManager.showTooltip('ツールチップの動作確認です', pos.x, pos.y)
        })
        button.on('pointerout', () => overlayManager.hideTooltip())
      }

      offsetX += 150 + MARGIN
    }
  }

  private openScrollModal(context: GameSceneContext): void {
    const { theme } = context
    const scroll = new GameScrollView(theme, 500, 260)
    for (let i = 1; i <= 40; i++) {
      const row = new GameLabel(`スクロールアイテム #${i}`, theme, 'body')
      row.y = (i - 1) * 28
      scroll.content.addChild(row)
    }

    const modalContent = new Container()
    scroll.y = MARGIN
    modalContent.addChild(scroll)
    context.overlayManager.openModal('Scroll Test', modalContent)
  }

  private updateFromViewModel(campaign: TavernCampaignState): void {
    if (!this._viewModel || !this._dayLabel || !this._reputationLabel) return

    this._dayLabel.text = `DAY ${this._viewModel.day}`
    this._reputationLabel.text = `酒場評判 ${this._viewModel.reputation}（${this._viewModel.reputationLabel}）`

    if (this._nextDayButton) {
      this._nextDayButton.setEnabled(campaign.currentDay.status === 'resolved')
    }

    this.rebuildPartyList(this._viewModel.parties)
  }

  private rebuildPartyList(parties: PartyListItemViewModel[]): void {
    if (!this._partyListRoot || !this._context) return

    destroyChildren(this._partyListRoot)
    this._partyButtons = []

    const width = LEFT_W - MARGIN * 3
    let y = 0

    for (const party of parties) {
      const button = new GameButton({
        width,
        height: 60,
        theme: this._context.theme,
        label: party.name,
      })
      button.y = y
      button.onActivate = () => this._context!.actions.selectParty(party.id)
      button.on('pointerover', (e) => {
        const pos = e.getLocalPosition(this._context!.layers.overlay)
        this._context!.overlayManager.showTooltip(
          party.statusLabel,
          pos.x,
          pos.y,
        )
      })
      button.on('pointerout', () => this._context!.overlayManager.hideTooltip())
      this._partyListRoot.addChild(button)
      this._partyButtons.push(button)
      y += 68
    }
  }

  private updateSelectedParty(): void {
    if (!this._selectedPartyLabel || !this._viewModel) return

    const selected = this._viewModel.parties.find(
      (p) => p.id === this._uiState.selectedPartyId,
    )

    if (selected) {
      this._selectedPartyLabel.text = `選択中: ${selected.name}\nメンバー: ${selected.memberNames.join(', ')}\n状態: ${selected.statusLabel}`
    } else {
      this._selectedPartyLabel.text = 'パーティを選択してください'
    }
  }
}
