import { Container } from 'pixi.js'
import { GamePanel } from '../../components/GamePanel.ts'
import { GameScrollView } from '../../components/GameScrollView.ts'
import { TavernListRow } from '../../components/TavernListRow.ts'
import type { GameUiTheme } from '../../theme/gameTheme.ts'
import type { TavernPartyListItemViewModel } from '../../viewModel/tavernScreenViewModel.ts'

export interface PartyListPanelOptions {
  theme: GameUiTheme
  width: number
  height: number
  onSelectParty: (partyId: string) => void
}

export class PartyListPanel extends Container {
  private readonly _theme: GameUiTheme
  private readonly _width: number
  private readonly _height: number
  private readonly _onSelectParty: (partyId: string) => void
  private readonly _scroll: GameScrollView
  private _rows: TavernListRow[] = []

  constructor(options: PartyListPanelOptions) {
    super()

    this._theme = options.theme
    this._width = options.width
    this._height = options.height
    this._onSelectParty = options.onSelectParty

    const panel = new GamePanel({
      width: this._width,
      height: this._height,
      theme: this._theme,
      title: 'PARTIES',
      color: this._theme.colors.panel,
      borderColor: this._theme.colors.panelBorder,
      radius: this._theme.radius.large,
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

  update(parties: TavernPartyListItemViewModel[]): void {
    const content = this._scroll.content
    for (const row of this._rows) {
      content.removeChild(row)
      row.destroy({ children: true })
    }
    this._rows = []

    const rowWidth = this._width - this._theme.spacing.s24 - 4
    const rowHeight = 56
    const gap = 8
    let y = 0

    if (parties.length === 0) {
      const empty = new TavernListRow({
        width: rowWidth,
        height: rowHeight,
        theme: this._theme,
        title: '現在滞在しているパーティはいません',
        disabled: true,
      })
      empty.y = y
      this._scroll.content.addChild(empty)
      this._rows.push(empty)
      return
    }

    for (const party of parties) {
      const subtitle = `${party.statusLabel} · ${party.memberCount}人`
      const row = new TavernListRow({
        width: rowWidth,
        height: rowHeight,
        theme: this._theme,
        title: party.name,
        subtitle,
        selected: party.selected,
        disabled: false,
        unread: party.unreadEventCount > 0,
      })
      row.y = y
      row.onActivate = () => this._onSelectParty(party.id)
      this._scroll.content.addChild(row)
      this._rows.push(row)
      y += rowHeight + gap
    }
  }
}
