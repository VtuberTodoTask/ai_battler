import {
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GamePanel } from '../../components/GamePanel.ts'
import type { GameUiTheme } from '../../theme/gameTheme.ts'
import type { TavernHeaderViewModel } from '../../viewModel/tavernScreenViewModel.ts'

export interface TavernHeaderOptions {
  theme: GameUiTheme
  width: number
  height: number
  onAdvance?: () => void
  onOpenSettings?: () => void
  onOpenSave?: () => void
  onOpenLibrary?: () => void
  onOpenLedger?: () => void
  onOpenUpgrade?: () => void
  onOpenVisitorRegistry?: () => void
  onOpenQuestChainLog?: () => void
}

const SETTINGS_ICON_URL = '/settings-icon.png'
const GEAR_SIZE = 44

export class TavernHeader extends Container {
  private readonly _theme: GameUiTheme
  private readonly _width: number
  private readonly _height: number
  private readonly _dayLabel: GameLabel
  private readonly _reputationLabel: GameLabel
  private readonly _moneyLabel: GameLabel
  private readonly _statusLabel: GameLabel
  private readonly _actionButton: GameButton
  private readonly _onAdvance?: () => void
  private readonly _onOpenSettings?: () => void
  private readonly _onOpenSave?: () => void
  private readonly _onOpenLibrary?: () => void
  private readonly _onOpenLedger?: () => void
  private readonly _onOpenUpgrade?: () => void
  private readonly _onOpenVisitorRegistry?: () => void
  private readonly _onOpenQuestChainLog?: () => void

  constructor(options: TavernHeaderOptions) {
    super()

    this._theme = options.theme
    this._width = options.width
    this._height = options.height
    this._onAdvance = options.onAdvance
    this._onOpenSettings = options.onOpenSettings
    this._onOpenSave = options.onOpenSave
    this._onOpenLibrary = options.onOpenLibrary
    this._onOpenLedger = options.onOpenLedger
    this._onOpenUpgrade = options.onOpenUpgrade
    this._onOpenVisitorRegistry = options.onOpenVisitorRegistry
    this._onOpenQuestChainLog = options.onOpenQuestChainLog

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
    this._reputationLabel.x = 180
    this._reputationLabel.y = 20
    this.addChild(this._reputationLabel)

    this._moneyLabel = new GameLabel('', this._theme, 'body')
    this._moneyLabel.x = 500
    this._moneyLabel.y = 20
    this.addChild(this._moneyLabel)

    this._statusLabel = new GameLabel('', this._theme, 'caption', {
      maxWidth: this._width - 420,
    })
    this._statusLabel.x = this._theme.spacing.s16
    this._statusLabel.y = 42
    this.addChild(this._statusLabel)

    const rightMargin = this._theme.spacing.s16
    const actionButtonWidth = 140
    const saveButtonWidth = 100
    const libraryButtonWidth = 100
    const ledgerButtonWidth = 100
    const upgradeButtonWidth = 100
    const registryButtonWidth = 140
    const chainLogButtonWidth = 140
    const gearSize = GEAR_SIZE
    const gap = this._theme.spacing.s8
    const rightClusterWidth =
      saveButtonWidth +
      gap +
      libraryButtonWidth +
      gap +
      ledgerButtonWidth +
      gap +
      upgradeButtonWidth +
      gap +
      registryButtonWidth +
      gap +
      chainLogButtonWidth +
      gap +
      actionButtonWidth +
      gap +
      gearSize
    const startX = this._width - rightMargin - rightClusterWidth

    const saveButton = new GameButton({
      width: saveButtonWidth,
      height: 44,
      theme: this._theme,
      label: 'セーブ',
    })
    saveButton.x = startX
    saveButton.y = 10
    saveButton.onActivate = () => {
      this._onOpenSave?.()
    }
    this.addChild(saveButton)

    const libraryButton = new GameButton({
      width: libraryButtonWidth,
      height: 44,
      theme: this._theme,
      label: '資料室',
    })
    libraryButton.x = startX + saveButtonWidth + gap
    libraryButton.y = 10
    libraryButton.onActivate = () => {
      this._onOpenLibrary?.()
    }
    this.addChild(libraryButton)

    const ledgerButton = new GameButton({
      width: ledgerButtonWidth,
      height: 44,
      theme: this._theme,
      label: '帳簿',
    })
    ledgerButton.x = startX + saveButtonWidth + gap + libraryButtonWidth + gap
    ledgerButton.y = 10
    ledgerButton.onActivate = () => {
      this._onOpenLedger?.()
    }
    this.addChild(ledgerButton)

    const upgradeButton = new GameButton({
      width: upgradeButtonWidth,
      height: 44,
      theme: this._theme,
      label: '設備',
    })
    upgradeButton.x =
      startX +
      saveButtonWidth +
      gap +
      libraryButtonWidth +
      gap +
      ledgerButtonWidth +
      gap
    upgradeButton.y = 10
    upgradeButton.onActivate = () => {
      this._onOpenUpgrade?.()
    }
    this.addChild(upgradeButton)

    const registryButton = new GameButton({
      width: registryButtonWidth,
      height: 44,
      theme: this._theme,
      label: '来訪者台帳',
    })
    registryButton.x =
      startX +
      saveButtonWidth +
      gap +
      libraryButtonWidth +
      gap +
      ledgerButtonWidth +
      gap +
      upgradeButtonWidth +
      gap
    registryButton.y = 10
    registryButton.onActivate = () => {
      this._onOpenVisitorRegistry?.()
    }
    this.addChild(registryButton)

    const chainLogButton = new GameButton({
      width: chainLogButtonWidth,
      height: 44,
      theme: this._theme,
      label: '依頼記録',
    })
    chainLogButton.x =
      startX +
      saveButtonWidth +
      gap +
      libraryButtonWidth +
      gap +
      ledgerButtonWidth +
      gap +
      upgradeButtonWidth +
      gap +
      registryButtonWidth +
      gap
    chainLogButton.y = 10
    chainLogButton.onActivate = () => {
      this._onOpenQuestChainLog?.()
    }
    this.addChild(chainLogButton)

    this._actionButton = new GameButton({
      width: actionButtonWidth,
      height: 44,
      theme: this._theme,
      label: '翌日へ',
      disabled: true,
    })
    this._actionButton.x =
      startX +
      saveButtonWidth +
      gap +
      libraryButtonWidth +
      gap +
      ledgerButtonWidth +
      gap +
      upgradeButtonWidth +
      gap +
      registryButtonWidth +
      gap +
      chainLogButtonWidth +
      gap
    this._actionButton.y = 10
    this._actionButton.onActivate = () => {
      if (this._actionButton.state === 'disabled') return
      this._onAdvance?.()
    }
    this.addChild(this._actionButton)

    const gearX =
      startX +
      saveButtonWidth +
      gap +
      libraryButtonWidth +
      gap +
      ledgerButtonWidth +
      gap +
      upgradeButtonWidth +
      gap +
      registryButtonWidth +
      gap +
      chainLogButtonWidth +
      gap +
      actionButtonWidth +
      gap
    const gearY = (this._height - gearSize) / 2
    this._setupSettingsIcon(gearX, gearY)
  }

