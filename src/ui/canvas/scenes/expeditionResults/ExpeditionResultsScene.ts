import { Container, Graphics } from 'pixi.js'
import type {
  CampaignParty,
  TavernCampaignState,
} from '../../../../core/tavern/campaign/types.ts'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import { AudioController } from '../../audio/AudioController.ts'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GamePanel } from '../../components/GamePanel.ts'
import { GameScrollView } from '../../components/GameScrollView.ts'
import { TavernListRow } from '../../components/TavernListRow.ts'
import type { GameScene, GameSceneContext, GameUiState } from '../../types.ts'
import type {
  SoundNovelSceneInput,
  SoundNovelVisualContext,
} from '../soundNovel/types.ts'
import {
  buildExpeditionResultsSceneViewModel,
  buildSummaryLines,
  type ExpeditionResultItemViewModel,
  type ExpeditionResultsSceneInput,
  type ExpeditionResultsSceneViewModel,
} from './expeditionResultsViewModel.ts'

const MARGIN = 16
const TOP_BAR_HEIGHT = 64
const BOTTOM_BAR_HEIGHT = 72
const LIST_WIDTH = 420
const LIST_ROW_HEIGHT = 74
const CONTENT_Y = TOP_BAR_HEIGHT + MARGIN
const CONTENT_HEIGHT =
  VIRTUAL_HEIGHT - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT - MARGIN * 3
const BOTTOM_Y = CONTENT_Y + CONTENT_HEIGHT + MARGIN
const DETAIL_X = LIST_WIDTH + MARGIN * 2
const DETAIL_WIDTH = VIRTUAL_WIDTH - LIST_WIDTH - MARGIN * 3

export class ExpeditionResultsScene implements GameScene {
  readonly id = 'expeditionResults'

  private _context: GameSceneContext | null = null
  private _root: Container | null = null
  private _campaign: TavernCampaignState | null = null
  private _uiState: GameUiState = {
    selectedPartyId: null,
    selectedQuestId: null,
    openCharacterId: null,
    modalOpen: false,
    viewedReportIds: [],
    viewedActivityIds: [],
  }
  private _inputDayNumber = 0
  private _selectedResultId?: string
  private _viewModel: ExpeditionResultsSceneViewModel | null = null
  private _narrativeGenerationInFlight = new Set<string>()

  mount(context: GameSceneContext, input?: unknown): void {
    this._context = context
    const typedInput = input as ExpeditionResultsSceneInput | undefined
    this._campaign = typedInput?.campaign ?? this._campaign
    this._inputDayNumber = typedInput?.dayNumber ?? this._inputDayNumber
    this._selectedResultId =
      typedInput?.selectedResultId ?? this._selectedResultId

    this._root = new Container()
    context.layers.ui.addChild(this._root)

    AudioController.playBgm('expeditionReports')

    if (this._campaign) {
      this.updateViewModel()
      this.render()
    }
  }

  unmount(): void {
    AudioController.stopBgm()
    if (this._root && this._root.parent) {
      this._root.parent.removeChild(this._root)
    }
    this._root?.destroy({ children: true })
    this._root = null
    this._context = null
  }

  setCampaign(campaign: TavernCampaignState, uiState: GameUiState): void {
    this._campaign = campaign
    this._uiState = { ...uiState }
    this.updateViewModel()
    this.render()
  }

  setUiState(uiState: GameUiState): void {
    this._uiState = { ...uiState }
    this.updateViewModel()
    this.render()
  }

  private updateViewModel(): void {
    if (!this._campaign) return
    const dayNumber =
      this._inputDayNumber > 0 ? this._inputDayNumber : this._campaign.dayNumber
    this._viewModel = buildExpeditionResultsSceneViewModel(
      {
        campaign: this._campaign,
        dayNumber,
        selectedResultId: this._selectedResultId,
      },
      this._uiState.viewedReportIds ?? [],
    )
    if (this._viewModel.selectedResult) {
      this._selectedResultId = this._viewModel.selectedResult.id
    }
  }

