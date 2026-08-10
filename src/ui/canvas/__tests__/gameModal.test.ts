// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Container } from 'pixi.js'
import { GameModal } from '../components/GameModal.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'

describe('GameModal', () => {
  it('destroys previous body content when opening new content', () => {
    const modal = new GameModal(DEFAULT_GAME_THEME, () => {})
    const oldContent = new Container()

    modal.open('Old', oldContent)
    expect(
      (modal as unknown as { _bodyContainer: { children: Container[] } })
        ._bodyContainer.children,
    ).toContain(oldContent)

    modal.open('New', 'new body text')

    expect(oldContent.destroyed).toBe(true)
    expect(
      (modal as unknown as { _bodyContainer: { children: Container[] } })
        ._bodyContainer.children.length,
    ).toBe(1)
  })

  it('adds a text label when content is a string', () => {
    const modal = new GameModal(DEFAULT_GAME_THEME, () => {})

    modal.open('Title', 'body text')
    const body = (
      modal as unknown as { _bodyContainer: { children: { text: string }[] } }
    )._bodyContainer

    expect(body.children.length).toBe(1)
    expect(body.children[0]!.text).toBe('body text')
  })
})
