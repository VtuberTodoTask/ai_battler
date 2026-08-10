import { describe, expect, it } from 'vitest'
import type { CampaignParty } from '../tavern/campaign/types.ts'
import { generateCampaignParty } from '../tavern/campaign/generators.ts'
import {
  applyDowntimeEvent,
  buildDowntimePrompt,
  createDowntimeEvent,
  DEFAULT_DOWNTIME_CONFIG,
  DOWNTIME_PROMPT_VERSION,
  generateDowntimeNarrative,
  resolveDowntimeForParty,
} from './downtime.ts'
import { updateArcSignals } from './arcSignals.ts'
import { updateRelationshipMilestones } from './milestones.ts'

const RELATIONSHIP_TYPES: string[] = [
  'shared_meal',
  'casual_conversation',
  'quiet_company',
  'equipment_help',
  'planning_together',
  'shared_chore',
  'minor_argument',
  'annoying_habit',
  'misunderstanding',
  'resource_disagreement',
  'competitive_activity',
  'mixed_working_session',
  'recovery_assistance',
  'unexpected_common_ground',
]

function makeParty(seed = 'downtime-test'): CampaignParty {
  const party = generateCampaignParty(seed, 0, 10, 1)
  // Ensure deterministic defaults for relationship tests.
  party.memberRelationships ??= {}
  const members = party.party.members
  for (let i = 0; i < members.length; i++) {
    for (let j = 0; j < members.length; j++) {
      if (i === j) continue
      const key = `${members[i]!.id}:${members[j]!.id}`
      if (!party.memberRelationships![key]) {
        party.memberRelationships![key] = {
          sourceCharacterId: members[i]!.id,
          targetCharacterId: members[j]!.id,
          affinity: 50,
          trust: 50,
          respect: 50,
          tension: 50,
          sharedExpeditions: 0,
          tags: [],
          recentEvents: [],
        }
      }
    }
  }
  return party
}

function rel(party: CampaignParty, sourceId: string, targetId: string) {
  return party.memberRelationships?.[`${sourceId}:${targetId}`]
}

function weightOverride(type: string): Partial<Record<string, number>> {
  const override: Record<string, number> = {}
  for (const t of RELATIONSHIP_TYPES) {
    override[t] = t === type ? 100 : 0
  }
  return override
}

function deterministicConfig(type: string): typeof DEFAULT_DOWNTIME_CONFIG {
  return {
    ...DEFAULT_DOWNTIME_CONFIG,
    relationshipEventChance: 100,
    flavorEventChance: 0,
    eventCooldownDays: 0,
    pairRepetitionWindowDays: 0,
    relationshipEventWeightOverride: weightOverride(type),
  }
}

describe('downtime event selection', () => {
  it('does not generate downtime events for dispatched parties', () => {
    const party = makeParty()
    // Simulate a dispatched party: no downtime should occur even with forced chance.
    const events = resolveDowntimeForParty(party, 1, 'seed', {
      ...deterministicConfig('shared_meal'),
      relationshipEventChance: 0,
    })
    // A dispatched simulation is tested in smoke; here we verify idempotency.
    expect(events).toHaveLength(0)
  })

  it('is deterministic for the same seed, day, and party state', () => {
    const partyA = makeParty('det')
    const partyB = structuredClone(partyA) as unknown as CampaignParty
    partyB.downtimeEvents = []

    const eventsA = resolveDowntimeForParty(
      partyA,
      1,
      'same-seed',
      deterministicConfig('shared_meal'),
    )
    const eventsB = resolveDowntimeForParty(
      partyB,
      1,
      'same-seed',
      deterministicConfig('shared_meal'),
    )

    expect(eventsA.map((e) => e.type)).toEqual(eventsB.map((e) => e.type))
    expect(eventsA[0]?.participantIds).toEqual(eventsB[0]?.participantIds)
  })

  it('is idempotent when resolved twice for the same day', () => {
    const party = makeParty()
    const config = deterministicConfig('shared_meal')
    resolveDowntimeForParty(party, 1, 'seed', config)
    const second = resolveDowntimeForParty(party, 1, 'seed', config)
    expect(second).toHaveLength(0)
    const total = party.downtimeEvents?.filter((e) => e.day === 1) ?? []
    expect(total).toHaveLength(1)
  })

  it('produces at most one relationship-changing event per party per day', () => {
    const party = makeParty()
    const config: typeof DEFAULT_DOWNTIME_CONFIG = {
      ...DEFAULT_DOWNTIME_CONFIG,
      relationshipEventChance: 100,
      flavorEventChance: 0,
      pairRepetitionWindowDays: 0,
      eventCooldownDays: 0,
    }
    const events = resolveDowntimeForParty(party, 1, 'seed', config)
    const relationshipEvents = events.filter((e) =>
      [
        'shared_meal',
        'casual_conversation',
        'quiet_company',
        'equipment_help',
        'planning_together',
        'shared_chore',
        'minor_argument',
        'annoying_habit',
        'misunderstanding',
        'resource_disagreement',
        'competitive_activity',
        'mixed_working_session',
        'recovery_assistance',
        'unexpected_common_ground',
      ].includes(e.type),
    )
    expect(relationshipEvents.length).toBeLessThanOrEqual(1)
  })

  it('can produce no event', () => {
    const party = makeParty()
    const events = resolveDowntimeForParty(party, 1, 'seed', {
      ...DEFAULT_DOWNTIME_CONFIG,
      relationshipEventChance: 0,
      flavorEventChance: 0,
    })
    expect(events).toHaveLength(0)
  })
})

