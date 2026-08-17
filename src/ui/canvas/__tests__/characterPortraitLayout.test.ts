// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { Graphics, Rectangle, Texture } from 'pixi.js'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import { PartyDetailScene } from '../scenes/partyDetail/PartyDetailScene.ts'
import { DEFAULT_GAME_UI_STATE } from '../types.ts'
import { setupCanvasMock, createSceneContext } from './partyDetailTestUtils.ts'

beforeEach(() => {
  setupCanvasMock()
})

function makeTexture(width: number, height: number): Texture {
  return new Texture({
    source: Texture.WHITE.source,
    frame: new Rectangle(0, 0, width, height),
    orig: new Rectangle(0, 0, width, height),
  } as ConstructorParameters<typeof Texture>[0])
}

describe('PartyDetailScene portrait layout', () => {
  function mountWithSpecies(
    width: number,
    height: number,
    seed: string,
    memberIndex = 0,
  ) {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign(seed)
    const party = campaign.parties[0]!
    const member = party.party.members[memberIndex]!
    const speciesId = member.identity?.species ?? 'human'
    ;(
      context.assetManager as unknown as { _cache: Map<string, Texture> }
    )._cache.set(speciesId, makeTexture(width, height))

    scene.mount(context, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    return { scene, party, member, context }
  }

  it('anchors portrait at bottom-center', () => {
    const { scene } = mountWithSpecies(300, 800, 'portrait-layout-1')
    const internal = scene as unknown as {
      _profilePortrait: { anchor: { x: number; y: number } }
    }
    expect(internal._profilePortrait.anchor.x).toBe(0.5)
    expect(internal._profilePortrait.anchor.y).toBe(1)
  })

  it('scales portrait from natural size with uniform contain', () => {
    const { scene } = mountWithSpecies(400, 900, 'portrait-layout-2')
    const internal = scene as unknown as {
      _profilePortrait: { scale: { x: number; y: number } }
      _portraitArea: { width: number; height: number }
    }
    const scale = internal._profilePortrait.scale.x
    const { width: areaW, height: areaH } = internal._portraitArea
    const expectedScale = Math.min(areaW / 400, areaH / 900)
    expect(scale).toBe(expectedScale)
    expect(internal._profilePortrait.scale.y).toBe(scale)
  })

  it('uses an explicit Graphics mask for the portrait area', () => {
    const { scene } = mountWithSpecies(300, 800, 'portrait-layout-3')
    const internal = scene as unknown as {
      _profilePortrait: { mask: unknown }
      _portraitMask: Graphics
    }
    expect(internal._profilePortrait.mask).toBe(internal._portraitMask)
    expect(internal._portraitMask).toBeInstanceOf(Graphics)
  })

  it('does not drift in scale when repeatedly switching characters', () => {
    const { scene, party } = mountWithSpecies(500, 800, 'portrait-layout-4')
    const [a, b, c] = party.party.members
    const internal = scene as unknown as {
      _profilePortrait: {
        scale: { x: number; y: number }
        texture: Texture
        visible: boolean
      }
      selectCharacter: (id: string) => void
      _portraitArea: { width: number; height: number }
    }
    const cache = (
      scene as unknown as {
        _context: { assetManager: { _cache: Map<string, Texture> } }
      }
    )._context.assetManager._cache

    cache.set(a!.identity!.species, makeTexture(500, 800))
    cache.set(b!.identity!.species, makeTexture(300, 600))
    cache.set(c!.identity!.species, makeTexture(600, 1000))

    const firstScale = internal._profilePortrait.scale.x
    internal.selectCharacter(b!.id)
    internal.selectCharacter(c!.id)
    internal.selectCharacter(a!.id)
    expect(internal._profilePortrait.scale.x).toBe(firstScale)
    expect(internal._profilePortrait.scale.y).toBe(firstScale)
  })

  it('shows placeholder when no silhouette is available', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('portrait-layout-5')
    const party = campaign.parties[0]!
    const member =
      party.party.members.find(
        (m) => !m.identity || m.identity.species === undefined,
      ) ?? party.party.members[0]!

    scene.mount(context, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const internal = scene as unknown as {
      _profilePortrait: { visible: boolean; texture?: Texture }
      _portraitPlaceholder: { visible: boolean; text: string }
    }
    expect(internal._profilePortrait.visible).toBe(false)
    expect(internal._portraitPlaceholder.visible).toBe(true)
  })
})
