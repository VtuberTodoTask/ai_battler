import { Container } from 'pixi.js'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GamePanel } from '../../components/GamePanel.ts'
import { GameScrollView } from '../../components/GameScrollView.ts'
import type { GameUiTheme } from '../../theme/gameTheme.ts'
import type { TavernPartySummaryViewModel } from '../../viewModel/tavernScreenViewModel.ts'

export interface PartySummaryPanelOptions {
  theme: GameUiTheme
  width: number
  height: number
  onAssign?: () => void
}

export class PartySummaryPanel extends Container {
  private readonly _theme: GameUiTheme
  private readonly _width: number
  private readonly _height: number
  private readonly _onAssign?: () => void
  private readonly _panel: GamePanel
  private readonly _titleLabel: GameLabel
  private readonly _statusLabel: GameLabel
  private readonly _memberLabels: GameLabel[] = []
  private readonly _questLabel: GameLabel
  private readonly _stayLabel: GameLabel
  private readonly _assignButton: GameButton
  private readonly _memberScroll: GameScrollView
  private readonly _memberScrollHeight: number

  constructor(options: PartySummaryPanelOptions) {
    super()

    this._theme = options.theme
    this._width = options.width
    this._height = options.height
    this._onAssign = options.onAssign

    this._panel = new GamePanel({
      width: this._width,
      height: this._height,
      theme: this._theme,
      title: 'PARTY SUMMARY',
      color: this._theme.colors.panel,
      borderColor: this._theme.colors.panelBorder,
      radius: this._theme.radius.large,
      alpha: 0.82,
    })
    this.addChild(this._panel)

    this._titleLabel = new GameLabel('', this._theme, 'heading')
    this._titleLabel.x = this._theme.spacing.s16
    this._titleLabel.y = 48
    this.addChild(this._titleLabel)

    this._statusLabel = new GameLabel('', this._theme, 'body', {
      maxWidth: this._width - this._theme.spacing.s32,
    })
    this._statusLabel.x = this._theme.spacing.s16
    this._statusLabel.y = 88
    this.addChild(this._statusLabel)

    this._memberScrollHeight = Math.min(220, this._height - 240)

    this._memberScroll = new GameScrollView(
      this._theme,
      this._width - this._theme.spacing.s24,
      this._memberScrollHeight,
    )
    this._memberScroll.x = this._theme.spacing.s12
    this._memberScroll.y = 130
    this.addChild(this._memberScroll)

    const questY = 130 + this._memberScrollHeight + 16

    this._questLabel = new GameLabel('', this._theme, 'body', {
      maxWidth: this._width - this._theme.spacing.s32,
    })
    this._questLabel.x = this._theme.spacing.s16
    this._questLabel.y = questY
    this.addChild(this._questLabel)

    this._stayLabel = new GameLabel('', this._theme, 'caption', {
      maxWidth: this._width - this._theme.spacing.s32,
    })
    this._stayLabel.x = this._theme.spacing.s16
    this._stayLabel.y = questY + 36
    this.addChild(this._stayLabel)

    this._assignButton = new GameButton({
      width: 180,
      height: 44,
      theme: this._theme,
      label: '依頼を割り当てる',
      disabled: true,
    })
    this._assignButton.x = this._theme.spacing.s16
    this._assignButton.y = this._height - 60
    this._assignButton.onActivate = () => this._onAssign?.()
    this.addChild(this._assignButton)
  }

  update(summary?: TavernPartySummaryViewModel): void {
    if (!summary) {
      this._titleLabel.text = 'パーティを選択してください'
      this._statusLabel.text = ''
      this._questLabel.text = ''
      this._stayLabel.text = ''
      this._assignButton.setEnabled(false)
      this.clearMembers()
      return
    }

    this._titleLabel.text = `《${summary.name}》`
    this._statusLabel.text = summary.statusLabel
    this._questLabel.text = summary.currentQuest
      ? `依頼：${summary.currentQuest.title}`
      : '依頼未選択'
    this._stayLabel.text = summary.stayInfo
      ? `滞在残り ${summary.stayInfo.daysRemaining}日${summary.stayInfo.extended ? ` · 延長（${summary.stayInfo.extensionReasonLabel}）` : ''}`
      : ''

    this._assignButton.setLabel(
      summary.canAssignQuest
        ? '依頼を割り当てる'
        : (summary.assignDisabledReason ?? '依頼を割り当てる'),
    )
    this._assignButton.setEnabled(summary.canAssignQuest)

    this.renderMembers(summary.members)
  }

  private renderMembers(members: TavernPartySummaryViewModel['members']): void {
    this.clearMembers()
    const content = this._memberScroll.content
    let y = 0
    for (const member of members) {
      const label = new GameLabel(
        `${member.name} · ${member.role} · ${member.rank}`,
        this._theme,
        'body',
      )
      label.y = y
      content.addChild(label)
      this._memberLabels.push(label)
      y += 24

      const condition = new GameLabel(
        member.conditionLabel,
        this._theme,
        'caption',
      )
      condition.y = y
      content.addChild(condition)
      this._memberLabels.push(condition)
      y += 28
    }
    this._memberScroll.setViewportSize(
      this._width - this._theme.spacing.s24,
      this._memberScrollHeight,
    )
  }

  private clearMembers(): void {
    for (const label of this._memberLabels) {
      this._memberScroll.content.removeChild(label)
      label.destroy({ children: true })
    }
    this._memberLabels.length = 0
  }
}
