import { Container, Graphics } from 'pixi.js'
import type {
  CampaignParty,
  TavernCampaignState,
} from '../../../../core/tavern/campaign/types.ts'
import {
  formatLedgerAmount,
  formatSignedCurrencyAmount,
} from '../../../../core/economy/index.ts'
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
  buildDayResultsSceneViewModel,
  type DayResultEventViewModel,
  type DayResultsSceneInput,
  type DayResultsSceneViewModel,
  type DayResultsStep,
  type ExpeditionResultItemViewModel,
} from './dayResultsViewModel.ts'

const MARGIN = 16
const TOP_BAR_HEIGHT = 64
const BOTTOM_BAR_HEIGHT = 72
const LIST_WIDTH = 420
const LIST_ROW_HEIGHT = 74
const CONTENT_Y = TOP_BAR_HEIGHT + MARGIN
const CONTENT_HEIGHT =
  VIRTUAL_HEIGHT - TOP_BAR_HEIGHT - BOTTOM_BAR_HEIGHT - MARGIN * 3
const FINANCE_SUMMARY_HEIGHT = 132
const BOTTOM_Y = CONTENT_Y + CONTENT_HEIGHT + MARGIN
const DETAIL_X = LIST_WIDTH + MARGIN * 2
const DETAIL_WIDTH = VIRTUAL_WIDTH - LIST_WIDTH - MARGIN * 3

export class DayResultsScene implements GameScene {
  readonly id = 'dayResults'

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
  private _resolvedDay = 0
  private _nextDay = 0
  private _step: DayResultsStep = 'important_events'
  private _selectedResultId?: string
  private _returnTarget: { sceneId: string } = { sceneId: 'tavern' }
  private _viewModel: DayResultsSceneViewModel | null = null
  private _narrativeGenerationInFlight = new Set<string>()
  private _spinner: Container | null = null

  mount(context: GameSceneContext, input?: unknown): void {
    this._context = context
    const typedInput = input as DayResultsSceneInput | undefined
    this._campaign = typedInput?.campaign ?? this._campaign
    this._resolvedDay = typedInput?.resolvedDay ?? this._resolvedDay
    this._nextDay = typedInput?.nextDay ?? this._nextDay
    this._step = typedInput?.step ?? this._step
    this._selectedResultId =
      typedInput?.selectedResultId ?? this._selectedResultId
    this._returnTarget = typedInput?.returnTarget ?? { sceneId: 'tavern' }

    this._root = new Container()
    context.layers.ui.addChild(this._root)

    AudioController.playBgm('expeditionReports')

    if (this._campaign) {
      this.updateViewModel()
      this.render()
    }
  }

  unmount(): void {
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
    if (uiState.lastDayResultsStep) {
      this._step = uiState.lastDayResultsStep
    }
    if (uiState.lastSelectedResultId) {
      this._selectedResultId = uiState.lastSelectedResultId
    }
    this.updateViewModel()
    this.render()
  }

  setUiState(uiState: GameUiState): void {
    this._uiState = { ...uiState }
    if (uiState.lastDayResultsStep) {
      this._step = uiState.lastDayResultsStep
    }
    if (uiState.lastSelectedResultId) {
      this._selectedResultId = uiState.lastSelectedResultId
    }
    this.updateViewModel()
    this.render()
  }

  update(_dt: number): void {
    if (this._spinner) {
      this._spinner.rotation += _dt * 0.004
    }
  }

