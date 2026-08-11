import type { GameTypography } from './typography.ts'

export interface GameUiTheme {
  colors: {
    background: number
    panel: number
    panelHover: number
    panelPressed: number
    panelBorder: number
    panelTitle: number
    textPrimary: number
    textMuted: number
    textDisabled: number
    textInverse: number
    accent: number
    accentHover: number
    accentPressed: number
    danger: number
    dangerHover: number
    wood: number
    parchment: number
    brass: number
    overlay: number
    dim: number
  }
  typography: GameTypography
  spacing: {
    s4: number
    s8: number
    s12: number
    s16: number
    s24: number
    s32: number
    s48: number
  }
  radius: {
    small: number
    medium: number
    large: number
  }
}

export const DEFAULT_GAME_THEME: GameUiTheme = {
  colors: {
    background: 0x1a120b,
    panel: 0x3f2c20,
    panelHover: 0x4f3a2c,
    panelPressed: 0x2f2118,
    panelBorder: 0x8a6b4b,
    panelTitle: 0x5c4033,
    textPrimary: 0xf0e6d2,
    textMuted: 0xb0a08c,
    textDisabled: 0x756b5e,
    textInverse: 0x1a120b,
    accent: 0xd4af37,
    accentHover: 0xe6c458,
    accentPressed: 0xb8962e,
    danger: 0x8b3a3a,
    dangerHover: 0xa85252,
    wood: 0x5c4033,
    parchment: 0xf0e6d2,
    brass: 0xd4af37,
    overlay: 0x000000,
    dim: 0x000000,
  },
  typography: {
    body: '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif',
    heading:
      '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif',
    numeric: '"Roboto Mono", "SF Mono", monospace',
  },
  spacing: {
    s4: 4,
    s8: 8,
    s12: 12,
    s16: 16,
    s24: 24,
    s32: 32,
    s48: 48,
  },
  radius: {
    small: 4,
    medium: 8,
    large: 12,
  },
}
