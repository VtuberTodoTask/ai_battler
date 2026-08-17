import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js'
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../../GameViewport.ts'
import { GameButton } from '../../components/GameButton.ts'
import { GameLabel } from '../../components/GameLabel.ts'
import { GamePanel } from '../../components/GamePanel.ts'
import { GameScrollView } from '../../components/GameScrollView.ts'
import { TavernListRow } from '../../components/TavernListRow.ts'
import type { TavernCampaignState } from '../../../../core/tavern/campaign/types.ts'
import type { GameScene, GameSceneContext, GameUiState } from '../../types.ts'
import type { GameUiTheme } from '../../theme/gameTheme.ts'
import { AudioController } from '../../audio/AudioController.ts'
import {
  buildExpeditionReportViewModels,
  findExpeditionReportById,
} from '../../viewModel/expeditionReportViewModel.ts'
import type {
  PartyDetailSceneInput,
  PartyDetailSceneViewModel,
} from '../../viewModel/partyDetailViewModel.ts'
import { buildPartyDetailSceneViewModel } from '../../viewModel/partyDetailViewModel.ts'

const MARGIN = 16
const TOP_BAR_HEIGHT = 64
const PANEL_PADDING = 16
const PARTY_DETAIL_BG_URL = '/party-detail-bg.jpg'
const LEFT_WIDTH = 300
const MAIN_Y = TOP_BAR_HEIGHT + MARGIN
const MAIN_HEIGHT = VIRTUAL_HEIGHT - TOP_BAR_HEIGHT - MARGIN * 2
const RIGHT_X = LEFT_WIDTH + MARGIN * 2
const RIGHT_WIDTH = VIRTUAL_WIDTH - RIGHT_X - MARGIN
const TABS_HEIGHT = 44
const PORTRAIT_RATIO = 0.32
const RETURN_BUTTON_WIDTH = 160
const RETURN_BUTTON_HEIGHT = 44

type DetailTab = 'profile' | 'relationship' | 'history'

interface PortraitRect {
  x: number
  y: number
  width: number
  height: number
}

export class PartyDetailScene implements GameScene {
  readonly id = 'partyDetail'

  private _context: GameSceneContext | null = null
  private _campaign: TavernCampaignState | null = null
  private _input: PartyDetailSceneInput | null = null
  private _viewModel: PartyDetailSceneViewModel | null = null
  private _bgRoot: Container | null = null
  private _uiRoot: Container | null = null
  private _headerRoot: Container | null = null
  private _memberListRoot: Container | null = null
  private _detailRoot: Container | null = null
  private _returnButton: GameButton | null = null
  private _tabButtons: GameButton[] = []
  private _detailScroll: GameScrollView | null = null
  private _profilePortrait: Sprite | null = null
  private _portraitMask: Graphics | null = null
  private _portraitPlaceholder: GameLabel | null = null
  private _portraitArea: PortraitRect | null = null
  private _textMaxWidth = 0
  private _selectedTab: DetailTab = 'profile'
  private _bgLoadToken = 0

  mount(context: GameSceneContext, input?: unknown): void {
    this._context = context
    this._input = (input as PartyDetailSceneInput | undefined) ?? {
      partyId: '',
      returnTarget: { sceneId: 'tavern' },
    }
    this._selectedTab = 'profile'

    this._bgRoot = new Container()
    context.layers.background.addChild(this._bgRoot)

    this._uiRoot = new Container()
    context.layers.ui.addChild(this._uiRoot)

    this.drawBackground()
    this.createPanels(context)

    AudioController.playBgm('partyDetail', { loop: true })

    if (this._campaign) {
      this.applyCampaign(this._campaign)
    }
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
    this._memberListRoot = null
    this._detailRoot = null
    this._returnButton = null
    this._tabButtons = []
    this._detailScroll = null
    this._profilePortrait = null
    this._portraitMask = null
    this._portraitPlaceholder = null
    this._portraitArea = null
    this._context = null
    this._campaign = null
    this._input = null
    this._viewModel = null
    this._bgLoadToken++
  }

