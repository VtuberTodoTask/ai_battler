import type { CampaignParty } from '../src/core/tavern/campaign/types.ts'
import type { NarrativeRequestInfo } from '../src/core/narrative/types.ts'
import {
  projectRelationshipMilestonesForNarrative,
  updateRelationshipMilestones,
} from '../src/core/narrative/milestones.ts'
import {
  auditAbstractArcSummary,
  auditNarrativeIdentityConsistency,
} from '../src/core/narrative/qualityAudit.ts'
import type { Adventurer } from '../src/core/models/types.ts'

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
      members: members as unknown as Adventurer[],
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

type ArcOptions = {
  sourceId?: string
  targetId?: string
  strength?: number
  confidence?: number
  status?: 'emerging' | 'established' | 'fading'
  supportingMemoryIds?: string[]
}

function makeSignal(
  type: string,
  characterIds: [string, string],
  options: ArcOptions = {},
) {
  const [a, b] = characterIds
  const source = options.sourceId ?? a
  const target = options.targetId ?? b
  return {
    id: `sig:${type}:${source}:${target}:${[a, b].sort().join(':')}:1`,
    type,
    characterIds: [a, b],
    sourceCharacterId: options.sourceId,
    targetCharacterId: options.targetId,
    strength: options.strength ?? 60,
    confidence: options.confidence ?? 70,
    status: options.status ?? 'established',
    direction: 'positive' as const,
    supportingMemoryIds: options.supportingMemoryIds ?? ['m1', 'm2'],
    supportingEventIds: [],
    firstDetectedDay: 1,
    lastUpdatedDay: 1,
  }
}

function makeRel(
  sourceId: string,
  targetId: string,
  overrides: Record<string, unknown> = {},
) {
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
  ] as [string, { [key: string]: unknown }]
}

function caseA_BelowThreshold(): void {
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.arcSignals = [
    makeSignal('growing_reliance', ['A', 'B'], {
      sourceId: 'A',
      targetId: 'B',
      status: 'emerging',
      strength: 40,
      confidence: 50,
      supportingMemoryIds: ['m1'],
    }),
  ]
  party.memberRelationships = Object.fromEntries([
    makeRel('A', 'B', { sharedExpeditions: 1 }),
    makeRel('B', 'A', { sharedExpeditions: 1 }),
  ])
  party.sharedExpeditionCounts = { 'A:B': 1 }
  updateRelationshipMilestones(party, 10)
  assert(
    party.relationshipMilestones!.length === 0,
    'Case A: single rescue should not produce milestone',
  )
  console.log('Case A PASS: below threshold -> no milestone')
}

function caseB_DirectionalReliance(): void {
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.arcSignals = [
    makeSignal('growing_reliance', ['A', 'B'], {
      sourceId: 'A',
      targetId: 'B',
    }),
  ]
  party.memberRelationships = Object.fromEntries([
    makeRel('A', 'B', { sharedExpeditions: 3, trust: 70 }),
    makeRel('B', 'A', { sharedExpeditions: 3 }),
  ])
  party.sharedExpeditionCounts = { 'A:B': 3 }
  updateRelationshipMilestones(party, 10)
  const milestone = party.relationshipMilestones!.find(
    (m) => m.type === 'established_directional_reliance',
  )
  assert(milestone !== undefined, 'Case B: directional reliance should exist')
  assert(
    milestone!.sourceCharacterId === 'A' &&
      milestone!.targetCharacterId === 'B',
    'Case B: direction must be A -> B',
  )
  console.log('Case B PASS: A -> B established_directional_reliance')
}

function caseC_MutualReliance(): void {
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.arcSignals = [
    makeSignal('growing_reliance', ['A', 'B'], {
      sourceId: 'A',
      targetId: 'B',
    }),
    makeSignal('growing_reliance', ['B', 'A'], {
      sourceId: 'B',
      targetId: 'A',
    }),
  ]
  party.memberRelationships = Object.fromEntries([
    makeRel('A', 'B', { sharedExpeditions: 3, trust: 75 }),
    makeRel('B', 'A', { sharedExpeditions: 3, trust: 75 }),
  ])
  party.sharedExpeditionCounts = { 'A:B': 3 }
  updateRelationshipMilestones(party, 10)
  const milestone = party.relationshipMilestones!.find(
    (m) => m.type === 'established_mutual_reliance',
  )
  assert(milestone !== undefined, 'Case C: mutual reliance should exist')
  assert(
    milestone!.sourceCharacterId === undefined,
    'Case C: mutual milestone is non-directional',
  )
  console.log('Case C PASS: established_mutual_reliance')
}

