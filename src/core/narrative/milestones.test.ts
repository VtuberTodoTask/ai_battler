import { describe, expect, it } from 'vitest'
import type { Adventurer } from '../models/types.ts'
import type { CampaignParty } from '../tavern/campaign/types.ts'
import type {
  CharacterArcSignal,
  CharacterRelationship,
  NarrativeRequestInfo,
} from './types.ts'
import {
  detectRelationshipMilestoneCandidates,
  projectRelationshipMilestonesForNarrative,
  updateRelationshipMilestones,
} from './milestones.ts'

function makeParty(members: { id: string; name: string }[]): CampaignParty {
  return {
    id: 'p1',
    party: {
      id: 'p1',
      name: 'Test',
      rank: 'C',
      archetypeId: 'balanced',
      leaderId: members[0]!.id,
      members: members as unknown as Adventurer[],
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
  }
}

function makeRel(
  sourceId: string,
  targetId: string,
  overrides: Partial<CharacterRelationship> = {},
): [string, CharacterRelationship] {
  const key = `${sourceId}:${targetId}`
  return [
    key,
    {
      sourceCharacterId: sourceId,
      targetCharacterId: targetId,
      affinity: 50,
      trust: 50,
      respect: 50,
      tension: 50,
      sharedExpeditions: 0,
      recentEvents: [],
      ...overrides,
    },
  ]
}

function makeSignal(
  type: CharacterArcSignal['type'],
  characterIds: [string, string],
  options: {
    sourceCharacterId?: string
    targetCharacterId?: string
    strength?: number
    confidence?: number
    status?: CharacterArcSignal['status']
    supportingMemoryIds?: string[]
  } = {},
): CharacterArcSignal {
  const [a, b] = characterIds
  const source = options.sourceCharacterId ?? a
  const target = options.targetCharacterId ?? b
  const id = `sig:${type}:${source}:${target}:${[a, b].sort().join(':')}:1`
  return {
    id,
    type,
    characterIds: [a, b],
    sourceCharacterId: options.sourceCharacterId,
    targetCharacterId: options.targetCharacterId,
    strength: options.strength ?? 60,
    confidence: options.confidence ?? 70,
    status: options.status ?? 'established',
    direction: 'positive',
    supportingMemoryIds: options.supportingMemoryIds ?? ['m1', 'm2'],
    supportingEventIds: [],
    firstDetectedDay: 1,
    lastUpdatedDay: 1,
  }
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

describe('detectRelationshipMilestoneCandidates', () => {
  it('returns no milestone for a single rescue signal below threshold', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
    ])
    party.arcSignals = [
      makeSignal('growing_reliance', ['A', 'B'], {
        sourceCharacterId: 'A',
        targetCharacterId: 'B',
        strength: 40,
        confidence: 45,
        status: 'emerging',
        supportingMemoryIds: ['m1'],
      }),
    ]
    party.memberRelationships = {
      ...Object.fromEntries([
        makeRel('A', 'B', { sharedExpeditions: 1 }),
        makeRel('B', 'A', { sharedExpeditions: 1 }),
      ]),
    }
    party.sharedExpeditionCounts = { 'A:B': 1 }

    const candidates = detectRelationshipMilestoneCandidates(party, 10)
    expect(candidates.length).toBe(0)
  })

  it('detects established_directional_reliance', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
    ])
    party.arcSignals = [
      makeSignal('growing_reliance', ['A', 'B'], {
        sourceCharacterId: 'A',
        targetCharacterId: 'B',
      }),
    ]
    party.memberRelationships = Object.fromEntries([
      makeRel('A', 'B', { sharedExpeditions: 3, trust: 70 }),
      makeRel('B', 'A', { sharedExpeditions: 3 }),
    ])
    party.sharedExpeditionCounts = { 'A:B': 3 }

    const candidates = detectRelationshipMilestoneCandidates(party, 10)
    const milestone = candidates.find(
      (c) => c.type === 'established_directional_reliance',
    )
    expect(milestone).toBeDefined()
    expect(milestone!.sourceCharacterId).toBe('A')
    expect(milestone!.targetCharacterId).toBe('B')
    expect(milestone!.eligible).toBe(true)
  })

  it('detects established_mutual_reliance when both directions are strong', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
    ])
    party.arcSignals = [
      makeSignal('growing_reliance', ['A', 'B'], {
        sourceCharacterId: 'A',
        targetCharacterId: 'B',
      }),
      makeSignal('growing_reliance', ['B', 'A'], {
        sourceCharacterId: 'B',
        targetCharacterId: 'A',
      }),
    ]
    party.memberRelationships = Object.fromEntries([
      makeRel('A', 'B', { sharedExpeditions: 3, trust: 70 }),
      makeRel('B', 'A', { sharedExpeditions: 3, trust: 70 }),
    ])
    party.sharedExpeditionCounts = { 'A:B': 3 }

    const candidates = detectRelationshipMilestoneCandidates(party, 10)
    const mutual = candidates.find(
      (c) => c.type === 'established_mutual_reliance',
    )
    expect(mutual).toBeDefined()
    expect(mutual!.sourceCharacterId).toBeUndefined()
  })

  it('detects established_trusted_friction', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
    ])
    party.arcSignals = [
      makeSignal('growing_reliance', ['A', 'B'], {
        sourceCharacterId: 'A',
        targetCharacterId: 'B',
      }),
      makeSignal('recurring_conflict', ['A', 'B']),
    ]
    party.memberRelationships = Object.fromEntries([
      makeRel('A', 'B', { sharedExpeditions: 3, trust: 75, tension: 75 }),
      makeRel('B', 'A', { sharedExpeditions: 3, trust: 75, tension: 75 }),
    ])
    party.sharedExpeditionCounts = { 'A:B': 3 }

    const candidates = detectRelationshipMilestoneCandidates(party, 10)
    const friction = candidates.find(
      (c) => c.type === 'established_trusted_friction',
    )
    expect(friction).toBeDefined()
  })

  it('projects only relevant scene milestones', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
      { id: 'C', name: 'Cara' },
      { id: 'D', name: 'Dane' },
    ])
    party.relationshipMilestones = [
      {
        id: 'm1',
        type: 'established_mutual_reliance',
        characterIds: ['A', 'B'],
        achievedDay: 5,
        status: 'active',
        strength: 70,
        confidence: 70,
        supportingArcSignalIds: [],
        supportingMemoryIds: [],
      },
      {
        id: 'm2',
        type: 'established_working_rhythm',
        characterIds: ['C', 'D'],
        achievedDay: 5,
        status: 'active',
        strength: 70,
        confidence: 70,
        supportingArcSignalIds: [],
        supportingMemoryIds: [],
      },
    ]
    const request = makeRequest('test')
    const projected = projectRelationshipMilestonesForNarrative(
      party,
      '',
      request,
      ['A', 'B'],
      10,
    )
    expect(projected.length).toBe(1)
    expect(projected[0]!.type).toBe('established_mutual_reliance')
  })
})

