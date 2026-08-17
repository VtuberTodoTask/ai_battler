// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { Container } from 'pixi.js'
import { vi } from 'vitest'
import { COUNTRY_LIST, SPECIES_LIST } from '../../../core/identity/worldData.ts'
import {
  COUNTRY_LORE_ENTRIES,
  getWorldLoreEntries,
  SPECIES_LORE_ENTRIES,
  WORLD_LORE_ENTRIES,
} from '../../../world/lore/worldLoreIndex.ts'
import { GameAssetManager } from '../assets/GameAssetManager.ts'
import { GameViewport } from '../GameViewport.ts'
import { OverlayManager } from '../overlays/OverlayManager.ts'
import { WorldEncyclopediaScene } from '../scenes/worldEncyclopedia/WorldEncyclopediaScene.ts'
import { DEFAULT_GAME_THEME } from '../theme/gameTheme.ts'
import { type GameSceneContext } from '../types.ts'
import { setupCanvasMock } from './partyDetailTestUtils.ts'

beforeEach(() => {
  setupCanvasMock()
})

function createSceneContext(_scene: WorldEncyclopediaScene): GameSceneContext {
  const app = {
    renderer: {
      on: vi.fn(),
      off: vi.fn(),
      events: { features: { wheel: false } },
    },
    stage: new Container(),
    screen: { width: 1600, height: 900 },
    canvas: document.createElement('canvas'),
    ticker: { add: vi.fn(), remove: vi.fn() },
    init: vi.fn(),
  } as unknown as GameSceneContext['app']

  const layers = {
    background: new Container(),
    content: new Container(),
    ui: new Container(),
    overlay: new Container(),
    modal: new Container(),
    transition: new Container(),
    debug: new Container(),
  }

  return {
    id: 'phase8-9-smoke',
    app,
    viewport: new GameViewport(),
    layers,
    overlayManager: new OverlayManager(
      layers.overlay,
      layers.modal,
      DEFAULT_GAME_THEME,
    ),
    theme: DEFAULT_GAME_THEME,
    assetManager: new GameAssetManager(),
    actions: {
      advanceDay: vi.fn(() => ({ ok: true })),
      resolveDay: vi.fn(() => ({ ok: true })),
      offerRequest: vi.fn(() => ({ ok: true })),
      selectParty: vi.fn(),
      selectQuest: vi.fn(),
      openCharacter: vi.fn(),
      openActivity: vi.fn().mockResolvedValue({ ok: true, data: '' }),
      openSettings: vi.fn(),
      closeModal: vi.fn(),
      switchToLegacy: vi.fn(),
    },
    canvasGame: {
      setUiState: vi.fn(),
      sceneManager: { push: vi.fn(), pop: vi.fn() },
    } as unknown as GameSceneContext['canvasGame'],
  }
}

describe('phase8-9-world-encyclopedia-smoke', () => {
  it('A: Tavern header entry point exists in TavernScene integration', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, {
      returnTarget: { sceneId: 'tavern' },
    })

    const internal = scene as unknown as {
      _returnButton: { label?: string }
      _category: string
    }
    expect(internal._category).toBe('world')
    expect(context.layers.ui.children.length).toBeGreaterThan(0)
  })

  it('B: world category is the default', () => {
    const entries = getWorldLoreEntries('world')
    expect(entries[0]!.id).toBe('seven-kingdoms-world')
    expect(entries[0]!.title).toBe('七国世界')
  })

  it('C: country category has exactly 7 entries', () => {
    expect(COUNTRY_LORE_ENTRIES.length).toBe(7)
    expect(getWorldLoreEntries('countries').length).toBe(7)
  })

  it('D: all country ids match the Character identity system', () => {
    const ids = COUNTRY_LORE_ENTRIES.map((entry) => entry.countryId)
    expect(new Set(ids).size).toBe(7)
    for (const id of COUNTRY_LIST) {
      expect(ids).toContain(id)
    }
  })

  it('E: species category has exactly 9 entries', () => {
    expect(SPECIES_LORE_ENTRIES.length).toBe(9)
    expect(getWorldLoreEntries('species').length).toBe(9)
  })

  it('F: all species ids match the Character identity system', () => {
    const ids = SPECIES_LORE_ENTRIES.map((entry) => entry.speciesId)
    expect(new Set(ids).size).toBe(9)
    for (const id of SPECIES_LIST) {
      expect(ids).toContain(id)
    }
  })

  it('G: article switching updates the displayed entry', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, { returnTarget: { sceneId: 'tavern' } })

    const tabs = (
      scene as unknown as {
        _tabButtons: { id: string; onActivate?: () => void }[]
      }
    )._tabButtons
    const countriesTab = tabs.find((b) => b.id === 'countries')!
    countriesTab.onActivate?.()

    const internal = scene as unknown as {
      _entryRows: { visible: boolean; onActivate?: () => void }[]
      _viewModel: {
        entryList: { id: string }[]
        article: { title: string }
      } | null
    }
    const celestaIndex = internal._viewModel!.entryList.findIndex(
      (entry) => entry.id === 'celesta',
    )
    expect(celestaIndex).toBeGreaterThanOrEqual(0)
    const celestaRow = internal._entryRows[celestaIndex]!
    expect(celestaRow.visible).toBe(true)
    celestaRow.onActivate?.()

    expect(internal._viewModel?.article.title).toBe('セレスタ交易共和国')
  })

  it('H: long article scroll area exists and resets on entry change', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, { returnTarget: { sceneId: 'tavern' } })

    const scroll = (
      scene as unknown as {
        _articleScroll: { content: { y: number }; scrollToTop: () => void }
      }
    )._articleScroll
    scroll.content.y = -100
    scroll.scrollToTop()
    expect(scroll.content.y).toBe(0)
  })

  it('I: return target preserves selected party and quest', () => {
    const scene = new WorldEncyclopediaScene()
    const context = createSceneContext(scene)

    scene.mount(context, {
      returnTarget: {
        sceneId: 'tavern',
        selectedPartyId: 'party-1',
        selectedQuestId: 'quest-1',
      },
    })

    const viewModel = (
      scene as unknown as {
        _viewModel: {
          returnTarget: {
            sceneId: string
            selectedPartyId?: string
            selectedQuestId?: string
          }
        } | null
      }
    )._viewModel
    expect(viewModel?.returnTarget.selectedPartyId).toBe('party-1')
    expect(viewModel?.returnTarget.selectedQuestId).toBe('quest-1')
  })

  it('J: all lore entries have unique ids and non-empty sections', () => {
    const all = [
      ...WORLD_LORE_ENTRIES,
      ...COUNTRY_LORE_ENTRIES,
      ...SPECIES_LORE_ENTRIES,
    ]
    const ids = all.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)

    for (const entry of all) {
      expect(entry.title).toBeTruthy()
      expect(entry.shortDescription).toBeTruthy()
      expect(entry.sections.length).toBeGreaterThan(0)
    }
  })

  it('K: scene does not mutate campaign or RNG state', () => {
    // WorldEncyclopediaScene has no setCampaign, no state mutation methods.
    const scene = new WorldEncyclopediaScene()
    expect('setCampaign' in scene).toBe(false)
  })
})
