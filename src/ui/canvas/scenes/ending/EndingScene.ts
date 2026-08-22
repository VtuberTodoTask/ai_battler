import { Container } from 'pixi.js'
import type { TavernCampaignState } from '../../../../core/tavern/campaign/types.ts'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GamePanel } from '../../components/GamePanel.ts'
import { AudioController } from '../../audio/AudioController.ts'
import type { GameScene, GameSceneContext, GameUiState } from '../../types.ts'
import type {
  SoundNovelSceneInput,
  SoundNovelVisualContext,
} from '../soundNovel/types.ts'
import {
  buildEndingGameClearViewModel,
  buildEndingViewModel,
  createEndingSceneInput,
  type EndingSceneInput,
  type EndingViewModel,
} from '../../viewModel/endingViewModel.ts'

const MARGIN = 16

/**
 * Phase 9.9 Ending orchestrator — pure Presentation flow controller,
 * mirroring `MainQuestScene`'s structure exactly (no Battle animation is
 * implemented here, per item 23: this only drives narrative generation,
 * then reuses `SoundNovelScene` for Aftermath -> Tavern Return -> Closing,
 * then shows a GAME CLEAR summary sourced from `CampaignEndingFacts`).
 * Terminal route: there is no "return to tavern" — the only way out is
 * `actions.returnToTitle()` from the GAME CLEAR screen (item 28/29).
 */
export class EndingScene implements GameScene {
  readonly id = 'ending'

