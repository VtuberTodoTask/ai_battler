import {
  Container,
  ObservablePoint,
  Text,
  type TextStyleOptions,
} from 'pixi.js'
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
    options?: {
      maxWidth?: number
      align?: 'left' | 'center' | 'right'
      breakWords?: boolean
      leading?: number
    },
  ) {
    super()

    const styleOptions: Partial<TextStyleOptions> = {
      wordWrap: options?.maxWidth ? true : undefined,
      wordWrapWidth: options?.maxWidth,
      align: options?.align ?? 'left',
      breakWords: options?.breakWords,
    }
    if (typeof options?.leading === 'number') {
      styleOptions.leading = options.leading
    }

    const style = makeTextStyle(theme, kind, styleOptions)

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

  measure(): { width: number; height: number } {
    try {
      const text = this._text as {
        updateText?: (respectDirty?: boolean) => void
      }
      if (typeof text.updateText === 'function') {
        text.updateText(false)
      }
      return { width: this._text.width, height: this._text.height }
    } catch {
      return { width: 0, height: 0 }
    }
  }
}
