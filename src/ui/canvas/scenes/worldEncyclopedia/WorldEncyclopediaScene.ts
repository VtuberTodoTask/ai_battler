import {
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GamePanel } from '../../components/GamePanel.ts'
import { GameScrollView } from '../../components/GameScrollView.ts'
import { TavernListRow } from '../../components/TavernListRow.ts'
import { AudioController } from '../../audio/AudioController.ts'
import type { GameScene, GameSceneContext } from '../../types.ts'
import type { GameUiTheme } from '../../theme/gameTheme.ts'
import {
  buildWorldEncyclopediaViewModel,
  resolveInitialEntry,
  WORLD_ENCYCLOPEDIA_CATEGORIES,
  type WorldEncyclopediaCategoryViewModel,
  type WorldEncyclopediaSceneInput,
  type WorldEncyclopediaViewModel,
} from '../../viewModel/worldEncyclopediaViewModel.ts'

const MARGIN = 16
const TOP_BAR_HEIGHT = 64
const MAIN_Y = TOP_BAR_HEIGHT + MARGIN
const MAIN_HEIGHT = VIRTUAL_HEIGHT - TOP_BAR_HEIGHT - MARGIN * 2
const TABS_HEIGHT = 44
const ENTRY_LIST_WIDTH = 320
const CATEGORY_GAP = 12
const RETURN_BUTTON_WIDTH = 160
const RETURN_BUTTON_HEIGHT = 44
const TAB_BUTTON_WIDTH = 160
const TAB_BUTTON_HEIGHT = TABS_HEIGHT - 8
const CONTENT_Y = MAIN_Y + TABS_HEIGHT + MARGIN
const CONTENT_HEIGHT = MAIN_Y + MAIN_HEIGHT - MARGIN - CONTENT_Y
const RIGHT_X = ENTRY_LIST_WIDTH + MARGIN * 2
const RIGHT_WIDTH = VIRTUAL_WIDTH - RIGHT_X - MARGIN
const BACKGROUND_URL = '/party-detail-bg.jpg'

class CategoryButton extends Container {
  private readonly _graphics: Graphics
  private readonly _label: GameLabel
  private readonly _theme: GameUiTheme
  private readonly _width: number
  private readonly _height: number
  private _selected = false
  private _hover = false
  private readonly _id: string
  onActivate?: () => void

  constructor(options: {
    id: string
    width: number
    height: number
    theme: GameUiTheme
    label: string
    selected?: boolean
  }) {
    super()

    this._id = options.id
    this._width = options.width
    this._height = options.height
    this._theme = options.theme
    this._selected = options.selected ?? false

    this._graphics = new Graphics()
    this.addChild(this._graphics)

    this._label = new GameLabel(options.label, this._theme, 'button')
    this.addChild(this._label)
    this._label.x = this._width / 2 - this._label.textWidth / 2
    this._label.y = this._height / 2 - this._label.textHeight / 2

    this.eventMode = 'static'
    this.hitArea = new Rectangle(0, 0, this._width, this._height)
    this.cursor = 'pointer'

    this.on('pointerover', this.onPointerOver)
    this.on('pointerout', this.onPointerOut)
    this.on('pointertap', this.onPointerTap)

    this.draw()
  }

  set selected(value: boolean) {
    this._selected = value
    this.draw()
  }

  get selected(): boolean {
    return this._selected
  }

  get id(): string {
    return this._id
  }

  private onPointerOver = (): void => {
    if (!this._hover) {
      AudioController.playSe('cursor')
    }
    this._hover = true
    this.draw()
  }

  private onPointerOut = (): void => {
    this._hover = false
    this.draw()
  }

  private onPointerTap = (): void => {
    AudioController.playSe('decision')
    this.onActivate?.()
  }

  private draw(): void {
    const colors = this._theme.colors
    let fill = colors.accent
    let stroke = colors.brass

    if (this._selected) {
      fill = colors.accentHover
      stroke = colors.parchment
    } else if (this._hover) {
      fill = colors.accentHover
      stroke = colors.brass
    }

    this._graphics.clear()
    this._graphics
      .roundRect(0, 0, this._width, this._height, this._theme.radius.medium)
      .fill({ color: fill })
      .stroke({ width: 2, color: stroke })
  }
}

export class WorldEncyclopediaScene implements GameScene {
  readonly id = 'worldEncyclopedia'

  private _context: GameSceneContext | null = null
  private _input: WorldEncyclopediaSceneInput | undefined = undefined
  private _category: WorldEncyclopediaCategoryViewModel['id'] = 'world'
  private _entryId = ''
  private _viewModel: WorldEncyclopediaViewModel | null = null

