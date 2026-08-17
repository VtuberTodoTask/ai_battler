// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Assets, Texture } from 'pixi.js'
import { GameAssetManager } from '../GameAssetManager.ts'
import { SPECIES_IDS, type SpeciesId } from '../../../../core/identity/types.ts'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('GameAssetManager character silhouettes', () => {
  it('maps all 9 species ids', () => {
    const manager = new GameAssetManager()
    expect(SPECIES_IDS).toHaveLength(9)
    for (const speciesId of SPECIES_IDS) {
      expect(manager.getCharacterVisual(speciesId).status).toBe('missing')
    }
  })

  it('loads all species silhouettes in parallel and returns ready textures', async () => {
    const manager = new GameAssetManager()
    const loadSpy = vi
      .spyOn(Assets, 'load')
      .mockResolvedValue(
        Texture.WHITE as unknown as Awaited<ReturnType<typeof Assets.load>>,
      )

    await manager.ensureCharacterSilhouettes()

    expect(loadSpy).toHaveBeenCalledTimes(9)
    for (const speciesId of SPECIES_IDS) {
      const result = manager.getCharacterVisual(speciesId)
      expect(result.status).toBe('ready')
      expect(result.texture).toBe(Texture.WHITE)
    }
  })

  it('keeps working when individual loads fail', async () => {
    const manager = new GameAssetManager()
    let callCount = 0
    vi.spyOn(Assets, 'load').mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.reject(new Error('network error'))
      return Promise.resolve(
        Texture.WHITE as unknown as Awaited<ReturnType<typeof Assets.load>>,
      )
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await manager.ensureCharacterSilhouettes()

    const results = SPECIES_IDS.map((id) => manager.getCharacterVisual(id))
    expect(results.filter((r) => r.status === 'ready')).toHaveLength(
      SPECIES_IDS.length - 1,
    )
    expect(results.filter((r) => r.status === 'missing')).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('returns missing for unknown or absent species id', async () => {
    const manager = new GameAssetManager()
    vi.spyOn(Assets, 'load').mockResolvedValue(
      Texture.WHITE as unknown as Awaited<ReturnType<typeof Assets.load>>,
    )
    await manager.ensureCharacterSilhouettes()

    expect(manager.getCharacterVisual(undefined).status).toBe('missing')
    expect(
      manager.getCharacterVisual('unknown' as unknown as SpeciesId).status,
    ).toBe('missing')
  })

  it('does not block repeated ensure calls with multiple parallel loads', async () => {
    const manager = new GameAssetManager()
    const loadSpy = vi
      .spyOn(Assets, 'load')
      .mockResolvedValue(
        Texture.WHITE as unknown as Awaited<ReturnType<typeof Assets.load>>,
      )

    const p1 = manager.ensureCharacterSilhouettes()
    const p2 = manager.ensureCharacterSilhouettes()
    const p3 = manager.preloadCharacterSilhouettes()
    await Promise.all([p1, p2, p3])

    expect(loadSpy).toHaveBeenCalledTimes(9)
  })
})
