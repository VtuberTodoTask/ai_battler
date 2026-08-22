import { Container } from 'pixi.js'
import type { TavernCampaignState } from '../../../../core/tavern/campaign/types.ts'
import { MAIN_QUEST_THREAT_DEFINITION_MAP } from '../../../../core/mainQuest/threats.ts'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GamePanel } from '../../components/GamePanel.ts'
import { GameScrollView } from '../../components/GameScrollView.ts'
import { TavernListRow } from '../../components/TavernListRow.ts'
import { AudioController } from '../../audio/AudioController.ts'
import type { GameScene, GameSceneContext, GameUiState } from '../../types.ts'
import type {
  SoundNovelSceneInput,
  SoundNovelVisualContext,
} from '../soundNovel/types.ts'
import {
  buildMainQuestViewModel,
  createMainQuestSceneInput,
  type MainQuestSceneInput,
  type MainQuestViewModel,
} from '../../viewModel/mainQuestViewModel.ts'
import type { MainQuestThreatId } from '../../../../core/mainQuest/types.ts'

const MARGIN = 16
const TOP_BAR_HEIGHT = 64
const BOTTOM_BAR_HEIGHT = 72

export class MainQuestScene implements GameScene {
  readonly id = 'mainQuest'

  private _context: GameSceneContext | null = null
  private _root: Container | null = null
  private _campaign: TavernCampaignState | null = null
  private _input: MainQuestSceneInput | undefined = undefined
  private _viewModel: MainQuestViewModel | null = null
  private _selectedThreatId: MainQuestThreatId | null = null
  private _narrativeRequestedFor: string | null = null
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
      (input as MainQuestSceneInput | undefined) ??
      createMainQuestSceneInput({ sceneId: 'tavern' })
    this._root = new Container()
    context.layers.ui.addChild(this._root)

    AudioController.playBgm('tavern', { loop: true })

