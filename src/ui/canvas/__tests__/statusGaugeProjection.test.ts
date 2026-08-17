import { describe, expect, it } from 'vitest'
import { projectStatusGauge } from '../utils/statusGaugeProjection.ts'

describe('projectStatusGauge', () => {
  it('projects 0 / 100 to 0', () => {
    const result = projectStatusGauge(0, 100)
    expect(result.ratio).toBe(0)
    expect(result.display).toBe('0 / 100')
    expect(result.percent).toBe('0%')
  })

  it('projects 50 / 100 to 0.5', () => {
    const result = projectStatusGauge(50, 100)
    expect(result.ratio).toBe(0.5)
    expect(result.display).toBe('50 / 100')
    expect(result.percent).toBe('50%')
  })

  it('projects 100 / 100 to 1', () => {
    const result = projectStatusGauge(100, 100)
    expect(result.ratio).toBe(1)
    expect(result.display).toBe('100 / 100')
    expect(result.percent).toBe('100%')
  })

  it('clamps 120 / 100 to 1', () => {
    const result = projectStatusGauge(120, 100)
    expect(result.ratio).toBe(1)
    expect(result.display).toBe('120 / 100')
  })

  it('clamps -10 / 100 to 0', () => {
    const result = projectStatusGauge(-10, 100)
    expect(result.ratio).toBe(0)
    expect(result.display).toBe('-10 / 100')
  })

  it('returns safe invalid state when max is 0', () => {
    const result = projectStatusGauge(50, 0)
    expect(result.ratio).toBe(0)
    expect(result.percent).toBe('—')
  })

  it('handles NaN inputs safely', () => {
    const result = projectStatusGauge(Number.NaN, Number.NaN)
    expect(result.ratio).toBe(0)
    expect(result.display).toBe('—')
    expect(result.percent).toBe('—')
  })
})
