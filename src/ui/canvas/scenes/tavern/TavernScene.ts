import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import type {
  CampaignParty,
  TavernCampaignState,
} from '../../../../core/tavern/campaign/types.ts'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GameScrollView } from '../../components/GameScrollView.ts'
import { TavernListRow } from '../../components/TavernListRow.ts'
import { OUTCOME_LABELS } from '../../../expedition/labels.ts'
import { getPredictionLabel } from '../../../tavern/predictionLabels.ts'
import {
  AudioController,
  type BgmTrackId,
} from '../../audio/AudioController.ts'
import type { GameScene, GameSceneContext, GameUiState } from '../../types.ts'
import {
  buildTavernScreenViewModel,
  type TavernScreenViewModel,
} from '../../viewModel/tavernScreenViewModel.ts'
import type { TavernActivityItemViewModel } from '../../viewModel/tavernScreenViewModel.ts'
import {
  findExpeditionReportById,
  type ExpeditionReportViewModel,
} from '../../viewModel/expeditionReportViewModel.ts'
import type {
  SoundNovelSceneInput,
  SoundNovelVisualContext,
} from '../soundNovel/types.ts'
import {
  buildExpeditionResultsSceneViewModel,
  type ExpeditionResultsSceneInput,
} from '../expeditionResults/expeditionResultsViewModel.ts'
import { ActivityPanel } from './ActivityPanel.ts'
import { DecisionPanel } from './DecisionPanel.ts'
import { PartyListPanel } from './PartyListPanel.ts'
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
    viewedReportIds: [],
    viewedActivityIds: [],
  }
  private _viewModel: TavernScreenViewModel | null = null
  private _header: TavernHeader | null = null
  private _partyList: PartyListPanel | null = null
  private _decisionPanel: DecisionPanel | null = null
  private _questList: QuestListPanel | null = null
  private _activityPanel: ActivityPanel | null = null
  private _autoSelectPending = true
  private _activityGenerationInFlight = new Set<string>()
  private _narrativeGenerationInFlight = new Set<string>()
  private _shownHighFeedbackIds = new Set<string>()
  private _previousPartyCount = 0
  private _modalTrack: BgmTrackId | null = null

  mount(context: GameSceneContext): void {
    this._context = context

    this._backgroundRoot = new Container()
    context.layers.background.addChild(this._backgroundRoot)

    this._uiRoot = new Container()
    context.layers.ui.addChild(this._uiRoot)

    this.drawBackground(context)
    this.createPanels(context)

    context.overlayManager.onClose(() => this.handleModalClose())
    AudioController.playBgm('tavern')

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
    this._decisionPanel = null
    this._questList = null
    this._activityPanel = null
    this._context = null
    this._campaign = null
    this._activityGenerationInFlight.clear()
    this._narrativeGenerationInFlight.clear()
    this._shownHighFeedbackIds.clear()
    this._autoSelectPending = true
    this._modalTrack = null
    AudioController.stopBgm()
  }

  setCampaign(campaign: TavernCampaignState, uiState: GameUiState): void {
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
    const previousDayNumber = this._campaign?.dayNumber ?? 0
    const previousStatus = this._campaign?.currentDay.status
    const previousPartyCount = this._campaign?.parties.length ?? 0

    this._campaign = campaign
    this._uiState = { ...uiState }
    this._previousPartyCount = campaign.parties.length

    const dayAdvanced =
      previousDayNumber > 0 && campaign.dayNumber > previousDayNumber
    if (dayAdvanced) {
      const previousRecord = campaign.history[campaign.history.length - 1]
      if (previousRecord && previousRecord.results.length > 0) {
        const resultViewModel = buildExpeditionResultsSceneViewModel(
          {
            campaign,
            dayNumber: previousRecord.dayNumber,
            selectedResultId: undefined,
          },
          this._uiState.viewedReportIds ?? [],
        )
        if (resultViewModel.results.length > 0) {
          const input: ExpeditionResultsSceneInput = {
            campaign,
            dayNumber: previousRecord.dayNumber,
            selectedResultId: resultViewModel.results[0].id,
          }
          this._context!.canvasGame.sceneManager?.push(
            'expeditionResults',
            input,
          )
          return
        }
      }
    }

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

    const resolvedTransition =
      campaign.currentDay.status === 'resolved' && previousStatus === 'planning'
    if (dayAdvanced || resolvedTransition) {
      this.showHighImportanceSummary()
    }

    if (dayAdvanced && campaign.parties.length > previousPartyCount) {
      AudioController.playSe('newParty')
    }

    if (resolvedTransition) {
      const hasSuccess = campaign.currentDay.results.some(
        (r) =>
          r.result?.outcome === 'success' ||
          r.result?.outcome === 'completeSuccess' ||
          r.result?.outcome === 'partialSuccess',
      )
      if (hasSuccess) {
        AudioController.playSe('successJingle')
      }
    }
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
      onOpenReports: () => this.openReportArchiveModal(),
      onOpenSettings: () => this._context!.actions.openSettings(),
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

    this._decisionPanel = new DecisionPanel({
      theme,
      width: CENTER_WIDTH - MARGIN,
      height: MAIN_HEIGHT,
      onAssign: () => this.handleAssign(),
      getSelectedParty: () =>
        this._campaign?.currentDay.parties.find(
          (p) => p.id === this._uiState.selectedPartyId,
        ),
      getSelectedQuest: () =>
        this._campaign?.currentDay.requests.find(
          (r) => r.id === this._uiState.selectedQuestId,
        ),
      onOpenBreakdown: () => this.openPredictionBreakdown(),
    })
    this._decisionPanel.x = LEFT_WIDTH + MARGIN
    this._decisionPanel.y = MAIN_Y
    this._uiRoot!.addChild(this._decisionPanel)

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
    this._decisionPanel?.update(this._viewModel.decision)
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
    const party = this._viewModel?.parties.find((p) => p.id === partyId)
    const result = this._context!.actions.offerRequest(partyId, questId)
    if (!result.ok) {
      this.setActionMessage(
        'error',
        result.message ?? '依頼を紹介できませんでした',
      )
      return
    }

    if (result.data) {
      const partyName = party?.name ?? 'パーティ'
      if (result.data.decision === 'accepted') {
        this.setActionMessage(
          'success',
          `${partyName}が依頼を引き受けました${
            result.data.reasonText ? `\n${result.data.reasonText}` : ''
          }`,
        )
      } else {
        const body = result.data.reasonText
          ? result.data.reasonText
          : '依頼を断りました。'
        this.openActivityModal(`${partyName}は依頼を断りました`, body)
      }
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

  private markReportViewed(reportId: string): void {
    const current = new Set(this._uiState.viewedReportIds ?? [])
    if (current.has(reportId)) return
    current.add(reportId)
    this._context?.canvasGame.setUiState({
      viewedReportIds: [...current],
    })
  }

  private markActivityViewed(activityId: string): void {
    const current = new Set(this._uiState.viewedActivityIds ?? [])
    if (current.has(activityId)) return
    current.add(activityId)
    this._context?.canvasGame.setUiState({
      viewedActivityIds: [...current],
    })
  }

  private openActivityModal(title: string, text: string): void {
    const theme = this._context!.theme
    const content = new Container()
    const scroll = new GameScrollView(theme, 520, 220)
    const label = new GameLabel(text, theme, 'body', { maxWidth: 520 })
    scroll.content.addChild(label)
    content.addChild(scroll)
    this._context!.overlayManager.openModal(title, content)
  }

  private handleOpenActivity(activity: TavernActivityItemViewModel): void {
    if (!activity.canOpen) return
    this.clearActionMessage()

    if (activity.reportId) {
      const report = findExpeditionReportById(
        this._viewModel?.reports ?? [],
        activity.reportId,
      )
      if (report) {
        this.markActivityViewed(activity.id)
        this.openReportModal(report)
        return
      }
    }

    if (activity.kind === 'stay_extension') {
      this.markActivityViewed(activity.id)
      this.openStayExtensionDetail(activity)
      return
    }

    if (activity.kind !== 'downtime') {
      this.markActivityViewed(activity.id)
      this.openActivityModal(activity.title, activity.summary)
      return
    }

    if (activity.narrativeStatus === 'viewed') {
      this.openSoundNovelForDowntime(activity, activity.summary)
      return
    }

    if (this._activityGenerationInFlight.has(activity.id)) return
    this._activityGenerationInFlight.add(activity.id)

    if (activity.narrativeStatus === 'generated') {
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
          this.openSoundNovelForDowntime(activity, result.data)
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

    const theme = this._context!.theme
    const loading = new GameLabel('生成中…', theme, 'body', { maxWidth: 520 })
    const loadingContainer = new Container()
    const scroll = new GameScrollView(theme, 520, 220)
    scroll.content.addChild(loading)
    loadingContainer.addChild(scroll)
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
        this._context!.overlayManager.closeModal()
        this.openSoundNovelForDowntime(activity, result.data)
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

  private openStayExtensionDetail(activity: TavernActivityItemViewModel): void {
    const theme = this._context!.theme
    const scroll = new GameScrollView(theme, 520, 170)

    let y = 0
    if (activity.summary) {
      const summary = new GameLabel(activity.summary, theme, 'body', {
        maxWidth: 520,
      })
      summary.y = y
      scroll.content.addChild(summary)
      y += summary.textHeight + 16
    }

    const canReadNarrative =
      !!activity.narrativeTargetId &&
      !!this._context!.actions.openExpeditionNarrative
    const narrativeButton = new GameButton({
      width: 180,
      height: 40,
      theme,
      label: '物語として読む',
      disabled: !canReadNarrative,
    })
    narrativeButton.onActivate = () => this.openStayExtensionNarrative(activity)

    this._context!.overlayManager.openModal(
      activity.title,
      scroll,
      narrativeButton,
    )
  }

  private openStayExtensionNarrative(
    activity: TavernActivityItemViewModel,
  ): void {
    const targetId = activity.narrativeTargetId
    if (!targetId) return
    if (this._narrativeGenerationInFlight.has(targetId)) return

    if (this._campaign) {
      const candidate = this._campaign.narrativeCandidates.find(
        (c) => c.id === targetId,
      )
      if (candidate?.state === 'generated' && candidate.activeGenerationId) {
        const record = this._campaign.narrativeGenerations.find(
          (g) => g.id === candidate.activeGenerationId,
        )
        if (record) {
          this.openSoundNovelForStayExtension(activity, record.generatedText)
          return
        }
      }
    }

    this._narrativeGenerationInFlight.add(targetId)
    const theme = this._context!.theme
    const loading = new GameLabel('生成中…', theme, 'body', { maxWidth: 520 })
    const loadingContainer = new Container()
    const scroll = new GameScrollView(theme, 520, 220)
    scroll.content.addChild(loading)
    loadingContainer.addChild(scroll)
    this._context!.overlayManager.openModal('滞在延長の物語', loadingContainer)

    this._context!.actions.openExpeditionNarrative!(targetId)
      .then((result) => {
        this._narrativeGenerationInFlight.delete(targetId)
        if (!result.ok || result.data === undefined) {
          this._context!.overlayManager.openModal(
            '滞在延長の物語',
            this.errorModalContent(
              result.message ?? '物語の生成に失敗しました。',
            ),
          )
          this.setActionMessage(
            'error',
            result.message ?? '物語の生成に失敗しました',
          )
          return
        }
        this._context!.overlayManager.closeModal()
        this.openSoundNovelForStayExtension(activity, result.data)
      })
      .catch((e) => {
        this._narrativeGenerationInFlight.delete(targetId)
        this._context!.overlayManager.openModal(
          '滞在延長の物語',
          this.errorModalContent('物語の生成に失敗しました。'),
        )
        this.setActionMessage(
          'error',
          e instanceof Error ? e.message : '物語の生成に失敗しました',
        )
      })
  }

  private openReportArchiveModal(): void {
    if (!this._viewModel) return
    const theme = this._context!.theme
    const content = new Container()
    const scroll = new GameScrollView(theme, 520, 220)

    if (this._viewModel.reports.length === 0) {
      const empty = new GameLabel('報告はまだありません。', theme, 'body', {
        maxWidth: 520,
      })
      scroll.content.addChild(empty)
    } else {
      const rowHeight = 36
      for (const report of this._viewModel.reports) {
        const title = `Day ${report.day}  ${report.questTitle}  ${report.partyName}  ${report.outcomeLabel}`
        const row = new TavernListRow({
          width: 520,
          height: rowHeight,
          theme,
          title,
          disabled: false,
        })
        row.onActivate = () => this.openReportModal(report)
        scroll.addItem(row)
      }
    }

    content.addChild(scroll)
    this._modalTrack = 'expeditionReports'
    AudioController.playBgm('expeditionReports')
    this._context!.overlayManager.openModal('最近の報告', content)
  }

  private openPredictionBreakdown(): void {
    const prediction = this._decisionPanel?.currentPrediction
    const decision = this._viewModel?.decision
    if (!prediction || !decision) return

    const theme = this._context!.theme
    const content = new Container()
    const scroll = new GameScrollView(theme, 520, 260)

    const partyName = decision.selectedParty?.name ?? 'パーティ'
    const questTitle = decision.selectedQuest?.title ?? '依頼'

    const outcomes = [
      'completeSuccess',
      'success',
      'partialSuccess',
      'failedObjective',
      'forcedRetreat',
      'lostExpedition',
    ] as const

    let y = 0
    const add = (
      text: string,
      kind: 'heading' | 'body' | 'caption' = 'body',
    ) => {
      const label = new GameLabel(text, theme, kind, { maxWidth: 520 })
      label.y = y
      scroll.content.addChild(label)
      y += label.textHeight + 8
    }

    add('遠征予測', 'heading')
    add(`${partyName} × ${questTitle}`)
    add(`仮想遠征数           ${prediction.sampleCount}`)
    for (const outcome of outcomes) {
      const count = prediction.counts[outcome]
      const rate = Math.round(prediction.rates[outcome] * 100)
      add(`${OUTCOME_LABELS[outcome]}                  ${count} (${rate}%)`)
    }
    add(
      `推定依頼達成率       ${Math.round(
        prediction.estimatedSuccessRate * 100,
      )}%`,
      'heading',
    )
    add(getPredictionLabel(prediction.estimatedSuccessRate))

    content.addChild(scroll)
    this._context!.overlayManager.openModal('遠征予測の内訳', content)
  }

  private openReportModal(report: ExpeditionReportViewModel): void {
    this.markReportViewed(report.id)

    this._modalTrack = 'expeditionReports'
    AudioController.playBgm('expeditionReports')

    const theme = this._context!.theme
    const scroll = new GameScrollView(theme, 520, 170)

    const lines = this.buildReportLines(report)
    let y = 0
    for (const line of lines) {
      const label = new GameLabel(line, theme, 'body', { maxWidth: 520 })
      label.y = y
      scroll.content.addChild(label)
      y += label.textHeight + 8
    }

    const canReadNarrative =
      report.canGenerateNarrative ||
      (report.generatedText !== undefined && report.generatedText.length > 0)
    const narrativeButton = new GameButton({
      width: 180,
      height: 40,
      theme,
      label: '物語として読む',
      disabled: !canReadNarrative,
    })
    narrativeButton.onActivate = () => this.openNarrativeModal(report)

    this._context!.overlayManager.openModal(
      `遠征報告：${report.questTitle}`,
      scroll,
      narrativeButton,
    )
  }

  private buildReportLines(report: ExpeditionReportViewModel): string[] {
    const lines: string[] = []
    lines.push(`結果：${report.outcomeLabel}`)
    lines.push(`Party：${report.partyName}`)
    lines.push(`目的：${report.objectiveSummary}`)
    lines.push(`生還：${report.survivalText}`)

    let injuryText: string
    if (report.injuryRecordMissing) {
      injuryText = '負傷記録なし'
    } else if (report.injuries.length > 0) {
      injuryText = report.injuries
        .map((i) => `${i.name}：${i.severity}`)
        .join(' / ')
    } else {
      injuryText = '負傷なし'
    }
    lines.push(`負傷：${injuryText}`)

    lines.push(
      `殉職：${
        report.casualties.length > 0
          ? report.casualties.map((c) => c.name).join(' / ')
          : 'なし'
      }`,
    )
    lines.push(
      `報酬：${
        report.rewards.length > 0
          ? report.rewards.map((r) => r.label).join(' / ')
          : '記録なし'
      }`,
    )
    return lines
  }

  private openNarrativeModal(report: ExpeditionReportViewModel): void {
    if (this._narrativeGenerationInFlight.has(report.id)) return

    if (report.generatedText && report.generatedText.length > 0) {
      this.openSoundNovelForReport(report, report.generatedText)
      return
    }

    if (!report.narrativeTargetId) {
      this.openActivityModal(
        '遠征の物語',
        'この報告には物語が紐づいていません。',
      )
      return
    }

    this._narrativeGenerationInFlight.add(report.id)
    const theme = this._context!.theme
    const loading = new GameLabel('生成中…', theme, 'body', { maxWidth: 520 })
    const loadingContainer = new Container()
    const scroll = new GameScrollView(theme, 520, 220)
    scroll.content.addChild(loading)
    loadingContainer.addChild(scroll)
    this._context!.overlayManager.openModal('遠征の物語', loadingContainer)

    this._context!.actions.openExpeditionNarrative!(report.narrativeTargetId)
      .then((result) => {
        this._narrativeGenerationInFlight.delete(report.id)
        if (!result.ok || result.data === undefined) {
          this._context!.overlayManager.openModal(
            '遠征の物語',
            this.errorModalContent(
              result.message ?? '物語の生成に失敗しました。',
            ),
          )
          this.setActionMessage(
            'error',
            result.message ?? '物語の生成に失敗しました',
          )
          return
        }
        this._context!.overlayManager.closeModal()
        this.openSoundNovelForReport(report, result.data)
      })
      .catch((e) => {
        this._narrativeGenerationInFlight.delete(report.id)
        this._context!.overlayManager.openModal(
          '遠征の物語',
          this.errorModalContent('物語の生成に失敗しました。'),
        )
        this.setActionMessage(
          'error',
          e instanceof Error ? e.message : '物語の生成に失敗しました',
        )
      })
  }

  private openSoundNovel(input: SoundNovelSceneInput): void {
    this._context!.canvasGame.sceneManager!.push('soundNovel', input)
  }

  private openSoundNovelForReport(
    report: ExpeditionReportViewModel,
    text: string,
  ): void {
    const party = report.partyId
      ? this.findPartyAcrossCampaign(report.partyId)
      : undefined
    const visualContext: SoundNovelVisualContext = {
      environment: report.environment,
      participantIds: party?.party.members.map((m) => m.id),
      focusCharacterIds: this.buildFocusCharacterIds(party),
    }
    this.openSoundNovel({
      narrativeId: report.narrativeTargetId ?? report.id,
      source: 'expedition',
      title: `遠征の物語：${report.questTitle}`,
      text,
      visualContext,
      returnTarget: {
        sceneId: 'tavern',
        reportId: report.id,
        partyId: report.partyId,
      },
      mood: this.resolveReportMood(report),
    })
  }

  private openSoundNovelForStayExtension(
    activity: TavernActivityItemViewModel,
    text: string,
  ): void {
    const party = activity.partyId
      ? this.findPartyAcrossCampaign(activity.partyId)
      : undefined
    const visualContext: SoundNovelVisualContext = {
      environment: 'tavern',
      participantIds: party?.party.members.map((m) => m.id),
      focusCharacterIds: this.buildFocusCharacterIds(party),
    }
    this.openSoundNovel({
      narrativeId: activity.narrativeTargetId ?? activity.id,
      source: 'stay_extension',
      title: activity.title,
      text,
      visualContext,
      returnTarget: {
        sceneId: 'tavern',
        activityId: activity.id,
        partyId: activity.partyId,
      },
      mood: 'daily',
    })
  }

  private openSoundNovelForDowntime(
    activity: TavernActivityItemViewModel,
    text: string,
  ): void {
    const party = activity.partyId
      ? this.findPartyAcrossCampaign(activity.partyId)
      : undefined
    const visualContext: SoundNovelVisualContext = {
      environment: 'tavern',
      participantIds: party?.party.members.map((m) => m.id),
      focusCharacterIds: this.buildFocusCharacterIds(party),
    }
    this.openSoundNovel({
      narrativeId: activity.id,
      source: 'downtime',
      title: activity.title,
      text,
      visualContext,
      returnTarget: {
        sceneId: 'tavern',
        activityId: activity.id,
        partyId: activity.partyId,
      },
      mood: 'daily',
    })
  }

  private findPartyAcrossCampaign(partyId: string): CampaignParty | undefined {
    return this._campaign?.parties.find((p) => p.id === partyId)
  }

  private resolveReportMood(
    report: ExpeditionReportViewModel,
  ): 'daily' | 'tension' | 'sad' {
    if (report.outcome === 'failure' || report.outcome === 'retreat') {
      return 'sad'
    }
    const env = (report.environment ?? '').toLowerCase()
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

  private showHighImportanceSummary(): void {
    if (!this._viewModel) return
    const highItems = this._viewModel.activities.filter(
      (a) => a.importance === 'high' && !this._shownHighFeedbackIds.has(a.id),
    )
    if (highItems.length === 0) return

    for (const item of highItems) {
      this._shownHighFeedbackIds.add(item.id)
    }

    const theme = this._context!.theme
    const content = new Container()
    const scroll = new GameScrollView(theme, 520, 220)

    let y = 0
    for (const item of highItems) {
      const title = new GameLabel(`・${item.title}`, theme, 'body', {
        maxWidth: 520,
      })
      title.y = y
      scroll.content.addChild(title)
      y += title.textHeight + 8

      if (item.summary) {
        const summary = new GameLabel(`  ${item.summary}`, theme, 'caption', {
          maxWidth: 520,
        })
        summary.y = y
        scroll.content.addChild(summary)
        y += summary.textHeight + 8
      }

      const action = this.createHighNotificationAction(item)
      if (action) {
        action.y = y
        scroll.content.addChild(action)
        y += action.height + 12
      }
    }

    content.addChild(scroll)
    this._context!.overlayManager.openModal('本日の重要な出来事', content)
  }

  private createHighNotificationAction(
    item: TavernActivityItemViewModel,
  ): Container | null {
    const theme = this._context!.theme

    if (item.kind === 'expedition_return' && item.reportId) {
      const report = findExpeditionReportById(
        this._viewModel?.reports ?? [],
        item.reportId,
      )
      if (!report) return null
      const btn = new GameButton({
        width: 140,
        height: 32,
        theme,
        label: '報告を見る',
      })
      btn.onActivate = () => {
        this._context!.overlayManager.closeModal()
        this.markActivityViewed(item.id)
        this.openReportModal(report)
      }
      return btn
    }

    if (item.kind === 'party_arrival' && item.partyId) {
      const btn = new GameButton({
        width: 140,
        height: 32,
        theme,
        label: '選択する',
      })
      btn.onActivate = () => {
        this._context!.overlayManager.closeModal()
        this._context!.actions.selectParty(item.partyId!)
      }
      return btn
    }

    return null
  }

  private errorModalContent(text: string): Container {
    const theme = this._context!.theme
    const content = new Container()
    const scroll = new GameScrollView(theme, 520, 220)
    const label = new GameLabel(text, theme, 'body', { maxWidth: 520 })
    scroll.content.addChild(label)
    content.addChild(scroll)
    return content
  }

  private handleModalClose(): void {
    if (this._modalTrack) {
      this._modalTrack = null
      AudioController.playBgm('tavern')
    }
  }
}