    if (this._campaign) {
      this.updateViewModel()
      if (this._input.presentationStep) {
        this.advancePresentation()
      } else {
        this.render(context)
      }
    }
  }

  unmount(): void {
    this.clearUi()
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
    if (this._context) {
      // Phase 9.9: completing the final Main Quest Presentation (the
      // Nosferatu victory) can start the Ending in the SAME Campaign
      // update that completes this Presentation — the Canvas bridge
      // preserves the current scene on that sync (same as any other
      // successful Presentation step), so this scene itself must notice
      // and hand off to EndingScene rather than re-rendering its own hub.
      if (campaign.ending.status !== 'locked') {
        this._context.canvasGame.sceneManager?.push('ending')
        return
      }
      this.updateViewModel()
      this.maybeRequestNarrative()
      this.render(this._context)
    }
  }

  setUiState(uiState: GameUiState): void {
    this._uiState = { ...uiState }
  }

  private updateViewModel(): void {
    if (!this._campaign) return
    this._viewModel = buildMainQuestViewModel(
      this._campaign,
      this._selectedThreatId,
      this._input?.returnTarget ?? { sceneId: 'tavern' },
    )
  }

  private clearUi(): void {
    if (!this._root) return
    for (const child of this._root.removeChildren()) {
      child.destroy({ children: true })
    }
  }

  // --- Hub rendering -------------------------------------------------

  private render(context: GameSceneContext): void {
    if (!this._root || !this._viewModel) return
    this.clearUi()

    const { theme } = context
    const vm = this._viewModel

    const titleLabel = new GameLabel('主依頼：国家的脅威', theme, 'heading')
    titleLabel.anchor.set(0, 0.5)
    titleLabel.x = MARGIN
    titleLabel.y = TOP_BAR_HEIGHT / 2
    this._root.addChild(titleLabel)

    let contentY = TOP_BAR_HEIGHT + MARGIN

    if (vm.pending) {
      contentY += this.renderPendingBanner(vm, contentY, theme)
    }

    const contentHeight = VIRTUAL_HEIGHT - contentY - BOTTOM_BAR_HEIGHT - MARGIN
    const leftWidth = 520
    const rightX = MARGIN * 2 + leftWidth
    const rightWidth = VIRTUAL_WIDTH - rightX - MARGIN

    this.renderThreatList(leftWidth, contentHeight, contentY, theme, vm)
    this.renderThreatDetail(
      rightX,
      rightWidth,
      contentHeight,
      contentY,
      theme,
      vm,
    )

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

  private renderPendingBanner(
    vm: MainQuestViewModel,
    y: number,
    theme: GameSceneContext['theme'],
  ): number {
    if (!this._root || !vm.pending) return 0
    const height = 64
    const panel = new GamePanel({
      width: VIRTUAL_WIDTH - MARGIN * 2,
      height,
      theme,
      color: theme.colors.danger,
      alpha: 0.25,
    })
    panel.x = MARGIN
    panel.y = y
    this._root.addChild(panel)

    const statusText =
      vm.pending.presentationStatus === 'narrative_pending'
        ? `${vm.pending.threatName}の顛末を生成中…`
        : `${vm.pending.threatName}の顛末がまだ確認されていません`

    const label = new GameLabel(statusText, theme, 'body')
    label.anchor.set(0, 0.5)
    label.x = MARGIN * 2
    label.y = y + height / 2
    this._root.addChild(label)

    if (
      vm.pending.presentationStatus === 'ready' ||
      vm.pending.presentationStatus === 'viewing'
    ) {
      const button = new GameButton({
        width: 160,
        height: 40,
        theme,
        label: '顛末を見る',
      })
      button.x = VIRTUAL_WIDTH - MARGIN * 2 - 160
      button.y = y + (height - 40) / 2
      button.onActivate = () => this.beginPresentation(vm.pending!.attemptId)
      this._root.addChild(button)
    }

    return height + MARGIN
  }

  private renderThreatList(
    width: number,
    height: number,
    y: number,
    theme: GameSceneContext['theme'],
    vm: MainQuestViewModel,
  ): void {
    if (!this._root) return
    const panel = new GamePanel({
      width,
      height,
      theme,
      title: '国家的脅威',
      alpha: 0.82,
    })
    panel.x = MARGIN
    panel.y = y
    this._root.addChild(panel)

    const scroll = new GameScrollView(theme, width - MARGIN * 2, height - 64)
    scroll.x = MARGIN * 2
    scroll.y = y + 52
    this._root.addChild(scroll)

    const rowHeight = 68
    const gap = 8
    let rowY = 0
    for (const threat of vm.threats) {
      const row = new TavernListRow({
        width: width - MARGIN * 2,
        height: rowHeight,
        theme,
        title: `${threat.name} ${threat.title}`,
        subtitle: threat.statusLabel,
        selected: threat.id === this._selectedThreatId,
        disabled: threat.status === 'locked',
      })
      row.y = rowY
      row.onActivate = () => this.selectThreat(threat.id)
      scroll.content.addChild(row)
      rowY += rowHeight + gap
    }
    scroll.scrollToTop()
  }

  private renderThreatDetail(
    x: number,
    width: number,
    height: number,
    y: number,
    theme: GameSceneContext['theme'],
    vm: MainQuestViewModel,
  ): void {
    if (!this._root) return
    const panel = new GamePanel({
      width,
      height,
      theme,
      title: vm.selectedThreatId
        ? MAIN_QUEST_THREAT_DEFINITION_MAP[vm.selectedThreatId].name
        : '同行させるパーティを選択してください',
      alpha: 0.82,
    })
    panel.x = x
    panel.y = y
    this._root.addChild(panel)

    if (!vm.selectedThreatId) return

    const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[vm.selectedThreatId]
    const briefing = new GameLabel(
      definition.scenarioRules.briefing,
      theme,
      'caption',
      {
        maxWidth: width - MARGIN * 2,
        breakWords: true,
      },
    )
    briefing.x = MARGIN
    briefing.y = 48
    this._root.addChild(briefing)

    const scroll = new GameScrollView(theme, width - MARGIN * 2, height - 160)
    scroll.x = x + MARGIN
    scroll.y = y + 160
    this._root.addChild(scroll)

    const rowHeight = 84
    const gap = 10
    let rowY = 0
    if (vm.eligibility.length === 0) {
      const empty = new GameLabel(
        '本日出動可能なパーティがいません',
        theme,
        'body',
      )
      empty.y = 8
      scroll.content.addChild(empty)
    } else {
      for (const row of vm.eligibility) {
        const container = new Container()
        const rowPanel = new TavernListRow({
          width: width - MARGIN * 2,
          height: rowHeight,
          theme,
          title: `${row.partyName} ${row.rankLabel}`,
          subtitle:
            row.blockReasons.length > 0
              ? row.blockReasons.join(' / ')
              : `信頼 ${row.affinityLabel} ・ 費用 ${row.feeLabel}`,
          disabled: !row.eligible,
        })
        container.addChild(rowPanel)

        const dispatchButton = new GameButton({
          width: 96,
          height: 40,
          theme,
          label: '同行する',
          disabled: !row.eligible,
        })
        dispatchButton.x = width - MARGIN * 2 - 96 - 8
        dispatchButton.y = (rowHeight - 40) / 2
        dispatchButton.onActivate = () => this.dispatch(row.partyId)
        container.addChild(dispatchButton)

        container.y = rowY
        scroll.content.addChild(container)
        rowY += rowHeight + gap
      }
    }
    scroll.scrollToTop()
  }

  // --- Actions ---------------------------------------------------------

  private selectThreat(threatId: MainQuestThreatId): void {
    this._selectedThreatId = threatId
    this.updateViewModel()
    if (this._context) this.render(this._context)
  }

  private dispatch(partyId: string): void {
    if (!this._context || !this._selectedThreatId) return
    const actions = this._context.actions
    if (!actions.dispatchMainQuest) return
    const result = actions.dispatchMainQuest(this._selectedThreatId, partyId)
    if (!result.ok) {
      this._context.overlayManager.openModal(
        '主依頼',
        result.message ?? '同行を依頼できませんでした。',
      )
      return
    }
    this._selectedThreatId = null
    this.updateViewModel()
    this.render(this._context)
  }

  private maybeRequestNarrative(): void {
    if (!this._context || !this._campaign) return
    const attemptId = this._campaign.mainQuest.pendingPresentationAttemptId
    if (!attemptId) return
    const attempt = this._campaign.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )
    if (!attempt || attempt.presentationStatus !== 'narrative_pending') return
    if (this._narrativeRequestedFor === attemptId) return
    if (!this._context.actions.generateMainQuestNarrative) return

    this._narrativeRequestedFor = attemptId
    this._context.actions
      .generateMainQuestNarrative(attemptId)
      .then((result) => {
        if (!result.ok && this._context) {
          this._narrativeRequestedFor = null
          this.showNarrativeFailure(result.message)
        }
      })
      .catch(() => {
        this._narrativeRequestedFor = null
      })
  }

  /**
   * Narrative generation stays mandatory — there is no skip button, ever —
   * but "return to tavern (mandatory redirect back here)" must not be the
   * only recovery path on failure, so this offers an explicit retry and a
   * shortcut into AI settings (e.g. an unconfigured/invalid provider).
   */
  private showNarrativeFailure(message?: string): void {
    if (!this._context) return
    const theme = this._context.theme
    const content = new GameLabel(
      message ?? '顛末の生成に失敗しました。',
      theme,
      'body',
      { maxWidth: 480 },
    )
    const footer = new Container()
    const retryButton = new GameButton({
      width: 140,
      height: 40,
      theme,
      label: '再試行',
    })
    retryButton.x = 0
    retryButton.y = 0
    retryButton.onActivate = () => {
      this._context?.overlayManager.closeModal()
      this.maybeRequestNarrative()
    }

    const settingsButton = new GameButton({
      width: 140,
      height: 40,
      theme,
      label: 'AI設定',
    })
    settingsButton.x = 160
    settingsButton.y = 0
    settingsButton.onActivate = () => {
      this._context?.overlayManager.closeModal()
      this._context?.actions.openSettings()
    }

    footer.addChild(retryButton, settingsButton)
    this._context.overlayManager.openModal('主依頼', content, footer)
  }

  private beginPresentation(attemptId: string): void {
    if (!this._context || !this._campaign || !this._input) return
    const attempt = this._campaign.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )
    if (!attempt || !attempt.narrative) return

    if (
      attempt.presentationStatus === 'ready' &&
      this._context.actions.startMainQuestPresentation
    ) {
      const result = this._context.actions.startMainQuestPresentation(attemptId)
      if (!result.ok) {
        this._context.overlayManager.openModal(
          '主依頼',
          result.message ?? '演出を開始できませんでした。',
        )
        return
      }
    }

    this._input.presentationStep = 'preBattle'
    this.pushPreBattle(attemptId)
  }

  private advancePresentation(): void {
    if (!this._context || !this._campaign || !this._input) return
    const attemptId = this._campaign.mainQuest.pendingPresentationAttemptId
    if (!attemptId) {
      this._input.presentationStep = undefined
      this.render(this._context)
      return
    }
    const step = this._input.presentationStep
    if (step === 'preBattle') {
      this._input.presentationStep = 'battle'
      this.pushBattle(attemptId)
      return
    }
    if (step === 'battle') {
      this._input.presentationStep = 'postBattle'
      this.pushPostBattle(attemptId)
      return
    }
    if (step === 'postBattle') {
      const result =
        this._context.actions.completeMainQuestPresentation?.(attemptId)
      if (result && !result.ok) {
        this._context.overlayManager.openModal(
          '主依頼',
          result.message ?? '演出を完了できませんでした。',
        )
        return
      }
      this._input.presentationStep = undefined
      this._narrativeRequestedFor = null
      this.updateViewModel()
      this.render(this._context)
      return
    }
    this.render(this._context)
  }

  private pushPreBattle(attemptId: string): void {
    if (!this._context || !this._campaign) return
    const attempt = this._campaign.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )
    if (!attempt || !attempt.narrative) return
    const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[attempt.threatId]
    const party = this._campaign.parties.find((p) => p.id === attempt.partyId)

    const visualContext: SoundNovelVisualContext = {
      environment: definition.scenarioRules.environment,
      participantIds: party?.party.members.map((m) => m.id),
    }
    const input: SoundNovelSceneInput = {
      narrativeId: `mainquest:${attemptId}:pre`,
      source: 'main_quest',
      title: `主依頼：${definition.name}`,
      text: attempt.narrative.preBattle,
      visualContext,
      returnTarget: { sceneId: 'mainQuest' },
      mood: 'tension',
    }
    this._context.canvasGame.sceneManager?.push('soundNovel', input)
  }

  private pushBattle(attemptId: string): void {
    if (!this._context || !this._input) return
    this._context.canvasGame.sceneManager?.push('mainQuestBattle', {
      attemptId,
      returnTarget: this._input.returnTarget,
    })
  }

  private pushPostBattle(attemptId: string): void {
    if (!this._context || !this._campaign) return
    const attempt = this._campaign.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )
    if (!attempt || !attempt.narrative) return
    const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[attempt.threatId]
    const party = this._campaign.parties.find((p) => p.id === attempt.partyId)

    const visualContext: SoundNovelVisualContext = {
      environment: definition.scenarioRules.environment,
      participantIds: party?.party.members.map((m) => m.id),
    }
    const mood: 'daily' | 'sad' =
      attempt.result && !attempt.result.monsterDefeated ? 'sad' : 'daily'
    const input: SoundNovelSceneInput = {
      narrativeId: `mainquest:${attemptId}:post`,
      source: 'main_quest',
      title: `主依頼：${definition.name}`,
      text: attempt.narrative.postBattle,
      visualContext,
      returnTarget: { sceneId: 'mainQuest' },
      mood,
    }
    this._context.canvasGame.sceneManager?.push('soundNovel', input)
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
}
