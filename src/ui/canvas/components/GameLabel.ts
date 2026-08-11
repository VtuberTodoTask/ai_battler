import { Container, ObservablePoint, Text } from 'pixi.js'
import type { GameUiTheme } from '../theme/gameTheme.ts'
import { makeTextStyle, type TypographyKind } from '../theme/typography.ts'

export class GameLabel extends Container {
  private readonly _text: Text

  get anchor(): ObservablePoint {
    return this._text.anchor
  }

  constructor(
    initialText: string,
    theme: GameUiTheme,
    kind: TypographyKind = 'body',
    options?: { maxWidth?: number; align?: 'left' | 'center' | 'right' },
  ) {
    super()

    const style = makeTextStyle(theme, kind, {
      wordWrap: options?.maxWidth ? true : undefined,
      wordWrapWidth: options?.maxWidth,
      align: options?.align ?? 'left',
    })

    this._text = new Text({ text: initialText, style })
    this.addChild(this._text)
  }

  set text(value: string) {
    this._text.text = value
  }

  get text(): string {
    return this._text.text as string
  }

  get textWidth(): number {
    try {
      return this._text.width
    } catch {
      return 0
    }
  }

  get textHeight(): number {
    try {
      return this._text.height
    } catch {
      return 0
    }
  }
}
