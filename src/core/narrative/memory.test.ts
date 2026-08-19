import { describe, expect, it } from 'vitest'
import type { Adventurer } from '../models/types.ts'
import type {
  ExpeditionOutcome,
  ExpeditionRequest,
  ExpeditionResult,
  ExpeditionState,
} from '../expedition/types.ts'
import type { CampaignParty } from '../tavern/campaign/types.ts'
import { initializePartyMemberRelationships } from './characterRelationships.ts'
import { applyExpeditionMemory, projectMemoriesForNarrative } from './memory.ts'
import type { NarrativeRequestInfo } from './types.ts'

function makeState(overrides: Partial<ExpeditionState> = {}): ExpeditionState {
  return {
    currentPhase: 'return',
    elapsedTime: 0,
    partyHp: { a: 10, b: 10 },
    partyMp: {},
    partyMorale: {},
    partyStatusEffects: {},
    supplies: { food: 0, medicine: 0, tools: 0 },
    information: [],
    injuries: [],
    casualties: [],
    incapacitated: [],
    objectiveProgress: 0,
    objectiveCompleted: false,
    discoveredThreats: [],
    avoidedThreats: [],
    logs: [],
    battles: [],
    ...overrides,
  } as unknown as ExpeditionState
}

function makeParty(): CampaignParty {
  return {
    id: 'p1',
    party: {
      id: 'p1',
      name: 'Test',
      rank: 'C',
      leaderId: 'a',
      members: [
        {
          id: 'a',
          name: 'A',
          role: 'vanguard',
          rank: 'C',
        } as unknown as Adventurer,
        {
          id: 'b',
          name: 'B',
          role: 'healer',
          rank: 'C',
        } as unknown as Adventurer,
      ],
      archetypeId: 'balanced',
      missionSpecialization: {
        strongObjective: 'investigation',
        weakObjective: 'elimination',
      },
    },
    arrivalSerial: 1,
    arrivalDay: 1,
    plannedDepartureDay: 10,
    condition: { incapacitatedIds: [], injuries: [] },
    stats: {
      totalExpeditions: 0,
      completeSuccesses: 0,
      successes: 0,
      partialSuccesses: 0,
      failures: 0,
      retreats: 0,
    },
    progression: {
      growthXp: 0,
      totalGrowthXp: 0,
      growthMilestones: 0,
      trainingDays: 0,
    },
    relationship: {
      affinity: 50,
      financialPressure: 0,
      riskTolerance: 'balanced',
      stayExtensionDaysUsed: 0,
    },
    lifecycle: { status: 'staying', firstArrivalDay: 1, visitCount: 1 },
  }
}

function makeResult(
  outcome: ExpeditionOutcome,
  state: ExpeditionState,
): ExpeditionResult {
  return {
    outcome,
    state,
    request: {} as unknown as ExpeditionRequest,
    party: [],
  } as unknown as ExpeditionResult
}

function makeRequest(title: string): NarrativeRequestInfo {
  return {
    id: 'r1',
    title,
    briefing: 'test',
    rank: 'C',
    objectiveType: 'investigation',
    environment: 'forest',
    publicTags: [],
  }
}

describe('applyExpeditionMemory', () => {
  it('creates directional rescue memories with high importance', () => {
    const party = makeParty()
    party.memberRelationships = initializePartyMemberRelationships(
      party.party.members,
    )
    const state = makeState({
      objectiveState: {
        type: 'rescue',
        targetName: 'Lia',
        returned: true,
      } as unknown as ExpeditionState['objectiveState'],
    })
    applyExpeditionMemory(party, makeResult('success', state), 1, 'exp-1')

    const aMemories = party.characterMemories!.a
    expect(
      aMemories.some((m) => m.type === 'rescue' && m.importance >= 8),
    ).toBe(true)
    const bMemories = party.characterMemories!.b
    expect(
      bMemories.some((m) => m.type === 'rescue' && m.valence === 'positive'),
    ).toBe(true)
  })

  it('initializes memory storage on an old party without fields', () => {
    const party = makeParty()
    expect(party.characterMemories).toBeUndefined()
    expect(party.sharedExpeditionCounts).toBeUndefined()
    applyExpeditionMemory(party, makeResult('success', makeState()), 1, 'exp-1')
    expect(party.characterMemories).toBeDefined()
    expect(party.sharedExpeditionCounts).toBeDefined()
    expect(party.characterMemories!.a.length).toBeGreaterThan(0)
  })

  it('records shared expedition counts for each pair', () => {
    const party = makeParty()
    party.memberRelationships = initializePartyMemberRelationships(
      party.party.members,
    )
    applyExpeditionMemory(party, makeResult('success', makeState()), 1, 'exp-1')
    expect(party.sharedExpeditionCounts!['a:b']).toBe(1)
    const rel = party.memberRelationships!['a:b']
    expect(rel.sharedExpeditions).toBe(1)
  })
})

describe('projectMemoriesForNarrative', () => {
  it('selects relevant relationship memories for current scene characters', () => {
    const party = makeParty()
    party.memberRelationships = initializePartyMemberRelationships(
      party.party.members,
    )
    party.memberRelationships!['a:b'].recentEvents = [
      {
        id: 'm1',
        sourceCharacterId: 'a',
        targetCharacterId: 'b',
        day: 1,
        type: 'rescued',
        summary: 'Bを危険から救った',
        importance: 8,
        valence: 'positive',
        createdAtDay: 1,
        lastReferencedDay: 1,
      },
    ]

    const projected = projectMemoriesForNarrative(
      party,
      'Bの負傷',
      makeRequest('Bの負傷'),
      ['a', 'b'],
      5,
    )
    expect(projected.relationshipMemories['a:b']).toBeDefined()
    expect(
      projected.relationshipMemories['a:b']!.some((m) => m.type === 'rescued'),
    ).toBe(true)
  })

  it('does not project memories for characters not in the current scene', () => {
    const party = makeParty()
    party.memberRelationships = initializePartyMemberRelationships(
      party.party.members,
    )
    party.memberRelationships!['a:b'].recentEvents = [
      {
        id: 'm1',
        sourceCharacterId: 'a',
        targetCharacterId: 'b',
        day: 1,
        type: 'shared_success',
        summary: '一緒に成功した',
        importance: 2,
        valence: 'positive',
        createdAtDay: 1,
        lastReferencedDay: 1,
      },
    ]

    const projected = projectMemoriesForNarrative(
      party,
      'other scene',
      makeRequest('other'),
      ['c', 'd'],
      5,
    )
    expect(Object.keys(projected.relationshipMemories)).toHaveLength(0)
  })

  it('ranks high-importance old memory above low-importance recent memory', () => {
    const party = makeParty()
    party.characterMemories = {
      a: [
        {
          id: 'old',
          characterId: 'a',
          day: 1,
          type: 'casualty',
          summary: '仲間の死を目撃した',
          importance: 9,
          valence: 'negative',
          createdAtDay: 1,
          lastReferencedDay: 1,
        },
        {
          id: 'recent',
          characterId: 'a',
          day: 9,
          type: 'major_success',
          summary: '成功した',
          importance: 2,
          valence: 'positive',
          createdAtDay: 9,
          lastReferencedDay: 9,
        },
      ],
    }

    const projected = projectMemoriesForNarrative(
      party,
      'a',
      makeRequest('a'),
      ['a'],
      10,
    )
    expect(projected.characterMemories['a'][0].type).toBe('casualty')
  })
})
