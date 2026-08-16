import { Container } from 'pixi.js'
import { GamePanel } from '../../components/GamePanel.ts'
import { GameScrollView } from '../../components/GameScrollView.ts'
import { TavernListRow } from '../../components/TavernListRow.ts'
import type { GameUiTheme } from '../../theme/gameTheme.ts'
import type { TavernQuestListItemViewModel } from '../../viewModel/tavernScreenViewModel.ts'

export interface QuestListPanelOptions {
  theme: GameUiTheme
  width: number
  height: number
  onSelectQuest: (questId: string) => void
}

export class QuestListPanel extends Container {
  private readonly _theme: GameUiTheme
  private readonly _width: number
  private readonly _height: number
  private readonly _onSelectQuest: (questId: string) => void
  private readonly _scroll: GameScrollView
  private _rows: TavernListRow[] = []

  constructor(options: QuestListPanelOptions) {
    super()

    this._theme = options.theme
    this._width = options.width
    this._height = options.height
    this._onSelectQuest = options.onSelectQuest

    const panel = new GamePanel({
      width: this._width,
      height: this._height,
      theme: this._theme,
      title: 'QUESTS',
      color: this._theme.colors.panel,
      borderColor: this._theme.colors.panelBorder,
      radius: this._theme.radius.large,
      alpha: 0.82,
    })
    this.addChild(panel)

    this._scroll = new GameScrollView(
      this._theme,
      this._width - this._theme.spacing.s24,
      this._height - 56,
    )
    this._scroll.x = this._theme.spacing.s12
    this._scroll.y = 48
    this.addChild(this._scroll)
  }

  update(quests: TavernQuestListItemViewModel[]): void {
    for (const row of this._rows) {
      this._scroll.content.removeChild(row)
      row.destroy({ children: true })
    }
    this._rows = []

    const rowWidth = this._width - this._theme.spacing.s24 - 4
    const rowHeight = 64
    const gap = 8
    let y = 0

    if (quests.length === 0) {
      const empty = new TavernListRow({
        width: rowWidth,
        height: rowHeight,
        theme: this._theme,
        title: '本日紹介できる依頼はありません',
        disabled: true,
      })
      empty.y = y
      this._scroll.content.addChild(empty)
      this._rows.push(empty)
      return
    }

    for (const quest of quests) {
      const subtitle = `${quest.objectiveLabel} / ${quest.terrainLabel} / ${quest.statusLabel}`
      const row = new TavernListRow({
        width: rowWidth,
        height: rowHeight,
        theme: this._theme,
        title: quest.title,
        subtitle,
        trailing: quest.rank,
        selected: quest.selected,
        disabled: false,
      })
      row.y = y
      row.onActivate = () => this._onSelectQuest(quest.id)
      this._scroll.content.addChild(row)
      this._rows.push(row)
      y += rowHeight + gap
    }
  }
}
