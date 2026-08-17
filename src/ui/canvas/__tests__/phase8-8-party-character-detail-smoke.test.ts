// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { Rectangle, Texture } from 'pixi.js'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import { PartyDetailScene } from '../scenes/partyDetail/PartyDetailScene.ts'
import { TavernScene } from '../scenes/tavern/TavernScene.ts'
import { DEFAULT_GAME_UI_STATE } from '../types.ts'
import {
  buildPartyDetailHeader,
  buildPartyDetailSceneViewModel,
} from '../viewModel/partyDetailViewModel.ts'
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

describe('Phase 8.8 Party & Character Detail Smoke', () => {
  it('A: mounts PartyDetailScene and selects initial character', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-a')
    const party = campaign.parties[0]!
    const member = party.party.members[1]!

    scene.mount(context, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const vm = (
      scene as unknown as { _viewModel: { selectedCharacter?: { id: string } } }
    )._viewModel
    expect(vm.selectedCharacter?.id).toBe(member.id)
    expect(context.layers.ui.children.length).toBeGreaterThan(0)
  })

  it('B: header shows idle, recovering and dispatched statuses', () => {
    const campaign = createTavernCampaign('phase8-8-b')
    const party = campaign.parties[0]!

    const idle = buildPartyDetailHeader(party, campaign)
    expect(idle.statusLabel).toBe('待機中')

    party.recoveringThroughDay = campaign.dayNumber + 2
    const recovering = buildPartyDetailHeader(party, campaign)
    expect(recovering.statusLabel).toBe('療養中')

    party.recoveringThroughDay = undefined
    const request = campaign.currentDay.requests[0]!
    const tavernParty = campaign.currentDay.parties.find(
      (p) => p.id === party.id,
    )!
    tavernParty.acceptedRequestId = request.id
    const dispatched = buildPartyDetailHeader(party, campaign)
    expect(dispatched.statusLabel).toBe('遠征中')
    expect(dispatched.currentQuestLabel).toBe(request.title)
  })

  it('C: member list shows role and condition labels', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-c')
    const party = campaign.parties[0]!

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const vm = (
      scene as unknown as {
        _viewModel: { members: { roleLabel: string; conditionLabel: string }[] }
      }
    )._viewModel
    expect(vm.members.length).toBe(party.party.members.length)
    expect(vm.members[0]!.roleLabel).toBeTruthy()
    expect(vm.members[0]!.conditionLabel).toMatch(/HP/)
  })

  it('D: profile tab exposes identity, abilities and personality', () => {
    const campaign = createTavernCampaign('phase8-8-d')
    const party = campaign.parties[0]!
    const member = party.party.members[0]!

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })

    const char = vm.selectedCharacter!
    expect(char.name).toBe(member.name)
    expect(char.abilities.some((a) => a.name === 'STR')).toBe(true)
    expect(char.condition.hp).toMatch(/\//)
    expect(char.personality.lines.length).toBeGreaterThan(0)
  })

  it('E: relationship tab provides directional labels and milestones', () => {
    const campaign = createTavernCampaign('phase8-8-e')
    const party = campaign.parties[0]!
    const [a, b] = party.party.members

    party.memberRelationships = {
      [`${a!.id}:${b!.id}`]: {
        sourceCharacterId: a!.id,
        targetCharacterId: b!.id,
        affinity: 75,
        trust: 70,
        respect: 60,
        tension: 20,
        recentEvents: [
          {
            id: 'rm-e',
            sourceCharacterId: a!.id,
            targetCharacterId: b!.id,
            day: 1,
            type: 'shared_success',
            summary: '共に勝利を収めた',
            importance: 5,
            valence: 'positive',
          },
        ],
      },
    }

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: a!.id,
      returnTarget: { sceneId: 'tavern' },
    })
    const rel = vm.selectedCharacter!.relationships.find(
      (r) => r.targetId === b!.id,
    )!
    expect(rel).toBeDefined()
    expect(rel.recentMemories.length).toBeGreaterThan(0)
  })

  it('F: history tab includes recent events and expedition records', () => {
    const campaign = createTavernCampaign('phase8-8-f')
    const party = campaign.parties[0]!
    const member = party.party.members[0]!

    party.characterMemories = {
      [member.id]: [
        {
          id: 'cm-f',
          characterId: member.id,
          day: 1,
          type: 'major_success',
          summary: '遺跡の謎を解いた',
          importance: 5,
          valence: 'positive',
        },
      ],
    }

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })
    expect(vm.selectedCharacter!.recentEvents.length).toBeGreaterThan(0)
    expect(vm.selectedCharacter!.expeditions).toBeDefined()
  })

  it('G: invalid party id shows empty fallback and invalid character falls back to first member', () => {
    const campaign = createTavernCampaign('phase8-8-g')

    const invalidParty = buildPartyDetailSceneViewModel(campaign, {
      partyId: 'missing',
      returnTarget: { sceneId: 'tavern' },
    })
    expect(invalidParty.emptyMessage).toBeTruthy()

    const party = campaign.parties[0]!
    const invalidChar = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: 'missing',
      returnTarget: { sceneId: 'tavern' },
    })
    expect(invalidChar.selectedCharacter?.id).toBe(party.party.members[0]!.id)
  })

  it('H: switching characters does not call AI or mutate campaign', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-h')
    const party = campaign.parties[0]!
    const before = JSON.stringify(campaign)

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)
    const internal = scene as unknown as {
      selectCharacter: (id: string) => void
    }
    internal.selectCharacter(party.party.members[1]!.id)

    expect(context.actions.openExpeditionNarrative).not.toHaveBeenCalled()
    expect(JSON.stringify(campaign)).toBe(before)
  })

  it('I: return to tavern preserves selected party and quest', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-i')
    const party = campaign.parties[0]!
    const request = campaign.currentDay.requests[0]!

    scene.mount(context, {
      partyId: party.id,
      returnTarget: {
        sceneId: 'tavern',
        selectedPartyId: party.id,
        selectedQuestId: request.id,
      },
    })
    scene.setCampaign(campaign, uiStateRef.current)
    const internal = scene as unknown as { returnToTavern: () => void }
    internal.returnToTavern()

    expect(context.canvasGame.setUiState).toHaveBeenCalledWith({
      selectedPartyId: party.id,
      selectedQuestId: request.id,
    })
    expect(context.canvasGame.sceneManager?.pop).toHaveBeenCalled()
  })

  it('J: TavernScene can push PartyDetailScene with selected party', () => {
    const tavern = new TavernScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(tavern, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-j')
    const party = campaign.parties[0]!

    tavern.mount(context)
    tavern.setCampaign(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
    })
    tavern.setUiState({
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
    })

    const internal = tavern as unknown as { openPartyDetail: () => void }
    internal.openPartyDetail()

    expect(context.canvasGame.sceneManager?.push).toHaveBeenCalledWith(
      'partyDetail',
      expect.objectContaining({
        partyId: party.id,
        returnTarget: expect.anything(),
      }),
    )
  })

  it('P: species texture resolves and is applied to portrait', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-p')
    const party = campaign.parties[0]!
    const member = party.party.members[0]!
    const texture = makeTexture(300, 800)
    const speciesId = member.identity?.species ?? 'human'
    ;(
      context.assetManager as unknown as { _cache: Map<string, Texture> }
    )._cache.set(speciesId, texture)

    scene.mount(context, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const internal = scene as unknown as {
      _profilePortrait: { texture: Texture; visible: boolean }
    }
    expect(internal._profilePortrait.visible).toBe(true)
    expect(internal._profilePortrait.texture).toBe(texture)
  })

  it('Q: portrait is visible on all tabs', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-q')
    const party = campaign.parties[0]!
    const texture = makeTexture(300, 800)
    const member = party.party.members[0]!
    const speciesId = member.identity?.species ?? 'human'
    ;(
      context.assetManager as unknown as { _cache: Map<string, Texture> }
    )._cache.set(speciesId, texture)

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const internal = scene as unknown as {
      _selectedTab: string
      selectTab: (tab: 'profile' | 'relationship' | 'history') => void
      _profilePortrait: { visible: boolean }
    }
    expect(internal._profilePortrait.visible).toBe(true)

    for (const tab of ['relationship', 'history'] as const) {
      internal.selectTab(tab)
      expect(internal._profilePortrait.visible).toBe(true)
    }
  })

  it('R: portrait switches with character and maintains size', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-r')
    const party = campaign.parties[0]!
    const [a, b, c] = party.party.members
    const textureA = makeTexture(400, 900)
    const textureB = makeTexture(600, 700)
    const textureC = makeTexture(500, 800)
    ;(
      context.assetManager as unknown as { _cache: Map<string, Texture> }
    )._cache.set(a!.identity!.species, textureA)
    ;(
      context.assetManager as unknown as { _cache: Map<string, Texture> }
    )._cache.set(b!.identity!.species, textureB)
    ;(
      context.assetManager as unknown as { _cache: Map<string, Texture> }
    )._cache.set(c!.identity!.species, textureC)

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const internal = scene as unknown as {
      _profilePortrait: {
        texture: Texture
        scale: { x: number; y: number }
        visible: boolean
      }
      selectCharacter: (id: string) => void
    }
    expect(internal._profilePortrait.visible).toBe(true)

    const startScale = internal._profilePortrait.scale.x
    internal.selectCharacter(b!.id)
    expect(internal._profilePortrait.scale.x).not.toBe(startScale)
    const bScale = internal._profilePortrait.scale.x
    internal.selectCharacter(c!.id)
    internal.selectCharacter(a!.id)
    expect(internal._profilePortrait.scale.x).toBe(startScale)
    expect(bScale).toBeGreaterThan(0)
    expect(internal._profilePortrait.scale.y).toBe(
      internal._profilePortrait.scale.x,
    )
  })

  it('S: portrait remains visible on relationship tab', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-s')
    const party = campaign.parties[0]!
    const texture = makeTexture(300, 800)
    const member = party.party.members[0]!
    const speciesId = member.identity?.species ?? 'human'
    ;(
      context.assetManager as unknown as { _cache: Map<string, Texture> }
    )._cache.set(speciesId, texture)

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const internal = scene as unknown as {
      selectTab: (tab: 'profile' | 'relationship' | 'history') => void
      _profilePortrait: { visible: boolean }
    }
    internal.selectTab('relationship')
    expect(internal._profilePortrait.visible).toBe(true)
  })

  it('T: portrait remains visible on history tab', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-t')
    const party = campaign.parties[0]!
    const texture = makeTexture(300, 800)
    const member = party.party.members[0]!
    const speciesId = member.identity?.species ?? 'human'
    ;(
      context.assetManager as unknown as { _cache: Map<string, Texture> }
    )._cache.set(speciesId, texture)

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const internal = scene as unknown as {
      selectTab: (tab: 'profile' | 'relationship' | 'history') => void
      _profilePortrait: { visible: boolean }
    }
    internal.selectTab('history')
    expect(internal._profilePortrait.visible).toBe(true)
  })

  it('U: scroll content does not contain a giant background rectangle', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-u')
    const party = campaign.parties[0]!

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const internal = scene as unknown as {
      _detailScroll: { content: { height: number; children: unknown[] } }
    }
    expect(internal._detailScroll.content.height).toBeLessThan(10000)
    const hasGiantRect = internal._detailScroll.content.children.some(
      (child: unknown) =>
        child &&
        typeof child === 'object' &&
        'height' in child &&
        (child as { height: number }).height >= 10000,
    )
    expect(hasGiantRect).toBe(false)
  })

  it('V: profile tab renders a CharacterAbilityRadar', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-v')
    const party = campaign.parties[0]!

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const internal = scene as unknown as {
      _selectedTab: 'profile'
      _detailScroll: { content: { children: unknown[] } }
    }
    const hasRadar = internal._detailScroll.content.children.some(
      (child: unknown) =>
        child &&
        typeof child === 'object' &&
        'getAxisCount' in (child as object),
    )
    expect(hasRadar).toBe(true)
  })

  it('W: radar points change when switching characters', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-w')
    const party = campaign.parties[0]!
    const [a, b] = party.party.members

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const findRadar = (s: typeof scene) => {
      const internal = s as unknown as {
        _detailScroll: { content: { children: unknown[] } }
      }
      return internal._detailScroll.content.children.find(
        (child: unknown) =>
          child &&
          typeof child === 'object' &&
          'getValuePolygonPoints' in (child as object),
      ) as
        { getValuePolygonPoints: () => { x: number; y: number }[] } | undefined
    }

    const radarA = findRadar(scene)!
    const pointsA = radarA.getValuePolygonPoints()

    const internal = scene as unknown as {
      selectCharacter: (id: string) => void
    }
    internal.selectCharacter(b!.id)

    const radarB = findRadar(scene)!
    const pointsB = radarB.getValuePolygonPoints()

    expect(pointsA).toHaveLength(7)
    expect(pointsB).toHaveLength(7)

    let changed = false
    for (let i = 0; i < pointsA.length; i++) {
      if (pointsA[i]!.x !== pointsB[i]!.x || pointsA[i]!.y !== pointsB[i]!.y) {
        changed = true
        break
      }
    }
    expect(changed).toBe(a!.stats !== b!.stats)
  })

  it('X: profile tab renders HP and MP StatusGauges', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-x')
    const party = campaign.parties[0]!

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const internal = scene as unknown as {
      _detailScroll: { content: { children: unknown[] } }
    }
    const gauges = internal._detailScroll.content.children.filter(
      (child: unknown) =>
        child && typeof child === 'object' && 'setValues' in (child as object),
    )
    expect(gauges.length).toBeGreaterThanOrEqual(2)
  })

  it('Y: status gauge values match character condition', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-y')
    const party = campaign.parties[0]!
    const member = party.party.members[0]!

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const internal = scene as unknown as {
      _detailScroll: { content: { children: unknown[] } }
    }
    const gauges = internal._detailScroll.content.children.filter(
      (child: unknown) =>
        child &&
        typeof child === 'object' &&
        'current' in (child as object) &&
        'max' in (child as object),
    ) as { current: number; max: number }[]

    const hpGauge = gauges.find((g) => g.current === member.currentHp)
    expect(hpGauge).toBeDefined()
    expect(hpGauge!.max).toBe(member.maxHp)
  })

  it('Z: switching characters keeps gauges updated without runtime errors', () => {
    const scene = new PartyDetailScene()
    const uiStateRef = { current: { ...DEFAULT_GAME_UI_STATE } }
    const context = createSceneContext(scene, uiStateRef)
    const campaign = createTavernCampaign('phase8-8-z')
    const party = campaign.parties[0]!
    const [, second] = party.party.members

    scene.mount(context, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    scene.setCampaign(campaign, uiStateRef.current)

    const internal = scene as unknown as {
      selectCharacter: (id: string) => void
    }
    expect(() => internal.selectCharacter(second!.id)).not.toThrow()
  })
})
