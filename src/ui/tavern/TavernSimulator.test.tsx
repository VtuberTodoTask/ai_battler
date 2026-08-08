// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { TavernSimulator } from './TavernSimulator.tsx'

describe('TavernSimulator UI', () => {
  it('renders the tavern board with 3 requests and 8 adventurers', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const adventurerBoard = screen.getByTestId('adventurer-board')
    expect(
      within(requestBoard).getAllByRole('heading', { level: 4 }).length,
    ).toBe(3)
    expect(
      within(adventurerBoard).getAllByRole('heading', { level: 4 }).length,
    ).toBe(8)
  })

  it('selects a request and assigns adventurers', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(requestCards[0])

    const adventurerBoard = screen.getByTestId('adventurer-board')
    const adventurerCards = within(adventurerBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(adventurerCards[0])
    fireEvent.click(adventurerCards[1])

    const panel = screen.getByTestId('dispatch-panel')
    expect(panel.textContent).toMatch(/編成:\s*2\s*\/\s*4/)
  })

  it('prevents assigning the same adventurer to two requests', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(requestCards[0])

    const adventurerBoard = screen.getByTestId('adventurer-board')
    const adventurerCards = within(adventurerBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(adventurerCards[0])

    fireEvent.click(requestCards[1])
    fireEvent.click(adventurerCards[0])

    fireEvent.click(requestCards[0])
    const panel = screen.getByTestId('dispatch-panel')
    expect(panel.textContent).toMatch(/編成:\s*1\s*\/\s*4/)
  })

  it('shows resolve button enabled only with a full 4-person party', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(requestCards[0])

    const adventurerBoard = screen.getByTestId('adventurer-board')
    const adventurerCards = within(adventurerBoard).getAllByRole('heading', {
      level: 4,
    })

    const resolveButton = screen.getByRole('button', {
      name: '本日の派遣を実行',
    })
    expect(resolveButton.hasAttribute('disabled')).toBe(true)

    fireEvent.click(adventurerCards[0])
    fireEvent.click(adventurerCards[1])
    fireEvent.click(adventurerCards[2])
    expect(resolveButton.hasAttribute('disabled')).toBe(true)

    fireEvent.click(adventurerCards[3])
    expect(resolveButton.hasAttribute('disabled')).toBe(false)
  })

  it('warns and disables resolve with a 3-person party', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(requestCards[0])

    const adventurerBoard = screen.getByTestId('adventurer-board')
    const adventurerCards = within(adventurerBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(adventurerCards[0])
    fireEvent.click(adventurerCards[1])
    fireEvent.click(adventurerCards[2])

    const resolveButton = screen.getByRole('button', {
      name: '本日の派遣を実行',
    })
    expect(resolveButton.hasAttribute('disabled')).toBe(true)
    expect(screen.getByTestId('dispatch-panel').textContent).toContain(
      '派遣には4人必要',
    )
  })

  it('can staff two requests with 4 adventurers each and leaves the third impossible', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })

    const adventurerBoard = screen.getByTestId('adventurer-board')
    const adventurerCards = within(adventurerBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(requestCards[0])
    for (let i = 0; i < 4; i++) {
      fireEvent.click(adventurerCards[i])
    }

    fireEvent.click(requestCards[1])
    for (let i = 4; i < 8; i++) {
      fireEvent.click(adventurerCards[i])
    }

    fireEvent.click(requestCards[2])
    for (let i = 0; i < 8; i++) {
      fireEvent.click(adventurerCards[i])
    }

    const panel = screen.getByTestId('dispatch-panel')
    expect(panel.textContent).toMatch(/編成:\s*0\s*\/\s*4/)
  })

  it('resolves the day and shows results', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(requestCards[0])

    const adventurerBoard = screen.getByTestId('adventurer-board')
    const adventurerCards = within(adventurerBoard).getAllByRole('heading', {
      level: 4,
    })

    for (let i = 0; i < 4; i++) {
      fireEvent.click(adventurerCards[i])
    }

    fireEvent.click(screen.getByRole('button', { name: '本日の派遣を実行' }))

    expect(screen.getByText('本日の派遣結果')).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 4 }).length).toBeGreaterThan(
      0,
    )
  })

  it('displays final HP from ExpeditionState in result detail', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(requestCards[0])

    const adventurerBoard = screen.getByTestId('adventurer-board')
    const adventurerCards = within(adventurerBoard).getAllByRole('heading', {
      level: 4,
    })

    for (let i = 0; i < 4; i++) {
      fireEvent.click(adventurerCards[i])
    }

    fireEvent.click(screen.getByRole('button', { name: '本日の派遣を実行' }))

    expect(screen.getByText(/HP 20\/76/)).toBeTruthy()
  })

  it('shows result details with party and key facts after resolve', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(requestCards[0])

    const adventurerBoard = screen.getByTestId('adventurer-board')
    const adventurerCards = within(adventurerBoard).getAllByRole('heading', {
      level: 4,
    })

    for (let i = 0; i < 4; i++) {
      fireEvent.click(adventurerCards[i])
    }

    fireEvent.click(screen.getByRole('button', { name: '本日の派遣を実行' }))

    const results = screen.getByText('本日の派遣結果').parentElement!
    const resultCards = within(results).getAllByRole('heading', { level: 4 })
    fireEvent.click(resultCards[0])

    expect(screen.getByText('派遣メンバー')).toBeTruthy()
    expect(screen.getByText('重要facts')).toBeTruthy()
  })

  it('prevents editing assignments after resolve', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(requestCards[0])

    const adventurerBoard = screen.getByTestId('adventurer-board')
    const adventurerCards = within(adventurerBoard).getAllByRole('heading', {
      level: 4,
    })

    for (let i = 0; i < 4; i++) {
      fireEvent.click(adventurerCards[i])
    }

    fireEvent.click(screen.getByRole('button', { name: '本日の派遣を実行' }))

    expect(screen.getByText('本日の派遣結果')).toBeTruthy()

    fireEvent.click(adventurerCards[0])

    expect(screen.getByText('本日の派遣結果')).toBeTruthy()
    expect(screen.getByText(/HP 20\/76/)).toBeTruthy()
  })
})
