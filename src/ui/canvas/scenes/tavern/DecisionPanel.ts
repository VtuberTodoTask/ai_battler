import { Container } from 'pixi.js'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GamePanel } from '../../components/GamePanel.ts'
import { GameScrollView } from '../../components/GameScrollView.ts'
import type { GameUiTheme } from '../../theme/gameTheme.ts'
import type {
  TavernDecisionViewModel,
  TavernPartyMemberViewModel,
} from '../../viewModel/tavernScreenViewModel.ts'
import type {
  TavernParty,
  TavernRequestOffer,
} from '../../../../core/tavern/types.ts'
import { getPredictionLabel } from '../../../tavern/predictionLabels.ts'
import { getExpeditionPrediction } from '../../../shared/expeditionPredictionService.ts'
import type { ExpeditionPrediction } from '../../../../core/tavern/prediction/types.ts'

export interface DecisionPanelOptions {
  theme: GameUiTheme
  width: number
  height: number
  onAssign: () => void
  getSelectedParty: () => TavernParty | undefined
  getSelectedQuest: () => TavernRequestOffer | undefined
  onOpenBreakdown: () => void
}

type PredictionStatus = 'idle' | 'loading' | 'error'

export class DecisionPanel extends Container {
  private readonly _theme: GameUiTheme
  private readonly _width: number
  private readonly _height: number
  private readonly _onAssign: () => void
  private readonly _getSelectedParty: () => TavernParty | undefined
  private readonly _getSelectedQuest: () => TavernRequestOffer | undefined
  private readonly _onOpenBreakdown: () => void
  private readonly _panel: GamePanel
  private readonly _scroll: GameScrollView
  private readonly _scrollWidth: number
  private readonly _scrollHeight: number
  private readonly _assignButton: GameButton
  private _viewModel?: TavernDecisionViewModel
  private _prediction?: ExpeditionPrediction
  private _predictionStatus: PredictionStatus = 'idle'
  private _sequence = 0
  private _lastPartyId?: string
  private _lastQuestId?: string

  constructor(options: DecisionPanelOptions) {
    super()

    this._theme = options.theme
    this._width = options.width
    this._height = options.height
    this._onAssign = options.onAssign
    this._getSelectedParty = options.getSelectedParty
    this._getSelectedQuest = options.getSelectedQuest
    this._onOpenBreakdown = options.onOpenBreakdown

    this._panel = new GamePanel({
      width: this._width,
      height: this._height,
      theme: this._theme,
      color: this._theme.colors.panel,
      borderColor: this._theme.colors.panelBorder,
      radius: this._theme.radius.large,
      alpha: 0.82,
    })
    this.addChild(this._panel)

    this._scrollWidth = this._width - this._theme.spacing.s24
    this._scrollHeight = this._height - 80
    this._scroll = new GameScrollView(
      this._theme,
      this._scrollWidth,
      this._scrollHeight,
    )
    this._scroll.x = this._theme.spacing.s12
    this._scroll.y = this._theme.spacing.s12
    this.addChild(this._scroll)

    this._assignButton = new GameButton({
      width: 200,
      height: 44,
      theme: this._theme,
      label: 'この依頼を紹介する',
      disabled: true,
    })
    this._assignButton.x = (this._width - 200) / 2
    this._assignButton.y = this._height - 56
    this._assignButton.onActivate = () => this._onAssign()
    this.addChild(this._assignButton)
  }

  get currentPrediction(): ExpeditionPrediction | undefined {
    return this._prediction
  }

  update(viewModel?: TavernDecisionViewModel): void {
    this._viewModel = viewModel
    this.updatePrediction()
    this.draw()
  }

  private updatePrediction(): void {
    const party = this._getSelectedParty()
    const quest = this._getSelectedQuest()

    if (!party || !quest) {
      this._prediction = undefined
      this._predictionStatus = 'idle'
      this._lastPartyId = undefined
      this._lastQuestId = undefined
      return
    }

    if (party.id === this._lastPartyId && quest.id === this._lastQuestId) {
      return
    }

    this._lastPartyId = party.id
    this._lastQuestId = quest.id
    this._prediction = undefined
    this._predictionStatus = 'loading'
    this._sequence++
    const seq = this._sequence

    getExpeditionPrediction(quest, party)
      .then((prediction) => {
        if (seq !== this._sequence) return
        this._prediction = prediction
        this._predictionStatus = 'idle'
        this.draw()
      })
      .catch(() => {
        if (seq !== this._sequence) return
        this._predictionStatus = 'error'
        this.draw()
      })
  }

