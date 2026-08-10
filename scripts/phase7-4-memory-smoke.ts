import {
  applyRelationshipEvents,
  initializePartyMemberRelationships,
} from '../src/core/narrative/characterRelationships.ts'
import {
  applyExpeditionMemory,
  projectMemoriesForNarrative,
} from '../src/core/narrative/memory.ts'
import type { CampaignParty } from '../src/core/tavern/campaign/types.ts'
import type {
  ExpeditionOutcome,
  ExpeditionResult,
  ExpeditionState,
} from '../src/core/expedition/types.ts'
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

console.log('=== Phase 7.4 Memory Smoke ===\n')

// Case A: rescue memory B -> A with high importance.
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.memberRelationships = initializePartyMemberRelationships(
    party.party.members,
  )
  applyRelationshipEvents(party.memberRelationships, party.party.members, [
    {
      type: 'rescued',
      actorId: 'A',
      targetId: 'B',
      reason: 'test',
      expeditionId: 'exp-a',
    },
  ])

  const bToA = party.memberRelationships!['B:A']
  assert(bToA !== undefined, 'Case A: B -> A relationship exists')
  const bToAMemory = bToA.recentEvents![0]
  assert(bToAMemory !== undefined, 'Case A: B -> A memory exists')
  assert(bToAMemory.type === 'rescued', 'Case A: B -> A memory type is rescued')
  assert(
    bToAMemory.importance >= 8,
    'Case A: B -> A rescue memory is high importance',
  )
  assert(
    bToAMemory.valence === 'positive',
    'Case A: B -> A rescue memory is positive',
  )
  assert(
    bToAMemory.summary.includes('Aron'),
    'Case A: B -> A summary references Aron',
  )
  console.log('Case A PASS: B -> A rescue memory is high importance')
}

// Case B: directionality A -> B vs B -> A differ.
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.memberRelationships = initializePartyMemberRelationships(
    party.party.members,
  )
  applyRelationshipEvents(party.memberRelationships, party.party.members, [
    {
      type: 'healed',
      actorId: 'A',
      targetId: 'B',
      magnitude: 6,
      reason: 'test',
      expeditionId: 'exp-b',
    },
  ])

  const aToB = party.memberRelationships!['A:B'].recentEvents![0]
  const bToA = party.memberRelationships!['B:A'].recentEvents![0]
  assert(
    aToB.summary.includes('手当てを行った'),
    'Case B: A -> B summary is active',
  )
  assert(
    bToA.summary.includes('手当てしてもらった'),
    'Case B: B -> A summary is passive',
  )
  assert(
    aToB.summary !== bToA.summary,
    'Case B: A -> B and B -> A summaries differ',
  )
  console.log('Case B PASS: directional memories differ')
}

// Case C: conflict memory over retreat decision is negative/mixed.
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.memberRelationships = initializePartyMemberRelationships(
    party.party.members,
  )
  applyRelationshipEvents(party.memberRelationships, party.party.members, [
    {
      type: 'conflict',
      actorId: 'A',
      targetId: 'B',
      reason: '撤退提案が拒否された',
      expeditionId: 'exp-c',
    },
  ])

  const conflict = party.memberRelationships!['A:B'].recentEvents![0]
  assert(conflict.type === 'conflict', 'Case C: conflict memory recorded')
  assert(
    conflict.valence === 'negative' || conflict.valence === 'mixed',
    'Case C: conflict memory is negative or mixed',
  )
  assert(
    conflict.summary.includes('対立'),
    'Case C: conflict summary mentions disagreement',
  )
  console.log('Case C PASS: conflict memory is negative/mixed')
}

// Case D: routine travel produces no relationship memory.
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.memberRelationships = initializePartyMemberRelationships(
    party.party.members,
  )
  const state = {
    logs: [
      {
        phase: 'approach',
        type: 'travel',
        actorIds: ['A', 'B'],
        facts: ['移動した'],
        effects: [],
      },
    ],
    partyHp: { A: 10, B: 10 },
    casualties: [],
    battles: [],
  } as unknown as ExpeditionState

  applyRelationshipEvents(party.memberRelationships!, party.party.members, [], {
    state,
    day: 5,
  })

  for (const key of Object.keys(party.memberRelationships!)) {
    const rel = party.memberRelationships![key]
    assert(
      !rel.recentEvents || rel.recentEvents.length === 0,
      `Case D: no memory from routine travel for ${key}`,
    )
  }
  console.log('Case D PASS: routine travel produces no memory')
}