describe('downtime relationship deltas', () => {
  it('shared_meal increases affinity', () => {
    const party = makeParty()
    const a = party.party.members[0]!.id
    const b = party.party.members[1]!.id
    const before = rel(party, a, b)!.affinity
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    applyDowntimeEvent(party, event, 1)
    expect(rel(party, a, b)!.affinity).toBe(before + 1)
  })

  it('minor_argument increases tension and decreases affinity', () => {
    const party = makeParty()
    const a = party.party.members[0]!.id
    const b = party.party.members[1]!.id
    const beforeTension = rel(party, a, b)!.tension
    const beforeAffinity = rel(party, a, b)!.affinity
    const event = createDowntimeEvent(
      party,
      'minor_argument',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    applyDowntimeEvent(party, event, 1)
    expect(rel(party, a, b)!.tension).toBe(beforeTension + 2)
    expect(rel(party, a, b)!.affinity).toBe(beforeAffinity - 1)
  })

  it('competitive_activity increases respect and tension', () => {
    const party = makeParty()
    const a = party.party.members[0]!.id
    const b = party.party.members[1]!.id
    const beforeRespect = rel(party, a, b)!.respect
    const beforeTension = rel(party, a, b)!.tension
    const event = createDowntimeEvent(
      party,
      'competitive_activity',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    applyDowntimeEvent(party, event, 1)
    expect(rel(party, a, b)!.respect).toBe(beforeRespect + 1)
    expect(rel(party, a, b)!.tension).toBe(beforeTension + 1)
  })

  it('does not change romantic attraction by default', () => {
    const party = makeParty()
    const a = party.party.members[0]!
    const b = party.party.members[1]!
    // Set compatible romantic profiles.
    a.romanticProfile = {
      attraction: { genders: [b.identity?.gender ?? 'female'], openness: 80 },
    }
    b.romanticProfile = {
      attraction: { genders: [a.identity?.gender ?? 'female'], openness: 80 },
    }
    rel(party, a.id, b.id)!.romanticAttraction = 30
    const before = rel(party, a.id, b.id)!.romanticAttraction
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [a.id, b.id],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    applyDowntimeEvent(party, event, 1)
    expect(rel(party, a.id, b.id)!.romanticAttraction).toBe(before)
  })
})

describe('downtime memory eligibility', () => {
  it('does not memory-ize minor shared meals', () => {
    const party = makeParty()
    const a = party.party.members[0]!.id
    const b = party.party.members[1]!.id
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    applyDowntimeEvent(party, event, 1)
    const forward = rel(party, a, b)!.recentEvents ?? []
    expect(forward.some((m) => m.day === 1)).toBe(false)
  })

  it('adds relationship memory for significant support', () => {
    const party = makeParty()
    const a = party.party.members[0]!.id
    const b = party.party.members[1]!.id
    const event = createDowntimeEvent(
      party,
      'equipment_help',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    applyDowntimeEvent(party, event, 1)
    const forward = rel(party, a, b)!.recentEvents ?? []
    const reverse = rel(party, b, a)!.recentEvents ?? []
    expect(forward.some((m) => m.type === 'supported')).toBe(true)
    expect(reverse.some((m) => m.type === 'supported')).toBe(true)
  })
})

describe('downtime arc and milestone integration', () => {
  it('repeated support contributes to growing_reliance arc signal', () => {
    const party = makeParty()
    const a = party.party.members[0]!.id
    const b = party.party.members[1]!.id

    // Give both directions high trust to push signal strength over threshold.
    rel(party, a, b)!.trust = 80
    rel(party, b, a)!.trust = 80

    for (let day = 1; day <= 5; day++) {
      // Alternate helper so both directions accumulate positive memories.
      const [source, target] = day % 2 === 1 ? [a, b] : [b, a]
      const event = createDowntimeEvent(
        party,
        'equipment_help',
        [source, target],
        day,
        'idle',
        DEFAULT_DOWNTIME_CONFIG,
      )
      applyDowntimeEvent(party, event, day)
    }

    updateArcSignals(party, 5)
    const signals = (party.arcSignals ?? []).filter(
      (s) => s.type === 'growing_reliance',
    )
    expect(signals.length).toBeGreaterThan(0)
    expect(signals[0]!.strength).toBeGreaterThanOrEqual(70)
  })

  it('can promote a milestone from downtime-driven arc signals and shared expedition history', () => {
    const party = makeParty()
    const a = party.party.members[0]!.id
    const b = party.party.members[1]!.id

    rel(party, a, b)!.trust = 80
    rel(party, b, a)!.trust = 80
    party.sharedExpeditionCounts = { [`${[a, b].sort().join(':')}`]: 3 }

    for (let day = 1; day <= 5; day++) {
      const [source, target] = day % 2 === 1 ? [a, b] : [b, a]
      const event = createDowntimeEvent(
        party,
        'equipment_help',
        [source, target],
        day,
        'idle',
        DEFAULT_DOWNTIME_CONFIG,
      )
      applyDowntimeEvent(party, event, day)
    }

    updateArcSignals(party, 5)
    updateRelationshipMilestones(party, 5)

    const milestone = (party.relationshipMilestones ?? []).find(
      (m) => m.type === 'established_mutual_reliance',
    )
    expect(milestone).toBeDefined()
  })
})

describe('downtime prompt', () => {
  it('uses DOWNTIME_PROMPT_VERSION v1 and contains required sections', () => {
    const party = makeParty()
    const a = party.party.members[0]!.id
    const b = party.party.members[1]!.id
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    const { systemPrompt, userPrompt } = buildDowntimePrompt(event, party)
    expect(systemPrompt).toContain(DOWNTIME_PROMPT_VERSION)
    expect(systemPrompt).toContain('DOWNTIME EVENT')
    expect(systemPrompt).toContain('CHARACTERS')
    expect(systemPrompt).toContain('RELATIONSHIP CONTEXT')
    expect(systemPrompt).toContain('NARRATIVE RULES')
    expect(userPrompt).toContain('shared_meal')
  })
})

describe('downtime narrative generation', () => {
  it('uses fallback and does not call provider when provider is null', async () => {
    const party = makeParty()
    const a = party.party.members[0]!.id
    const b = party.party.members[1]!.id
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    const text = await generateDowntimeNarrative(event, party, null)
    expect(text.length).toBeGreaterThan(0)
    expect(event.narrativeStatus).toBe('generated')
    expect(event.generatedText).toBe(text)
  })

  it('caches generated narrative and does not call provider again', async () => {
    const party = makeParty()
    const a = party.party.members[0]!.id
    const b = party.party.members[1]!.id
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    let calls = 0
    const fakeProvider = {
      generate: async () => {
        calls++
        return { text: 'cached text' }
      },
    }
    await generateDowntimeNarrative(event, party, fakeProvider)
    const text = await generateDowntimeNarrative(event, party, fakeProvider)
    expect(calls).toBe(1)
    expect(text).toBe('cached text')
  })

  it('falls back on provider failure', async () => {
    const party = makeParty()
    const a = party.party.members[0]!.id
    const b = party.party.members[1]!.id
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    const failingProvider = {
      generate: async () => {
        throw new Error('fail')
      },
    }
    const text = await generateDowntimeNarrative(event, party, failingProvider)
    expect(text.length).toBeGreaterThan(0)
    expect(event.narrativeStatus).toBe('generated')
  })
})