  private _bgRoot: Container | null = null
  private _uiRoot: Container | null = null
  private _headerRoot: Container | null = null
  private _contentRoot: Container | null = null
  private _returnButton: GameButton | null = null
  private _tabButtons: CategoryButton[] = []
  private _entryListPanel: GamePanel | null = null
  private _articlePanel: GamePanel | null = null
  private _entryRows: TavernListRow[] = []
  private _entryListScroll: GameScrollView | null = null
  private _articleScroll: GameScrollView | null = null
  private _articleLabels: Container[] = []
  private _bgLoadToken = 0

  mount(context: GameSceneContext, input?: unknown): void {
    this._context = context
    this._input = (input as WorldEncyclopediaSceneInput | undefined) ?? {
      returnTarget: { sceneId: 'tavern' },
    }

    const initial = resolveInitialEntry(this._input)
    this._category = initial.category
    this._entryId = initial.entryId

    this._bgRoot = new Container()
    context.layers.background.addChild(this._bgRoot)

    this._uiRoot = new Container()
    context.layers.ui.addChild(this._uiRoot)

    this.drawBackground()
    this.createHeader(context)
    this.createContent(context)

    this._viewModel = buildWorldEncyclopediaViewModel(
      this._category,
      this._entryId,
      this._input.returnTarget,
    )
    this.applyViewModel(this._viewModel, true)

    AudioController.playBgm('partyDetail', { loop: true })
  }

  unmount(): void {
    if (this._bgRoot) {
      this._bgRoot.parent?.removeChild(this._bgRoot)
      this._bgRoot.destroy({ children: true })
      this._bgRoot = null
    }
    if (this._uiRoot) {
      this._uiRoot.parent?.removeChild(this._uiRoot)
      this._uiRoot.destroy({ children: true })
      this._uiRoot = null
    }
    this._headerRoot = null
    this._contentRoot = null
    this._returnButton = null
    this._tabButtons = []
    this._entryListPanel = null
    if (this._entryListScroll) {
      this._entryListScroll.destroy({ children: true })
      this._entryListScroll = null
    }
    this._articlePanel = null
    this._entryRows = []
    this._articleScroll = null
    this._articleLabels = []
    this._context = null
    this._input = undefined
    this._viewModel = null
    this._bgLoadToken++
  }

  private drawBackground(): void {
    if (!this._bgRoot) return

    const base = new Graphics()
    base.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill({
      color: this._context!.theme.colors.background,
    })
    this._bgRoot.addChild(base)

    if (
      typeof import.meta.env !== 'undefined' &&
      import.meta.env.MODE === 'test'
    ) {
      return
    }

    if (typeof Assets.load !== 'function') return

    const token = ++this._bgLoadToken
    void Assets.load(BACKGROUND_URL)
      .then((texture) => {
        if (!this._bgRoot || token !== this._bgLoadToken) return
        const sourceTexture = texture as Texture
        const sourceWidth = sourceTexture.width
        const sourceHeight = sourceTexture.height
        const scale = Math.max(
          VIRTUAL_WIDTH / sourceWidth,
          VIRTUAL_HEIGHT / sourceHeight,
        )
        const sprite = new Sprite(sourceTexture)
        sprite.anchor.set(0.5)
        sprite.scale.set(scale)
        sprite.x = VIRTUAL_WIDTH / 2
        sprite.y = VIRTUAL_HEIGHT / 2
        sprite.alpha = 0.55
        base.clear()
        this._bgRoot!.removeChild(base)
        base.destroy()
        this._bgRoot!.addChild(sprite)
      })
      .catch(() => {
        // Keep base color if loading fails.
      })
  }

  private createHeader(context: GameSceneContext): void {
    const { theme } = context

    this._headerRoot = new Container()
    this._headerRoot.x = MARGIN
    this._headerRoot.y = MARGIN
    this._uiRoot!.addChild(this._headerRoot)

    const headerPanel = new GamePanel({
      width: VIRTUAL_WIDTH - MARGIN * 2,
      height: TOP_BAR_HEIGHT,
      theme,
      color: theme.colors.panelTitle,
      borderColor: theme.colors.panelBorder,
      radius: 0,
    })
    this._headerRoot.addChild(headerPanel)

    const title = new GameLabel('資料室', theme, 'heading')
    title.x = theme.spacing.s16
    title.y = (TOP_BAR_HEIGHT - title.textHeight) / 2
    this._headerRoot.addChild(title)

    this._returnButton = new GameButton({
      width: RETURN_BUTTON_WIDTH,
      height: RETURN_BUTTON_HEIGHT,
      theme,
      label: '酒場へ戻る',
    })
    this._returnButton.x =
      VIRTUAL_WIDTH - MARGIN * 2 - RETURN_BUTTON_WIDTH - theme.spacing.s16
    this._returnButton.y = (TOP_BAR_HEIGHT - RETURN_BUTTON_HEIGHT) / 2
    this._returnButton.onActivate = () => this.returnToTavern()
    this._headerRoot.addChild(this._returnButton)
  }