// Case E: relevant projection (past A/B rescue, current B injured -> rescue memory selected).
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.memberRelationships = initializePartyMemberRelationships(
    party.party.members,
  )
  applyRelationshipEvents(
    party.memberRelationships!,
    party.party.members,
    [
      {
        type: 'rescued',
        actorId: 'A',
        targetId: 'B',
        reason: 'test',
        expeditionId: 'exp-e',
      },
    ],
    { day: 5 },
  )
  party.characterMemories = {
    B: [
      {
        id: 'cm-B-1',
        characterId: 'B',
        expeditionId: 'exp-e',
        day: 6,
        type: 'critical_injury',
        summary: 'Bellaが重傷を負った',
        importance: 7,
        valence: 'negative',
        createdAtDay: 6,
        lastReferencedDay: 6,
      },
    ],
  }

  const request = makeRequest('Bellaの負傷')
  const focus = 'Bellaの負傷を手当てする場面'
  const projected = projectMemoriesForNarrative(
    party,
    focus,
    request,
    ['A', 'B'],
    10,
  )

  assert(
    projected.relationshipMemories['A:B']?.some((m) => m.type === 'rescued'),
    'Case E: A/B rescue memory selected for injured B scene',
  )
  assert(
    projected.characterMemories['B']?.some((m) => m.type === 'critical_injury'),
    'Case E: B injury memory selected',
  )
  console.log('Case E PASS: relevant memories projected for current scene')
}

// Case F: irrelevant memory (past A/B navigation, current C/D scene -> not projected).
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
  applyRelationshipEvents(
    party.memberRelationships!,
    party.party.members,
    [
      {
        type: 'shared_success',
        actorId: 'A',
        targetId: 'B',
        reason: 'test',
        expeditionId: 'exp-f',
      },
    ],
    { day: 5 },
  )

  const request = makeRequest('CyrusとDianaの依頼')
  const focus = 'CyrusとDianaの探索'
  const projected = projectMemoriesForNarrative(
    party,
    focus,
    request,
    ['C', 'D'],
    10,
  )

  assert(
    projected.relationshipMemories['A:B'] === undefined,
    'Case F: A/B memory not projected for C/D scene',
  )
  console.log('Case F PASS: irrelevant memories not projected')
}

// Case G: old high-importance memory can outrank recent low-importance memory.
{
  const party = makeParty([{ id: 'A', name: 'Aron' }])
  party.characterMemories = {
    A: [
      {
        id: 'cm-A-old',
        characterId: 'A',
        day: 1,
        type: 'casualty',
        summary: '仲間の死を目撃した',
        importance: 9,
        valence: 'negative',
        createdAtDay: 1,
        lastReferencedDay: 1,
      },
      {
        id: 'cm-A-recent',
        characterId: 'A',
        day: 9,
        type: 'shared_success',
        summary: '依頼を成功させた',
        importance: 2,
        valence: 'positive',
        createdAtDay: 9,
        lastReferencedDay: 9,
      },
    ],
  }

  const request = makeRequest('Aronの依頼')
  const projected = projectMemoriesForNarrative(
    party,
    'Aron',
    request,
    ['A'],
    10,
  )

  const selected = projected.characterMemories['A']
  assert(selected !== undefined, 'Case G: character memories projected')
  assert(
    selected[0]?.type === 'casualty',
    'Case G: old high-importance memory outranks recent low-importance memory',
  )
  console.log(
    'Case G PASS: old high-importance memory outranks recent low-importance memory',
  )
}

// Case H: old save without memory loads normally.
{
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  // Intentionally omit characterMemories, memberRelationships, and sharedExpeditionCounts.
  const state = {
    logs: [],
    partyHp: { A: 10, B: 10 },
    casualties: [],
    injuries: [],
    battles: [],
    objectiveState: { type: 'rescue', returned: true, targetName: 'Lia' },
  } as unknown as ExpeditionState
  const result = {
    outcome: 'success' as ExpeditionOutcome,
    state,
    request: {} as unknown as ReturnType<typeof makeRequest>,
    party: [],
  } as unknown as ExpeditionResult

  assert(
    party.characterMemories === undefined,
    'Case H: party starts without character memories',
  )
  assert(
    party.memberRelationships === undefined,
    'Case H: party starts without member relationships',
  )

  applyExpeditionMemory(party, result, 1, 'exp-h')

  assert(
    party.characterMemories !== undefined,
    'Case H: character memory initialized after expedition',
  )
  assert(
    Object.keys(party.characterMemories!).length > 0,
    'Case H: character memories populated without error',
  )
  assert(
    party.sharedExpeditionCounts !== undefined,
    'Case H: shared expedition counts initialized',
  )
  console.log('Case H PASS: old save without memory loads normally')
}

console.log('\n=== Phase 7.4 Memory Smoke: ALL PASS ===')
