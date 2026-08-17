// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import { CharacterAbilityRadar } from '../components/CharacterAbilityRadar.ts'
import { setupCanvasMock } from './partyDetailTestUtils.ts'

beforeEach(() => {
  setupCanvasMock()
})

function makeStats(): { name: string; value: number }[] {
  return [
    { name: 'STR', value: 60 },
    { name: 'CON', value: 50 },
    { name: 'DEX', value: 70 },
    { name: 'INT', value: 40 },
    { name: 'PER', value: 55 },
    { name: 'WIL', value: 65 },
    { name: 'SOC', value: 30 },
  ]
}

describe('CharacterAbilityRadar geometry', () => {
  it('creates 7 axes', () => {
    const radar = new CharacterAbilityRadar({
      width: 300,
      height: 260,
      theme: DEFAULT_GAME_THEME,
      stats: makeStats(),
      min: 20,
      max: 100,
    })
    expect(radar.getAxisCount()).toBe(7)
  })

  it('produces a value polygon with 7 finite points', () => {
    const radar = new CharacterAbilityRadar({
      width: 300,
      height: 260,
      theme: DEFAULT_GAME_THEME,
      stats: makeStats(),
      min: 20,
      max: 100,
    })
    const points = radar.getValuePolygonPoints()
    expect(points).toHaveLength(7)
    for (const point of points) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
      expect(Number.isNaN(point.x)).toBe(false)
      expect(Number.isNaN(point.y)).toBe(false)
    }
  })

  it('produces identical geometry for identical input', () => {
    const stats = makeStats()
    const radar1 = new CharacterAbilityRadar({
      width: 300,
      height: 260,
      theme: DEFAULT_GAME_THEME,
      stats,
      min: 20,
      max: 100,
    })
    const radar2 = new CharacterAbilityRadar({
      width: 300,
      height: 260,
      theme: DEFAULT_GAME_THEME,
      stats,
      min: 20,
      max: 100,
    })
    const points1 = radar1.getValuePolygonPoints()
    const points2 = radar2.getValuePolygonPoints()
    expect(points1).toHaveLength(points2.length)
    for (let i = 0; i < points1.length; i++) {
      expect(points1[i]!.x).toBeCloseTo(points2[i]!.x, 5)
      expect(points1[i]!.y).toBeCloseTo(points2[i]!.y, 5)
    }
  })

  it('handles invalid values without producing NaN coordinates', () => {
    const radar = new CharacterAbilityRadar({
      width: 300,
      height: 260,
      theme: DEFAULT_GAME_THEME,
      stats: [
        { name: 'STR', value: Number.NaN },
        { name: 'CON', value: 50 },
        { name: 'DEX', value: Number.POSITIVE_INFINITY },
        { name: 'INT', value: 40 },
        { name: 'PER', value: 55 },
        { name: 'WIL', value: 65 },
        { name: 'SOC', value: 30 },
      ],
      min: 20,
      max: 100,
    })
    const points = radar.getValuePolygonPoints()
    expect(points).toHaveLength(7)
    for (const point of points) {
      expect(Number.isFinite(point.x)).toBe(true)
      expect(Number.isFinite(point.y)).toBe(true)
    }
  })
})
