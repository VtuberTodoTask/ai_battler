import type { TextStyleOptions } from 'pixi.js'
import type { GameUiTheme } from './gameTheme.ts'

export type TypographyKind =
  | 'heading'
  | 'body'
  | 'narration'
  | 'caption'
  | 'button'
  | 'numeric'
  | 'display'

const FALLBACK_FAMILIES =
  '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif'

export function makeTextStyle(
  theme: GameUiTheme,
  kind: TypographyKind,
  options?: Partial<TextStyleOptions>,
): TextStyleOptions {
  const base: Record<TypographyKind, TextStyleOptions> = {
    heading: {
      fontFamily: FALLBACK_FAMILIES,
      fontSize: 28,
      fill: theme.colors.textPrimary,
      fontWeight: 'bold',
      lineHeight: 38,
    },
    body: {
      fontFamily: FALLBACK_FAMILIES,
      fontSize: 18,
      fill: theme.colors.textPrimary,
      lineHeight: 28,
    },
    narration: {
      fontFamily: FALLBACK_FAMILIES,
      fontSize: 22,
      fill: theme.colors.textPrimary,
      lineHeight: 34,
    },
    caption: {
      fontFamily: FALLBACK_FAMILIES,
      fontSize: 14,
      fill: theme.colors.textMuted,
      lineHeight: 22,
    },
    button: {
      fontFamily: FALLBACK_FAMILIES,
      fontSize: 16,
      fill: theme.colors.textPrimary,
      lineHeight: 24,
    },
    numeric: {
      fontFamily: '"Roboto Mono", "SF Mono", monospace',
      fontSize: 18,
      fill: theme.colors.textPrimary,
      lineHeight: 26,
    },
    display: {
      fontFamily: FALLBACK_FAMILIES,
      fontSize: 42,
      fill: theme.colors.textPrimary,
      fontWeight: 'bold',
      lineHeight: 50,
    },
  }

  return { ...base[kind], ...options }
}

export interface GameTypography {
  body: string
  heading: string
  numeric: string
}
