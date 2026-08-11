import { Container, Graphics } from 'pixi.js'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import type { TavernCampaignState } from '../../../../core/tavern/campaign/types.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import type { GameScene, GameSceneContext, GameUiState } from '../../types.ts'
import {
  buildTavernScreenViewModel,
  type TavernScreenViewModel,
} from '../../viewModel/tavernScreenViewModel.ts'
import type { TavernActivityItemViewModel } from '../../viewModel/tavernScreenViewModel.ts'
import { ActivityPanel } from './ActivityPanel.ts'
import { PartyListPanel } from './PartyListPanel.ts'
import { PartySummaryPanel } from './PartySummaryPanel.ts'
import { QuestListPanel } from './QuestListPanel.ts'
import { TavernHeader } from './TavernHeader.ts'

const MARGIN = 16
const TOP_BAR_HEIGHT = 64
const BOTTOM_PANEL_HEIGHT = 200
const LEFT_WIDTH = 360
const RIGHT_WIDTH = 360
const MAIN_Y = TOP_BAR_HEIGHT + MARGIN
const MAIN_HEIGHT =
  VIRTUAL_HEIGHT - TOP_BAR_HEIGHT - BOTTOM_PANEL_HEIGHT - MARGIN * 3
const BOTTOM_Y = MAIN_Y + MAIN_HEIGHT + MARGIN
const CENTER_WIDTH = VIRTUAL_WIDTH - LEFT_WIDTH - RIGHT_WIDTH - MARGIN * 4

export class TavernScene implements GameScene {
  readonly id = 'tavern'

  private _context: GameSceneContext | null = null
  private _backgroundRoot: Container | null = null
  private _uiRoot: Container | null = null
  private _campaign: TavernCampaignState | null = null
  private _uiState: GameUiState = {
    selectedPartyId: null,
    selectedQuestId: null,
    openCharacterId: null,
    modalOpen: false,
  }
  private _viewModel: TavernScreenViewModel | null = null
  private _header: TavernHeader | null = null
  private _partyList: PartyListPanel | null = null
  private _partySummary: PartySummaryPanel | null = null
  private _questList: QuestListPanel | null = null
  private _activityPanel: ActivityPanel | null = null
  private _autoSelectPending = true
  private _openedActivityEventIds = new Set<string>()

  mount(context: GameSceneContext): void {
    this._context = context

    this._backgroundRoot = new Container()
    context.layers.background.addChild(this._backgroundRoot)

    this._uiRoot = new Container()
    context.layers.ui.addChild(this._uiRoot)

    this.drawBackground(context)
    this.createPanels(context)

    if (this._campaign) {
      this.applyCampaign(this._campaign, this._uiState)
    }
  }

  unmount(): void {
    if (this._backgroundRoot) {
      this._backgroundRoot.parent?.removeChild(this._backgroundRoot)
      this._backgroundRoot.destroy({ children: true })
      this._backgroundRoot = null
    }
    if (this._uiRoot) {
      this._uiRoot.parent?.removeChild(this._uiRoot)
      this._uiRoot.destroy({ children: true })
      this._uiRoot = null
    }
    this._header = null
    this._partyList = null
    this._partySummary = null
    this._questList = null
    this._activityPanel = null
    this._context = null
    this._campaign = null
    this._openedActivityEventIds.clear()
    this._autoSelectPending = true
  }

  setCampaign(campaign: TavernCampaignState, uiState: GameUiState): void {
    this._campaign = campaign
    this.applyCampaign(campaign, uiState)
  }

  setUiState(uiState: GameUiState): void {
    this._uiState = { ...uiState }
    this.updateViewModel()
    this.render()
  }

  update(_dt: number): void {
    // Static scene; no per-frame animation.
  }

  private applyCampaign(
    campaign: TavernCampaignState,
    uiState: GameUiState,
  ): void {
    this._uiState = { ...uiState }

    const partyIds = new Set(campaign.currentDay.parties.map((p) => p.id))
    const requestIds = new Set(campaign.currentDay.requests.map((r) => r.id))

    if (this._uiState.selectedPartyId) {
      if (!partyIds.has(this._uiState.selectedPartyId)) {
        this._uiState.selectedPartyId = null
      }
    }
    if (
      this._uiState.selectedQuestId &&
      !requestIds.has(this._uiState.selectedQuestId)
    ) {
      this._uiState.selectedQuestId = null
    }

    if (
      this._autoSelectPending &&
      !this._uiState.selectedPartyId &&
      campaign.currentDay.parties.length > 0
    ) {
      const firstSelectable =
        campaign.currentDay.parties.find(
          (p) => p.availability !== 'recovering',
        ) ?? campaign.currentDay.parties[0]
      if (firstSelectable) {
        this._uiState.selectedPartyId = firstSelectable.id
        this._autoSelectPending = false
        if (this._context) {
          this._context.canvasGame.setUiState({
            selectedPartyId: firstSelectable.id,
          })
          return
        }
      }
    }

    this._autoSelectPending = false
    this.updateViewModel()
    this.render()
  }

  private updateViewModel(): void {
    if (!this._campaign) return
    this._viewModel = buildTavernScreenViewModel(this._campaign, this._uiState)
  }