function caseD_TrustedFriction(): void {
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.arcSignals = [
    makeSignal('growing_reliance', ['A', 'B'], {
      sourceId: 'A',
      targetId: 'B',
    }),
    makeSignal('recurring_conflict', ['A', 'B']),
  ]
  party.memberRelationships = Object.fromEntries([
    makeRel('A', 'B', { sharedExpeditions: 3, trust: 75, tension: 75 }),
    makeRel('B', 'A', { sharedExpeditions: 3, trust: 75, tension: 75 }),
  ])
  party.sharedExpeditionCounts = { 'A:B': 3 }
  updateRelationshipMilestones(party, 10)
  const milestone = party.relationshipMilestones!.find(
    (m) => m.type === 'established_trusted_friction',
  )
  assert(milestone !== undefined, 'Case D: trusted friction should exist')
  console.log('Case D PASS: established_trusted_friction')
}

function caseE_WorkingRhythm(): void {
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.arcSignals = [makeSignal('comfortable_familiarity', ['A', 'B'])]
  party.memberRelationships = Object.fromEntries([
    makeRel('A', 'B', {
      sharedExpeditions: 3,
      recentEvents: [
        { type: 'supported', day: 1 },
        { type: 'supported', day: 2 },
        { type: 'shared_success', day: 3 },
      ],
    }),
    makeRel('B', 'A', { sharedExpeditions: 3 }),
  ])
  party.sharedExpeditionCounts = { 'A:B': 3 }
  updateRelationshipMilestones(party, 10)
  const milestone = party.relationshipMilestones!.find(
    (m) => m.type === 'established_working_rhythm',
  )
  assert(milestone !== undefined, 'Case E: working rhythm should exist')
  console.log('Case E PASS: established_working_rhythm')
}

function caseF_StrainedTrust(): void {
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.arcSignals = [
    makeSignal('eroding_trust', ['A', 'B'], { sourceId: 'A', targetId: 'B' }),
  ]
  party.memberRelationships = Object.fromEntries([
    makeRel('A', 'B', {
      sharedExpeditions: 3,
      trust: 60,
      tension: 60,
      recentEvents: [
        { type: 'conflict', day: 1 },
        { type: 'abandoned', day: 2 },
      ],
    }),
    makeRel('B', 'A', { sharedExpeditions: 3 }),
  ])
  party.sharedExpeditionCounts = { 'A:B': 3 }
  updateRelationshipMilestones(party, 10)
  const milestone = party.relationshipMilestones!.find(
    (m) => m.type === 'established_strained_trust',
  )
  assert(milestone !== undefined, 'Case F: strained trust should exist')
  console.log('Case F PASS: established_strained_trust')
}

function caseG_Legacy(): void {
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
      supportingArcSignalIds: [],
      supportingMemoryIds: [],
    },
  ]
  party.arcSignals = []
  party.memberRelationships = Object.fromEntries([
    makeRel('A', 'B', { sharedExpeditions: 1 }),
    makeRel('B', 'A', { sharedExpeditions: 1 }),
  ])
  party.sharedExpeditionCounts = { 'A:B': 1 }
  updateRelationshipMilestones(party, 20)
  const milestone = party.relationshipMilestones![0]!
  assert(
    milestone.status === 'legacy',
    'Case G: unsupported milestone becomes legacy',
  )
  assert(milestone.deactivatedDay === 20, 'Case G: deactivatedDay recorded')
  console.log('Case G PASS: active -> legacy')
}

function caseH_MixedMilestones(): void {
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.arcSignals = [
    makeSignal('growing_reliance', ['A', 'B'], {
      sourceId: 'A',
      targetId: 'B',
    }),
    makeSignal('growing_reliance', ['B', 'A'], {
      sourceId: 'B',
      targetId: 'A',
    }),
    makeSignal('recurring_conflict', ['A', 'B']),
  ]
  party.memberRelationships = Object.fromEntries([
    makeRel('A', 'B', { sharedExpeditions: 3, trust: 75, tension: 75 }),
    makeRel('B', 'A', { sharedExpeditions: 3, trust: 75, tension: 75 }),
  ])
  party.sharedExpeditionCounts = { 'A:B': 3 }
  updateRelationshipMilestones(party, 10)
  const mutual = party.relationshipMilestones!.find(
    (m) => m.type === 'established_mutual_reliance',
  )
  const friction = party.relationshipMilestones!.find(
    (m) => m.type === 'established_trusted_friction',
  )
  assert(
    mutual !== undefined && friction !== undefined,
    'Case H: mutual reliance and trusted friction can coexist',
  )
  console.log('Case H PASS: mixed milestones coexist')
}