  private render(): void {
    if (!this._context || !this._root || !this._viewModel) return

    this._root.removeChildren()
    this.drawBackground(this._context)
    this.drawHeader(this._context, this._viewModel.dayLabel)
    this.drawResultsList(this._context, this._viewModel)
    this.drawDetailPanel(this._context, this._viewModel)
    this.drawFooter(this._context, this._viewModel)
  }

  private drawBackground(context: GameSceneContext): void {
    const bg = new Graphics()
    bg.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill({
      color: context.theme.colors.background,
    })
    this._root!.addChild(bg)
  }

  private drawHeader(context: GameSceneContext, dayLabel: string): void {
    const title = new GameLabel(dayLabel, context.theme, 'heading')
    title.anchor.set(0, 0.5)
    title.x = MARGIN
    title.y = TOP_BAR_HEIGHT / 2
    this._root!.addChild(title)
  }

  private drawResultsList(
    context: GameSceneContext,
    viewModel: ExpeditionResultsSceneViewModel,
  ): void {
    const panel = new GamePanel({
      width: LIST_WIDTH,
      height: CONTENT_HEIGHT,
      theme: context.theme,
      title: '帰還したパーティ',
      alpha: 0.82,
    })
    panel.x = MARGIN
    panel.y = CONTENT_Y
    this._root!.addChild(panel)

    if (viewModel.results.length === 0) {
      const empty = new GameLabel(
        '本日の帰還結果はありません',
        context.theme,
        'body',
        { maxWidth: LIST_WIDTH - MARGIN * 2 },
      )
      empty.x = MARGIN * 2
      empty.y = CONTENT_Y + MARGIN * 2
      this._root!.addChild(empty)
      return
    }

    const scroll = new GameScrollView(
      context.theme,
      LIST_WIDTH - MARGIN * 2,
      CONTENT_HEIGHT - 60,
    )
    scroll.x = MARGIN * 2
    scroll.y = CONTENT_Y + 50

    for (let i = 0; i < viewModel.results.length; i++) {
      const result = viewModel.results[i]
      const row = new TavernListRow({
        width: LIST_WIDTH - MARGIN * 2,
        height: LIST_ROW_HEIGHT,
        theme: context.theme,
        title: result.partyName,
        subtitle: result.questTitle,
        trailing: result.outcomeLabel,
        selected: result.id === this._selectedResultId,
        unread: !result.seen,
      })
      row.onActivate = () => this.selectResult(result.id)
      scroll.addItem(row)
    }

    this._root!.addChild(scroll)
  }

  private drawDetailPanel(
    context: GameSceneContext,
    viewModel: ExpeditionResultsSceneViewModel,
  ): void {
    const panel = new GamePanel({
      width: DETAIL_WIDTH,
      height: CONTENT_HEIGHT,
      theme: context.theme,
      title: '選択中の結果詳細',
      alpha: 0.82,
    })
    panel.x = DETAIL_X
    panel.y = CONTENT_Y
    this._root!.addChild(panel)

    const selected = viewModel.selectedResult
    if (!selected) {
      const empty = new GameLabel(
        '左の一覧から結果を選択してください',
        context.theme,
        'body',
        { maxWidth: DETAIL_WIDTH - MARGIN * 2 },
      )
      empty.x = DETAIL_X + MARGIN
      empty.y = CONTENT_Y + MARGIN * 2
      this._root!.addChild(empty)
      return
    }

    let y = CONTENT_Y + 56
    const left = DETAIL_X + MARGIN

    const partyLabel = new GameLabel(
      `Party：${selected.partyName}`,
      context.theme,
      'body',
      { maxWidth: DETAIL_WIDTH - MARGIN * 2 },
    )
    partyLabel.x = left
    partyLabel.y = y
    this._root!.addChild(partyLabel)
    y += partyLabel.height + 8

    const questLabel = new GameLabel(
      `依頼：${selected.questTitle}`,
      context.theme,
      'body',
      { maxWidth: DETAIL_WIDTH - MARGIN * 2 },
    )
    questLabel.x = left
    questLabel.y = y
    this._root!.addChild(questLabel)
    y += questLabel.height + 16

    for (const line of selected.summaryLines) {
      const label = new GameLabel(line, context.theme, 'body', {
        maxWidth: DETAIL_WIDTH - MARGIN * 2,
      })
      label.x = left
      label.y = y
      this._root!.addChild(label)
      y += label.height + 8
    }

    y += 16

    const reportButton = new GameButton({
      width: 180,
      height: 44,
      theme: context.theme,
      label: '構造化報告を見る',
    })
    reportButton.x = left
    reportButton.y = y
    reportButton.onActivate = () => this.openReportOverlay(selected)
    this._root!.addChild(reportButton)

    const narrativeButton = new GameButton({
      width: 180,
      height: 44,
      theme: context.theme,
      label: '物語として読む',
      disabled: !selected.canGenerateNarrative && !selected.generatedText,
    })
    narrativeButton.x = left + 196
    narrativeButton.y = y
    narrativeButton.onActivate = () => this.openNarrative(selected)
    this._root!.addChild(narrativeButton)
  }