  private createContent(context: GameSceneContext): void {
    this._contentRoot = new Container()
    this._contentRoot.x = MARGIN
    this._contentRoot.y = CONTENT_Y
    this._uiRoot!.addChild(this._contentRoot)

    this.createTabs(context)
    this.createEntryList(context)
    this.createArticle(context)
  }

  private createTabs(context: GameSceneContext): void {
    const { theme } = context

    let x = 0
    for (const category of WORLD_ENCYCLOPEDIA_CATEGORIES) {
      const button = new CategoryButton({
        id: category.id,
        width: TAB_BUTTON_WIDTH,
        height: TAB_BUTTON_HEIGHT,
        theme,
        label: category.label,
        selected: category.id === this._category,
      })
      button.x = x
      button.y = -TABS_HEIGHT - MARGIN + (TABS_HEIGHT - TAB_BUTTON_HEIGHT) / 2
      button.onActivate = () => this.switchCategory(category.id)
      this._tabButtons.push(button)
      this._contentRoot!.addChild(button)
      x += TAB_BUTTON_WIDTH + CATEGORY_GAP
    }
  }

  private createEntryList(context: GameSceneContext): void {
    const { theme } = context

    this._entryListPanel = new GamePanel({
      width: ENTRY_LIST_WIDTH,
      height: CONTENT_HEIGHT,
      theme,
      color: theme.colors.panel,
      borderColor: theme.colors.panelBorder,
      radius: theme.radius.large,
      alpha: 0.82,
    })
    this._contentRoot!.addChild(this._entryListPanel)

    this._entryListScroll = new GameScrollView(
      theme,
      ENTRY_LIST_WIDTH - theme.spacing.s16 * 2,
      CONTENT_HEIGHT - theme.spacing.s16 * 2,
    )
    this._entryListScroll.x = theme.spacing.s16
    this._entryListScroll.y = theme.spacing.s16
    this._entryListPanel.addChild(this._entryListScroll)
  }

  private createArticle(context: GameSceneContext): void {
    const { theme } = context

    this._articlePanel = new GamePanel({
      width: RIGHT_WIDTH,
      height: CONTENT_HEIGHT,
      theme,
      color: theme.colors.panel,
      borderColor: theme.colors.panelBorder,
      radius: theme.radius.large,
      alpha: 0.82,
    })
    this._articlePanel.x = RIGHT_X - MARGIN
    this._contentRoot!.addChild(this._articlePanel)

    const scroll = new GameScrollView(
      theme,
      RIGHT_WIDTH - theme.spacing.s16 * 2,
      CONTENT_HEIGHT - theme.spacing.s16 * 2,
    )
    scroll.x = theme.spacing.s16
    scroll.y = theme.spacing.s16
    this._articlePanel.addChild(scroll)
    this._articleScroll = scroll
  }

  private switchCategory(
    category: WorldEncyclopediaCategoryViewModel['id'],
  ): void {
    if (category === this._category) return
    this._category = category
    this._entryId = ''

    const viewModel = buildWorldEncyclopediaViewModel(
      category,
      this._entryId,
      this._input?.returnTarget ?? { sceneId: 'tavern' },
    )
    this._viewModel = viewModel
    this._entryId = viewModel.article.id
    this.applyViewModel(viewModel, true)
  }

  private selectEntry(entryId: string): void {
    if (entryId === this._entryId) return
    this._entryId = entryId

    const viewModel = buildWorldEncyclopediaViewModel(
      this._category,
      entryId,
      this._input?.returnTarget ?? { sceneId: 'tavern' },
    )
    this._viewModel = viewModel
    this.applyViewModel(viewModel)
  }

  private applyViewModel(
    viewModel: WorldEncyclopediaViewModel,
    resetListScroll = false,
  ): void {
    this.updateTabs(viewModel)
    this.updateEntryList(viewModel)
    if (resetListScroll) this._entryListScroll?.scrollToTop()
    this.updateArticle(viewModel)
  }

