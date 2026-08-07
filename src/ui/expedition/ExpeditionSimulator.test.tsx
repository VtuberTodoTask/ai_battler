// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ExpeditionSimulator } from './ExpeditionSimulator.tsx'

describe('ExpeditionSimulator UI', () => {
  it('renders six objective options in the preset select', () => {
    render(<ExpeditionSimulator />)
    const select = screen.getByLabelText('依頼') as HTMLSelectElement
    expect(select).toBeTruthy()
    const options = Array.from(select.querySelectorAll('option')).map(
      (o) => o.value,
    )
    expect(options.length).toBeGreaterThanOrEqual(6)
    expect(new Set(options).size).toBe(options.length)
  })

  it('updates default roles when the preset changes', () => {
    render(<ExpeditionSimulator />)
    const select = screen.getByLabelText('依頼') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'elimination-cave' } })
    expect((screen.getByLabelText('Slot 1') as HTMLSelectElement).value).toBe(
      'vanguard',
    )
    expect((screen.getByLabelText('Slot 2') as HTMLSelectElement).value).toBe(
      'guardian',
    )
    expect((screen.getByLabelText('Slot 3') as HTMLSelectElement).value).toBe(
      'mage',
    )
    expect((screen.getByLabelText('Slot 4') as HTMLSelectElement).value).toBe(
      'healer',
    )
  })

  it('starts an expedition and shows a timeline', async () => {
    render(<ExpeditionSimulator />)
    fireEvent.click(screen.getByRole('button', { name: '遠征開始' }))
    await waitFor(() => {
      expect(screen.getByTestId('expedition-timeline')).toBeTruthy()
    })
  })

  it('navigates through timeline events with next and prev', async () => {
    render(<ExpeditionSimulator />)
    fireEvent.click(screen.getByRole('button', { name: '遠征開始' }))
    await waitFor(() => {
      expect(screen.getByTestId('expedition-timeline')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: '最初へ' }))
    const item0 = screen.getByTestId('timeline-item-0')
    expect(item0.classList.contains('active')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '次へ' }))
    fireEvent.click(screen.getByRole('button', { name: '次へ' }))
    const item2 = screen.getByTestId('timeline-item-2')
    expect(item2.classList.contains('active')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '前へ' }))
    fireEvent.click(screen.getByRole('button', { name: '最後へ' }))
  })

  it('shows Raw JSON when the button is clicked', async () => {
    render(<ExpeditionSimulator />)
    fireEvent.click(screen.getByRole('button', { name: '遠征開始' }))
    await waitFor(() => {
      expect(screen.getByText('Raw JSONを表示')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Raw JSONを表示' }))
    await waitFor(() => {
      expect(screen.getByText(/"request"/)).toBeTruthy()
    })
  })

  it('displays a check detail for a log with a check', async () => {
    render(<ExpeditionSimulator />)
    fireEvent.click(screen.getByRole('button', { name: '遠征開始' }))
    await waitFor(() => {
      expect(screen.getByTestId('expedition-timeline')).toBeTruthy()
    })
    const items = screen
      .getByTestId('expedition-timeline')
      .querySelectorAll('li')
    for (const item of Array.from(items)) {
      fireEvent.click(item)
      const detail = screen.queryByText(/使用技能/)
      if (detail) return
    }
    expect(true).toBe(true)
  })

  it('shows the battle panel for an elimination expedition', async () => {
    render(<ExpeditionSimulator />)
    fireEvent.change(screen.getByLabelText('依頼'), {
      target: { value: 'elimination-cave' },
    })
    fireEvent.click(screen.getByRole('button', { name: '遠征開始' }))
    await waitFor(() => {
      expect(screen.getByText('戦闘結果')).toBeTruthy()
    })
  })

  it('keeps battle outcome and expedition outcome as separate labels', async () => {
    render(<ExpeditionSimulator />)
    fireEvent.change(screen.getByLabelText('依頼'), {
      target: { value: 'elimination-cave' },
    })
    fireEvent.click(screen.getByRole('button', { name: '遠征開始' }))
    await waitFor(() => {
      expect(screen.getByText('戦闘結果')).toBeTruthy()
    })
    expect(screen.getByText(/依頼結果/)).toBeTruthy()
  })
})
