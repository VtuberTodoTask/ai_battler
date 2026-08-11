import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js'
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
const TAVERN_BG_URL = '/tavern-bg.jpg'

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
  private _activityGenerationInFlight = new Set<string>()

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
    this._activityGenerationInFlight.clear()
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

    let reconciled = false
    if (
      this._uiState.selectedPartyId &&
      !partyIds.has(this._uiState.selectedPartyId)
    ) {
      this._uiState.selectedPartyId = null
      reconciled = true
    }
    if (
      this._uiState.selectedQuestId &&
      !requestIds.has(this._uiState.selectedQuestId)
    ) {
      this._uiState.selectedQuestId = null
      reconciled = true
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
      if (firstSelectable && this._context) {
        this._uiState.selectedPartyId = firstSelectable.id
        this._autoSelectPending = false
        this._context.canvasGame.setUiState({ ...this._uiState })
        return
      }
    }

    this._autoSelectPending = false

    if (reconciled && this._context) {
      this._context.canvasGame.setUiState({ ...this._uiState })
      return
    }

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

    if (
      typeof import.meta.env !== 'undefined' &&
      import.meta.env.MODE === 'test'
    ) {
      return
    }

    if (typeof Assets.load !== 'function') return

    void Assets.load(TAVERN_BG_URL)
      .then((texture) => {
        const sprite = new Sprite(texture as Texture)
        const scale = VIRTUAL_HEIGHT / sprite.height
        sprite.anchor.set(0.5)
        sprite.scale.set(scale)
        sprite.x = VIRTUAL_WIDTH / 2
        sprite.y = VIRTUAL_HEIGHT / 2
        base.clear()
        bg.removeChild(base)
        base.destroy()
        bg.addChild(sprite)
      })
      .catch(() => {
        // Keep base color if loading fails.
      })
  }

  private createPanels(context: GameSceneContext): void {
    const { theme } = context

    this._header = new TavernHeader({
      theme,
      width: VIRTUAL_WIDTH,
      height: TOP_BAR_HEIGHT,
      onResolve: () => this.handleResolve(),
      onAdvance: () => this.handleAdvance(),
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

  private handleResolve(): void {
    this.clearActionMessage()
    const result = this._context!.actions.resolveDay()
    if (!result.ok) {
      this.setActionMessage(
        'error',
        result.message ?? '本日の仲介確定に失敗しました',
      )
    }
  }

  private handleAdvance(): void {
    this.clearActionMessage()
    const result = this._context!.actions.advanceDay()
    if (!result.ok) {
      this.setActionMessage(
        'error',
        result.message ?? '翌日への進行に失敗しました',
      )
    }
  }

  private handleAssign(): void {
    this.clearActionMessage()
    const partyId = this._uiState.selectedPartyId
    const questId = this._uiState.selectedQuestId
    if (!partyId || !questId) return
    const result = this._context!.actions.offerRequest(partyId, questId)
    if (!result.ok) {
      this.setActionMessage(
        'error',
        result.message ?? '依頼を紹介できませんでした',
      )
    }
  }

  private setActionMessage(
    kind: 'error' | 'success' | 'info',
    text: string,
  ): void {
    this._uiState.actionMessage = { kind, text }
    this._context?.canvasGame.setUiState({ actionMessage: { kind, text } })
  }

  private clearActionMessage(): void {
    if (!this._uiState.actionMessage) return
    this._uiState.actionMessage = undefined
    this._context?.canvasGame.setUiState({ actionMessage: undefined })
  }

  private openActivityModal(title: string, text: string): void {
    const theme = this._context!.theme
    const content = new Container()
    const label = new GameLabel(text, theme, 'body', { maxWidth: 520 })
    label.y = MARGIN
    content.addChild(label)
    this._context!.overlayManager.openModal(title, content)
  }

  private handleOpenActivity(activity: TavernActivityItemViewModel): void {
    if (!activity.canOpen) return
    this.clearActionMessage()

    if (activity.narrativeStatus === 'viewed') {
      this.openActivityModal(activity.title, activity.summary)
      return
    }

    if (this._activityGenerationInFlight.has(activity.id)) return
    this._activityGenerationInFlight.add(activity.id)

    if (activity.narrativeStatus === 'generated') {
      // Already generated: no AI call, just confirm viewed state and display text.
      this._context!.actions.openActivity(activity.partyId!, activity.id)
        .then((result) => {
          this._activityGenerationInFlight.delete(activity.id)
          if (!result.ok || result.data === undefined) {
            this.setActionMessage(
              'error',
              result.message ?? '表示に失敗しました',
            )
            return
          }
          this.openActivityModal(activity.title, result.data)
        })
        .catch((e) => {
          this._activityGenerationInFlight.delete(activity.id)
          this.setActionMessage(
            'error',
            e instanceof Error ? e.message : '表示に失敗しました',
          )
        })
      return
    }

    // Unseen: lazy narrative generation (exactly one AI call per unseen event).
    const theme = this._context!.theme
    const loading = new GameLabel('生成中…', theme, 'body', { maxWidth: 520 })
    const loadingContainer = new Container()
    loading.y = MARGIN
    loadingContainer.addChild(loading)
    this._context!.overlayManager.openModal(activity.title, loadingContainer)

    this._context!.actions.openActivity(activity.partyId!, activity.id)
      .then((result) => {
        this._activityGenerationInFlight.delete(activity.id)
        if (!result.ok || result.data === undefined) {
          this._context!.overlayManager.openModal(
            activity.title,
            this.errorModalContent(
              result.message ?? '表示準備に失敗しました。',
            ),
          )
          this.setActionMessage(
            'error',
            result.message ?? '表示準備に失敗しました',
          )
          return
        }
        this.openActivityModal(activity.title, result.data)
      })
      .catch((e) => {
        this._activityGenerationInFlight.delete(activity.id)
        this._context!.overlayManager.openModal(
          activity.title,
          this.errorModalContent('表示準備に失敗しました。'),
        )
        this.setActionMessage(
          'error',
          e instanceof Error ? e.message : '表示準備に失敗しました',
        )
      })
  }

  private errorModalContent(text: string): Container {
    const theme = this._context!.theme
    const content = new Container()
    const label = new GameLabel(text, theme, 'body', { maxWidth: 520 })
    label.y = MARGIN
    content.addChild(label)
    return content
  }
}