  private _setupSettingsIcon(x: number, y: number): void {
    if (typeof Assets.load !== 'function') return
    void Assets.load(SETTINGS_ICON_URL)
      .then((texture) => {
        const button = new Graphics()
        button.x = x
        button.y = y
        button.eventMode = 'static'
        button.cursor = 'pointer'
        button.hitArea = new Rectangle(0, 0, GEAR_SIZE, GEAR_SIZE)
        button.rect(0, 0, GEAR_SIZE, GEAR_SIZE).fill({ alpha: 0 })

        const sprite = new Sprite(texture as Texture)
        sprite.eventMode = 'none'
        sprite.width = GEAR_SIZE
        sprite.height = GEAR_SIZE
        button.addChild(sprite)

        button.on('pointertap', () => {
          this._onOpenSettings?.()
        })
        this.addChild(button)
      })
      .catch(() => {
        // Ignore icon load failures (e.g., in test environments).
      })
  }

  update(viewModel: TavernHeaderViewModel): void {
    this._dayLabel.text = `DAY ${viewModel.day}`
    this._reputationLabel.text = viewModel.reputationLabel
    this._moneyLabel.text = viewModel.moneyLabel ?? ''

    if (viewModel.statusMessage) {
      this._statusLabel.text = viewModel.statusMessage.text
      this._statusLabel.visible = true
    } else {
      this._statusLabel.text = ''
      this._statusLabel.visible = false
    }

    const canAdvance = viewModel.canResolveDay || viewModel.canAdvanceDay
    this._actionButton.setEnabled(canAdvance)
  }

  setActionEnabled(enabled: boolean): void {
    this._actionButton.setEnabled(enabled)
  }
}
