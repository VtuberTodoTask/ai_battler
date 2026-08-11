import { Texture } from 'pixi.js'

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
}