function caseI_RomanticDirectionality(): void {
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.arcSignals = [
    makeSignal('romantic_interest_possible', ['A', 'B'], {
      sourceId: 'A',
      targetId: 'B',
    }),
  ]
  party.memberRelationships = Object.fromEntries([
    makeRel('A', 'B', {
      sharedExpeditions: 3,
      romanticAttraction: 70,
    }),
    makeRel('B', 'A', { sharedExpeditions: 3 }),
  ])
  party.sharedExpeditionCounts = { 'A:B': 3 }
  updateRelationshipMilestones(party, 10)
  const milestone = party.relationshipMilestones!.find(
    (m) => m.type === 'persistent_romantic_interest',
  )
  assert(
    milestone !== undefined,
    'Case I: one-sided romantic milestone should exist',
  )
  assert(
    milestone!.sourceCharacterId === 'A' &&
      milestone!.targetCharacterId === 'B',
    'Case I: romantic milestone is directional A -> B',
  )
  console.log('Case I PASS: A -> B persistent_romantic_interest')
}

function caseJ_MutualRomanticNoPartner(): void {
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  party.arcSignals = [
    makeSignal('romantic_interest_possible', ['A', 'B'], {
      sourceId: 'A',
      targetId: 'B',
    }),
    makeSignal('romantic_interest_possible', ['B', 'A'], {
      sourceId: 'B',
      targetId: 'A',
    }),
  ]
  party.memberRelationships = Object.fromEntries([
    makeRel('A', 'B', {
      sharedExpeditions: 3,
      romanticAttraction: 70,
    }),
    makeRel('B', 'A', {
      sharedExpeditions: 3,
      romanticAttraction: 70,
    }),
  ])
  party.sharedExpeditionCounts = { 'A:B': 3 }
  updateRelationshipMilestones(party, 10)
  const milestones = party.relationshipMilestones!.filter(
    (m) => m.type === 'persistent_romantic_interest',
  )
  assert(milestones.length === 2, 'Case J: two directional romantic milestones')
  console.log(
    'Case J PASS: two directional romantic milestones, no partnered change',
  )
}

function caseK_OldSave(): void {
  const party = makeParty([
    { id: 'A', name: 'Aron' },
    { id: 'B', name: 'Bella' },
  ])
  updateRelationshipMilestones(party, 1)
  assert(
    Array.isArray(party.relationshipMilestones) &&
      party.relationshipMilestones.length === 0,
    'Case K: old save loads with empty milestones',
  )
  console.log('Case K PASS: old save -> empty milestones')
}

function caseL_NarrativeProjection(): void {
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
  const request = makeRequest('smoke')
  const projected = projectRelationshipMilestonesForNarrative(
    party,
    '',
    request,
    ['A', 'B'],
    10,
  )
  assert(
    projected.length === 1,
    'Case L: only scene-relevant milestone projected',
  )
  assert(
    projected[0]!.type === 'established_mutual_reliance',
    'Case L: A/B milestone projected',
  )
  console.log('Case L PASS: narrative projection is scene-relevant')
}

function caseM_IdentityAudit(): void {
  const text =
    'エルナは地図を開いた。彼は道を指した。ドランは立ち止まった。彼女は周囲を見た。'
  const contexts = [
    { characterId: 'erna', name: 'エルナ', gender: 'female' as const },
    { characterId: 'doran', name: 'ドラン', gender: 'male' as const },
  ]
  const result = auditNarrativeIdentityConsistency(text, contexts)
  assert(
    result.warnings.includes('identity_pronoun_mismatch'),
    'Case M: identity pronoun mismatch detected',
  )
  console.log('Case M PASS: identity pronoun mismatch audit')
}

function caseN_AbstractArcAudit(): void {
  const text = '二人は互いを理解していた。'
  const result = auditAbstractArcSummary(text)
  assert(
    result.warnings.includes('abstract_relationship_summary'),
    'Case N: abstract arc summary detected',
  )
  console.log('Case N PASS: abstract arc summary audit')
}

function main(): void {
  console.log('Phase 7.6 Relationship Milestone Smoke')
  caseA_BelowThreshold()
  caseB_DirectionalReliance()
  caseC_MutualReliance()
  caseD_TrustedFriction()
  caseE_WorkingRhythm()
  caseF_StrainedTrust()
  caseG_Legacy()
  caseH_MixedMilestones()
  caseI_RomanticDirectionality()
  caseJ_MutualRomanticNoPartner()
  caseK_OldSave()
  caseL_NarrativeProjection()
  caseM_IdentityAudit()
  caseN_AbstractArcAudit()
  console.log('ALL Phase 7.6 smoke cases passed')
}

main()
