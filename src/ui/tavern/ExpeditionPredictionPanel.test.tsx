// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { generateTavernDay } from '../../core/tavern/dayGenerator.ts'
import { ExpeditionPredictionPanel } from './ExpeditionPredictionPanel.tsx'

function makeFixture(seed = 'prediction-panel-day-001') {
  const day = generateTavernDay(seed)
  return {
    requestOffer: day.requests[0],
    party: day.parties[0],
  }
}

describe('ExpeditionPredictionPanel', () => {
  it('shows a hint when only a request is selected', () => {
    const { requestOffer } = makeFixture()
    render(
      <ExpeditionPredictionPanel
        requestOffer={requestOffer}
        tavernParty={null}
        sampleCount={20}
      />,
    )
    expect(
      screen.getByText('パーティを選択すると遠征見込みを確認できます'),
    ).toBeTruthy()
  })

  it('shows a hint when no request is selected', () => {
    render(<ExpeditionPredictionPanel requestOffer={null} tavernParty={null} />)
    expect(
      screen.getByText('依頼を選択すると遠征予測が表示されます'),
    ).toBeTruthy()
  })

  it('shows the estimated success rate and danger label after selecting a party', async () => {
    const { requestOffer, party } = makeFixture()
    render(
      <ExpeditionPredictionPanel
        requestOffer={requestOffer}
        tavernParty={party}
        sampleCount={20}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('prediction-rate')).toBeTruthy()
    })

    const rateEl = screen.getByTestId('prediction-rate')
    expect(rateEl.textContent).toMatch(/^\d+%$/)

    expect(screen.getByTestId('prediction-danger')).toBeTruthy()
  })

  it('displays the sample count and disclaimer', async () => {
    const { requestOffer, party } = makeFixture()
    render(
      <ExpeditionPredictionPanel
        requestOffer={requestOffer}
        tavernParty={party}
        sampleCount={20}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/20回の仮想遠征による推定/)).toBeTruthy()
    })

    expect(
      screen.getByText(/実際の遠征結果を保証するものではありません/),
    ).toBeTruthy()
  })

  it('expands the outcome breakdown', async () => {
    const { requestOffer, party } = makeFixture()
    render(
      <ExpeditionPredictionPanel
        requestOffer={requestOffer}
        tavernParty={party}
        sampleCount={20}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('内訳を見る')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('内訳を見る'))

    for (const label of [
      '完全成功',
      '成功',
      '部分成功',
      '依頼失敗',
      '撤退',
      '遠征隊壊滅',
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('does not predict for a recovering party', () => {
    const { requestOffer, party } = makeFixture()
    const recoveringParty = { ...party, availability: 'recovering' as const }
    render(
      <ExpeditionPredictionPanel
        requestOffer={requestOffer}
        tavernParty={recoveringParty}
        sampleCount={20}
      />,
    )
    expect(screen.getByText('療養中のため遠征予測できません')).toBeTruthy()
  })

  it('does not keep stale prediction when the pair changes', async () => {
    const { requestOffer, party } = makeFixture()
    const { requestOffer: otherRequest, party: otherParty } = makeFixture(
      'prediction-panel-day-002',
    )

    const { rerender } = render(
      <ExpeditionPredictionPanel
        requestOffer={requestOffer}
        tavernParty={party}
        sampleCount={20}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/推定依頼達成率/)).toBeTruthy()
    })
    const firstRate = screen.getByTestId('prediction-rate').textContent

    rerender(
      <ExpeditionPredictionPanel
        requestOffer={otherRequest}
        tavernParty={otherParty}
        sampleCount={20}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('prediction-rate').textContent).not.toBe(
        firstRate,
      )
    })
  })
})