  private updateViewModel(): void {
    if (!this._campaign) return
    this._viewModel = buildDayResultsSceneViewModel(
      {
        campaign: this._campaign,
        resolvedDay: this._resolvedDay,
        nextDay: this._nextDay,
        step: this._step,
        selectedResultId: this._selectedResultId,
        returnTarget: this._returnTarget,
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
    this.drawHeader(this._context, this._viewModel)
    this.drawStepContent(this._context, this._viewModel)
    this.drawFooter(this._context, this._viewModel)
  }

  private drawBackground(context: GameSceneContext): void {
    const bg = new Graphics()
    bg.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill({
      color: context.theme.colors.background,
    })
    this._root!.addChild(bg)
  }

  private drawHeader(
    context: GameSceneContext,
    viewModel: DayResultsSceneViewModel,
  ): void {
    const title =
      viewModel.step === 'important_events'
        ? `DAY ${viewModel.resolvedDay} の重要な出来事`
        : `DAY ${viewModel.resolvedDay} の依頼結果`
    const label = new GameLabel(title, context.theme, 'heading')
    label.anchor.set(0, 0.5)
    label.x = MARGIN
    label.y = TOP_BAR_HEIGHT / 2
    this._root!.addChild(label)

    const stepText =
      viewModel.step === 'important_events' ? 'STEP 1 / 2' : 'STEP 2 / 2'
    const stepLabel = new GameLabel(stepText, context.theme, 'caption')
    stepLabel.anchor.set(1, 0.5)
    stepLabel.x = VIRTUAL_WIDTH - MARGIN
    stepLabel.y = TOP_BAR_HEIGHT / 2
    this._root!.addChild(stepLabel)
  }

  private drawStepContent(
    context: GameSceneContext,
    viewModel: DayResultsSceneViewModel,
  ): void {
    if (viewModel.step === 'important_events') {
      this.drawImportantEvents(context, viewModel)
    } else {
      this.drawExpeditionResults(context, viewModel)
    }
  }

  private drawImportantEvents(
    context: GameSceneContext,
    viewModel: DayResultsSceneViewModel,
  ): void {
    const panel = new GamePanel({
      width: VIRTUAL_WIDTH - MARGIN * 2,
      height: CONTENT_HEIGHT,
      theme: context.theme,
      title: '本日の出来事',
      alpha: 0.82,
    })
    panel.x = MARGIN
    panel.y = CONTENT_Y
    this._root!.addChild(panel)

    if (viewModel.importantEvents.length === 0) {
      const empty = new GameLabel(
        '今日は特に大きな出来事はありませんでした。',
        context.theme,
        'body',
        { maxWidth: VIRTUAL_WIDTH - MARGIN * 4 },
      )
      empty.x = MARGIN * 2
      empty.y = CONTENT_Y + MARGIN * 2
      this._root!.addChild(empty)
      return
    }

    const scroll = new GameScrollView(
      context.theme,
      VIRTUAL_WIDTH - MARGIN * 4,
      CONTENT_HEIGHT - 60,
    )
    scroll.x = MARGIN * 2
    scroll.y = CONTENT_Y + 50

    for (const event of viewModel.importantEvents) {
      const row = this.buildImportantEventRow(context, event)
      scroll.addItem(row)
    }

    this._root!.addChild(scroll)
  }

  private buildImportantEventRow(
    context: GameSceneContext,
    event: DayResultEventViewModel,
  ): Container {
    const width = VIRTUAL_WIDTH - MARGIN * 4
    const row = new Container()

    const title = new GameLabel(event.title, context.theme, 'body', {
      maxWidth: width - MARGIN * 2,
    })
    title.x = MARGIN
    title.y = MARGIN
    row.addChild(title)

    const summary = new GameLabel(event.summary, context.theme, 'caption', {
      maxWidth: width - MARGIN * 2,
    })
    summary.x = MARGIN
    summary.y = title.y + title.height + 6
    row.addChild(summary)

    let rowHeight = summary.y + summary.height + MARGIN

    if (event.narrativeTargetId) {
      const narrativeButton = new GameButton({
        width: 140,
        height: 32,
        theme: context.theme,
        label: '物語として読む',
      })
      narrativeButton.x = MARGIN
      narrativeButton.y = rowHeight
      narrativeButton.onActivate = () => this.openNarrativeForEvent(event)
      row.addChild(narrativeButton)
      rowHeight += 40
    }

    const separator = new Graphics()
    separator
      .rect(0, rowHeight - 2, width - MARGIN * 2, 1)
      .fill({ color: context.theme.colors.panelBorder, alpha: 0.4 })
    row.addChild(separator)

    row.height = rowHeight
    return row
  }

  private drawExpeditionResults(
    context: GameSceneContext,
    viewModel: DayResultsSceneViewModel,
  ): void {
    const contentStartY = CONTENT_Y + FINANCE_SUMMARY_HEIGHT + MARGIN
    const contentHeight = CONTENT_HEIGHT - FINANCE_SUMMARY_HEIGHT - MARGIN

    this.drawFinanceSummary(context, viewModel, CONTENT_Y)
    this.drawResultsList(context, viewModel, contentStartY, contentHeight)
    this.drawDetailPanel(context, viewModel, contentStartY, contentHeight)
  }

  private drawFinanceSummary(
    context: GameSceneContext,
    viewModel: DayResultsSceneViewModel,
    startY: number,
  ): void {
    const panel = new GamePanel({
      width: VIRTUAL_WIDTH - MARGIN * 2,
      height: FINANCE_SUMMARY_HEIGHT,
      theme: context.theme,
      title: '本日の収支',
      alpha: 0.82,
    })
    panel.x = MARGIN
    panel.y = startY
    this._root!.addChild(panel)

    const summary = viewModel.dailyFinanceSummary
    const left = MARGIN * 2
    const right = VIRTUAL_WIDTH - MARGIN * 2
    const rowHeight = 22
    let y = startY + 42

    const commissionLabel = new GameLabel('依頼仲介収入', context.theme, 'body')
    commissionLabel.anchor.set(0, 0.5)
    commissionLabel.x = left
    commissionLabel.y = y
    this._root!.addChild(commissionLabel)

    const commissionValue = new GameLabel(
      formatLedgerAmount(summary.commissionIncome),
      context.theme,
      'body',
    )
    commissionValue.anchor.set(1, 0.5)
    commissionValue.x = right
    commissionValue.y = y
    this._root!.addChild(commissionValue)
    y += rowHeight

    const operatingLabel = new GameLabel('営業費', context.theme, 'body')
    operatingLabel.anchor.set(0, 0.5)
    operatingLabel.x = left
    operatingLabel.y = y
    this._root!.addChild(operatingLabel)

    const operatingValue = new GameLabel(
      formatLedgerAmount(summary.operatingCost),
      context.theme,
      'body',
    )
    operatingValue.anchor.set(1, 0.5)
    operatingValue.x = right
    operatingValue.y = y
    this._root!.addChild(operatingValue)
    y += rowHeight + 4

    const separator = new Graphics()
    separator
      .rect(left, y - 2, right - left - MARGIN * 2, 1)
      .fill({ color: context.theme.colors.panelBorder, alpha: 0.6 })
    this._root!.addChild(separator)

    const netLabel = new GameLabel('本日収支', context.theme, 'body')
    netLabel.anchor.set(0, 0.5)
    netLabel.x = left
    netLabel.y = y
    this._root!.addChild(netLabel)

    const netValue = new GameLabel(
      formatLedgerAmount(summary.net),
      context.theme,
      'body',
    )
    netValue.anchor.set(1, 0.5)
    netValue.x = right
    netValue.y = y
    this._root!.addChild(netValue)
    y += rowHeight

    const fundsLabel = new GameLabel(
      `現在資金 ${formatSignedCurrencyAmount(summary.currentFunds)}`,
      context.theme,
      'body',
    )
    fundsLabel.anchor.set(0, 0.5)
    fundsLabel.x = left
    fundsLabel.y = y
    this._root!.addChild(fundsLabel)
  }

  private drawResultsList(
    context: GameSceneContext,
    viewModel: DayResultsSceneViewModel,
    startY: number,
    panelHeight: number,
  ): void {
    const panel = new GamePanel({
      width: LIST_WIDTH,
      height: panelHeight,
      theme: context.theme,
      title: '帰還したパーティ',
      alpha: 0.82,
    })
    panel.x = MARGIN
    panel.y = startY
    this._root!.addChild(panel)

    if (viewModel.expeditionResults.length === 0) {
      const empty = new GameLabel(
        '本日帰還したパーティはありません。',
        context.theme,
        'body',
        { maxWidth: LIST_WIDTH - MARGIN * 2 },
      )
      empty.x = MARGIN * 2
      empty.y = startY + MARGIN * 2
      this._root!.addChild(empty)
      return
    }

    const scroll = new GameScrollView(
      context.theme,
      LIST_WIDTH - MARGIN * 2,
      panelHeight - 60,
    )
    scroll.x = MARGIN * 2
    scroll.y = startY + 50

    for (let i = 0; i < viewModel.expeditionResults.length; i++) {
      const result = viewModel.expeditionResults[i]
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
    viewModel: DayResultsSceneViewModel,
    startY: number,
    panelHeight: number,
  ): void {
    const panel = new GamePanel({
      width: DETAIL_WIDTH,
      height: panelHeight,
      theme: context.theme,
      title: '選択中の結果詳細',
      alpha: 0.82,
    })
    panel.x = DETAIL_X
    panel.y = startY
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
      empty.y = startY + MARGIN * 2
      this._root!.addChild(empty)
      return
    }

    let y = startY + 56
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

    const narrativeButton = new GameButton({
      width: 180,
      height: 44,
      theme: context.theme,
      label: '物語として読む',
      disabled: !selected.canGenerateNarrative && !selected.generatedText,
    })
    narrativeButton.x = left
    narrativeButton.y = y
    narrativeButton.onActivate = () => this.openNarrativeForResult(selected)
    this._root!.addChild(narrativeButton)
  }

  private drawFooter(
    context: GameSceneContext,
    viewModel: DayResultsSceneViewModel,
  ): void {
    if (viewModel.step === 'important_events') {
      const nextButton = new GameButton({
        width: 160,
        height: 48,
        theme: context.theme,
        label: '次へ',
      })
      nextButton.x = VIRTUAL_WIDTH - MARGIN - 160
      nextButton.y = BOTTOM_Y + (BOTTOM_BAR_HEIGHT - 48) / 2
      nextButton.onActivate = () => this.goToExpeditionResults()
      this._root!.addChild(nextButton)
      return
    }

    const prevButton = new GameButton({
      width: 120,
      height: 48,
      theme: context.theme,
      label: '前へ',
    })
    prevButton.x = MARGIN
    prevButton.y = BOTTOM_Y + (BOTTOM_BAR_HEIGHT - 48) / 2
    prevButton.onActivate = () => this.goToImportantEvents()
    this._root!.addChild(prevButton)

    const prevResultButton = new GameButton({
      width: 120,
      height: 48,
      theme: context.theme,
      label: '前の結果',
      disabled: !viewModel.canGoPrevious,
    })
    prevResultButton.x = VIRTUAL_WIDTH - 400 - MARGIN
    prevResultButton.y = BOTTOM_Y + (BOTTOM_BAR_HEIGHT - 48) / 2
    prevResultButton.onActivate = () => this.goPreviousResult()
    this._root!.addChild(prevResultButton)

    const nextResultButton = new GameButton({
      width: 120,
      height: 48,
      theme: context.theme,
      label: '次の結果',
      disabled: !viewModel.canGoNext,
    })
    nextResultButton.x = VIRTUAL_WIDTH - 260 - MARGIN
    nextResultButton.y = BOTTOM_Y + (BOTTOM_BAR_HEIGHT - 48) / 2
    nextResultButton.onActivate = () => this.goNextResult()
    this._root!.addChild(nextResultButton)

    const advanceButton = new GameButton({
      width: 120,
      height: 48,
      theme: context.theme,
      label: '翌日へ',
    })
    advanceButton.x = VIRTUAL_WIDTH - 120 - MARGIN
    advanceButton.y = BOTTOM_Y + (BOTTOM_BAR_HEIGHT - 48) / 2
    advanceButton.onActivate = () => this.goToNextDay()
    this._root!.addChild(advanceButton)
  }

  private goToImportantEvents(): void {
    this.updateStep('important_events')
  }

  private goToExpeditionResults(): void {
    this.updateStep('expedition_results')
  }

  private updateStep(step: DayResultsStep): void {
    this._step = step
    this._context?.canvasGame.setUiState({
      ...this._uiState,
      lastDayResultsStep: step,
    })
  }

  private goToNextDay(): void {
    this._context?.canvasGame.setUiState({
      ...this._uiState,
      lastDayResultsStep: undefined,
      lastSelectedResultId: undefined,
    })
    this._context?.canvasGame.sceneManager?.pop()
  }

  private goPreviousResult(): void {
    if (!this._viewModel || this._viewModel.selectedIndex <= 0) return
    const index = this._viewModel.selectedIndex - 1
    this.selectResult(this._viewModel.expeditionResults[index].id)
  }

  private goNextResult(): void {
    if (
      !this._viewModel ||
      this._viewModel.selectedIndex >=
        this._viewModel.expeditionResults.length - 1
    )
      return
    const index = this._viewModel.selectedIndex + 1
    this.selectResult(this._viewModel.expeditionResults[index].id)
  }

  private selectResult(id: string): void {
    this._selectedResultId = id
    this.markReportViewed(id)
    this.updateViewModel()
    this.render()
  }

  private markReportViewed(id: string): void {
    const viewed = new Set(this._uiState.viewedReportIds ?? [])
    if (viewed.has(id)) return
    viewed.add(id)
    this._context?.canvasGame?.setUiState({
      ...this._uiState,
      viewedReportIds: Array.from(viewed),
      lastSelectedResultId: this._selectedResultId,
    })
  }

  private openNarrativeForResult(result: ExpeditionResultItemViewModel): void {
    if (this._narrativeGenerationInFlight.has(result.id)) return

    if (result.generatedText && result.generatedText.length > 0) {
      this.openSoundNovelForResult(result, result.generatedText)
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
    this.openGeneratingModal('遠征の物語')
    this._context!.actions.openExpeditionNarrative(result.narrativeTargetId)
      .then((res) => {
        this._narrativeGenerationInFlight.delete(result.id)
        if (!res.ok || res.data === undefined) {
          this.showNarrativeError('遠征の物語', res.message)
          return
        }
        this.closeGeneratingModal()
        this.openSoundNovelForResult(result, res.data)
      })
      .catch(() => {
        this._narrativeGenerationInFlight.delete(result.id)
        this.showNarrativeError('遠征の物語')
      })
  }

  private openSoundNovelForResult(
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

    this._context?.canvasGame.setUiState({
      ...this._uiState,
      lastDayResultsStep: this._step,
      lastSelectedResultId: result.id,
    })

    const input: SoundNovelSceneInput = {
      narrativeId: result.narrativeTargetId ?? result.id,
      source: 'expedition',
      title: `遠征の物語：${result.questTitle}`,
      text,
      visualContext,
      returnTarget: { sceneId: 'dayResults', reportId: result.id },
      mood: this.resolveReportMood(result),
    }

    this._context?.canvasGame.sceneManager?.push('soundNovel', input)
  }

  private openNarrativeForEvent(event: DayResultEventViewModel): void {
    if (!event.narrativeTargetId) return
    if (this._narrativeGenerationInFlight.has(event.narrativeTargetId)) return

    const candidate = this._campaign?.narrativeCandidates.find(
      (c) => c.id === event.narrativeTargetId,
    )
    if (!candidate) return

    const existing = this._campaign?.narrativeGenerations.find(
      (g) => g.candidateId === candidate.id,
    )
    if (existing) {
      this.openSoundNovelForEvent(event, existing.generatedText)
      return
    }

    if (!this._context!.actions.openExpeditionNarrative) {
      this._context!.overlayManager.openModal(
        '出来事の物語',
        '物語生成機能が有効になっていません。',
      )
      return
    }

    this._narrativeGenerationInFlight.add(event.narrativeTargetId)
    this.openGeneratingModal('出来事の物語')
    this._context!.actions.openExpeditionNarrative(event.narrativeTargetId)
      .then((res) => {
        this._narrativeGenerationInFlight.delete(event.narrativeTargetId!)
        if (!res.ok || res.data === undefined) {
          this.showNarrativeError('出来事の物語', res.message)
          return
        }
        this.closeGeneratingModal()
        this.openSoundNovelForEvent(event, res.data)
      })
      .catch(() => {
        this._narrativeGenerationInFlight.delete(event.narrativeTargetId!)
        this.showNarrativeError('出来事の物語')
      })
  }

  private openSoundNovelForEvent(
    event: DayResultEventViewModel,
    text: string,
  ): void {
    const party = event.partyId
      ? this._campaign?.parties.find((p) => p.id === event.partyId)
      : undefined
    const visualContext: SoundNovelVisualContext = {
      environment: 'tavern',
      participantIds: party?.party.members.map((m) => m.id),
      focusCharacterIds: this.buildFocusCharacterIds(party),
    }

    this._context?.canvasGame.setUiState({
      ...this._uiState,
      lastDayResultsStep: 'important_events',
      lastSelectedResultId: this._selectedResultId,
    })

    const title =
      event.kind === 'stayExtended'
        ? '滞在延長の物語'
        : event.kind === 'partyArrival'
          ? '新しい仲間の物語'
          : '出来事の物語'

    const input: SoundNovelSceneInput = {
      narrativeId: event.narrativeTargetId ?? event.id,
      source: 'stay_extension',
      title,
      text,
      visualContext,
      returnTarget: { sceneId: 'dayResults', partyId: event.partyId },
      mood: 'daily',
    }

    this._context?.canvasGame.sceneManager?.push('soundNovel', input)
  }

  private openGeneratingModal(title: string): void {
    if (!this._context) return
    const theme = this._context.theme
    const content = new Container()
    const bodyWidth = 600 - theme.spacing.s48

    const label = new GameLabel('生成中です', theme, 'body', {
      align: 'center',
      maxWidth: bodyWidth,
    })
    const measured = label.measure()
    label.x = (bodyWidth - measured.width) / 2
    label.y = 0
    content.addChild(label)

    const spinner = new Container()
    const graphics = new Graphics()
    graphics.arc(0, 0, 14, Math.PI * 0.2, Math.PI * 1.6, false)
    graphics.stroke({ width: 4, color: theme.colors.textPrimary })
    spinner.addChild(graphics)
    spinner.x = bodyWidth / 2
    spinner.y = 48
    content.addChild(spinner)

    this._spinner = spinner
    this._context.overlayManager.openModal(title, content)
  }

  private closeGeneratingModal(): void {
    this._spinner = null
    this._context?.overlayManager.closeModal()
  }

  private showNarrativeError(title: string, message?: string): void {
    this._spinner = null
    const body =
      message && message.length > 0
        ? `物語の生成に失敗しました。${message}`
        : '物語の生成に失敗しました。'
    this._context!.overlayManager.openModal(title, body)
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
