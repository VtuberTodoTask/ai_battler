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
  onAdvance?: () => void
  onOpenSettings?: () => void
  onOpenSave?: () => void
  onOpenLibrary?: () => void
  onOpenLedger?: () => void
  onOpenUpgrade?: () => void
  onOpenVisitorRegistry?: () => void
  onOpenQuestChainLog?: () => void
  onOpenWorldEventLog?: () => void
}

const SETTINGS_ICON_URL = '/settings-icon.png'
const GEAR_SIZE = 44
const BUTTON_HEIGHT = 44

/**
 * Three-row layout (Phase 9.7.1) — replaces the earlier single 64px-tall
 * row, which had grown to eight buttons plus the day/reputation/money/
 * status readouts and could no longer fit them without overlap:
 *   Row A (y=8):  DAY / Tavern Rank & reputation / funds
 *   Row B (y=34): status message (left) and, only while a World Event is
 *                 active, a compact clickable banner (right) — never both
 *                 competing for the same horizontal space as Row A's
 *                 always-on readouts.
 *   Row C (y=62): every navigation button, left-aligned, plus the day
 *                 advance button and settings gear at the end. Widths are
 *                 summed programmatically (not by hand-chained arithmetic
 *                 per button, which is exactly what silently drifted out
 *                 of sync in Phase 9.6) so adding a button can never
 *                 leave a later one mispositioned.
 */
const ROW_A_Y = 8
const ROW_B_Y = 36
const ROW_C_Y = 64
export const TAVERN_HEADER_HEIGHT = ROW_C_Y + BUTTON_HEIGHT + 8

export class TavernHeader extends Container {
  private readonly _theme: GameUiTheme
  private readonly _width: number
  private readonly _dayLabel: GameLabel
  private readonly _reputationLabel: GameLabel
  private readonly _moneyLabel: GameLabel
  private readonly _statusLabel: GameLabel
  private readonly _worldEventBanner: GameLabel
  private readonly _actionButton: GameButton
  private readonly _onAdvance?: () => void
  private readonly _onOpenSettings?: () => void
  private readonly _onOpenSave?: () => void
  private readonly _onOpenLibrary?: () => void
  private readonly _onOpenLedger?: () => void
  private readonly _onOpenUpgrade?: () => void
  private readonly _onOpenVisitorRegistry?: () => void
  private readonly _onOpenQuestChainLog?: () => void
  private readonly _onOpenWorldEventLog?: () => void

