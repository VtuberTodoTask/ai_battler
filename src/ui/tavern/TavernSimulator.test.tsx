// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { TavernSimulator } from './TavernSimulator.tsx'

describe('TavernSimulator UI', () => {
  it('renders the tavern board with 3 requests and 4 parties', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const partyBoard = screen.getByTestId('party-board')
    expect(
      within(requestBoard).getAllByRole('heading', { level: 4 }).length,
    ).toBe(3)
    expect(
      within(partyBoard).getAllByRole('heading', { level: 4 }).length,
    ).toBe(4)
  })

  it('selects a request and party and records an offer', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const partyBoard = screen.getByTestId('party-board')
    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })
    const partyCards = within(partyBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(requestCards[1])
    fireEvent.click(partyCards[0])

    const offerButton = screen.getByRole('button', {
      name: 'この依頼を紹介する',
    })
    fireEvent.click(offerButton)

    const panel = screen.getByTestId('brokerage-panel')
    expect(
      panel.textContent?.includes('受諾') ||
        panel.textContent?.includes('辞退'),
    ).toBe(true)
  })

  it('enables resolve only after an accepted match', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const partyBoard = screen.getByTestId('party-board')

    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })
    const partyCards = within(partyBoard).getAllByRole('heading', {
      level: 4,
    })

    const resolveButton = screen.getByRole('button', {
      name: '本日の仲介を確定',
    })
    expect(resolveButton.hasAttribute('disabled')).toBe(true)

    // Try each request against each party until an acceptance occurs.
    outer: for (const requestCard of requestCards) {
      fireEvent.click(requestCard)
      for (const partyCard of partyCards) {
        fireEvent.click(partyCard)
        const offerButton = screen.queryByRole('button', {
          name: 'この依頼を紹介する',
        })
        if (offerButton) {
          fireEvent.click(offerButton)
        }
        const panel = screen.getByTestId('brokerage-panel')
        if (panel.textContent?.includes('受諾')) {
          break outer
        }
      }
    }

    expect(resolveButton.hasAttribute('disabled')).toBe(false)
  })

  it('prevents offering the same request-party pair twice', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const partyBoard = screen.getByTestId('party-board')

    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })
    const partyCards = within(partyBoard).getAllByRole('heading', {
      level: 4,
    })

    fireEvent.click(requestCards[0])
    fireEvent.click(partyCards[0])

    const offerButton = screen.getByRole('button', {
      name: 'この依頼を紹介する',
    })
    fireEvent.click(offerButton)

    // After the first offer the same party is still selected.
    expect(
      screen.queryByRole('button', { name: 'この依頼を紹介する' }),
    ).toBeNull()
  })

  it('resolves the day and shows results', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const partyBoard = screen.getByTestId('party-board')

    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })
    const partyCards = within(partyBoard).getAllByRole('heading', {
      level: 4,
    })

    // Find any accepting pair.
    outer: for (const requestCard of requestCards) {
      fireEvent.click(requestCard)
      for (const partyCard of partyCards) {
        fireEvent.click(partyCard)
        const offerButton = screen.queryByRole('button', {
          name: 'この依頼を紹介する',
        })
        if (offerButton) {
          fireEvent.click(offerButton)
        }
        const panel = screen.getByTestId('brokerage-panel')
        if (panel.textContent?.includes('受諾')) {
          break outer
        }
      }
    }

    const resolveButton = screen.getByRole('button', {
      name: '本日の仲介を確定',
    })
    fireEvent.click(resolveButton)

    expect(screen.getByText('本日の仲介結果')).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 4 }).length).toBeGreaterThan(
      0,
    )
  })

  it('displays final HP from ExpeditionState in result detail', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const partyBoard = screen.getByTestId('party-board')

    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })
    const partyCards = within(partyBoard).getAllByRole('heading', {
      level: 4,
    })

    outer: for (const requestCard of requestCards) {
      fireEvent.click(requestCard)
      for (const partyCard of partyCards) {
        fireEvent.click(partyCard)
        const offerButton = screen.queryByRole('button', {
          name: 'この依頼を紹介する',
        })
        if (offerButton) {
          fireEvent.click(offerButton)
        }
        const panel = screen.getByTestId('brokerage-panel')
        if (panel.textContent?.includes('受諾')) {
          break outer
        }
      }
    }

    fireEvent.click(screen.getByRole('button', { name: '本日の仲介を確定' }))

    // The result board shows cards with h4 headings; click the first resolved one.
    const results = screen.getByText('本日の仲介結果').parentElement!
    const resultCards = within(results).getAllByRole('heading', { level: 4 })
    fireEvent.click(resultCards[0])

    expect(screen.getAllByText(/HP \d+\/\d+/).length).toBeGreaterThan(0)
    expect(screen.getByText('受諾パーティ')).toBeTruthy()
  })

  it('prevents offering after the day is resolved', () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const partyBoard = screen.getByTestId('party-board')

    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })
    const partyCards = within(partyBoard).getAllByRole('heading', {
      level: 4,
    })

    outer: for (const requestCard of requestCards) {
      fireEvent.click(requestCard)
      for (const partyCard of partyCards) {
        fireEvent.click(partyCard)
        const offerButton = screen.queryByRole('button', {
          name: 'この依頼を紹介する',
        })
        if (offerButton) {
          fireEvent.click(offerButton)
        }
        const panel = screen.getByTestId('brokerage-panel')
        if (panel.textContent?.includes('受諾')) {
          break outer
        }
      }
    }

    fireEvent.click(screen.getByRole('button', { name: '本日の仲介を確定' }))

    expect(screen.getByText('本日の仲介結果')).toBeTruthy()

    fireEvent.click(partyCards[1])
    expect(
      screen.queryByRole('button', { name: 'この依頼を紹介する' }),
    ).toBeNull()
  })
})
