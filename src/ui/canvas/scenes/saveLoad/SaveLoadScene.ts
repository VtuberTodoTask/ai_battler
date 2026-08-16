import { Container, Graphics } from 'pixi.js'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GamePanel } from '../../components/GamePanel.ts'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import type {
  GameScene,
  GameSceneContext,
  SaveSlotSummaryFromActions,
} from '../../types.ts'

const PANEL_WIDTH = 720
const PANEL_HEIGHT = 560
const ROW_HEIGHT = 80

export class SaveLoadScene implements GameScene {
  readonly id = 'saveLoad'

  private _context: GameSceneContext | null = null
  private _root: Container | null = null
  private _mode: 'save' | 'load' = 'load'
  private _slots: SaveSlotSummaryFromActions[] = []
  private _loading = false
  private _message = ''

  mount(context: GameSceneContext, input?: { mode?: 'save' | 'load' }): void {
    this._context = context
    this._mode = input?.mode ?? 'load'
    this._root = new Container()
    context.layers.ui.addChild(this._root)

    this.drawBackground(context)
    this.drawPanel(context)
    this.drawTitle(context)
    this.drawBackButton(context)

    void this.refreshSlots()
  }

  unmount(): void {
    if (this._root) {
      this._root.parent?.removeChild(this._root)
      this._root.destroy({ children: true })
      this._root = null
    }
    this._context = null
    this._slots = []
    this._message = ''
  }

  update(): void {}

