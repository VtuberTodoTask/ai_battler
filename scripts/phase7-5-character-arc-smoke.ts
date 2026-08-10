import {
  detectArcSignals,
  projectArcSignalsForNarrative,
  updateArcSignals,
} from '../src/core/narrative/arcSignals.ts'
import { initializePartyMemberRelationships } from '../src/core/narrative/characterRelationships.ts'
import type { CampaignParty } from '../src/core/tavern/campaign/types.ts'
import type { NarrativeRequestInfo } from '../src/core/narrative/types.ts'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`)
  }
}

function makeParty(members: { id: string; name: string }[]): CampaignParty {
  return {
    id: 'smoke-party',
    party: {
      id: 'p',
      name: 'Smoke Party',
      members: members as unknown as CampaignParty['party']['members'],
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
  } as CampaignParty
}

function makeRequest(title: string): NarrativeRequestInfo {
  return {
    id: 'req-1',
    title,
    briefing: 'smoke request',
    rank: 'C',
    objectiveType: 'investigation',
    environment: 'forest',
    publicTags: [],
  }
}

type MemoryType =
  | 'healed'
  | 'rescued'
  | 'conflict'
  | 'disagreement'
  | 'shared_success'
  | 'shared_failure'

function addRelationshipMemory(
  party: CampaignParty,
  sourceId: string,
  targetId: string,
  type: MemoryType,
  day: number,
  options: { importance?: number } = {},
): void {
  party.memberRelationships ??= initializePartyMemberRelationships(
    party.party.members,
  )
  const rel = party.memberRelationships[`${sourceId}:${targetId}`]
  assert(rel !== undefined, `relationship ${sourceId}:${targetId} exists`)
  const importance =
    options.importance ??
    (type === 'rescued'
      ? 8
      : type === 'healed'
        ? 5
        : type === 'conflict'
          ? 6
          : 4)
  rel.recentEvents ??= []
  rel.recentEvents.unshift({
    id: `m-${sourceId}-${targetId}-${type}-${day}`,
    sourceCharacterId: sourceId,
    targetCharacterId: targetId,
    day,
    type,
    summary: `${type} memory`,
    importance,
    valence:
      type === 'healed' || type === 'rescued' || type === 'shared_success'
        ? 'positive'
        : 'negative',
    createdAtDay: day,
    lastReferencedDay: day,
  })
}

function setRelationship(
  party: CampaignParty,
  sourceId: string,
  targetId: string,
  values: {
    affinity?: number
    trust?: number
    respect?: number
    tension?: number
    romanticAttraction?: number
    sharedExpeditions?: number
  },
): void {
  party.memberRelationships ??= initializePartyMemberRelationships(
    party.party.members,
  )
  const rel = party.memberRelationships[`${sourceId}:${targetId}`]
  assert(rel !== undefined, `relationship ${sourceId}:${targetId} exists`)
  Object.assign(rel, values)
}

function addSharedCount(
  party: CampaignParty,
  a: string,
  b: string,
  count: number,
): void {
  party.sharedExpeditionCounts ??= {}
  const key = [a, b].sort().join(':')
  party.sharedExpeditionCounts[key] = count
}

console.log('=== Phase 7.5 Character Arc Smoke ===\n')

// Case A: repeated support detects growing_reliance.
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.memberRelationships = initializePartyMemberRelationships(
    party.party.members,
  )
  setRelationship(party, 'A', 'B', {
    trust: 75,
    affinity: 60,
    sharedExpeditions: 3,
  })
  setRelationship(party, 'B', 'A', {
    trust: 75,
    affinity: 60,
    sharedExpeditions: 3,
  })
  addSharedCount(party, 'A', 'B', 3)
  addRelationshipMemory(party, 'B', 'A', 'healed', 3)
  addRelationshipMemory(party, 'B', 'A', 'rescued', 5)

  const signals = updateArcSignals(party, 10)
  const growing = signals.find(
    (s) => s.type === 'growing_reliance' && s.sourceCharacterId === 'A',
  )
  assert(growing !== undefined, 'Case A: growing_reliance detected for A -> B')
  assert(
    growing!.status === 'established',
    'Case A: growing_reliance is established',
  )
  assert(
    growing!.supportingMemoryIds.length >= 2,
    'Case A: growing_reliance has supporting memory IDs',
  )
  console.log('Case A PASS: repeated support detects growing_reliance')
}

// Case B: a single rescue does not establish a strong arc.
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.memberRelationships = initializePartyMemberRelationships(
    party.party.members,
  )
  addRelationshipMemory(party, 'B', 'A', 'rescued', 5, { importance: 8 })

  const signals = detectArcSignals(party, 10)
  const growing = signals.find((s) => s.type === 'growing_reliance')
  assert(
    growing === undefined,
    'Case B: single rescue does not create growing_reliance',
  )
  console.log('Case B PASS: single rescue does not establish arc')
}

// Case C: directional signals are distinct (A relies on B, not B relies on A).
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.memberRelationships = initializePartyMemberRelationships(
    party.party.members,
  )
  setRelationship(party, 'A', 'B', { trust: 60, sharedExpeditions: 2 })
  setRelationship(party, 'B', 'A', { trust: 50, sharedExpeditions: 2 })
  addSharedCount(party, 'A', 'B', 2)
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
  assert(aRelies !== undefined, 'Case C: A relies on B detected')
  assert(bRelies === undefined, 'Case C: B relies on A not detected')
  console.log('Case C PASS: directional signals are distinct')
}

// Case D: mixed signals (growing_reliance + recurring_conflict) can coexist.
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.memberRelationships = initializePartyMemberRelationships(
    party.party.members,
  )
  setRelationship(party, 'A', 'B', {
    trust: 70,
    affinity: 55,
    tension: 75,
    sharedExpeditions: 4,
  })
  setRelationship(party, 'B', 'A', {
    trust: 70,
    affinity: 55,
    tension: 75,
    sharedExpeditions: 4,
  })
  addSharedCount(party, 'A', 'B', 4)
  addRelationshipMemory(party, 'B', 'A', 'healed', 3)
  addRelationshipMemory(party, 'B', 'A', 'rescued', 5)
  addRelationshipMemory(party, 'A', 'B', 'conflict', 6, { importance: 6 })
  addRelationshipMemory(party, 'B', 'A', 'disagreement', 7, { importance: 4 })

  const signals = detectArcSignals(party, 10)
  assert(
    signals.some((s) => s.type === 'growing_reliance'),
    'Case D: growing_reliance detected',
  )
  assert(
    signals.some((s) => s.type === 'recurring_conflict'),
    'Case D: recurring_conflict detected',
  )
  console.log('Case D PASS: mixed positive and negative signals coexist')
}

// Case E: positive counter-evidence causes a conflict arc to fade.
{
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
  party.memberRelationships = initializePartyMemberRelationships(
    party.party.members,
  )
  setRelationship(party, 'A', 'B', {
    trust: 70,
    affinity: 70,
    tension: 40,
    sharedExpeditions: 3,
  })
  setRelationship(party, 'B', 'A', {
    trust: 70,
    affinity: 70,
    tension: 40,
    sharedExpeditions: 3,
  })
  addSharedCount(party, 'A', 'B', 3)
  addRelationshipMemory(party, 'A', 'B', 'shared_success', 8)
  addRelationshipMemory(party, 'B', 'A', 'shared_success', 8)

  const signals = updateArcSignals(party, 10)
  const conflict = signals.find((s) => s.type === 'recurring_conflict')
  assert(conflict !== undefined, 'Case E: previous conflict arc still tracked')
  assert(
    conflict!.status === 'fading',
    'Case E: conflict arc fades after counter evidence',
  )
  assert(conflict!.strength < 70, 'Case E: conflict arc strength dropped')
  console.log('Case E PASS: counter-evidence fades established conflict')
}

// Case F: arcs involving non-scene characters are not projected to narrative context.
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
    { id: 'C', name: 'Cyrus' },
    { id: 'D', name: 'Diana' },
  ])
  party.memberRelationships = initializePartyMemberRelationships(
    party.party.members,
  )
  setRelationship(party, 'A', 'B', {
    trust: 70,
    affinity: 60,
    sharedExpeditions: 3,
  })
  setRelationship(party, 'B', 'A', {
    trust: 70,
    affinity: 60,
    sharedExpeditions: 3,
  })
  addSharedCount(party, 'A', 'B', 3)
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
  assert(projected.length === 0, 'Case F: A/B arc not projected to C/D scene')
  console.log('Case F PASS: irrelevant arcs not projected')
}

// Case G: romantic_interest_possible requires romanticAttraction and shared history.
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.memberRelationships = initializePartyMemberRelationships(
    party.party.members,
  )
  setRelationship(party, 'A', 'B', {
    romanticAttraction: 75,
    affinity: 60,
    sharedExpeditions: 2,
  })
  setRelationship(party, 'B', 'A', {
    romanticAttraction: 30,
    affinity: 60,
    sharedExpeditions: 2,
  })
  addSharedCount(party, 'A', 'B', 2)
  addRelationshipMemory(party, 'B', 'A', 'healed', 3)

  const signals = detectArcSignals(party, 10)
  const romanceA = signals.find(
    (s) =>
      s.type === 'romantic_interest_possible' && s.sourceCharacterId === 'A',
  )
  const romanceB = signals.find(
    (s) =>
      s.type === 'romantic_interest_possible' && s.sourceCharacterId === 'B',
  )
  assert(romanceA !== undefined, 'Case G: A romantic interest detected')
  assert(romanceB === undefined, 'Case G: B low attraction not detected')
  assert(
    romanceA!.direction === 'positive',
    'Case G: romantic interest is positive direction',
  )
  console.log(
    'Case G PASS: romantic_interest_possible is directional and evidence-based',
  )
}

// Case H: shared failure alone does not create a shared_failure_bond without continued cooperation.
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.memberRelationships = initializePartyMemberRelationships(
    party.party.members,
  )
  setRelationship(party, 'A', 'B', { affinity: 50, sharedExpeditions: 1 })
  setRelationship(party, 'B', 'A', { affinity: 50, sharedExpeditions: 1 })
  addSharedCount(party, 'A', 'B', 1)
  addRelationshipMemory(party, 'A', 'B', 'shared_failure', 3, { importance: 5 })
  addRelationshipMemory(party, 'B', 'A', 'shared_failure', 3, { importance: 5 })

  const signals = detectArcSignals(party, 10)
  const bond = signals.find((s) => s.type === 'shared_failure_bond')
  assert(
    bond === undefined,
    'Case H: shared_failure_bond not created from isolated failure',
  )
  console.log('Case H PASS: shared failure alone does not bond')
}

// Case I: personal repeated injury creates a repeated_injury arc signal.
{
  const party = makeParty([{ id: 'A', name: 'Aron' }])
  party.characterMemories = {
    A: [
      {
        id: 'cm-1',
        characterId: 'A',
        day: 2,
        type: 'injury',
        summary: '轻伤',
        importance: 4,
        valence: 'negative',
        relatedCharacterIds: [],
      },
      {
        id: 'cm-2',
        characterId: 'A',
        day: 5,
        type: 'critical_injury',
        summary: '重伤',
        importance: 8,
        valence: 'negative',
        relatedCharacterIds: [],
      },
    ],
  }

  const signals = detectArcSignals(party, 10)
  const injury = signals.find((s) => s.type === 'repeated_injury')
  assert(injury !== undefined, 'Case I: repeated_injury signal detected')
  assert(injury!.characterIds[0] === 'A', 'Case I: signal belongs to A')
  console.log('Case I PASS: personal repeated injury arc detected')
}

// Case J: old saves without arcSignals initialize to empty array.
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  assert(
    party.arcSignals === undefined,
    'Case J: party starts without arcSignals',
  )
  const signals = updateArcSignals(party, 1)
  assert(Array.isArray(signals), 'Case J: update returns an array')
  assert(party.arcSignals === signals, 'Case J: arcSignals is set on party')
  console.log('Case J PASS: backward compatibility initializes arcSignals')
}

console.log('\n=== Phase 7.5 Character Arc Smoke: ALL PASS ===')
