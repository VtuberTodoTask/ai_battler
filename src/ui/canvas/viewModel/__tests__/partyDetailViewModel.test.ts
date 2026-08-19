import { describe, expect, it } from 'vitest'
import { createTavernCampaign } from '../../../../core/tavern/campaign/campaign.ts'
import type { ExpeditionInjury } from '../../../../core/expedition/types.ts'
import type {
  ExpeditionResult,
  ExpeditionState,
} from '../../../../core/expedition/types.ts'
import type { ExpeditionRequest } from '../../../../core/expedition/types.ts'
import {
  buildPartyDetailSceneViewModel,
  buildPartyDetailHeader,
} from '../partyDetailViewModel.ts'

describe('partyDetailViewModel', () => {
  it('builds header for idle party with rank and member count', () => {
    const campaign = createTavernCampaign('party-detail-header-idle')
    const party = campaign.parties[0]!
    const header = buildPartyDetailHeader(party, campaign)

    expect(header.name).toBe(party.party.name)
    expect(header.rankLabel).toContain('Rank')
    expect(header.statusLabel).toBe('待機中')
    expect(header.memberCount).toBe(party.party.members.length)
  })

  it('builds header for recovering party', () => {
    const campaign = createTavernCampaign('party-detail-header-recover')
    const party = campaign.parties[0]!
    party.recoveringThroughDay = campaign.dayNumber + 2
    const header = buildPartyDetailHeader(party, campaign)

    expect(header.statusLabel).toBe('療養中')
    expect(header.stayLabel).toMatch(/療養残り/)
  })

  it('builds header for dispatched party', () => {
    const campaign = createTavernCampaign('party-detail-header-dispatch')
    const party = campaign.parties[0]!
    const request = campaign.currentDay.requests[0]!
    const tavernParty = campaign.currentDay.parties.find(
      (p) => p.id === party.id,
    )!
    tavernParty.acceptedRequestId = request.id
    const header = buildPartyDetailHeader(party, campaign)

    expect(header.statusLabel).toBe('遠征中')
    expect(header.currentQuestLabel).toBe(request.title)
  })

  it('returns fallback for an invalid party id', () => {
    const campaign = createTavernCampaign('party-detail-invalid')
    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: 'missing-party',
      returnTarget: { sceneId: 'tavern' },
    })

    expect(vm.emptyMessage).toBeDefined()
    expect(vm.members).toHaveLength(0)
  })

  it('selects requested initial character and falls back to first member', () => {
    const campaign = createTavernCampaign('party-detail-select')
    const party = campaign.parties[0]!
    const members = party.party.members
    const firstId = members[0]!.id
    const secondId = members[1]!.id

    const vmWithSecond = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: secondId,
      returnTarget: { sceneId: 'tavern' },
    })
    expect(vmWithSecond.selectedCharacter?.id).toBe(secondId)
    expect(vmWithSecond.members.find((m) => m.id === secondId)?.selected).toBe(
      true,
    )

    const vmWithInvalid = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: 'missing-character',
      returnTarget: { sceneId: 'tavern' },
    })
    expect(vmWithInvalid.selectedCharacter?.id).toBe(firstId)
  })

  it('reflects member injury and death in condition', () => {
    const campaign = createTavernCampaign('party-detail-condition')
    const party = campaign.parties[0]!
    const member = party.party.members[0]!

    const injury: ExpeditionInjury = {
      id: 'inj-1',
      adventurerId: member.id,
      type: 'light',
      cause: '罠',
      hpLoss: 3,
      status: 'active',
    }
    party.condition.injuries = [injury]

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })

    const selected = vm.selectedCharacter!
    expect(selected.condition.status).toMatch(/負傷/)
    expect(selected.condition.injuries).toHaveLength(1)
    expect(selected.condition.injuries[0]!.type).toBe('軽傷')

    party.condition.incapacitatedIds = [member.id]
    member.currentHp = 0
    const vmDead = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    expect(vmDead.selectedCharacter!.condition.status).toBe('死亡')
  })

  it('reflects recovery days in condition', () => {
    const campaign = createTavernCampaign('party-detail-recovery')
    const party = campaign.parties[0]!
    party.recoveringThroughDay = campaign.dayNumber + 3

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    expect(vm.selectedCharacter!.condition.recoveryDaysRemaining).toBe(3)
    expect(vm.selectedCharacter!.condition.status).toMatch(/療養中/)
  })

  it('renders relationships with labels, memories and milestones', () => {
    const campaign = createTavernCampaign('party-detail-relationships')
    const party = campaign.parties[0]!
    const members = party.party.members
    if (members.length < 2) return

    const [a, b] = members
    party.memberRelationships = {
      [`${a!.id}:${b!.id}`]: {
        sourceCharacterId: a!.id,
        targetCharacterId: b!.id,
        affinity: 70,
        trust: 80,
        respect: 60,
        tension: 30,
        sharedExpeditions: 2,
        recentEvents: [
          {
            id: 'rm-1',
            sourceCharacterId: a!.id,
            targetCharacterId: b!.id,
            day: 1,
            type: 'shared_success',
            summary: '共に難関を切り抜けた',
            importance: 5,
            valence: 'positive',
          },
        ],
      },
    }
    party.relationshipMilestones = [
      {
        id: 'm-1',
        type: 'established_mutual_reliance',
        characterIds: [a!.id, b!.id],
        achievedDay: 2,
        status: 'active',
        strength: 80,
        confidence: 75,
        supportingArcSignalIds: [],
        supportingMemoryIds: [],
      },
    ]

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: a!.id,
      returnTarget: { sceneId: 'tavern' },
    })
    const rel = vm.selectedCharacter!.relationships.find(
      (r) => r.targetId === b!.id,
    )!
    expect(rel).toBeDefined()
    expect(rel.label).toMatch(/親密|信頼/)
    expect(rel.sharedExpeditions).toBe(2)
    expect(rel.recentMemories).toHaveLength(1)
    expect(rel.milestones).toHaveLength(1)
    expect(rel.milestones[0]!.label).toMatch(/定着|関係/)
  })

  it('shows empty relationship message when no notable relationship exists', () => {
    const campaign = createTavernCampaign('party-detail-no-rel')
    const party = campaign.parties[0]!
    party.memberRelationships = {}

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      returnTarget: { sceneId: 'tavern' },
    })
    expect(vm.selectedCharacter!.relationships).toHaveLength(
      party.party.members.length - 1,
    )
    const rel = vm.selectedCharacter!.relationships[0]!
    expect(rel.label).toMatch(/まだ特筆/)
  })

  it('collects recent events from character memories, downtime and skill gains', () => {
    const campaign = createTavernCampaign('party-detail-events')
    const party = campaign.parties[0]!
    const member = party.party.members[0]!

    party.characterMemories = {
      [member.id]: [
        {
          id: 'cm-1',
          characterId: member.id,
          day: 2,
          type: 'other',
          summary: '森で珍しい花を見た',
          importance: 3,
          valence: 'positive',
        },
      ],
    }
    party.downtimeEvents = [
      {
        id: 'de-1',
        day: 3,
        type: 'watching_party_prepare',
        participantIds: [member.id],
        valence: 'positive',
        importance: 2,
        relationshipDeltas: [],
        memoryEligible: true,
        narrativeKey: 'watching_party_prepare',
        createdAtDay: 3,
        narrativeStatus: 'unseen',
      },
    ]
    campaign.history = [
      {
        dayNumber: 4,
        daySeed: 'seed',
        reputationSummary: {
          beforeScore: 10,
          delta: 2,
          afterScore: 12,
          beforeRank: 1,
          afterRank: 1,
          promoted: false,
        },
        results: [],
        partyEvents: [],
        progressionEvents: [
          {
            type: 'skillImproved',
            partyId: party.id,
            partyName: party.party.name,
            memberId: member.id,
            memberName: member.name,
            skill: 'scouting',
            before: 1,
            after: 2,
            milestone: 0,
            dayNumber: 4,
          },
        ],
        relationshipEvents: [],
        questChainEvents: [],
      },
    ]

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })
    const summaries = vm.selectedCharacter!.recentEvents.map((e) => e.summary)
    expect(summaries.some((s) => s.includes('花を見た'))).toBe(true)
    expect(summaries.some((s) => s.includes('偵察'))).toBe(true)
    expect(vm.selectedCharacter!.recentEvents.length).toBeGreaterThanOrEqual(2)
  })

  it('builds expedition history from campaign results', () => {
    const campaign = createTavernCampaign('party-detail-expeditions')
    const party = campaign.parties[0]!
    const member = party.party.members[0]!
    const request = campaign.currentDay.requests[0]!

    const result: ExpeditionResult = {
      outcome: 'success',
      state: {} as unknown as ExpeditionState,
      party: [],
      request: request as unknown as ExpeditionRequest,
    }

    campaign.history = [
      {
        dayNumber: 2,
        daySeed: 'seed',
        reputationSummary: {
          beforeScore: 10,
          delta: 5,
          afterScore: 15,
          beforeRank: 1,
          afterRank: 1,
          promoted: false,
        },
        results: [
          {
            requestId: request.id,
            request,
            partyId: party.id,
            partyName: party.party.name,
            memberIds: [member.id],
            status: 'resolved',
            result,
          },
        ],
        partyEvents: [],
        progressionEvents: [],
        relationshipEvents: [],
        questChainEvents: [],
      },
    ]

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })
    expect(vm.selectedCharacter!.expeditions).toHaveLength(1)
    expect(vm.selectedCharacter!.expeditions[0]!.outcomeLabel).toBe('成功')
    expect(vm.selectedCharacter!.expeditions[0]!.reportId).toBeDefined()
  })

  it('keeps abilities to core stats and condition to HP/MP/morale', () => {
    const campaign = createTavernCampaign('party-detail-abilities')
    const party = campaign.parties[0]!
    const member = party.party.members[0]!

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })

    const char = vm.selectedCharacter!
    const abilityNames = char.abilities.map((a) => a.name)
    expect(abilityNames).toEqual([
      'STR',
      'CON',
      'DEX',
      'INT',
      'PER',
      'WIL',
      'SOC',
    ])
    expect(abilityNames).not.toContain('HP')
    expect(abilityNames).not.toContain('MP')
    expect(abilityNames).not.toContain('Morale')

    expect(char.condition.hp).toMatch(/\d+\/\d+/)
    expect(char.condition.mp).toMatch(/\d+\/\d+/)
    expect(char.condition.morale).toMatch(/\d+/)
    expect(char.condition.hpValue.max).toBeGreaterThan(0)
    expect(char.condition.mpValue.max).toBeGreaterThan(0)
    expect(char.condition.moraleValue.max).toBe(100)
  })

  it('exposes speciesId only when identity exists and localizes country', () => {
    const campaign = createTavernCampaign('party-detail-identity')
    const party = campaign.parties[0]!

    for (const member of party.party.members) {
      const vm = buildPartyDetailSceneViewModel(campaign, {
        partyId: party.id,
        initialCharacterId: member.id,
        returnTarget: { sceneId: 'tavern' },
      })
      const char = vm.selectedCharacter!

      if (member.identity?.species) {
        expect(char.speciesId).toBe(member.identity.species)
        expect(char.speciesLabel).toBeTruthy()
      } else {
        expect(char.speciesId).toBeUndefined()
        expect(char.speciesLabel).toMatch(/不明|未記録/)
      }

      if (member.identity?.countryOfOrigin) {
        expect(char.country.name).not.toBe('')
        expect(char.country.name).not.toBe('記録なし')
        expect(char.country.culture).toBeDefined()
      } else {
        expect(char.country.name).toBe('記録なし')
      }
    }
  })

  it('localizes status effects and skill gains', () => {
    const campaign = createTavernCampaign('party-detail-localize')
    const party = campaign.parties[0]!
    const member = party.party.members[0]!

    member.statusEffects = [
      {
        type: 'poisoned',
        duration: 3,
        sourceId: 'enemy',
      },
    ]

    campaign.history = [
      {
        dayNumber: 1,
        daySeed: 'seed',
        reputationSummary: {
          beforeScore: 10,
          delta: 0,
          afterScore: 10,
          beforeRank: 1,
          afterRank: 1,
          promoted: false,
        },
        results: [],
        partyEvents: [],
        progressionEvents: [
          {
            type: 'skillImproved',
            partyId: party.id,
            partyName: party.party.name,
            memberId: member.id,
            memberName: member.name,
            skill: 'scouting',
            before: 1,
            after: 2,
            milestone: 0,
            dayNumber: 1,
          },
        ],
        relationshipEvents: [],
        questChainEvents: [],
      },
    ]

    const vm = buildPartyDetailSceneViewModel(campaign, {
      partyId: party.id,
      initialCharacterId: member.id,
      returnTarget: { sceneId: 'tavern' },
    })

    expect(vm.selectedCharacter!.condition.status).toContain('毒')
    expect(
      vm.selectedCharacter!.recentEvents.some((e) =>
        e.summary.includes('偵察'),
      ),
    ).toBe(true)
  })
})
