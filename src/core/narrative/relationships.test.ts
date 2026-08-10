import { describe, expect, it } from 'vitest'
import type { Adventurer } from '../models/types.ts'
import type {
  ExpeditionRequest,
  ExpeditionResult,
  ExpeditionState,
  ExpeditionOutcome,
} from '../expedition/types.ts'
import type { CampaignParty } from '../tavern/campaign/types.ts'
import {
  applyCharacterRelationshipChanges,
  applyRelationshipEvents,
  initializePartyMemberRelationships,
  projectRelationshipEvents,
} from './characterRelationships.ts'

function makeState(
  overrides: Partial<ExpeditionState> & {
    partyHp?: Record<string, number>
  } = {},
): ExpeditionState {
  return {
    currentPhase: 'return',
    elapsedTime: 0,
    partyHp: { a: 10, b: 10, c: 10 },
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
        {
          id: 'c',
          name: 'C',
          role: 'guardian',
          rank: 'C',
        } as unknown as Adventurer,
      ],
      archetypeId: 'balanced',
      missionSpecialization: {
        id: 'balanced',
        name: 'Balanced',
        strongObjective: 'investigation',
        weakObjective: 'escort',
      },
    },
    arrivalSerial: 1,
    arrivalDay: 1,
    plannedDepartureDay: 7,
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
  } as unknown as CampaignParty
}

describe('projectRelationshipEvents', () => {
  it('extracts a healed event from a first-aid log', () => {
    const state = makeState({
      partyHp: { h: 10, t: 5 },
      logs: [
        {
          phase: 'return',
          type: 'firstAid',
          actorIds: ['h'],
          targetIds: ['t'],
          effects: [{ type: 'hpHeal', value: 4, targetId: 't' }],
          facts: [],
        },
      ],
    })
    const events = projectRelationshipEvents(state, 'success')
    const healed = events.filter((e) => e.type === 'healed')
    expect(healed).toHaveLength(1)
    expect(healed[0]).toMatchObject({
      type: 'healed',
      actorId: 'h',
      targetId: 't',
    })
  })

  it('extracts a casualty event from a casualty log', () => {
    const state = makeState({
      partyHp: { a: 10, dead: 0 },
      casualties: ['dead'],
      logs: [
        {
          phase: 'battle',
          type: 'casualty',
          actorIds: [],
          targetIds: ['dead'],
          effects: [{ type: 'hpDamage', value: 10, targetId: 'dead' }],
          facts: [],
        },
      ],
    })
    const events = projectRelationshipEvents(state, 'success')
    const casualty = events.find((e) => e.type === 'casualty')
    expect(casualty).toBeDefined()
    expect(casualty?.targetId).toBe('dead')
  })

  it('emits shared_success events for all pairs on success', () => {
    const state = makeState({ partyHp: { a: 10, b: 10, c: 10 } })
    const events = projectRelationshipEvents(state, 'success')
    const shared = events.filter((e) => e.type === 'shared_success')
    expect(shared.length).toBe(6)
  })

  it('emits shared_failure events for all pairs on forcedRetreat', () => {
    const state = makeState({ partyHp: { a: 10, b: 10, c: 10 } })
    const events = projectRelationshipEvents(state, 'forcedRetreat')
    const shared = events.filter((e) => e.type === 'shared_failure')
    expect(shared.length).toBe(6)
  })
})

describe('applyRelationshipEvents', () => {
  it('increases trust and affinity on healed events', () => {
    const rels = initializePartyMemberRelationships([{ id: 'h' }, { id: 't' }])
    applyRelationshipEvents(
      rels,
      [{ id: 'h' }, { id: 't' }],
      [{ type: 'healed', actorId: 'h', targetId: 't', reason: 'test' }],
    )
    const rel = rels['h:t']
    expect(rel.trust).toBeGreaterThan(50)
    expect(rel.affinity).toBeGreaterThan(50)
  })

  it('increases trust and affinity on rescued events', () => {
    const rels = initializePartyMemberRelationships([{ id: 'r' }, { id: 't' }])
    applyRelationshipEvents(
      rels,
      [{ id: 'r' }, { id: 't' }],
      [{ type: 'rescued', actorId: 'r', targetId: 't', reason: 'test' }],
    )
    const rel = rels['r:t']
    expect(rel.trust).toBeGreaterThan(50)
    expect(rel.affinity).toBeGreaterThan(50)
    expect(rel.recentEvents?.some((m) => m.type === 'rescued')).toBe(true)
  })

  it('increases tension on shared_failure events', () => {
    const rels = initializePartyMemberRelationships([{ id: 'a' }, { id: 'b' }])
    applyRelationshipEvents(
      rels,
      [{ id: 'a' }, { id: 'b' }],
      [{ type: 'shared_failure', actorId: 'a', targetId: 'b', reason: 'test' }],
    )
    const rel = rels['a:b']
    expect(rel.tension).toBeGreaterThan(50)
    expect(rel.affinity).toBeLessThan(50)
  })

  it('increases affinity on shared_success events', () => {
    const rels = initializePartyMemberRelationships([{ id: 'a' }, { id: 'b' }])
    applyRelationshipEvents(
      rels,
      [{ id: 'a' }, { id: 'b' }],
      [{ type: 'shared_success', actorId: 'a', targetId: 'b', reason: 'test' }],
    )
    const rel = rels['a:b']
    expect(rel.affinity).toBeGreaterThan(50)
  })

  it('reduces affinity and increases tension on casualty events', () => {
    const rels = initializePartyMemberRelationships([
      { id: 'a' },
      { id: 'b' },
      { id: 'dead' },
    ])
    const state = makeState({
      partyHp: { a: 10, b: 10, dead: 0 },
      casualties: ['dead'],
    })
    applyRelationshipEvents(
      rels,
      [{ id: 'a' }, { id: 'b' }, { id: 'dead' }],
      [{ type: 'casualty', targetId: 'dead', reason: 'test' }],
      state,
    )
    const rel = rels['a:dead']
    expect(rel.affinity).toBeLessThan(50)
    expect(rel.tension).toBeGreaterThan(50)
    expect(rel.recentEvents?.some((m) => m.type === 'casualty')).toBe(true)
  })
})

describe('applyCharacterRelationshipChanges', () => {
  it('initializes memberRelationships and applies changes from a result', () => {
    const party = makeParty()
    const result = {
      outcome: 'success' as ExpeditionOutcome,
      state: makeState({ partyHp: { a: 10, b: 10, c: 10 } }),
      request: {} as unknown as ExpeditionRequest,
      party: [],
    } as unknown as ExpeditionResult
    expect(party.memberRelationships).toBeUndefined()
    applyCharacterRelationshipChanges(party, result)
    expect(party.memberRelationships).toBeDefined()
    const rel = party.memberRelationships!['a:b']
    expect(rel.affinity).toBeGreaterThan(50)
  })
})
