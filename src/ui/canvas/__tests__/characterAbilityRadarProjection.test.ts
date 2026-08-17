import { describe, expect, it } from 'vitest'
import { projectAbilityToRadarRatio } from '../utils/radarProjection.ts'

describe('projectAbilityToRadarRatio', () => {
  it('maps min value to 0', () => {
    expect(projectAbilityToRadarRatio(20, 20, 100)).toBe(0)
  })

  it('maps mid value to 0.5', () => {
    expect(projectAbilityToRadarRatio(60, 20, 100)).toBe(0.5)
  })

  it('maps max value to 1', () => {
    expect(projectAbilityToRadarRatio(100, 20, 100)).toBe(1)
  })

  it('clamps values over max to 1', () => {
    expect(projectAbilityToRadarRatio(150, 20, 100)).toBe(1)
  })

  it('clamps values below min to 0', () => {
    expect(projectAbilityToRadarRatio(0, 20, 100)).toBe(0)
  })

  it('returns safe fallback for invalid values', () => {
    expect(projectAbilityToRadarRatio(Number.NaN, 20, 100)).toBe(0)
    expect(projectAbilityToRadarRatio(50, Number.NaN, 100)).toBe(0)
    expect(projectAbilityToRadarRatio(50, 20, Number.NaN)).toBe(0)
  })

  it('returns 0 when range is zero or negative', () => {
    expect(projectAbilityToRadarRatio(50, 100, 100)).toBe(0)
    expect(projectAbilityToRadarRatio(50, 100, 80)).toBe(0)
  })
})
