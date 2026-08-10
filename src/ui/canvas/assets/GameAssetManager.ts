import { Assets, Texture } from 'pixi.js'

export class GameAssetManager {
  private readonly _cache = new Map<string, Texture>()
  private _loaded = false

  get isLoaded(): boolean {
    return this._loaded
  }

  async load(): Promise<void> {
    if (this._loaded) return

    await Assets.init({ manifest: this.buildManifest() })

    try {
      const textures = await Assets.loadBundle('foundation')
      for (const [alias, texture] of Object.entries(textures)) {
        if (texture instanceof Texture) {
          this._cache.set(alias, texture)
        }
      }
    } catch {
      // Foundation phase uses placeholder textures; missing bundle is safe.
    }

    this._loaded = true
  }

  getTexture(alias: string): Texture {
    return this._cache.get(alias) ?? Texture.WHITE
  }

  registerPlaceholder(alias: string, texture: Texture): void {
    this._cache.set(alias, texture)
  }

  private buildManifest() {
    return {
      bundles: [
        {
          name: 'foundation',
          assets: [
            { alias: 'ui.panel', src: '' },
            { alias: 'ui.button', src: '' },
            { alias: 'tavern.background', src: '' },
            { alias: 'icon.quest', src: '' },
          ],
        },
      ],
    }
  }
}