  setCampaign(campaign: TavernCampaignState, _uiState: GameUiState): void {
    this.applyCampaign(campaign)
  }

  setUiState(_uiState: GameUiState): void {
    // No UI state tracked locally.
  }

  update(_dt: number): void {
    // Static scene.
  }

  private drawBackground(): void {
    if (!this._bgRoot || !this._context) return
    const { theme } = this._context
    const base = new Graphics()
    base.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill({
      color: theme.colors.background,
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
    void Assets.load(PARTY_DETAIL_BG_URL)
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
        base.clear()
        this._bgRoot!.removeChild(base)
        base.destroy()
        this._bgRoot!.addChild(sprite)
      })
      .catch(() => {
        // Keep base color if loading fails.
      })
  }

  private createPanels(context: GameSceneContext): void {
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

    this._memberListRoot = new Container()
    this._memberListRoot.x = MARGIN
    this._memberListRoot.y = MAIN_Y
    this._uiRoot!.addChild(this._memberListRoot)

    const leftPanel = new GamePanel({
      width: LEFT_WIDTH,
      height: MAIN_HEIGHT,
      theme,
      title: 'MEMBERS',
      color: theme.colors.panel,
      borderColor: theme.colors.panelBorder,
      radius: theme.radius.large,
      alpha: 0.82,
    })
    this._memberListRoot.addChild(leftPanel)

    this._detailRoot = new Container()
    this._detailRoot.x = RIGHT_X
    this._detailRoot.y = MAIN_Y
    this._uiRoot!.addChild(this._detailRoot)

    const rightPanel = new GamePanel({
      width: RIGHT_WIDTH,
      height: MAIN_HEIGHT,
      theme,
      title: 'CHARACTER',
      color: theme.colors.panel,
      borderColor: theme.colors.panelBorder,
      radius: theme.radius.large,
      alpha: 0.82,
    })
    this._detailRoot.addChild(rightPanel)

    this.createReturnButton(theme)
    this.createTabs(theme)
  }

  private createReturnButton(theme: GameUiTheme): void {
    this._returnButton = new GameButton({
      width: RETURN_BUTTON_WIDTH,
      height: RETURN_BUTTON_HEIGHT,
      theme,
      label: '酒場へ戻る',
    })
    this._returnButton.x =
      VIRTUAL_WIDTH - MARGIN * 2 - RETURN_BUTTON_WIDTH - PANEL_PADDING
    this._returnButton.y = (TOP_BAR_HEIGHT - RETURN_BUTTON_HEIGHT) / 2
    this._returnButton.onActivate = () => this.returnToTavern()
    this._headerRoot!.addChild(this._returnButton)
  }