  constructor(options: TavernHeaderOptions) {
    super()

    this._theme = options.theme
    this._width = options.width
    this._onAdvance = options.onAdvance
    this._onOpenSettings = options.onOpenSettings
    this._onOpenSave = options.onOpenSave
    this._onOpenLibrary = options.onOpenLibrary
    this._onOpenLedger = options.onOpenLedger
    this._onOpenUpgrade = options.onOpenUpgrade
    this._onOpenVisitorRegistry = options.onOpenVisitorRegistry
    this._onOpenQuestChainLog = options.onOpenQuestChainLog
    this._onOpenWorldEventLog = options.onOpenWorldEventLog

    const panel = new GamePanel({
      width: this._width,
      height: TAVERN_HEADER_HEIGHT,
      theme: this._theme,
      color: this._theme.colors.panelTitle,
      borderColor: this._theme.colors.panelBorder,
      radius: 0,
      alpha: 0.82,
    })
    this.addChild(panel)

    // --- Row A: always-on readouts ---
    this._dayLabel = new GameLabel('', this._theme, 'heading')
    this._dayLabel.x = this._theme.spacing.s16
    this._dayLabel.y = ROW_A_Y
    this.addChild(this._dayLabel)

    this._reputationLabel = new GameLabel('', this._theme, 'body')
    this._reputationLabel.x = 180
    this._reputationLabel.y = ROW_A_Y + 4
    this.addChild(this._reputationLabel)

    this._moneyLabel = new GameLabel('', this._theme, 'body')
    this._moneyLabel.x = 500
    this._moneyLabel.y = ROW_A_Y + 4
    this.addChild(this._moneyLabel)

    // --- Row B: status message (left) / World Event banner (right) ---
    this._statusLabel = new GameLabel('', this._theme, 'caption', {
      maxWidth: 660,
    })
    this._statusLabel.x = this._theme.spacing.s16
    this._statusLabel.y = ROW_B_Y
    this.addChild(this._statusLabel)

    this._worldEventBanner = new GameLabel('', this._theme, 'caption', {
      maxWidth: this._width - 720,
    })
    this._worldEventBanner.x = 700
    this._worldEventBanner.y = ROW_B_Y
    this._worldEventBanner.eventMode = 'static'
    this._worldEventBanner.cursor = 'pointer'
    this._worldEventBanner.on('pointertap', () => {
      this._onOpenWorldEventLog?.()
    })
    this._worldEventBanner.visible = false
    this.addChild(this._worldEventBanner)

    // --- Row C: navigation buttons, then advance + gear ---
    const gap = this._theme.spacing.s8
    const navButtons: {
      width: number
      label: string
      onActivate?: () => void
    }[] = [
      { width: 100, label: 'セーブ', onActivate: this._onOpenSave },
      { width: 100, label: '資料室', onActivate: this._onOpenLibrary },
      { width: 100, label: '帳簿', onActivate: this._onOpenLedger },
      { width: 100, label: '設備', onActivate: this._onOpenUpgrade },
      {
        width: 140,
        label: '来訪者台帳',
        onActivate: this._onOpenVisitorRegistry,
      },
      {
        width: 140,
        label: '依頼記録',
        onActivate: this._onOpenQuestChainLog,
      },
      {
        width: 140,
        label: '世界情勢',
        onActivate: this._onOpenWorldEventLog,
      },
    ]

    let cursorX = this._theme.spacing.s16
    for (const spec of navButtons) {
      const button = new GameButton({
        width: spec.width,
        height: BUTTON_HEIGHT,
        theme: this._theme,
        label: spec.label,
      })
      button.x = cursorX
      button.y = ROW_C_Y
      button.onActivate = () => spec.onActivate?.()
      this.addChild(button)
      cursorX += spec.width + gap
    }

    const actionButtonWidth = 140
    this._actionButton = new GameButton({
      width: actionButtonWidth,
      height: BUTTON_HEIGHT,
      theme: this._theme,
      label: '翌日へ',
      disabled: true,
    })
    this._actionButton.x = cursorX
    this._actionButton.y = ROW_C_Y
    this._actionButton.onActivate = () => {
      if (this._actionButton.state === 'disabled') return
      this._onAdvance?.()
    }
    this.addChild(this._actionButton)
    cursorX += actionButtonWidth + gap

    const gearY = ROW_C_Y + (BUTTON_HEIGHT - GEAR_SIZE) / 2
    this._setupSettingsIcon(cursorX, gearY)
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

    // Phase 9.7.1: the active World Event's title / response progress /
    // remaining days are rendered directly on the Tavern Main header —
    // not just implied by a button label — and stay hidden entirely when
    // no event is active. Clicking it opens the full World Event Log,
    // same destination as the permanent "世界情勢" nav button.
    if (viewModel.worldEventBanner) {
      const banner = viewModel.worldEventBanner
      this._worldEventBanner.text = `世界情勢：${banner.eventTitle} / ${banner.statusProgressLabel} / ${banner.remainingDaysLabel}`
      this._worldEventBanner.visible = true
    } else {
      this._worldEventBanner.text = ''
      this._worldEventBanner.visible = false
    }
  }

  setActionEnabled(enabled: boolean): void {
    this._actionButton.setEnabled(enabled)
  }

  /** Test-only accessor for the World Event banner's current presentation
   * state — avoids pixel-position assertions while still proving the
   * banner becomes render-visible with the right content when active. */
  getWorldEventBannerStateForTest(): { visible: boolean; text: string } {
    return {
      visible: this._worldEventBanner.visible,
      text: this._worldEventBanner.text,
    }
  }
}
