import { Container } from 'pixi.js'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GamePanel } from '../../components/GamePanel.ts'
import type { GameUiTheme } from '../../theme/gameTheme.ts'
import type { TavernHeaderViewModel } from '../../viewModel/tavernScreenViewModel.ts'

export interface TavernHeaderOptions {
  theme: GameUiTheme
  width: number
  height: number
  onResolve?: () => void
  onAdvance?: () => void
  onOpenReports?: () => void
}

export class TavernHeader extends Container {
  private readonly _theme: GameUiTheme
  private readonly _width: number
  private readonly _height: number
  private readonly _dayLabel: GameLabel
  private readonly _reputationLabel: GameLabel
  private readonly _statusLabel: GameLabel
  private readonly _actionButton: GameButton
  private readonly _reportButton: GameButton
  private readonly _onResolve?: () => void
  private readonly _onAdvance?: () => void
  private readonly _onOpenReports?: () => void

  constructor(options: TavernHeaderOptions) {
    super()

    this._theme = options.theme
    this._width = options.width
    this._height = options.height
    this._onResolve = options.onResolve
    this._onAdvance = options.onAdvance
    this._onOpenReports = options.onOpenReports

    const panel = new GamePanel({
      width: this._width,
      height: this._height,
      theme: this._theme,
      color: this._theme.colors.panelTitle,
      borderColor: this._theme.colors.panelBorder,
      radius: 0,
      alpha: 0.82,
    })
    this.addChild(panel)

    this._dayLabel = new GameLabel('', this._theme, 'heading')
    this._dayLabel.x = this._theme.spacing.s16
    this._dayLabel.y = 16
    this.addChild(this._dayLabel)

    this._reputationLabel = new GameLabel('', this._theme, 'body')
    this._reputationLabel.x = 280
    this._reputationLabel.y = 20
    this.addChild(this._reputationLabel)

    this._statusLabel = new GameLabel('', this._theme, 'caption', {
      maxWidth: this._width - 420,
    })
    this._statusLabel.x = this._theme.spacing.s16
    this._statusLabel.y = 42
    this.addChild(this._statusLabel)

    this._reportButton = new GameButton({
      width: 120,
      height: 44,
      theme: this._theme,
      label: '報告',
      disabled: false,
    })
    this._reportButton.x =
      this._width - 196 - this._theme.spacing.s16 - 120 - this._theme.spacing.s8
    this._reportButton.y = 10
    this._reportButton.onActivate = () => {
      if (this._reportButton.state !== 'disabled') {
        this._onOpenReports?.()
      }
    }
    this.addChild(this._reportButton)

    this._actionButton = new GameButton({
      width: 180,
      height: 44,
      theme: this._theme,
      label: '本日を確定',
      disabled: true,
    })
    this._actionButton.x = this._width - 196 - this._theme.spacing.s16
    this._actionButton.y = 10
    this._actionButton.onActivate = () => {
      if (this._actionButton.state === 'disabled') return
      if (this._actionButtonLabel === '本日を確定') {
        this._onResolve?.()
      } else {
        this._onAdvance?.()
      }
    }
    this.addChild(this._actionButton)
  }

  private _actionButtonLabel = '本日を確定'

  update(viewModel: TavernHeaderViewModel): void {
    this._dayLabel.text = `DAY ${viewModel.day}`
    this._reputationLabel.text = viewModel.reputationLabel

    if (viewModel.statusMessage) {
      this._statusLabel.text = viewModel.statusMessage.text
      this._statusLabel.visible = true
    } else {
      this._statusLabel.text = ''
      this._statusLabel.visible = false
    }

    if (viewModel.canResolveDay) {
      this._actionButtonLabel = '本日を確定'
      this._actionButton.setLabel(this._actionButtonLabel)
      this._actionButton.setEnabled(true)
    } else if (viewModel.canAdvanceDay) {
      this._actionButtonLabel = '翌日へ'
      this._actionButton.setLabel(this._actionButtonLabel)
      this._actionButton.setEnabled(true)
    } else {
      this._actionButtonLabel = '本日を確定'
      this._actionButton.setLabel(this._actionButtonLabel)
      this._actionButton.setEnabled(false)
    }

    const reportLabel =
      viewModel.unreadReportCount > 0
        ? `報告 \u25cf${viewModel.unreadReportCount}`
        : '報告'
    this._reportButton.setLabel(reportLabel)
  }
}
