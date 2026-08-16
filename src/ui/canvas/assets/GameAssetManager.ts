import { Assets, Texture } from 'pixi.js'

export class GameAssetManager {
  private readonly _cache = new Map<string, Texture>()
  private _loaded = false

  get isLoaded(): boolean {
    return this._loaded
  }

  /**
   * Loads placeholder assets for the foundation phase.
   * Phase 8.0 does not load real image files; placeholder textures are used instead.
   */
  async loadFoundation(): Promise<void> {
    if (this._loaded) return
    this._loaded = true
  }

  getTexture(alias: string): Texture {
    return this._cache.get(alias) ?? Texture.WHITE
  }

  registerPlaceholder(alias: string, texture: Texture): void {
    this._cache.set(alias, texture)
  }

  async loadCharacterSilhouettes(): Promise<void> {
    const SILHOUETTE_URLS: Record<string, string> = {
      mountainfolk: '/characters/mountainfolk.png',
      goblinfolk: '/characters/goblinfolk.png',
      scalefolk: '/characters/scalefolk.png',
      tuskfolk: '/characters/tuskfolk.png',
      long_eared: '/characters/long_eared.png',
      human: '/characters/human.png',
      smallfolk: '/characters/smallfolk.png',
      finfolk: '/characters/finfolk.png',
      wingfolk: '/characters/wingfolk.png',
    }
    for (const [speciesId, url] of Object.entries(SILHOUETTE_URLS)) {
      try {
        const texture = await Assets.load(url)
        this._cache.set(`character:${speciesId}`, texture)
      } catch {
        // Silhouette is optional; missing files fall back to Texture.WHITE.
      }
    }
  }

  getCharacterTexture(speciesId: string): Texture {
    return this._cache.get(`character:${speciesId}`) ?? Texture.WHITE
  }
}
