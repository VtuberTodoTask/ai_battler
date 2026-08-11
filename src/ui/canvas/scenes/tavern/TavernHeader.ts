import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js'
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
  onOpenSettings?: () => void
}

const SETTINGS_ICON_URL = '/settings-icon.png'
const GEAR_SIZE = 44

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
  private readonly _onOpenSettings?: () => void

  constructor(options: TavernHeaderOptions) {
    super()

    this._theme = options.theme
    this._width = options.width
    this._height = options.height
    this._onResolve = options.onResolve
    this._onAdvance = options.onAdvance
    this._onOpenReports = options.onOpenReports
    this._onOpenSettings = options.onOpenSettings

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

    const rightMargin = this._theme.spacing.s16
    const actionButtonWidth = 180
    const reportButtonWidth = 120
    const gearSize = GEAR_SIZE
    const gap = this._theme.spacing.s8
    const rightClusterWidth =
      actionButtonWidth + gap + reportButtonWidth + gap + gearSize
    const startX = this._width - rightMargin - rightClusterWidth

    this._actionButton = new GameButton({
      width: actionButtonWidth,
      height: 44,
      theme: this._theme,
      label: '本日を確定',
      disabled: true,
    })
    this._actionButton.x = startX
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

    this._reportButton = new GameButton({
      width: reportButtonWidth,
      height: 44,
      theme: this._theme,
      label: '報告',
      disabled: false,
    })
    this._reportButton.x = startX + actionButtonWidth + gap
    this._reportButton.y = 10
    this._reportButton.onActivate = () => {
      if (this._reportButton.state !== 'disabled') {
        this._onOpenReports?.()
      }
    }
    this.addChild(this._reportButton)

    const gearX = this._reportButton.x + reportButtonWidth + gap
    const gearY = (this._height - gearSize) / 2
    this._setupSettingsIcon(gearX, gearY)
  }

  private _setupSettingsIcon(x: number, y: number): void {
    if (typeof Assets.load !== 'function') return
    void Assets.load(SETTINGS_ICON_URL)
      .then((texture) => {
        const sprite = new Sprite(texture as Texture)
        sprite.width = GEAR_SIZE
        sprite.height = GEAR_SIZE
        sprite.x = x
        sprite.y = y
        sprite.eventMode = 'static'
        sprite.cursor = 'pointer'
        sprite.hitArea = new Rectangle(0, 0, GEAR_SIZE, GEAR_SIZE)
        sprite.on('pointertap', () => {
          this._onOpenSettings?.()
        })
        this.addChild(sprite)
      })
      .catch(() => {
        // Ignore icon load failures (e.g., in test environments).
      })
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
