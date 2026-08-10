import { describe, expect, it } from 'vitest'
import type { Adventurer } from '../models/types.ts'
import type { CampaignParty } from '../tavern/campaign/types.ts'
import {
  detectArcSignals,
  projectArcSignalsForNarrative,
  updateArcSignals,
} from './arcSignals.ts'
import type { NarrativeRequestInfo } from './types.ts'

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

function addRelationshipMemory(
  party: CampaignParty,
  sourceId: string,
  targetId: string,
  type:
    | 'healed'
    | 'rescued'
    | 'conflict'
    | 'disagreement'
    | 'shared_success'
    | 'shared_failure',
  day: number,
  options: { importance?: number; romanticAttraction?: number } = {},
): void {
  party.memberRelationships ??= {}
  const key = `${sourceId}:${targetId}`
  if (!party.memberRelationships[key]) {
    party.memberRelationships[key] = {
      sourceCharacterId: sourceId,
      targetCharacterId: targetId,
      affinity: 50,
      trust: 50,
      respect: 50,
      tension: 50,
      sharedExpeditions: 0,
      recentEvents: [],
    }
  }
  const rel = party.memberRelationships[key]!
  rel.recentEvents ??= []
  const importance =
    options.importance ??
    (type === 'rescued'
      ? 8
      : type === 'healed'
        ? 5
        : type === 'conflict'
          ? 6
          : 4)
  rel.recentEvents.unshift({
    id: `m-${sourceId}-${targetId}-${type}-${day}`,
    sourceCharacterId: sourceId,
    targetCharacterId: targetId,
    day,
    type,
    summary: `${type} memory`,
    importance,
    valence: POSITIVE_TYPES.includes(type) ? 'positive' : 'negative',
    createdAtDay: day,
    lastReferencedDay: day,
  })
  if (options.romanticAttraction !== undefined) {
    rel.romanticAttraction = options.romanticAttraction
  }
}

const POSITIVE_TYPES: string[] = ['healed', 'rescued', 'shared_success']