  private drawFooter(
    context: GameSceneContext,
    viewModel: ExpeditionResultsSceneViewModel,
  ): void {
    const backButton = new GameButton({
      width: 240,
      height: 48,
      theme: context.theme,
      label: 'すべて確認して酒場へ戻る',
    })
    backButton.x = MARGIN
    backButton.y = BOTTOM_Y + (BOTTOM_BAR_HEIGHT - 48) / 2
    backButton.onActivate = () => this.returnToTavern()
    this._root!.addChild(backButton)

    const prevButton = new GameButton({
      width: 120,
      height: 48,
      theme: context.theme,
      label: '前の結果',
      disabled: !viewModel.canGoPrevious,
    })
    prevButton.x = VIRTUAL_WIDTH - 280 - MARGIN
    prevButton.y = BOTTOM_Y + (BOTTOM_BAR_HEIGHT - 48) / 2
    prevButton.onActivate = () => this.goPrevious()
    this._root!.addChild(prevButton)

    const nextButton = new GameButton({
      width: 120,
      height: 48,
      theme: context.theme,
      label: '次の結果',
      disabled: !viewModel.canGoNext,
    })
    nextButton.x = VIRTUAL_WIDTH - 140 - MARGIN
    nextButton.y = BOTTOM_Y + (BOTTOM_BAR_HEIGHT - 48) / 2
    nextButton.onActivate = () => this.goNext()
    this._root!.addChild(nextButton)
  }

  private selectResult(id: string): void {
    this._selectedResultId = id
    this.markReportViewed(id)
    this.updateViewModel()
    this.render()
  }

  private goPrevious(): void {
    if (!this._viewModel || this._viewModel.selectedIndex <= 0) return
    const index = this._viewModel.selectedIndex - 1
    this.selectResult(this._viewModel.results[index].id)
  }

  private goNext(): void {
    if (
      !this._viewModel ||
      this._viewModel.selectedIndex >= this._viewModel.results.length - 1
    )
      return
    const index = this._viewModel.selectedIndex + 1
    this.selectResult(this._viewModel.results[index].id)
  }

  private returnToTavern(): void {
    this._context?.canvasGame.sceneManager?.show('tavern')
  }

  private markReportViewed(id: string): void {
    const viewed = new Set(this._uiState.viewedReportIds ?? [])
    if (viewed.has(id)) return
    viewed.add(id)
    this._context?.canvasGame?.setUiState({
      viewedReportIds: Array.from(viewed),
    })
  }