  private _context: GameSceneContext | null = null
  private _root: Container | null = null
  private _campaign: TavernCampaignState | null = null
  private _input: EndingSceneInput | undefined = undefined
  private _viewModel: EndingViewModel | null = null
  private _narrativeRequested = false
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
      (input as EndingSceneInput | undefined) ?? createEndingSceneInput()
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
    this._viewModel = buildEndingViewModel(this._campaign)
  }

  private clearUi(): void {
    if (!this._root) return
    for (const child of this._root.removeChildren()) {
      child.destroy({ children: true })
    }
  }

  // --- Rendering -------------------------------------------------------

  private render(context: GameSceneContext): void {
    if (!this._root || !this._viewModel) return
    this.clearUi()

    const vm = this._viewModel
    if (vm.status === 'completed' && vm.facts) {
      this.renderGameClear(context, vm.facts)
      return
    }
    if (vm.status === 'ready') {
      this.renderReady(context)
      return
    }
    this.renderWaiting(context)
  }

  private renderWaiting(context: GameSceneContext): void {
    if (!this._root) return
    const { theme } = context
    const label = new GameLabel(
      'エピローグを生成しています……',
      theme,
      'heading',
    )
    label.anchor.set(0.5)
    label.x = VIRTUAL_WIDTH / 2
    label.y = VIRTUAL_HEIGHT / 2
    this._root.addChild(label)
  }

  private renderReady(context: GameSceneContext): void {
    if (!this._root) return
    const { theme } = context

    const titleLabel = new GameLabel('主依頼、完結', theme, 'heading')
    titleLabel.anchor.set(0.5)
    titleLabel.x = VIRTUAL_WIDTH / 2
    titleLabel.y = VIRTUAL_HEIGHT / 2 - 60
    this._root.addChild(titleLabel)

    const button = new GameButton({
      width: 240,
      height: 56,
      theme,
      label: 'エピローグへ',
    })
    button.x = (VIRTUAL_WIDTH - 240) / 2
    button.y = VIRTUAL_HEIGHT / 2 + 20
    button.onActivate = () => this.beginPresentation()
    this._root.addChild(button)
  }

  private renderGameClear(
    context: GameSceneContext,
    facts: NonNullable<EndingViewModel['facts']>,
  ): void {
    if (!this._root) return
    const { theme } = context
    const clear = buildEndingGameClearViewModel(facts)

    const panel = new GamePanel({
      width: 640,
      height: 380,
      theme,
      title: 'GAME CLEAR',
      alpha: 0.9,
    })
    panel.x = (VIRTUAL_WIDTH - 640) / 2
    panel.y = 60
    this._root.addChild(panel)

    const lines = [
      clear.clearDayLabel,
      clear.rankLabel,
      clear.reputationLabel,
      clear.threatProgressLabel,
      clear.finalThreatLabel,
      clear.curseLabel,
      clear.finalPartyLabel,
    ]
    let lineY = 64
    for (const line of lines) {
      const label = new GameLabel(line, theme, 'body')
      label.x = 32
      label.y = lineY
      panel.addChild(label)
      lineY += 40
    }

    const titleButton = new GameButton({
      width: 240,
      height: 56,
      theme,
      label: 'タイトルへ戻る',
    })
    titleButton.x = (VIRTUAL_WIDTH - 240) / 2
    titleButton.y = 60 + 380 + MARGIN * 2
    titleButton.onActivate = () => this._context?.actions.returnToTitle?.()
    this._root.addChild(titleButton)
  }

  // --- Actions -----------------------------------------------------------

  private maybeRequestNarrative(): void {
    if (!this._context || !this._campaign) return
    const { ending } = this._campaign
    if (ending.status !== 'narrative_pending') return
    if (ending.narrative) return
    if (this._narrativeRequested) return
    if (!this._context.actions.generateEndingNarrative) return

    this._narrativeRequested = true
    this._context.actions
      .generateEndingNarrative()
      .then((result) => {
        if (!result.ok && this._context) {
          this._narrativeRequested = false
          this.showNarrativeFailure(result.message)
        }
      })
      .catch(() => {
        this._narrativeRequested = false
      })
  }

  /**
   * Ending Narrative generation stays mandatory — there is no skip button,
   * ever (item 24) — but must offer an explicit retry and a shortcut into
   * AI settings, matching `MainQuestScene`'s established UX contract
   * exactly.
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
    this._context.overlayManager.openModal('エピローグ', content, footer)
  }

  private beginPresentation(): void {
    if (!this._context || !this._campaign || !this._input) return
    const { ending } = this._campaign
    if (ending.status !== 'ready' || !ending.narrative) return

    if (this._context.actions.startEndingPresentation) {
      const result = this._context.actions.startEndingPresentation()
      if (!result.ok) {
        this._context.overlayManager.openModal(
          'エピローグ',
          result.message ?? '演出を開始できませんでした。',
        )
        return
      }
    }

    this._input.presentationStep = 'aftermath'
    this.pushSoundNovel('aftermath', ending.narrative.aftermath)
  }

  private advancePresentation(): void {
    if (!this._context || !this._campaign || !this._input) return
    const { ending } = this._campaign
    const step = this._input.presentationStep
    if (!ending.narrative) {
      this._input.presentationStep = undefined
      this.render(this._context)
      return
    }
    if (step === 'aftermath') {
      this._input.presentationStep = 'tavernReturn'
      this.pushSoundNovel('tavernReturn', ending.narrative.tavernReturn)
      return
    }
    if (step === 'tavernReturn') {
      this._input.presentationStep = 'closing'
      this.pushSoundNovel('closing', ending.narrative.closing)
      return
    }
    if (step === 'closing') {
      const result = this._context.actions.completeEndingPresentation?.()
      if (result && !result.ok) {
        this._context.overlayManager.openModal(
          'エピローグ',
          result.message ?? '演出を完了できませんでした。',
        )
        return
      }
      this._input.presentationStep = undefined
      this.updateViewModel()
      this.render(this._context)
      return
    }
    this.render(this._context)
  }

  private pushSoundNovel(
    step: 'aftermath' | 'tavernReturn' | 'closing',
    text: string,
  ): void {
    if (!this._context) return
    const visualContext: SoundNovelVisualContext = {
      backgroundId: 'tavern',
    }
    const mood = step === 'closing' ? 'daily' : 'tension'
    const input: SoundNovelSceneInput = {
      narrativeId: `ending:${step}`,
      source: 'ending',
      title: 'エピローグ',
      text,
      visualContext,
      returnTarget: { sceneId: 'ending' },
      mood,
    }
    this._context.canvasGame.sceneManager?.push('soundNovel', input)
  }
}