  private draw(): void {
    const content = this._scroll.content
    for (const child of [...content.children]) {
      content.removeChild(child)
      child.destroy({ children: true })
    }

    this._assignButton.setEnabled(false)
    this._assignButton.setLabel('この依頼を紹介する')

    const vm = this._viewModel
    if (!vm?.selectedQuest) {
      const label = new GameLabel(
        '依頼を選択してください',
        this._theme,
        'body',
        { maxWidth: this._scrollWidth, breakWords: true },
      )
      content.addChild(label)
      this._scroll.setViewportSize(this._scrollWidth, this._scrollHeight)
      return
    }

    let y = 0
    const addLabel = (
      text: string,
      kind: 'heading' | 'body' | 'caption' = 'body',
    ): GameLabel => {
      const label = new GameLabel(text, this._theme, kind, {
        maxWidth: this._scrollWidth,
        breakWords: true,
      })
      label.y = y
      content.addChild(label)
      y += label.textHeight + 8
      return label
    }

    y += 4
    addLabel(`《${vm.selectedQuest.title}》`, 'heading')
    addLabel(vm.selectedQuest.rankLabel, 'body')

    const infoBlock = [
      `種別：${vm.selectedQuest.objectiveTypeLabel}`,
      `地域：${vm.selectedQuest.terrainLabel}`,
      `戦闘：${vm.selectedQuest.combatLabel}`,
      `状態：${vm.selectedQuest.offerStatusLabel}`,
    ].join('\n')
    const info = new GameLabel(infoBlock, this._theme, 'body', {
      maxWidth: this._scrollWidth,
      breakWords: true,
    })
    info.y = y
    content.addChild(info)
    y += info.textHeight + 12

    if (vm.selectedQuest.tags.length > 0) {
      const tags = new GameLabel(
        vm.selectedQuest.tags.join(' / '),
        this._theme,
        'caption',
        { maxWidth: this._scrollWidth, breakWords: true },
      )
      tags.y = y
      content.addChild(tags)
      y += tags.textHeight + 16
    }

    const desc = new GameLabel(
      vm.selectedQuest.description,
      this._theme,
      'body',
      {
        maxWidth: this._scrollWidth,
        breakWords: true,
      },
    )
    desc.y = y
    content.addChild(desc)
    y += desc.textHeight + 24

    if (vm.selectedParty) {
      const party = vm.selectedParty
      addLabel(`《${party.name}》 ${party.rankLabel}`, 'heading')
      addLabel(`状態：${party.statusLabel}  人数：${party.memberCount}名`)
      addLabel(party.injuryLabel)

      if (party.members.length > 0) {
        for (const member of party.members) {
          y = this.renderMember(content, member, y)
        }
      }

      y += 8

      if (vm.offerDisabledReason && !vm.canOffer) {
        addLabel(`紹介不可：${vm.offerDisabledReason}`, 'caption')
      }

      y += 8
      y = this.renderPrediction(content, y)
    } else {
      addLabel('パーティを選択すると遠征予測を確認できます')
    }

    this._assignButton.setEnabled(vm.canOffer)
    if (!vm.canOffer && vm.offerDisabledReason) {
      this._assignButton.setLabel(
        vm.offerDisabledReason.length > 10
          ? `${vm.offerDisabledReason.slice(0, 9)}…`
          : vm.offerDisabledReason,
      )
    }

    this._scroll.setViewportSize(this._scrollWidth, this._scrollHeight)
  }

  private renderMember(
    content: Container,
    member: TavernPartyMemberViewModel,
    y: number,
  ): number {
    const name = new GameLabel(
      `${member.name}（${member.role} · ${member.rank}）`,
      this._theme,
      'body',
      { maxWidth: this._scrollWidth, breakWords: true },
    )
    name.y = y
    content.addChild(name)
    y += name.textHeight + 2

    const condition = new GameLabel(
      member.conditionLabel,
      this._theme,
      'caption',
      {
        maxWidth: this._scrollWidth,
        breakWords: true,
      },
    )
    condition.y = y
    content.addChild(condition)
    y += condition.textHeight + 10

    return y
  }

  private renderPrediction(content: Container, y: number): number {
    if (this._predictionStatus === 'loading') {
      const label = new GameLabel('遠征を予測中…', this._theme, 'body', {
        maxWidth: this._scrollWidth,
        breakWords: true,
      })
      label.y = y
      content.addChild(label)
      y += label.textHeight + 8
      return y
    }

    if (this._predictionStatus === 'error') {
      const label = new GameLabel(
        '遠征予測を取得できませんでした',
        this._theme,
        'body',
        { maxWidth: this._scrollWidth, breakWords: true },
      )
      label.y = y
      content.addChild(label)
      y += label.textHeight + 8
      return y
    }

    if (!this._prediction) {
      return y
    }

    const prediction = this._prediction
    const rateText = `推定依頼達成率 ${Math.round(
      prediction.estimatedSuccessRate * 100,
    )}%`
    const rate = new GameLabel(rateText, this._theme, 'heading', {
      maxWidth: this._scrollWidth,
      breakWords: true,
    })
    rate.y = y
    content.addChild(rate)
    y += rate.textHeight + 4

    const danger = new GameLabel(
      getPredictionLabel(prediction.estimatedSuccessRate),
      this._theme,
      'body',
      { maxWidth: this._scrollWidth, breakWords: true },
    )
    danger.y = y
    content.addChild(danger)
    y += danger.textHeight + 8

    const sample = new GameLabel(
      `${prediction.sampleCount}回の仮想遠征による推定`,
      this._theme,
      'caption',
      { maxWidth: this._scrollWidth, breakWords: true },
    )
    sample.y = y
    content.addChild(sample)
    y += sample.textHeight + 4

    const disclaimer = new GameLabel(
      '予測値は多数の仮想遠征から算出した見込みです。実際の遠征結果を保証するものではありません。',
      this._theme,
      'caption',
      { maxWidth: this._scrollWidth, breakWords: true },
    )
    disclaimer.y = y
    content.addChild(disclaimer)
    y += disclaimer.textHeight + 12

    const breakdownButton = new GameButton({
      width: 140,
      height: 36,
      theme: this._theme,
      label: '内訳を見る',
    })
    breakdownButton.y = y
    breakdownButton.onActivate = () => this._onOpenBreakdown()
    content.addChild(breakdownButton)
    y += 44

    return y
  }
}