  private updateTabs(viewModel: WorldEncyclopediaViewModel): void {
    for (const button of this._tabButtons) {
      button.selected = button.id === viewModel.category
    }
  }

  private updateEntryList(viewModel: WorldEncyclopediaViewModel): void {
    if (!this._entryListScroll) return

    const rowHeight = 52
    const rowWidth = ENTRY_LIST_WIDTH - this._context!.theme.spacing.s16 * 2
    const gap = 8
    const content = this._entryListScroll.content

    for (let i = 0; i < viewModel.entryList.length; i++) {
      const entry = viewModel.entryList[i]
      let row = this._entryRows[i]
      if (!row) {
        row = new TavernListRow({
          width: rowWidth,
          height: rowHeight,
          theme: this._context!.theme,
          title: '',
          selected: false,
        })
        row.x = 0
        content.addChild(row)
        this._entryRows[i] = row
      }
      if (row.parent !== content) content.addChild(row)
      row.visible = true
      row.y = i * (rowHeight + gap)
      row.setTitle(entry.title)
      row.setSubtitle('')
      row.setSelected(entry.selected)
      row.setEnabled(true)
      row.onActivate = () => this.selectEntry(entry.id)
    }

    for (let i = viewModel.entryList.length; i < this._entryRows.length; i++) {
      const row = this._entryRows[i]
      if (row && row.parent === content) {
        content.removeChild(row)
      }
      if (row) {
        row.visible = false
        row.onActivate = undefined
      }
    }

    this._entryListScroll.setViewportSize(
      ENTRY_LIST_WIDTH - this._context!.theme.spacing.s16 * 2,
      CONTENT_HEIGHT - this._context!.theme.spacing.s16 * 2,
    )
  }

  private updateArticle(viewModel: WorldEncyclopediaViewModel): void {
    if (!this._articleScroll) return

    for (const label of this._articleLabels) {
      this._articleScroll.content.removeChild(label)
      label.destroy({ children: true })
    }
    this._articleLabels = []

    const contentWidth = RIGHT_WIDTH - this._context!.theme.spacing.s16 * 2
    const maxTextWidth = contentWidth - 24
    const theme = this._context!.theme

    const createArticleLabel = (
      text: string,
      kind: 'heading' | 'body',
    ): GameLabel =>
      new GameLabel(text, theme, kind, {
        maxWidth: maxTextWidth,
        breakWords: true,
      })

    const title = createArticleLabel(viewModel.article.title, 'heading')
    title.y = 0
    this._articleScroll.content.addChild(title)
    this._articleLabels.push(title)

    let currentY = title.y + title.textHeight + 8

    const shortDesc = createArticleLabel(
      viewModel.article.shortDescription,
      'body',
    )
    shortDesc.y = currentY
    shortDesc.alpha = 0.9
    this._articleScroll.content.addChild(shortDesc)
    this._articleLabels.push(shortDesc)

    currentY += shortDesc.textHeight + 20

    for (const section of viewModel.article.sections) {
      const heading = createArticleLabel(section.heading, 'heading')
      heading.y = currentY
      this._articleScroll.content.addChild(heading)
      this._articleLabels.push(heading)
      currentY += heading.textHeight + 6

      const body = createArticleLabel(section.body, 'body')
      body.y = currentY
      this._articleScroll.content.addChild(body)
      this._articleLabels.push(body)
      currentY += body.textHeight + 18
    }

    const BOTTOM_PADDING = 32
    const spacer = new Graphics()
    spacer.rect(0, currentY, 1, BOTTOM_PADDING).fill({
      color: theme.colors.textPrimary,
      alpha: 1e-4,
    })
    this._articleScroll.content.addChild(spacer)
    this._articleLabels.push(spacer)

    this._articleScroll.setViewportSize(
      RIGHT_WIDTH - theme.spacing.s16 * 2,
      CONTENT_HEIGHT - theme.spacing.s16 * 2,
    )
    this._articleScroll.scrollToTop()
  }

  private returnToTavern(): void {
    if (!this._context) return

    const target = this._input?.returnTarget ?? { sceneId: 'tavern' }
    if (target.selectedPartyId || target.selectedQuestId) {
      this._context.canvasGame.setUiState({
        selectedPartyId: target.selectedPartyId ?? null,
        selectedQuestId: target.selectedQuestId ?? null,
      })
    }

    this._context.canvasGame.sceneManager?.pop()
  }
}