  private createTabs(theme: GameUiTheme): void {
    const contentWidth = RIGHT_WIDTH - PANEL_PADDING * 2
    const textAreaWidth = Math.floor(contentWidth * (1 - PORTRAIT_RATIO))
    const portraitAreaWidth = contentWidth - textAreaWidth
    const tabHeight = TABS_HEIGHT - 4
    const scrollTop = PANEL_PADDING + tabHeight + 8
    const scrollHeight = MAIN_HEIGHT - scrollTop - PANEL_PADDING

    this._textMaxWidth = textAreaWidth - 24

    const portraitRect: PortraitRect = {
      x: PANEL_PADDING + textAreaWidth,
      y: scrollTop,
      width: portraitAreaWidth,
      height: scrollHeight,
    }
    this._portraitArea = portraitRect

    const portraitMask = new Graphics()
    portraitMask.eventMode = 'none'
    portraitMask
      .rect(
        portraitRect.x,
        portraitRect.y,
        portraitRect.width,
        portraitRect.height,
      )
      .fill({ color: 0xffffff })
    this._detailRoot!.addChild(portraitMask)
    this._portraitMask = portraitMask

    const portrait = new Sprite(Texture.WHITE)
    portrait.anchor.set(0.5, 1)
    portrait.alpha = 1
    portrait.visible = false
    portrait.eventMode = 'none'
    portrait.mask = portraitMask
    this._detailRoot!.addChild(portrait)
    this._profilePortrait = portrait

    const placeholder = new GameLabel('立ち絵なし', theme, 'caption', {
      maxWidth: portraitRect.width - 16,
      align: 'center',
    })
    placeholder.anchor.set(0.5)
    placeholder.x = portraitRect.x + portraitRect.width / 2
    placeholder.y = portraitRect.y + portraitRect.height / 2
    placeholder.visible = false
    placeholder.eventMode = 'none'
    this._detailRoot!.addChild(placeholder)
    this._portraitPlaceholder = placeholder

    const tabs: { id: DetailTab; label: string }[] = [
      { id: 'profile', label: 'プロフィール' },
      { id: 'relationship', label: '関係' },
      { id: 'history', label: '履歴' },
    ]
    const tabWidth = 120
    const gap = 8
    const startX = PANEL_PADDING
    const startY = PANEL_PADDING

    this._tabButtons = []
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i]!
      const button = new GameButton({
        width: tabWidth,
        height: tabHeight,
        theme,
        label: tab.label,
      })
      button.x = startX + i * (tabWidth + gap)
      button.y = startY
      button.onActivate = () => this.selectTab(tab.id)
      button.on('pointerout', () => this.updateTabStyles())
      this._detailRoot!.addChild(button)
      this._tabButtons.push(button)
    }

    this._detailScroll = new GameScrollView(theme, textAreaWidth, scrollHeight)
    this._detailScroll.x = PANEL_PADDING
    this._detailScroll.y = scrollTop
    this._detailRoot!.addChild(this._detailScroll)
  }

  private applyCampaign(campaign: TavernCampaignState): void {
    this._campaign = campaign
    if (!this._input || !this._context) return
    this._viewModel = buildPartyDetailSceneViewModel(campaign, this._input)
    this.render()
    this.ensurePortraitAssets()
  }

  private ensurePortraitAssets(): void {
    if (!this._context) return
    const selected = this._viewModel?.selectedCharacter
    if (!selected) return
    void this._context.assetManager.ensureCharacterSilhouettes().then(() => {
      if (!this._context) return
      this.updatePortrait()
    })
  }

  private selectTab(tab: DetailTab): void {
    this._selectedTab = tab
    this.renderDetail()
    this.updateTabStyles()
  }

  private selectCharacter(id: string): void {
    if (!this._input || !this._campaign) return
    this._input = { ...this._input, initialCharacterId: id }
    this._viewModel = buildPartyDetailSceneViewModel(
      this._campaign,
      this._input,
    )
    this.render()
  }

  private returnToTavern(): void {
    if (!this._context || !this._input) return
    const target = this._input.returnTarget
    this._context.canvasGame.setUiState({
      selectedPartyId: target.selectedPartyId ?? this._input.partyId,
      selectedQuestId: target.selectedQuestId ?? null,
    })
    this._context.canvasGame.sceneManager?.pop()
  }

  private render(): void {
    this.renderHeader()
    this.renderMemberList()
    this.updateTabStyles()
    this.renderDetail()
    this.updatePortrait()
  }

  private renderHeader(): void {
    if (!this._headerRoot || !this._viewModel || !this._context) return
    const panel = this._headerRoot.children[0]
    for (const child of [...this._headerRoot.children]) {
      if (child !== panel && child !== this._returnButton) {
        this._headerRoot.removeChild(child)
        child.destroy({ children: true })
      }
    }
    const { theme } = this._context
    const party = this._viewModel.party

    let x = theme.spacing.s16
    const y = 16

    const nameLabel = new GameLabel(party.name, theme, 'heading', {
      maxWidth: 500,
      breakWords: true,
    })
    nameLabel.x = x
    nameLabel.y = y
    this._headerRoot.addChild(nameLabel)
    x += Math.min(nameLabel.textWidth, 500) + theme.spacing.s24

    const infoText = [
      party.rankLabel,
      party.statusLabel,
      `${party.memberCount}名`,
      party.stayLabel,
      party.currentQuestLabel,
    ]
      .filter((s) => s && s.length > 0)
      .join(' ・ ')

    const infoLabel = new GameLabel(infoText, theme, 'body', {
      maxWidth: VIRTUAL_WIDTH - 700,
      breakWords: true,
    })
    infoLabel.x = x
    infoLabel.y = y + 4
    this._headerRoot.addChild(infoLabel)
  }

  private renderMemberList(): void {
    if (!this._memberListRoot || !this._viewModel || !this._context) return
    const oldScroll = this._memberListRoot.getChildByLabel('memberScroll')
    if (oldScroll) {
      this._memberListRoot.removeChild(oldScroll)
      oldScroll.destroy({ children: true })
    }

    const { theme } = this._context
    const listScroll = new GameScrollView(
      theme,
      LEFT_WIDTH - theme.spacing.s24,
      MAIN_HEIGHT - 56,
    )
    listScroll.label = 'memberScroll'
    listScroll.x = theme.spacing.s12
    listScroll.y = 48
    this._memberListRoot.addChild(listScroll)

    const rowWidth = LEFT_WIDTH - theme.spacing.s24 - 4
    const rowHeight = 56
    const gap = 8
    let y = 0

    for (const member of this._viewModel.members) {
      const row = new TavernListRow({
        width: rowWidth,
        height: rowHeight,
        theme,
        title: member.name,
        subtitle: `${member.roleLabel} / ${member.conditionLabel}`,
        selected: member.selected,
      })
      row.y = y
      row.onActivate = () => this.selectCharacter(member.id)
      listScroll.content.addChild(row)
      y += rowHeight + gap
    }

    if (this._viewModel.members.length === 0 && this._viewModel.emptyMessage) {
      const empty = new GameLabel(this._viewModel.emptyMessage, theme, 'body', {
        maxWidth: rowWidth,
        breakWords: true,
      })
      listScroll.content.addChild(empty)
    }
  }

  private updateTabStyles(): void {
    const activeIndex =
      this._selectedTab === 'profile'
        ? 0
        : this._selectedTab === 'relationship'
          ? 1
          : 2
    for (let i = 0; i < this._tabButtons.length; i++) {
      const button = this._tabButtons[i]!
      if (i === activeIndex) {
        button.focus()
      } else {
        button.blur()
      }
    }
  }

  private renderDetail(): void {
    if (!this._detailScroll || !this._viewModel || !this._context) return
    const content = this._detailScroll.content
    for (const child of [...content.children]) {
      content.removeChild(child)
      child.destroy({ children: true })
    }

    if (!this._viewModel.selectedCharacter) {
      const empty = new GameLabel(
        this._viewModel.emptyMessage ?? 'キャラクターを選択してください',
        this._context.theme,
        'body',
        {
          maxWidth: this._detailScroll.width - this._context.theme.spacing.s16,
          breakWords: true,
        },
      )
      content.addChild(empty)
      return
    }

    switch (this._selectedTab) {
      case 'profile':
        this.renderProfile(content)
        break
      case 'relationship':
        this.renderRelationship(content)
        break
      case 'history':
        this.renderHistory(content)
        break
    }
  }

  private addLabel(
    container: Container,
    text: string,
    kind: 'heading' | 'body' | 'caption' = 'body',
    y?: number,
  ): GameLabel {
    const theme = this._context!.theme
    const label = new GameLabel(text, theme, kind, {
      maxWidth: this._textMaxWidth,
      breakWords: true,
    })
    if (y !== undefined) label.y = y
    container.addChild(label)
    return label
  }

  private updatePortrait(): void {
    if (
      !this._profilePortrait ||
      !this._portraitPlaceholder ||
      !this._context
    ) {
      return
    }
    const char = this._viewModel?.selectedCharacter
    const portrait = this._profilePortrait
    const placeholder = this._portraitPlaceholder
    const rect = this._portraitArea
    if (!char || !rect) {
      portrait.visible = false
      placeholder.visible = false
      return
    }

    const visual = this._context.assetManager.getCharacterVisual(char.speciesId)
    if (visual.status === 'ready' && visual.texture) {
      portrait.visible = true
      placeholder.visible = false
      portrait.texture = visual.texture
      const sourceWidth = visual.texture.orig.width
      const sourceHeight = visual.texture.orig.height
      const scale = Math.min(
        rect.width / Math.max(sourceWidth, 1),
        rect.height / Math.max(sourceHeight, 1),
      )
      portrait.scale.set(scale)
      portrait.anchor.set(0.5, 1)
      portrait.x = rect.x + rect.width / 2
      portrait.y = rect.y + rect.height
    } else {
      portrait.visible = false
      placeholder.visible = true
      placeholder.text =
        visual.status === 'loading' ? '読み込み中…' : '立ち絵なし'
    }
  }

  private renderProfile(content: Container): void {
    const char = this._viewModel!.selectedCharacter!

    let y = 0
    const add = (
      text: string,
      kind: 'heading' | 'body' | 'caption' = 'body',
    ): GameLabel => {
      const label = this.addLabel(content, text, kind, y)
      y += label.textHeight + 8
      return label
    }

    add(char.name, 'heading')
    add(
      `${char.speciesLabel} ・ ${char.country.name} ・ ${char.genderLabel} ・ ${char.roleLabel}`,
    )
    if (char.country.culture.length > 0) {
      add(`文化：${char.country.culture}`, 'caption')
    }
    y += 8

    add('能力値', 'heading')
    for (let i = 0; i < char.abilities.length; i += 3) {
      const row = char.abilities
        .slice(i, i + 3)
        .map((a) => `${a.name} ${a.value}`)
        .join('   ')
      add(row)
    }
    y += 8

    add('状態', 'heading')
    add(`全体：${char.condition.status}`)
    add(
      `HP ${char.condition.hp}    MP ${char.condition.mp}    士気 ${char.condition.morale}`,
    )
    if (char.condition.injuries.length > 0) {
      const injuryText = char.condition.injuries
        .map((i) => (i.cause ? `${i.type}（${i.cause}）` : i.type))
        .join(' ・ ')
      add(`負傷：${injuryText}`)
    }
    if (char.condition.recoveryDaysRemaining !== undefined) {
      add(`療養残り：${char.condition.recoveryDaysRemaining}日`)
    }
    y += 8

    add('人物傾向', 'heading')
    for (const line of char.personality.lines) {
      add(line)
    }
  }

  private renderRelationship(content: Container): void {
    const char = this._viewModel!.selectedCharacter!

    if (char.relationships.length === 0) {
      this.addLabel(content, 'まだ特筆すべき関係はありません', 'body')
      return
    }

    let y = 0
    const add = (
      text: string,
      kind: 'heading' | 'body' | 'caption' = 'body',
    ): GameLabel => {
      const label = this.addLabel(content, text, kind, y)
      y += label.textHeight + 8
      return label
    }

    for (const rel of char.relationships) {
      const headingY = y
      add(`《${rel.targetName}》`, 'heading')

      const viewButton = new GameButton({
        width: 120,
        height: 28,
        theme: this._context!.theme,
        label: 'この人物を見る',
      })
      viewButton.x = this._textMaxWidth + 8 - 120
      viewButton.y = headingY + 2
      viewButton.onActivate = () => this.selectCharacter(rel.targetId)
      content.addChild(viewButton)

      add(rel.label)
      if (rel.sharedExpeditions > 0) {
        add(`共に遠征した回数：${rel.sharedExpeditions}回`, 'caption')
      }

      if (rel.recentMemories.length > 0) {
        add('最近の関係上の出来事', 'caption')
        for (const m of rel.recentMemories) {
          const dayText = m.day !== undefined ? `DAY ${m.day}  ` : ''
          add(`${dayText}${m.summary}`)
        }
      }

      if (rel.milestones.length > 0) {
        add('関係の節目', 'caption')
        for (const m of rel.milestones.slice(0, 3)) {
          add(`DAY ${m.day}：${m.label}`)
        }
      }
      y += 8
    }
  }

  private renderHistory(content: Container): void {
    const char = this._viewModel!.selectedCharacter!

    let y = 0
    const add = (
      text: string,
      kind: 'heading' | 'body' | 'caption' = 'body',
    ): GameLabel => {
      const label = this.addLabel(content, text, kind, y)
      y += label.textHeight + 8
      return label
    }

    add('最近の出来事', 'heading')
    if (char.recentEvents.length === 0) {
      add('最近の記録はありません')
    } else {
      for (const ev of char.recentEvents) {
        const dayText = ev.day !== undefined ? `DAY ${ev.day}  ` : ''
        add(`${dayText}${ev.summary}`)
      }
    }
    y += 8

    add('遠征履歴', 'heading')
    if (char.expeditions.length === 0) {
      add('まだ遠征記録はありません')
    } else {
      for (const exp of char.expeditions) {
        const row = new Container()
        const text = new GameLabel(
          `DAY ${exp.day}  ${exp.title} ／ ${exp.outcomeLabel}`,
          this._context!.theme,
          'body',
          { maxWidth: this._textMaxWidth, breakWords: true },
        )
        text.y = 0
        row.addChild(text)

        if (exp.reportId) {
          const reportButton = new GameButton({
            width: 120,
            height: 32,
            theme: this._context!.theme,
            label: '報告を見る',
          })
          reportButton.x = this._textMaxWidth - 120
          reportButton.y = 0
          reportButton.onActivate = () => this.openReport(exp.reportId!)
          row.addChild(reportButton)
        }
        row.y = y
        content.addChild(row)
        y += Math.max(32, text.textHeight) + 12
      }
    }
  }

  private openReport(reportId: string): void {
    if (!this._context || !this._campaign) return
    const reports = buildExpeditionReportViewModels(this._campaign)
    const report = findExpeditionReportById(reports, reportId)
    if (!report) {
      this._context.overlayManager.openModal(
        '報告',
        'この報告は表示できません。',
      )
      return
    }

    const theme = this._context.theme
    const scroll = new GameScrollView(theme, 520, 180)
    let y = 0
    const add = (text: string) => {
      const label = new GameLabel(text, theme, 'body', {
        maxWidth: 520,
        breakWords: true,
      })
      label.y = y
      scroll.content.addChild(label)
      y += label.textHeight + 6
    }

    add(`結果：${report.outcomeLabel}`)
    add(`Party：${report.partyName}`)
    add(`目的：${report.objectiveSummary}`)
    add(`生還：${report.survivalText}`)

    let injuryText: string
    if (report.injuryRecordMissing) {
      injuryText = '負傷記録なし'
    } else if (report.injuries.length > 0) {
      injuryText = report.injuries
        .map((i) => `${i.name}：${i.severity}`)
        .join(' / ')
    } else {
      injuryText = '負傷なし'
    }
    add(`負傷：${injuryText}`)
    add(
      `殉職：${report.casualties.length > 0 ? report.casualties.map((c) => c.name).join(' / ') : 'なし'}`,
    )

    this._context.overlayManager.openModal(
      `遠征報告：${report.questTitle}`,
      scroll,
    )
  }
}