describe('detectArcSignals', () => {
  it('detects growing_reliance from repeated support and high trust', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
    ])
    party.memberRelationships = {
      'A:B': {
        sourceCharacterId: 'A',
        targetCharacterId: 'B',
        affinity: 60,
        trust: 75,
        respect: 60,
        tension: 40,
        sharedExpeditions: 3,
        recentEvents: [],
      },
      'B:A': {
        sourceCharacterId: 'B',
        targetCharacterId: 'A',
        affinity: 60,
        trust: 75,
        respect: 60,
        tension: 40,
        sharedExpeditions: 3,
        recentEvents: [],
      },
    }
    addRelationshipMemory(party, 'B', 'A', 'healed', 3)
    addRelationshipMemory(party, 'B', 'A', 'rescued', 5)
    party.sharedExpeditionCounts = { 'A:B': 3 }

    const signals = detectArcSignals(party, 10)
    const growing = signals.find(
      (s) => s.type === 'growing_reliance' && s.sourceCharacterId === 'A',
    )
    expect(growing).toBeDefined()
    expect(growing!.status).toBe('established')
    expect(growing!.supportingMemoryIds.length).toBeGreaterThanOrEqual(2)
  })

  it('does not establish growing_reliance from a single rescue', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
    ])
    party.memberRelationships = {
      'B:A': {
        sourceCharacterId: 'B',
        targetCharacterId: 'A',
        affinity: 50,
        trust: 50,
        respect: 50,
        tension: 50,
        sharedExpeditions: 1,
        recentEvents: [],
      },
    }
    addRelationshipMemory(party, 'B', 'A', 'rescued', 5, { importance: 8 })

    const signals = detectArcSignals(party, 10)
    const growing = signals.find((s) => s.type === 'growing_reliance')
    expect(growing).toBeUndefined()
  })

  it('detects recurring_conflict from repeated disagreements', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
    ])
    party.memberRelationships = {
      'A:B': {
        sourceCharacterId: 'A',
        targetCharacterId: 'B',
        affinity: 40,
        trust: 40,
        respect: 50,
        tension: 80,
        sharedExpeditions: 2,
        recentEvents: [],
      },
      'B:A': {
        sourceCharacterId: 'B',
        targetCharacterId: 'A',
        affinity: 40,
        trust: 40,
        respect: 50,
        tension: 80,
        sharedExpeditions: 2,
        recentEvents: [],
      },
    }
    addRelationshipMemory(party, 'A', 'B', 'conflict', 2, { importance: 6 })
    addRelationshipMemory(party, 'A', 'B', 'disagreement', 4, { importance: 4 })

    const signals = detectArcSignals(party, 10)
    const conflict = signals.find((s) => s.type === 'recurring_conflict')
    expect(conflict).toBeDefined()
    expect(conflict!.direction).toBe('negative')
  })

  it('allows mixed signals (growing_reliance + recurring_conflict)', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
    ])
    party.memberRelationships = {
      'A:B': {
        sourceCharacterId: 'A',
        targetCharacterId: 'B',
        affinity: 55,
        trust: 70,
        respect: 60,
        tension: 75,
        sharedExpeditions: 4,
        recentEvents: [],
      },
      'B:A': {
        sourceCharacterId: 'B',
        targetCharacterId: 'A',
        affinity: 55,
        trust: 70,
        respect: 60,
        tension: 75,
        sharedExpeditions: 4,
        recentEvents: [],
      },
    }
    addRelationshipMemory(party, 'B', 'A', 'healed', 3)
    addRelationshipMemory(party, 'B', 'A', 'rescued', 5)
    addRelationshipMemory(party, 'A', 'B', 'conflict', 6, { importance: 6 })
    addRelationshipMemory(party, 'B', 'A', 'disagreement', 7, { importance: 4 })

    const signals = detectArcSignals(party, 10)
    expect(signals.some((s) => s.type === 'growing_reliance')).toBe(true)
    expect(signals.some((s) => s.type === 'recurring_conflict')).toBe(true)
  })

  it('detects fading conflict when positive counter-evidence appears', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
    ])
    party.arcSignals = [
      {
        id: 'arc:recurring_conflict:A:B::A:B:5',
        type: 'recurring_conflict',
        characterIds: ['A', 'B'],
        strength: 75,
        confidence: 70,
        supportingMemoryIds: ['m1'],
        firstDetectedDay: 2,
        lastUpdatedDay: 5,
        status: 'established',
        direction: 'negative',
      },
    ]
    party.memberRelationships = {
      'A:B': {
        sourceCharacterId: 'A',
        targetCharacterId: 'B',
        affinity: 70,
        trust: 70,
        respect: 60,
        tension: 40,
        sharedExpeditions: 3,
        recentEvents: [],
      },
      'B:A': {
        sourceCharacterId: 'B',
        targetCharacterId: 'A',
        affinity: 70,
        trust: 70,
        respect: 60,
        tension: 40,
        sharedExpeditions: 3,
        recentEvents: [],
      },
    }
    addRelationshipMemory(party, 'A', 'B', 'shared_success', 8)
    addRelationshipMemory(party, 'B', 'A', 'shared_success', 8)

    const signals = updateArcSignals(party, 10)
    const conflict = signals.find((s) => s.type === 'recurring_conflict')
    expect(conflict).toBeDefined()
    expect(conflict!.status).toBe('fading')
    expect(conflict!.strength).toBeLessThan(70)
  })

  it('keeps directional signals distinct (A relies on B vs B relies on A)', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
    ])
    party.memberRelationships = {
      'A:B': {
        sourceCharacterId: 'A',
        targetCharacterId: 'B',
        affinity: 50,
        trust: 60,
        respect: 50,
        tension: 50,
        sharedExpeditions: 2,
        recentEvents: [],
      },
      'B:A': {
        sourceCharacterId: 'B',
        targetCharacterId: 'A',
        affinity: 50,
        trust: 50,
        respect: 50,
        tension: 50,
        sharedExpeditions: 2,
        recentEvents: [],
      },
    }
    // B supports A twice, A supports B once.
    addRelationshipMemory(party, 'B', 'A', 'healed', 3)
    addRelationshipMemory(party, 'B', 'A', 'healed', 5)
    addRelationshipMemory(party, 'A', 'B', 'healed', 4)

    const signals = detectArcSignals(party, 10)
    const aRelies = signals.find(
      (s) => s.type === 'growing_reliance' && s.sourceCharacterId === 'A',
    )
    const bRelies = signals.find(
      (s) => s.type === 'growing_reliance' && s.sourceCharacterId === 'B',
    )
    expect(aRelies).toBeDefined()
    expect(bRelies).toBeUndefined()
  })

  it('does not project irrelevant arc signals into narrative context', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
      { id: 'C', name: 'Cyrus' },
      { id: 'D', name: 'Diana' },
    ])
    party.memberRelationships = {
      'A:B': {
        sourceCharacterId: 'A',
        targetCharacterId: 'B',
        affinity: 60,
        trust: 70,
        respect: 50,
        tension: 40,
        sharedExpeditions: 3,
        recentEvents: [],
      },
      'B:A': {
        sourceCharacterId: 'B',
        targetCharacterId: 'A',
        affinity: 60,
        trust: 70,
        respect: 50,
        tension: 40,
        sharedExpeditions: 3,
        recentEvents: [],
      },
    }
    addRelationshipMemory(party, 'B', 'A', 'healed', 3)
    addRelationshipMemory(party, 'B', 'A', 'healed', 5)
    updateArcSignals(party, 10)

    const projected = projectArcSignalsForNarrative(
      party,
      'C and D scene',
      makeRequest('C and D'),
      ['C', 'D'],
      10,
    )
    expect(projected.length).toBe(0)
  })

  it('initializes arc signals on an old party without arcSignals field', () => {
    const party = makeParty([
      { id: 'A', name: 'Aron' },
      { id: 'B', name: 'Bella' },
    ])
    expect(party.arcSignals).toBeUndefined()
    const signals = updateArcSignals(party, 1)
    expect(signals).toBeDefined()
    expect(party.arcSignals).toBe(signals)
  })
})
