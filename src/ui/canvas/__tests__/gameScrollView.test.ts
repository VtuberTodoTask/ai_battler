// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Rectangle } from 'pixi.js'
import { GameScrollView } from '../components/GameScrollView.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'

describe('GameScrollView', () => {
  it('sets viewport eventMode and hitArea on construction', () => {
    const scroll = new GameScrollView(DEFAULT_GAME_THEME, 300, 200)
    const viewport = (
      scroll as unknown as {
        _viewport: { eventMode: string; hitArea: Rectangle }
      }
    )._viewport

    expect(viewport.eventMode).toBe('static')
    expect(viewport.hitArea).toBeInstanceOf(Rectangle)
    expect(viewport.hitArea.width).toBe(300)
    expect(viewport.hitArea.height).toBe(200)
  })

  it('updates hitArea and mask when setViewportSize is called', () => {
    const scroll = new GameScrollView(DEFAULT_GAME_THEME, 300, 200)
    const viewport = (
      scroll as unknown as {
        _viewport: { eventMode: string; hitArea: Rectangle }
      }
    )._viewport

    scroll.setViewportSize(500, 400)

    expect(viewport.hitArea.width).toBe(500)
    expect(viewport.hitArea.height).toBe(400)
  })
})
