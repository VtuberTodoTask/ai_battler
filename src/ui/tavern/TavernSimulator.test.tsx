// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { TavernSimulator } from './TavernSimulator.tsx'

function findAcceptingPair() {
  const requestBoard = screen.getByTestId('request-board')
  const partyBoard = screen.getByTestId('party-board')
  const requestCards = within(requestBoard).getAllByRole('heading', {
    level: 4,
  })
  const partyCards = within(partyBoard).getAllByRole('heading', { level: 4 })

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
}

describe('TavernSimulator UI', () => {
  it('renders the campaign header and board with 3 requests and 4 parties', () => {
    render(<TavernSimulator />)
    expect(screen.getByTestId('campaign-header')).toBeTruthy()
    expect(screen.getByTestId('reputation-bar')).toBeTruthy()
    expect(
      within(screen.getByTestId('request-board')).getAllByRole('heading', {
        level: 4,
      }).length,
    ).toBe(3)
    expect(
      within(screen.getByTestId('party-board')).getAllByRole('heading', {
        level: 4,
      }).length,
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

  it('allows resolving the day even with no accepted match', () => {
    render(<TavernSimulator />)
    const resolveButton = screen.getByRole('button', {
      name: '本日の仲介を確定',
    })
    expect(resolveButton.hasAttribute('disabled')).toBe(false)
    fireEvent.click(resolveButton)
    expect(screen.getByTestId('campaign-result-summary')).toBeTruthy()
    expect(screen.getByText('本日の仲介結果')).toBeTruthy()
  })

  it('resolves the day and shows results after an accepted match', () => {
    render(<TavernSimulator />)
    findAcceptingPair()
    fireEvent.click(screen.getByRole('button', { name: '本日の仲介を確定' }))
    expect(screen.getByTestId('campaign-result-summary')).toBeTruthy()
    expect(screen.getByText('本日の仲介結果')).toBeTruthy()
  })

  it('advances to the next day and persists parties', () => {
    render(<TavernSimulator />)
    findAcceptingPair()
    fireEvent.click(screen.getByRole('button', { name: '本日の仲介を確定' }))

    const partyBoard = screen.getByTestId('party-board')
    const partyCardsBefore = within(partyBoard).getAllByRole('heading', {
      level: 4,
    })
    const firstPartyNameBefore = partyCardsBefore[0].textContent?.replace(
      /(新規|再訪)\s+/,
      '',
    )

    fireEvent.click(screen.getByRole('button', { name: '翌日へ' }))

    expect(screen.getByText(/Day 2/)).toBeTruthy()
    const partyCardsAfter = within(
      screen.getByTestId('party-board'),
    ).getAllByRole('heading', { level: 4 })
    expect(partyCardsAfter.length).toBe(4)
    expect(
      partyCardsAfter.some(
        (c) =>
          c.textContent?.replace(/(新規|再訪)\s+/, '') === firstPartyNameBefore,
      ),
    ).toBe(true)
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

    expect(
      screen.queryByRole('button', { name: 'この依頼を紹介する' }),
    ).toBeNull()
  })

  it('displays final HP/MP/Morale from ExpeditionState in result detail', () => {
    render(<TavernSimulator />)
    findAcceptingPair()
    fireEvent.click(screen.getByRole('button', { name: '本日の仲介を確定' }))

    const results = screen.getByText('本日の仲介結果').parentElement!
    const resultCards = within(results).getAllByRole('heading', { level: 4 })
    fireEvent.click(resultCards[0])

    expect(screen.getAllByText(/HP \d+\/\d+/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/MP \d+\/\d+/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Morale \d+/).length).toBeGreaterThan(0)
    expect(screen.getByText('受諾パーティ')).toBeTruthy()
  })

  it('does not hide result detail when a request card is clicked after resolve', () => {
    render(<TavernSimulator />)
    findAcceptingPair()
    fireEvent.click(screen.getByRole('button', { name: '本日の仲介を確定' }))

    const results = screen.getByText('本日の仲介結果').parentElement!
    const resultCards = within(results).getAllByRole('heading', { level: 4 })
    fireEvent.click(resultCards[0])

    expect(screen.getByText('受諾パーティ')).toBeTruthy()

    const requestBoard = screen.getByTestId('request-board')
    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })
    fireEvent.click(requestCards[0])

    expect(screen.getByText('受諾パーティ')).toBeTruthy()
  })

  it('starts a new campaign from the seed input', () => {
    render(<TavernSimulator />)
    const input = screen.getByDisplayValue('tavern-campaign-001')
    fireEvent.change(input, { target: { value: 'tavern-campaign-test-007' } })
    fireEvent.click(screen.getByRole('button', { name: '新しいキャンペーン' }))
    expect(screen.getByTestId('campaign-header').textContent).toContain(
      'tavern-campaign-test-007',
    )
  })

  it('shows campaign history after resolving a day', () => {
    render(<TavernSimulator />)
    fireEvent.click(screen.getByRole('button', { name: '本日の仲介を確定' }))
    expect(screen.getByTestId('campaign-history')).toBeTruthy()
  })

  it('shows the prediction panel after selecting a request and party', async () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const partyBoard = screen.getByTestId('party-board')
    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })
    const partyCards = within(partyBoard).getAllByRole('heading', { level: 4 })

    fireEvent.click(requestCards[0])
    expect(
      screen.getByText('パーティを選択すると遠征見込みを確認できます'),
    ).toBeTruthy()

    fireEvent.click(partyCards[0])
    await waitFor(() => {
      expect(screen.getByTestId('prediction-rate')).toBeTruthy()
    })
    expect(screen.getByTestId('prediction-danger')).toBeTruthy()
  })

  it('does not keep stale prediction when the selection changes', async () => {
    render(<TavernSimulator />)
    const requestBoard = screen.getByTestId('request-board')
    const partyBoard = screen.getByTestId('party-board')
    const requestCards = within(requestBoard).getAllByRole('heading', {
      level: 4,
    })
    const partyCards = within(partyBoard).getAllByRole('heading', { level: 4 })

    fireEvent.click(requestCards[0])
    fireEvent.click(partyCards[0])
    await waitFor(() => {
      expect(screen.getByTestId('prediction-rate')).toBeTruthy()
    })
    const firstRate = screen.getByTestId('prediction-rate').textContent

    fireEvent.click(requestCards[1])
    expect(
      screen.getByText('パーティを選択すると遠征見込みを確認できます'),
    ).toBeTruthy()

    fireEvent.click(partyCards[1])
    await waitFor(() => {
      expect(screen.getByTestId('prediction-rate').textContent).not.toBe(
        firstRate,
      )
    })
  })

  it('hides the prediction panel after resolving the day', async () => {
    render(<TavernSimulator />)
    findAcceptingPair()
    await waitFor(() => {
      expect(screen.getByTestId('prediction-rate')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: '本日の仲介を確定' }))
    expect(screen.queryByTestId('prediction-panel')).toBeNull()
  })
})
