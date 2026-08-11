import { describe, expect, it } from 'vitest'
import { GameViewport, VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '../GameViewport.ts'

describe('GameViewport', () => {
  it('uses 1600x900 virtual resolution', () => {
    const viewport = new GameViewport()
    expect(viewport.virtualWidth).toBe(1600)
    expect(viewport.virtualHeight).toBe(900)
  })

  it('computes scale and offsets for a 1920x1080 viewport', () => {
    const viewport = new GameViewport()
    viewport.resize(1920, 1080)

    const metrics = viewport.metrics
    expect(metrics.scale).toBeCloseTo(1080 / VIRTUAL_HEIGHT)
    expect(metrics.availableWidth).toBe(1920)
    expect(metrics.availableHeight).toBe(1080)
    expect(metrics.offsetX).toBe((1920 - VIRTUAL_WIDTH * metrics.scale) / 2)
    expect(metrics.offsetY).toBe((1080 - VIRTUAL_HEIGHT * metrics.scale) / 2)
  })

  it('letterboxes a 1920x1200 viewport vertically', () => {
    const viewport = new GameViewport()
    viewport.resize(1920, 1200)

    const metrics = viewport.metrics
    expect(metrics.scale).toBeCloseTo(1920 / VIRTUAL_WIDTH)
    expect(metrics.offsetY).toBeGreaterThan(0)
  })

  it('pillarboxes a 2560x1080 viewport horizontally', () => {
    const viewport = new GameViewport()
    viewport.resize(2560, 1080)

    const metrics = viewport.metrics
    expect(metrics.scale).toBeCloseTo(1080 / VIRTUAL_HEIGHT)
    expect(metrics.offsetX).toBeGreaterThan(0)
  })

  it('converts screen coordinates to virtual coordinates', () => {
    const viewport = new GameViewport()
    viewport.resize(1600, 900)

    expect(viewport.toVirtualX(0)).toBe(0)
    expect(viewport.toVirtualY(0)).toBe(0)
    expect(viewport.toVirtualX(1600)).toBe(1600)
    expect(viewport.toVirtualY(900)).toBe(900)
  })

  it('round-trips virtual coordinates through screen space', () => {
    const viewport = new GameViewport()
    viewport.resize(1024, 768)

    const screenX = viewport.toScreenX(200)
    const screenY = viewport.toScreenY(300)
    expect(viewport.toVirtualX(screenX)).toBeCloseTo(200)
    expect(viewport.toVirtualY(screenY)).toBeCloseTo(300)
  })

  it('does not distort the aspect ratio', () => {
    const viewport = new GameViewport()
    viewport.resize(800, 600)

    const metrics = viewport.metrics
    const virtualAspect = VIRTUAL_WIDTH / VIRTUAL_HEIGHT
    const screenAspect =
      (metrics.availableWidth - 2 * metrics.offsetX) /
      (metrics.availableHeight - 2 * metrics.offsetY)
    expect(screenAspect).toBeCloseTo(virtualAspect)
  })
})