  private drawBackground(context: GameSceneContext): void {
    const bg = this._backgroundRoot!
    const { theme } = context

    const base = new Graphics()
    base.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill({
      color: theme.colors.background,
    })
    bg.addChild(base)

    const floor = new Graphics()
    floor.rect(0, VIRTUAL_HEIGHT - 96, VIRTUAL_WIDTH, 96).fill({
      color: theme.colors.wood,
      alpha: 0.25,
    })
    bg.addChild(floor)

    const top = new Graphics()
    top.rect(0, 0, VIRTUAL_WIDTH, TOP_BAR_HEIGHT).fill({
      color: theme.colors.panelTitle,
      alpha: 0.6,
    })
    bg.addChild(top)

    const bottom = new Graphics()
    bottom
      .rect(MARGIN, BOTTOM_Y, VIRTUAL_WIDTH - MARGIN * 2, BOTTOM_PANEL_HEIGHT)
      .fill({
        color: theme.colors.panel,
        alpha: 0.4,
      })
    bg.addChild(bottom)
  }

  private createPanels(context: GameSceneContext): void {
    const { theme } = context

    this._header = new TavernHeader({
      theme,
      width: VIRTUAL_WIDTH,
      height: TOP_BAR_HEIGHT,
      onResolve: () => context.actions.resolveDay(),
      onAdvance: () => context.actions.advanceDay(),
    })
    this._header.x = 0
    this._header.y = 0
    this._uiRoot!.addChild(this._header)

    this._partyList = new PartyListPanel({
      theme,
      width: LEFT_WIDTH - MARGIN,
      height: MAIN_HEIGHT,
      onSelectParty: (id) => context.actions.selectParty(id),
    })
    this._partyList.x = MARGIN
    this._partyList.y = MAIN_Y
    this._uiRoot!.addChild(this._partyList)

    this._partySummary = new PartySummaryPanel({
      theme,
      width: CENTER_WIDTH - MARGIN,
      height: MAIN_HEIGHT,
      onAssign: () => this.handleAssign(),
    })
    this._partySummary.x = LEFT_WIDTH + MARGIN
    this._partySummary.y = MAIN_Y
    this._uiRoot!.addChild(this._partySummary)

    this._questList = new QuestListPanel({
      theme,
      width: RIGHT_WIDTH - MARGIN,
      height: MAIN_HEIGHT,
      onSelectQuest: (id) => context.actions.selectQuest(id),
    })
    this._questList.x = VIRTUAL_WIDTH - RIGHT_WIDTH - MARGIN
    this._questList.y = MAIN_Y
    this._uiRoot!.addChild(this._questList)

    this._activityPanel = new ActivityPanel({
      theme,
      width: VIRTUAL_WIDTH - MARGIN * 2,
      height: BOTTOM_PANEL_HEIGHT,
      onOpenActivity: (activity) => this.handleOpenActivity(activity),
    })
    this._activityPanel.x = MARGIN
    this._activityPanel.y = BOTTOM_Y
    this._uiRoot!.addChild(this._activityPanel)
  }

  private render(): void {
    if (!this._viewModel) return
    this._header?.update(this._viewModel.header)
    this._partyList?.update(this._viewModel.parties)
    this._partySummary?.update(this._viewModel.selectedParty)
    this._questList?.update(this._viewModel.quests)
    this._activityPanel?.update(this._viewModel.activities)
  }

  private handleAssign(): void {
    const partyId = this._uiState.selectedPartyId
    const questId = this._uiState.selectedQuestId
    if (!partyId || !questId) return
    this._context?.actions.offerRequest(partyId, questId)
  }

  private handleOpenActivity(activity: TavernActivityItemViewModel): void {
    if (!activity.canOpen) return
    const theme = this._context!.theme

    const shouldGenerate =
      activity.kind === 'downtime' &&
      activity.narrativeStatus === 'unseen' &&
      !this._openedActivityEventIds.has(activity.id)

    if (shouldGenerate) {
      // Lazy narrative generation: exactly one AI call per unseen event.
      this._openedActivityEventIds.add(activity.id)
      const loading = new GameLabel('生成中…', theme, 'body', {
        maxWidth: 520,
      })
      const loadingContainer = new Container()
      loading.y = MARGIN
      loadingContainer.addChild(loading)
      this._context!.overlayManager.openModal(activity.title, loadingContainer)

      this._context!.actions.openActivity(activity.partyId!, activity.id)
        .then((text) => {
          const content = new Container()
          const label = new GameLabel(text, theme, 'body', { maxWidth: 520 })
          label.y = MARGIN
          content.addChild(label)
          this._context!.overlayManager.openModal(activity.title, content)
        })
        .catch(() => {
          const content = new Container()
          const label = new GameLabel(
            '表示準備に失敗しました。',
            theme,
            'body',
            { maxWidth: 520 },
          )
          label.y = MARGIN
          content.addChild(label)
          this._context!.overlayManager.openModal(activity.title, content)
        })
      return
    }

    // Reopen or non-downtime: show the already-available summary.
    const content = new Container()
    const label = new GameLabel(activity.summary, theme, 'body', {
      maxWidth: 520,
    })
    label.y = MARGIN
    content.addChild(label)
    this._context!.overlayManager.openModal(activity.title, content)
  }
}
