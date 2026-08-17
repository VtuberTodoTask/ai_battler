import { Assets, Texture } from 'pixi.js'
import type { SpeciesId } from '../../../core/identity/types.ts'

export interface CharacterVisualResult {
  status: 'ready' | 'loading' | 'missing'
  texture?: Texture
}

const SILHOUETTE_URLS: Record<SpeciesId, string> = {
  human: '/characters/human.png',
  long_eared: '/characters/long_eared.png',
  mountainfolk: '/characters/mountainfolk.png',
  smallfolk: '/characters/smallfolk.png',
  tuskfolk: '/characters/tuskfolk.png',
  goblinfolk: '/characters/goblinfolk.png',
  scalefolk: '/characters/scalefolk.png',
  wingfolk: '/characters/wingfolk.png',
  finfolk: '/characters/finfolk.png',
}

export class GameAssetManager {
  private readonly _cache = new Map<SpeciesId, Texture>()
  private _loadPromise: Promise<void> | null = null
  private _loadStarted = false
  private _loadComplete = false

  get isLoaded(): boolean {
    return this._loadComplete
  }

  async preloadCharacterSilhouettes(): Promise<void> {
    return this.ensureCharacterSilhouettes()
  }

  async ensureCharacterSilhouettes(): Promise<void> {
    if (this._loadStarted) {
      return this._loadPromise ?? Promise.resolve()
    }
    this._loadStarted = true
    this._loadPromise = this.loadAll()
    return this._loadPromise
  }

  getCharacterVisual(speciesId?: SpeciesId): CharacterVisualResult {
    if (!speciesId) {
      return { status: 'missing' }
    }
    const texture = this._cache.get(speciesId)
    if (texture) {
      return { status: 'ready', texture }
    }
    if (this._loadStarted && !this._loadComplete) {
      return { status: 'loading' }
    }
    return { status: 'missing' }
  }

  private async loadAll(): Promise<void> {
    const entries = Object.entries(SILHOUETTE_URLS) as [SpeciesId, string][]
    await Promise.allSettled(
      entries.map(async ([speciesId, url]) => {
        try {
          const texture = (await Assets.load(url)) as Texture
          this._cache.set(speciesId, texture)
        } catch (err) {
          console.warn(`Failed to load silhouette: ${speciesId}`, err)
        }
      }),
    )
    this._loadComplete = true
  }
}