  private drawBackground(context: GameSceneContext): void {
    const graphics = new Graphics()
    graphics
      .rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT)
      .fill({ color: context.theme.colors.background })
    this._root?.addChild(graphics)
  }

  private drawPanel(context: GameSceneContext): void {
    const panel = new GamePanel({
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      theme: context.theme,
      color: context.theme.colors.panel,
      borderColor: context.theme.colors.brass,
      radius: context.theme.radius.large,
      alpha: 0.92,
    })
    panel.x = (VIRTUAL_WIDTH - PANEL_WIDTH) / 2
    panel.y = (VIRTUAL_HEIGHT - PANEL_HEIGHT) / 2
    this._root?.addChild(panel)
  }

  private drawTitle(context: GameSceneContext): void {
    const title = this._mode === 'save' ? 'セーブ' : 'ロード'
    const label = new GameLabel(title, context.theme, 'heading')
    label.anchor.set(0.5)
    label.x = VIRTUAL_WIDTH / 2
    label.y = 140
    this._root?.addChild(label)
  }

  private drawBackButton(context: GameSceneContext): void {
    const backButton = new GameButton({
      width: 140,
      height: 44,
      theme: context.theme,
      label: '戻る',
    })
    backButton.x = (VIRTUAL_WIDTH - PANEL_WIDTH) / 2 + 16
    backButton.y = VIRTUAL_HEIGHT - (VIRTUAL_HEIGHT - PANEL_HEIGHT) / 2 - 60
    backButton.onActivate = () => {
      this._context?.actions.returnToTitle?.()
    }
    this._root?.addChild(backButton)
  }

  private async refreshSlots(): Promise<void> {
    if (!this._context) return
    this._loading = true
    this._message = ''
    this.drawSlotList()

    const result = await this._context.actions.listSaves?.()
    if (result && result.ok && result.data) {
      this._slots = result.data
    } else {
      this._message = result?.message ?? 'セーブ一覧の取得に失敗しました'
    }
    this._loading = false
    this.drawSlotList()
  }

  private drawSlotList(): void {
    if (!this._root || !this._context) return

    const existing = this._root.getChildByLabel('slot-list')
    if (existing) {
      this._root.removeChild(existing)
      existing.destroy({ children: true })
    }

    const container = new Container()
    container.label = 'slot-list'
    const startY = 200
    const left = (VIRTUAL_WIDTH - PANEL_WIDTH) / 2 + 32
    const width = PANEL_WIDTH - 64

    if (this._loading) {
      const loadingLabel = new GameLabel(
        '読み込み中...',
        this._context.theme,
        'body',
      )
      loadingLabel.x = left
      loadingLabel.y = startY
      container.addChild(loadingLabel)
      this._root.addChild(container)
      return
    }

    if (this._message.length > 0) {
      const messageLabel = new GameLabel(
        this._message,
        this._context.theme,
        'body',
        {
          maxWidth: width,
        },
      )
      messageLabel.x = left
      messageLabel.y = startY
      container.addChild(messageLabel)
      this._root.addChild(container)
      return
    }

    if (this._slots.length === 0) {
      const emptyLabel = new GameLabel(
        'セーブデータがありません',
        this._context.theme,
        'body',
      )
      emptyLabel.x = left
      emptyLabel.y = startY
      container.addChild(emptyLabel)
      this._root.addChild(container)
      return
    }

    this._slots.forEach((slot, index) => {
      const y = startY + index * (ROW_HEIGHT + 12)
      const row = this.createSlotRow(slot, left, y, width)
      container.addChild(row)
    })

    this._root.addChild(container)
  }

  private createSlotRow(
    slot: SaveSlotSummaryFromActions,
    x: number,
    y: number,
    width: number,
  ): Container {
    const row = new Container()
    row.x = x
    row.y = y

    const panel = new GamePanel({
      width,
      height: ROW_HEIGHT,
      theme: this._context!.theme,
      color: slot.empty
        ? this._context!.theme.colors.panel
        : this._context!.theme.colors.panelTitle,
      borderColor: this._context!.theme.colors.panelBorder,
      radius: this._context!.theme.radius.medium,
    })
    row.addChild(panel)

    const title = slot.empty ? `${slot.label} - 空き` : slot.label
    const titleLabel = new GameLabel(title, this._context!.theme, 'body')
    titleLabel.x = 16
    titleLabel.y = 12
    row.addChild(titleLabel)

    if (!slot.empty && slot.metadata) {
      const detail = `DAY ${slot.metadata.currentDay} / ${slot.metadata.campaignSeed}`
      const detailLabel = new GameLabel(
        detail,
        this._context!.theme,
        'caption',
        {
          maxWidth: width - 180,
        },
      )
      detailLabel.x = 16
      detailLabel.y = 42
      row.addChild(detailLabel)
    }

    if (slot.incompatible) {
      const reason =
        slot.incompatibilityReason ?? '現在のバージョンでは読み込めません'
      const reasonLabel = new GameLabel(
        reason,
        this._context!.theme,
        'caption',
        {
          maxWidth: width - 180,
        },
      )
      reasonLabel.x = 16
      reasonLabel.y = 42
      row.addChild(reasonLabel)
    }

    const actionButton = new GameButton({
      width: 120,
      height: 40,
      theme: this._context!.theme,
      label:
        this._mode === 'save' ? (slot.empty ? '保存' : '上書き') : '読み込み',
      disabled: this._mode === 'load' && (slot.empty || slot.incompatible),
    })
    actionButton.x = width - 120 - 12
    actionButton.y = (ROW_HEIGHT - 40) / 2
    actionButton.onActivate = () => this.handleSlotAction(slot)
    row.addChild(actionButton)

    return row
  }

  private async handleSlotAction(
    slot: SaveSlotSummaryFromActions,
  ): Promise<void> {
    if (!this._context) return
    if (this._mode === 'load') {
      if (slot.empty || slot.incompatible) return
      const result = await this._context.actions.loadGame?.(slot.slotId)
      if (!result?.ok) {
        this._message = result?.message ?? 'ロードに失敗しました'
        this.drawSlotList()
      }
      return
    }

    if (this._mode === 'save') {
      if (slot.empty) {
        const result = await this._context.actions.saveGame?.(slot.slotId)
        this._message = result?.ok
          ? '保存しました'
          : (result?.message ?? '保存に失敗しました')
        void this.refreshSlots()
      } else {
        this.openOverwriteConfirmation(slot)
      }
    }
  }

  private openOverwriteConfirmation(slot: SaveSlotSummaryFromActions): void {
    const content = new GameLabel(
      `${slot.label} に上書き保存しますか？`,
      this._context!.theme,
      'body',
      { maxWidth: 480 },
    )
    const footer = new Container()
    const backButton = new GameButton({
      width: 120,
      height: 40,
      theme: this._context!.theme,
      label: '戻る',
    })
    backButton.x = 0
    backButton.y = 0
    backButton.onActivate = () => this._context?.overlayManager.closeModal()

    const overwriteButton = new GameButton({
      width: 120,
      height: 40,
      theme: this._context!.theme,
      label: '上書き',
    })
    overwriteButton.x = 140
    overwriteButton.y = 0
    overwriteButton.onActivate = async () => {
      this._context?.overlayManager.closeModal()
      const result = await this._context?.actions.saveGame?.(slot.slotId)
      this._message = result?.ok
        ? '上書き保存しました'
        : (result?.message ?? '保存に失敗しました')
      void this.refreshSlots()
    }

    footer.addChild(backButton, overwriteButton)
    this._context?.overlayManager.openModal('上書き確認', content, footer)
  }
}
