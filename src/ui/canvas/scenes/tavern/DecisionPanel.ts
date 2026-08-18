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
  onOpenPartyDetail: () => void
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
  private readonly _onOpenPartyDetail: () => void
  private readonly _getSelectedParty: () => TavernParty | undefined
  private readonly _getSelectedQuest: () => TavernRequestOffer | undefined
  private readonly _onOpenBreakdown: () => void
  private readonly _panel: GamePanel
  private readonly _scroll: GameScrollView
  private readonly _scrollWidth: number
  private readonly _scrollHeight: number
  private readonly _assignButton: GameButton
  private readonly _partyDetailButton: GameButton
  private readonly _bottomBar: Container
  private readonly _predictionContent: Container
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
    this._onOpenPartyDetail = options.onOpenPartyDetail
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

    const margin = this._theme.spacing.s12
    const gap = this._theme.spacing.s16
    const bottomBarHeight = 120
    this._scrollWidth = this._width - margin * 2
    this._scrollHeight = this._height - margin - bottomBarHeight - margin
    this._scroll = new GameScrollView(
      this._theme,
      this._scrollWidth,
      this._scrollHeight,
    )
    this._scroll.x = margin
    this._scroll.y = margin
    this.addChild(this._scroll)

    this._bottomBar = new Container()
    this._bottomBar.y = this._height - bottomBarHeight
    this.addChild(this._bottomBar)

    this._assignButton = new GameButton({
      width: 200,
      height: 44,
      theme: this._theme,
      label: 'この依頼を紹介する',
      disabled: true,
    })
    this._assignButton.x = margin
    this._assignButton.y = (bottomBarHeight - 44) / 2
    this._assignButton.onActivate = () => this._onAssign()
    this._bottomBar.addChild(this._assignButton)

    this._partyDetailButton = new GameButton({
      width: 120,
      height: 44,
      theme: this._theme,
      label: 'パーティ詳細',
      disabled: true,
    })
    this._partyDetailButton.x = margin + 200 + gap
    this._partyDetailButton.y = (bottomBarHeight - 44) / 2
    this._partyDetailButton.onActivate = () => this._onOpenPartyDetail()
    this._bottomBar.addChild(this._partyDetailButton)

    this._predictionContent = new Container()
    this._bottomBar.addChild(this._predictionContent)
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

    for (const child of [...this._predictionContent.children]) {
      this._predictionContent.removeChild(child)
      child.destroy({ children: true })
    }

    this._assignButton.setEnabled(false)
    this._assignButton.setLabel('この依頼を紹介する')
    this._partyDetailButton.setEnabled(false)

    const vm = this._viewModel
    if (!vm?.selectedParty && !vm?.selectedQuest) {
      const label = new GameLabel(
        '依頼を選択してください',
        this._theme,
        'body',
        { maxWidth: this._scrollWidth, breakWords: true },
      )
      content.addChild(label)
      this.renderPrediction(vm)
      this._scroll.setViewportSize(this._scrollWidth, this._scrollHeight)
      return
    }

    const gap = this._theme.spacing.s16
    const leftWidth = Math.round((this._scrollWidth - gap) * 0.55)
    const rightWidth = this._scrollWidth - leftWidth - gap

    const leftColumn = new Container()
    const rightColumn = new Container()
    rightColumn.x = leftWidth + gap
    content.addChild(leftColumn)
    content.addChild(rightColumn)

    if (vm.selectedQuest) {
      this.renderQuestDetail(leftColumn, vm.selectedQuest, leftWidth)
    } else {
      const hint = new GameLabel(
        '依頼を選択してください',
        this._theme,
        'body',
        { maxWidth: leftWidth, breakWords: true },
      )
      leftColumn.addChild(hint)
    }

    if (vm.selectedParty) {
      this.renderPartySummary(rightColumn, vm.selectedParty, rightWidth)
    } else {
      const hint = new GameLabel(
        'パーティを選択すると詳細と遠征予測を確認できます',
        this._theme,
        'body',
        { maxWidth: rightWidth, breakWords: true },
      )
      rightColumn.addChild(hint)
    }

    this._assignButton.setEnabled(vm.canOffer)
    this._partyDetailButton.setEnabled(!!vm.selectedParty)
    if (!vm.canOffer && vm.offerDisabledReason) {
      this._assignButton.setLabel(
        vm.offerDisabledReason.length > 10
          ? `${vm.offerDisabledReason.slice(0, 9)}…`
          : vm.offerDisabledReason,
      )
    }

    this.renderPrediction(vm)
    this._scroll.setViewportSize(this._scrollWidth, this._scrollHeight)
  }

  private renderQuestDetail(
    container: Container,
    quest: NonNullable<TavernDecisionViewModel['selectedQuest']>,
    maxWidth: number,
  ): void {
    let y = 0

    const title = new GameLabel(`《${quest.title}》`, this._theme, 'heading', {
      maxWidth,
      breakWords: true,
    })
    title.y = y
    container.addChild(title)
    y += title.textHeight + 8

    const rank = new GameLabel(quest.rankLabel, this._theme, 'body', {
      maxWidth,
      breakWords: true,
    })
    rank.y = y
    container.addChild(rank)
    y += rank.textHeight + 12

    const rewardBlock = [
      quest.promisedRewardLabel,
      quest.successCommissionLabel,
    ].join('\n')
    const reward = new GameLabel(rewardBlock, this._theme, 'body', {
      maxWidth,
      breakWords: true,
    })
    reward.y = y
    container.addChild(reward)
    y += reward.textHeight + 12

    const infoBlock = [
      `種別：${quest.objectiveTypeLabel}`,
      `地域：${quest.terrainLabel}`,
      `戦闘：${quest.combatLabel}`,
      `状態：${quest.offerStatusLabel}`,
    ].join('\n')
    const info = new GameLabel(infoBlock, this._theme, 'body', {
      maxWidth,
      breakWords: true,
    })
    info.y = y
    container.addChild(info)
    y += info.textHeight + 12

    if (quest.tags.length > 0) {
      const tags = new GameLabel(
        quest.tags.join(' / '),
        this._theme,
        'caption',
        {
          maxWidth,
          breakWords: true,
        },
      )
      tags.y = y
      container.addChild(tags)
      y += tags.textHeight + 16
    }

    const desc = new GameLabel(quest.description, this._theme, 'body', {
      maxWidth,
      breakWords: true,
    })
    desc.y = y
    container.addChild(desc)
  }

  private renderPartySummary(
    container: Container,
    party: NonNullable<TavernDecisionViewModel['selectedParty']>,
    maxWidth: number,
  ): void {
    let y = 0

    const title = new GameLabel(
      `《${party.name}》 ${party.rankLabel}`,
      this._theme,
      'heading',
      { maxWidth, breakWords: true },
    )
    title.y = y
    container.addChild(title)
    y += title.textHeight + 8

    const status = new GameLabel(
      `状態：${party.statusLabel}  人数：${party.memberCount}名`,
      this._theme,
      'body',
      { maxWidth, breakWords: true },
    )
    status.y = y
    container.addChild(status)
    y += status.textHeight + 8

    const injury = new GameLabel(party.injuryLabel, this._theme, 'body', {
      maxWidth,
      breakWords: true,
    })
    injury.y = y
    container.addChild(injury)
    y += injury.textHeight + 16

    if (party.members.length > 0) {
      for (const member of party.members) {
        y = this.renderMember(container, member, maxWidth, y)
      }
    }
  }

  private renderMember(
    container: Container,
    member: TavernPartyMemberViewModel,
    maxWidth: number,
    y: number,
  ): number {
    const name = new GameLabel(
      `${member.name}（${member.role} · ${member.rank}）`,
      this._theme,
      'body',
      { maxWidth, breakWords: true },
    )
    name.y = y
    container.addChild(name)
    y += name.textHeight + 2

    const condition = new GameLabel(
      member.conditionLabel,
      this._theme,
      'caption',
      {
        maxWidth,
        breakWords: true,
      },
    )
    condition.y = y
    container.addChild(condition)
    y += condition.textHeight + 10

    return y
  }

  private renderPrediction(vm: TavernDecisionViewModel | undefined): void {
    const margin = this._theme.spacing.s12
    const gap = this._theme.spacing.s16
    const leftWidth = Math.round((this._scrollWidth - gap) * 0.55)
    const rightWidth = this._scrollWidth - leftWidth - gap

    this._predictionContent.x = margin + leftWidth + gap
    this._predictionContent.y = 0

    if (!vm?.selectedParty || !vm.selectedQuest) {
      const hint = new GameLabel(
        'パーティと依頼を選択すると遠征予測を確認できます',
        this._theme,
        'caption',
        { maxWidth: rightWidth, align: 'right', breakWords: true },
      )
      this._predictionContent.addChild(hint)
      return
    }

    if (this._predictionStatus === 'loading') {
      const label = new GameLabel('遠征を予測中…', this._theme, 'caption', {
        maxWidth: rightWidth,
        align: 'right',
        breakWords: true,
      })
      this._predictionContent.addChild(label)
      return
    }

    if (this._predictionStatus === 'error') {
      const label = new GameLabel(
        '遠征予測を取得できませんでした',
        this._theme,
        'caption',
        { maxWidth: rightWidth, align: 'right', breakWords: true },
      )
      this._predictionContent.addChild(label)
      return
    }

    if (!this._prediction) {
      return
    }

    const prediction = this._prediction
    const rightX = 0
    let y = 0

    const label = new GameLabel('推定依頼達成率', this._theme, 'body', {
      maxWidth: rightWidth,
      align: 'right',
      breakWords: true,
    })
    label.x = rightX
    label.y = y
    this._predictionContent.addChild(label)
    y += label.textHeight + 4

    const rateValue = new GameLabel(
      `${Math.round(prediction.estimatedSuccessRate * 100)}%`,
      this._theme,
      'display',
      { maxWidth: rightWidth, align: 'right', breakWords: true },
    )
    rateValue.x = rightX
    rateValue.y = y
    this._predictionContent.addChild(rateValue)
    y += rateValue.textHeight + 4

    const danger = new GameLabel(
      getPredictionLabel(prediction.estimatedSuccessRate),
      this._theme,
      'caption',
      { maxWidth: rightWidth, align: 'right', breakWords: true },
    )
    danger.x = rightX
    danger.y = y
    this._predictionContent.addChild(danger)
    y += danger.textHeight

    const bottomBarHeight = this._height - this._bottomBar.y
    this._predictionContent.y = Math.max(0, (bottomBarHeight - y) / 2)
  }
}
