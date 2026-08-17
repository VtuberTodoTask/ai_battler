// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import { PartyDetailScene } from '../scenes/partyDetail/PartyDetailScene.ts'
import { DEFAULT_GAME_UI_STATE } from '../types.ts'
import { setupCanvasMock, createSceneContext } from './partyDetailTestUtils.ts'

beforeEach(() => {
  setupCanvasMock()
})

describe('PartyDetailScene scroll bounds', () => {
  it('does not create a giant background rectangle inside the scroll content', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('scroll-bounds-1')
    const party = campaign.parties[0]!

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const internal = scene as unknown as {
      _detailScroll: {
        content: { height: number; children: { height?: number }[] }
      }
    }
    expect(internal._detailScroll.content.height).toBeLessThan(10000)
    const hasGiantChild = internal._detailScroll.content.children.some(
      (child) => (child.height ?? 0) >= 10000,
    )
    expect(hasGiantChild).toBe(false)
  })

  it('keeps detail panel content within the visible panel height', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('scroll-bounds-2')
    const party = campaign.parties[0]!

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const internal = scene as unknown as {
      _detailScroll: { height: number; y: number }
      _detailRoot: { height: number; y: number }
    }
    const scrollBottom =
      internal._detailScroll.y + internal._detailScroll.height
    const panelBottom =
      (internal._detailRoot?.height ?? 0) + (internal._detailRoot?.y ?? 0)
    expect(scrollBottom).toBeLessThanOrEqual(panelBottom)
    expect(internal._detailScroll.height).toBeLessThan(900)
  })
})