  private openReportOverlay(result: ExpeditionResultItemViewModel): void {
    const theme = this._context!.theme
    const content = new Container()
    const scroll = new GameScrollView(theme, 520, 180)
    content.addChild(scroll)

    const lines = buildSummaryLines(result)
    let y = 0
    for (const line of lines) {
      const label = new GameLabel(line, theme, 'body', {
        maxWidth: 520,
      })
      label.y = y
      scroll.addItem(label)
      y += label.height + 8
    }

    const narrativeButton = new GameButton({
      width: 180,
      height: 40,
      theme,
      label: '物語として読む',
      disabled: !result.canGenerateNarrative && !result.generatedText,
    })
    narrativeButton.onActivate = () => {
      this._context!.overlayManager.closeModal()
      this.openNarrative(result)
    }

    const footer = new Container()
    footer.addChild(narrativeButton)

    this._context!.overlayManager.openModal('構造化報告', content, footer)
  }

  private openNarrative(result: ExpeditionResultItemViewModel): void {
    if (this._narrativeGenerationInFlight.has(result.id)) return

    if (result.generatedText && result.generatedText.length > 0) {
      this.openSoundNovel(result, result.generatedText)
      return
    }

    if (!result.narrativeTargetId) {
      this._context!.overlayManager.openModal(
        '遠征の物語',
        'この報告には物語が紐づいていません。',
      )
      return
    }

    if (!this._context!.actions.openExpeditionNarrative) {
      this._context!.overlayManager.openModal(
        '遠征の物語',
        '物語生成機能が有効になっていません。',
      )
      return
    }

    this._narrativeGenerationInFlight.add(result.id)
    this._context!.actions.openExpeditionNarrative(result.narrativeTargetId)
      .then((res) => {
        this._narrativeGenerationInFlight.delete(result.id)
        if (!res.ok || res.data === undefined) {
          this._context!.overlayManager.openModal(
            '遠征の物語',
            `物語の生成に失敗しました。${res.message ?? ''}`,
          )
          return
        }
        this.openSoundNovel(result, res.data)
      })
      .catch(() => {
        this._narrativeGenerationInFlight.delete(result.id)
        this._context!.overlayManager.openModal(
          '遠征の物語',
          '物語の生成に失敗しました。',
        )
      })
  }

  private openSoundNovel(
    result: ExpeditionResultItemViewModel,
    text: string,
  ): void {
    const party = result.partyId
      ? this._campaign?.parties.find((p) => p.id === result.partyId)
      : undefined
    const visualContext: SoundNovelVisualContext = {
      environment: result.environment,
      participantIds: party?.party.members.map((m) => m.id),
      focusCharacterIds: this.buildFocusCharacterIds(party),
    }

    const input: SoundNovelSceneInput = {
      narrativeId: result.narrativeTargetId ?? result.id,
      source: 'expedition',
      title: `遠征の物語：${result.questTitle}`,
      text,
      visualContext,
      returnTarget: {
        sceneId: 'expeditionResults',
        reportId: result.id,
        partyId: result.partyId,
      },
      mood: this.resolveReportMood(result),
    }

    this._context?.canvasGame.sceneManager?.push('soundNovel', input)
  }

  private resolveReportMood(
    result: ExpeditionResultItemViewModel,
  ): 'daily' | 'tension' | 'sad' {
    if (result.outcome === 'failure' || result.outcome === 'retreat') {
      return 'sad'
    }
    const env = (result.environment ?? '').toLowerCase()
    const tenseEnvironments = [
      'forest',
      'cave',
      'ruins',
      'dungeon',
      'mountain',
      'wetland',
      'swamp',
    ]
    if (
      tenseEnvironments.includes(env) ||
      tenseEnvironments.some((value) => env.includes(value))
    ) {
      return 'tension'
    }
    return 'daily'
  }

  private buildFocusCharacterIds(party: CampaignParty | undefined): string[] {
    if (!party) return []
    const leader = party.party.members.find(
      (m) => m.id === party.party.leaderId,
    )
    const first = party.party.members[0]
    const ids = new Set<string>()
    if (leader) ids.add(leader.id)
    if (first) ids.add(first.id)
    return Array.from(ids)
  }
}