describe('updateRelationshipMilestones', () => {
  it('promotes candidates and tracks legacy status on loss of support', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
    ])
    party.relationshipMilestones = [
      {
        id: 'm1',
        type: 'established_mutual_reliance',
        characterIds: ['A', 'B'],
        achievedDay: 5,
        status: 'active',
        strength: 70,
        confidence: 70,
        supportingArcSignalIds: ['s1'],
        supportingMemoryIds: ['m1', 'm2'],
      },
    ]
    // No longer supported: no matching arc signals.
    party.arcSignals = []
    party.memberRelationships = Object.fromEntries([
      makeRel('A', 'B', { sharedExpeditions: 1 }),
      makeRel('B', 'A', { sharedExpeditions: 1 }),
    ])
    party.sharedExpeditionCounts = { 'A:B': 1 }

    updateRelationshipMilestones(party, 15)
    const milestone = party.relationshipMilestones![0]!
    expect(milestone.status).toBe('legacy')
    expect(milestone.deactivatedDay).toBe(15)
  })

  it('does not duplicate milestones on repeated updates', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
    ])
    party.arcSignals = [
      makeSignal('growing_reliance', ['A', 'B'], {
        sourceCharacterId: 'A',
        targetCharacterId: 'B',
      }),
    ]
    party.memberRelationships = Object.fromEntries([
      makeRel('A', 'B', { sharedExpeditions: 3, trust: 70 }),
      makeRel('B', 'A', { sharedExpeditions: 3 }),
    ])
    party.sharedExpeditionCounts = { 'A:B': 3 }

    updateRelationshipMilestones(party, 10)
    const firstCount = party.relationshipMilestones!.length
    updateRelationshipMilestones(party, 10)
    expect(party.relationshipMilestones!.length).toBe(firstCount)
  })

  it('loads old saves with missing relationshipMilestones as empty', () => {
    const party = makeParty([{ id: 'A', name: 'Aron' }])
    updateRelationshipMilestones(party, 1)
    expect(party.relationshipMilestones).toEqual([])
  })
})
