import type { CampaignParty } from '../src/core/tavern/campaign/types.ts'
import type { Adventurer } from '../src/core/models/types.ts'
import {
  applyDowntimeEvent,
  buildDowntimePrompt,
  createDowntimeEvent,
  DEFAULT_DOWNTIME_CONFIG,
  DOWNTIME_PROMPT_VERSION,
  generateDowntimeNarrative,
  resolveDowntimeForCampaign,
  resolveDowntimeForParty,
} from '../src/core/narrative/downtime.ts'
import { updateArcSignals } from '../src/core/narrative/arcSignals.ts'
import { updateRelationshipMilestones } from '../src/core/narrative/milestones.ts'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`)
  }
}

function makeAdventurer(id: string, name: string): Adventurer {
  return {
    id,
    seed: `seed-${id}`,
    name,
    rank: 'D',
    role: 'vanguard',
    level: 1,
    stats: {
      str: 10,
      con: 10,
      dex: 10,
      int: 10,
      per: 10,
      wil: 10,
      soc: 10,
    },
    skills: {
      melee: 1,
      ranged: 1,
      defense: 1,
      tactics: 1,
      attackMagic: 0,
      defenseMagic: 0,
      healing: 0,
      scouting: 0,
      stealth: 0,
      trapDetection: 0,
      trapDisarm: 0,
      survival: 0,
    },
    maxHp: 30,
    currentHp: 30,
    maxMp: 10,
    currentMp: 10,
    morale: 50,
    traits: [],
    personality: {
      temperament: 'balanced',
      values: [],
      flaws: [],
      fears: [],
      socialStyle: 'cooperative',
    },
    identity: {
      species: 'human',
      gender: 'male',
      countryOfOrigin: 'alden',
    },
    equipment: { weapon: '', armor: '', accessory: '' },
    statusEffects: [],
  }
}

function makeParty(
  members: { id: string; name: string }[],
  recoveringThroughDay?: number,
): CampaignParty {
  const adventurers = members.map((m) => makeAdventurer(m.id, m.name))
  const memberRelationships: CampaignParty['memberRelationships'] = {}
  for (const source of adventurers) {
    for (const target of adventurers) {
      if (source.id === target.id) continue
      memberRelationships![`${source.id}:${target.id}`] = {
        sourceCharacterId: source.id,
        targetCharacterId: target.id,
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
  return {
    id: 'smoke-party',
    party: {
      id: 'smoke-party-party',
      name: 'Smoke Party',
      members: adventurers,
    },
    arrivalSerial: 1,
    arrivalDay: 1,
    plannedDepartureDay: 10,
    condition: { incapacitatedIds: [], injuries: [] },
    recoveringThroughDay,
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
    memberRelationships,
    sharedExpeditionCounts: {},
  } as unknown as CampaignParty
}

function relationshipConfig(
  chance: number,
  options?: {
    flavorChance?: number
    maxFlavorEvents?: number
    weightOverride?: Partial<Record<string, number>>
    eventCooldownDays?: number
    pairRepetitionWindowDays?: number
  },
) {
  return {
    ...DEFAULT_DOWNTIME_CONFIG,
    relationshipEventChance: chance,
    flavorEventChance: options?.flavorChance ?? 0,
    maxFlavorEvents: options?.maxFlavorEvents ?? 2,
    eventCooldownDays: options?.eventCooldownDays ?? 0,
    pairRepetitionWindowDays: options?.pairRepetitionWindowDays ?? 0,
    relationshipEventWeightOverride: options?.weightOverride,
  }
}

async function runSmoke(): Promise<void> {
  const results: string[] = []

  // Case A: expedition party excluded.
  {
    const party = makeParty([
      { id: 'A1', name: 'Alpha' },
      { id: 'A2', name: 'Beta' },
    ])
    const campaign = { seed: 'smoke', dayNumber: 1, parties: [party] }
    resolveDowntimeForCampaign(campaign, new Set(['smoke-party']))
    assert(
      !party.downtimeEvents || party.downtimeEvents.length === 0,
      'Case A: dispatched party should not receive downtime events',
    )
    results.push('A: dispatched party excluded')
  }

  // Case B: idle party eligible.
  {
    const party = makeParty([
      { id: 'B1', name: 'Bran' },
      { id: 'B2', name: 'Bria' },
    ])
    const events = resolveDowntimeForParty(
      party,
      1,
      'smoke-b',
      relationshipConfig(100),
    )
    assert(
      events.length > 0,
      'Case B: idle party should receive downtime events',
    )
    results.push('B: idle eligible')
  }

  // Case C: recovering party eligible.
  {
    const party = makeParty(
      [
        { id: 'C1', name: 'Cal' },
        { id: 'C2', name: 'Cara' },
      ],
      5,
    )
    const events = resolveDowntimeForParty(
      party,
      1,
      'smoke-c',
      relationshipConfig(100),
    )
    assert(
      events.length > 0,
      'Case C: recovering party should receive downtime events',
    )
    assert(
      !events.some((e) => e.type === 'competitive_activity'),
      'Case C: recovering party should not get physically excluded events',
    )
    results.push('C: recovering eligible')
  }

  // Case D: deterministic selection.
  {
    const partyA = makeParty([
      { id: 'D1', name: 'Dale' },
      { id: 'D2', name: 'Dara' },
    ])
    const partyB = structuredClone(partyA) as unknown as CampaignParty
    partyB.downtimeEvents = []
    const eventsA = resolveDowntimeForParty(
      partyA,
      1,
      'smoke-d',
      relationshipConfig(100),
    )
    const eventsB = resolveDowntimeForParty(
      partyB,
      1,
      'smoke-d',
      relationshipConfig(100),
    )
    assert(
      eventsA.map((e) => e.type).join(',') ===
        eventsB.map((e) => e.type).join(','),
      'Case D: same seed should produce identical downtime events',
    )
    assert(
      eventsA[0]?.participantIds.join(',') ===
        eventsB[0]?.participantIds.join(','),
      'Case D: same seed should produce identical participants',
    )
    results.push('D: deterministic')
  }

  // Case E: idempotency.
  {
    const party = makeParty([
      { id: 'E1', name: 'El' },
      { id: 'E2', name: 'Ela' },
    ])
    const config = relationshipConfig(100)
    resolveDowntimeForParty(party, 1, 'smoke-e', config)
    const second = resolveDowntimeForParty(party, 1, 'smoke-e', config)
    assert(second.length === 0, 'Case E: second resolve should be idempotent')
    assert(
      (party.downtimeEvents?.filter((e) => e.day === 1) ?? []).length === 1,
      'Case E: exactly one event stored for the day',
    )
    results.push('E: idempotent')
  }

  // Case F: positive event.
  {
    const party = makeParty([
      { id: 'F1', name: 'Fen' },
      { id: 'F2', name: 'Fae' },
    ])
    const a = 'F1'
    const b = 'F2'
    const before = party.memberRelationships?.[`${a}:${b}`]?.affinity ?? 50
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    applyDowntimeEvent(party, event, 1)
    const after = party.memberRelationships?.[`${a}:${b}`]?.affinity ?? 50
    assert(after === before + 1, 'Case F: shared_meal increases affinity by 1')
    assert(event.valence === 'positive', 'Case F: event valence is positive')
    results.push('F: positive shared_meal')
  }

  // Case G: negative event.
  {
    const party = makeParty([
      { id: 'G1', name: 'Gor' },
      { id: 'G2', name: 'Gia' },
    ])
    const a = 'G1'
    const b = 'G2'
    const beforeTension =
      party.memberRelationships?.[`${a}:${b}`]?.tension ?? 50
    const beforeAffinity =
      party.memberRelationships?.[`${a}:${b}`]?.affinity ?? 50
    const event = createDowntimeEvent(
      party,
      'minor_argument',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    applyDowntimeEvent(party, event, 1)
    assert(
      (party.memberRelationships?.[`${a}:${b}`]?.tension ?? 50) ===
        beforeTension + 2,
      'Case G: minor_argument increases tension by 2',
    )
    assert(
      (party.memberRelationships?.[`${a}:${b}`]?.affinity ?? 50) ===
        beforeAffinity - 1,
      'Case G: minor_argument decreases affinity by 1',
    )
    assert(event.valence === 'negative', 'Case G: event valence is negative')
    results.push('G: negative minor_argument')
  }

  // Case H: mixed event.
  {
    const party = makeParty([
      { id: 'H1', name: 'Hal' },
      { id: 'H2', name: 'Hia' },
    ])
    const a = 'H1'
    const b = 'H2'
    const beforeRespect =
      party.memberRelationships?.[`${a}:${b}`]?.respect ?? 50
    const beforeTension =
      party.memberRelationships?.[`${a}:${b}`]?.tension ?? 50
    const event = createDowntimeEvent(
      party,
      'competitive_activity',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    applyDowntimeEvent(party, event, 1)
    assert(
      (party.memberRelationships?.[`${a}:${b}`]?.respect ?? 50) ===
        beforeRespect + 1,
      'Case H: competitive_activity increases respect by 1',
    )
    assert(
      (party.memberRelationships?.[`${a}:${b}`]?.tension ?? 50) ===
        beforeTension + 1,
      'Case H: competitive_activity increases tension by 1',
    )
    assert(event.valence === 'mixed', 'Case H: event valence is mixed')
    results.push('H: mixed competitive_activity')
  }

  // Case I: event budget.
  {
    const party = makeParty([
      { id: 'I1', name: 'Ike' },
      { id: 'I2', name: 'Ila' },
    ])
    const events = resolveDowntimeForParty(
      party,
      1,
      'smoke-i',
      relationshipConfig(100, { flavorChance: 100, maxFlavorEvents: 2 }),
    )
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
    const flavorEvents = events.filter((e) =>
      [
        'personal_space',
        'no_notable_event',
        'solo_equipment_maintenance',
        'reading',
        'sleeping',
        'quiet_drinking',
        'writing_notes',
        'watching_other_adventurers',
        'resting_in_room',
        'checking_bandages',
        'slow_meal',
        'watching_party_prepare',
      ].includes(e.type),
    )
    assert(
      relationshipEvents.length <= 1,
      'Case I: at most one relationship event per party per day',
    )
    assert(
      flavorEvents.length <= 2,
      'Case I: at most two flavor events per party per day',
    )
    results.push('I: event budget')
  }

  // Case J: no event is normal.
  {
    const party = makeParty([
      { id: 'J1', name: 'Jan' },
      { id: 'J2', name: 'Jae' },
    ])
    const events = resolveDowntimeForParty(
      party,
      1,
      'smoke-j',
      relationshipConfig(0),
    )
    assert(events.length === 0, 'Case J: no event should be possible')
    results.push('J: no event')
  }

  // Case K: minor shared meal does not become relationship memory.
  {
    const party = makeParty([
      { id: 'K1', name: 'Kai' },
      { id: 'K2', name: 'Kira' },
    ])
    const a = 'K1'
    const b = 'K2'
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    applyDowntimeEvent(party, event, 1)
    const forward = party.memberRelationships?.[`${a}:${b}`]?.recentEvents ?? []
    assert(
      !forward.some((m) => m.day === 1),
      'Case K: shared_meal should not add relationship memory',
    )
    results.push('K: no memory for shared_meal')
  }

  // Case L: important downtime event becomes memory.
  {
    const party = makeParty([
      { id: 'L1', name: 'Leo' },
      { id: 'L2', name: 'Lia' },
    ])
    const a = 'L1'
    const b = 'L2'
    const event = createDowntimeEvent(
      party,
      'equipment_help',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    applyDowntimeEvent(party, event, 1)
    const forward = party.memberRelationships?.[`${a}:${b}`]?.recentEvents ?? []
    assert(
      forward.some((m) => m.type === 'supported' && m.day === 1),
      'Case L: equipment_help should add supported memory',
    )
    results.push('L: important event memory')
  }

  // Case M: repeated support downtime contributes to arc signal.
  {
    const party = makeParty([
      { id: 'M1', name: 'Milo' },
      { id: 'M2', name: 'Mia' },
    ])
    const a = 'M1'
    const b = 'M2'
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
    party.memberRelationships![`${a}:${b}`]!.trust = 80
    party.memberRelationships![`${b}:${a}`]!.trust = 80
    updateArcSignals(party, 5)
    const signals = (party.arcSignals ?? []).filter(
      (s) => s.type === 'growing_reliance',
    )
    assert(
      signals.length > 0,
      'Case M: repeated support should produce growing_reliance arc signal',
    )
    assert(signals[0]!.strength >= 70, 'Case M: signal should be established')
    results.push('M: arc integration')
  }

  // Case N: milestone integration from downtime-driven signals and shared history.
  {
    const party = makeParty([
      { id: 'N1', name: 'Nolan' },
      { id: 'N2', name: 'Nia' },
    ])
    const a = 'N1'
    const b = 'N2'
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
    party.memberRelationships![`${a}:${b}`]!.trust = 80
    party.memberRelationships![`${b}:${a}`]!.trust = 80
    party.sharedExpeditionCounts = { [`${[a, b].sort().join(':')}`]: 3 }
    updateArcSignals(party, 5)
    updateRelationshipMilestones(party, 5)
    const milestone = (party.relationshipMilestones ?? []).find(
      (m) => m.type === 'established_mutual_reliance',
    )
    assert(
      milestone !== undefined,
      'Case N: downtime-driven signal plus shared history should promote milestone',
    )
    results.push('N: milestone integration')
  }

  // Case O: zero AI calls when scene not opened.
  {
    const party = makeParty([
      { id: 'O1', name: 'Otto' },
      { id: 'O2', name: 'Ola' },
    ])
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      ['O1', 'O2'],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    assert(
      event.narrativeStatus === 'unseen',
      'Case O: new event should be unseen before generation',
    )
    assert(
      event.generatedText === undefined,
      'Case O: no generated text before opening',
    )
    results.push('O: zero calls unseen')
  }

  // Case P: lazy generation on first open.
  {
    const party = makeParty([
      { id: 'P1', name: 'Poe' },
      { id: 'P2', name: 'Pia' },
    ])
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      ['P1', 'P2'],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    let calls = 0
    const fakeProvider = {
      generate: async () => {
        calls++
        return { text: 'fake scene' }
      },
    }
    const text = await generateDowntimeNarrative(
      event,
      party,
      fakeProvider as { generate: () => Promise<{ text: string }> },
    )
    assert(text === 'fake scene', 'Case P: generated text returned')
    assert(calls === 1, 'Case P: exactly one AI call on first open')
    assert(
      event.narrativeStatus === 'generated',
      'Case P: narrative status becomes generated',
    )
    results.push('P: lazy generation')
  }

  // Case Q: reopen does not call provider again.
  {
    const party = makeParty([
      { id: 'Q1', name: 'Quo' },
      { id: 'Q2', name: 'Qua' },
    ])
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      ['Q1', 'Q2'],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    let calls = 0
    const fakeProvider = {
      generate: async () => {
        calls++
        return { text: 'cached scene' }
      },
    }
    await generateDowntimeNarrative(
      event,
      party,
      fakeProvider as { generate: () => Promise<{ text: string }> },
    )
    const text2 = await generateDowntimeNarrative(
      event,
      party,
      fakeProvider as { generate: () => Promise<{ text: string }> },
    )
    assert(calls === 1, 'Case Q: second open should not trigger AI call')
    assert(text2 === 'cached scene', 'Case Q: cached text returned')
    results.push('Q: reopen cached')
  }

  // Case R: provider failure uses fallback.
  {
    const party = makeParty([
      { id: 'R1', name: 'Rex' },
      { id: 'R2', name: 'Ria' },
    ])
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      ['R1', 'R2'],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    let calls = 0
    const failingProvider = {
      generate: async () => {
        calls++
        throw new Error('provider failure')
      },
    }
    const text = await generateDowntimeNarrative(
      event,
      party,
      failingProvider as { generate: () => Promise<{ text: string }> },
    )
    assert(calls === 1, 'Case R: one failing call attempt')
    assert(
      text.length > 0,
      'Case R: fallback text should be returned on failure',
    )
    assert(
      event.narrativeStatus === 'generated',
      'Case R: status becomes generated even on failure',
    )
    results.push('R: fallback on failure')
  }

  // Case S: romance guard - shared meal does not automatically increase romanticAttraction.
  {
    const party = makeParty([
      { id: 'S1', name: 'Sil' },
      { id: 'S2', name: 'Sia' },
    ])
    const a = 'S1'
    const b = 'S2'
    const memberA = party.party.members.find((m) => m.id === a)!
    const memberB = party.party.members.find((m) => m.id === b)!
    memberA.identity = { ...memberA.identity, gender: 'male' }
    memberB.identity = { ...memberB.identity, gender: 'female' }
    memberA.romanticProfile = {
      attraction: { genders: ['female'], openness: 80 },
    }
    memberB.romanticProfile = {
      attraction: { genders: ['male'], openness: 80 },
    }
    party.memberRelationships![`${a}:${b}`]!.romanticAttraction = 30
    party.memberRelationships![`${b}:${a}`]!.romanticAttraction = 30
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [a, b],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    applyDowntimeEvent(party, event, 1)
    assert(
      party.memberRelationships![`${a}:${b}`]!.romanticAttraction === 30,
      'Case S: shared_meal should not alter romanticAttraction',
    )
    assert(
      party.memberRelationships![`${b}:${a}`]!.romanticAttraction === 30,
      'Case S: reverse romanticAttraction unchanged',
    )
    results.push('S: romance guard')
  }

  // Case T: old save compatibility - absence of downtimeEvents does not break resolution.
  {
    const party = makeParty([
      { id: 'T1', name: 'Tal' },
      { id: 'T2', name: 'Tia' },
    ])
    party.downtimeEvents = undefined
    const events = resolveDowntimeForParty(
      party,
      1,
      'smoke-t',
      relationshipConfig(100),
    )
    assert(events.length > 0, 'Case T: old save party should still resolve')
    results.push('T: old save compatibility')
  }

  // Additional: prompt separation and identity guard.
  {
    const party = makeParty([
      { id: 'X1', name: 'Xan' },
      { id: 'X2', name: 'Xia' },
    ])
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      ['X1', 'X2'],
      1,
      'idle',
      DEFAULT_DOWNTIME_CONFIG,
    )
    const { systemPrompt } = buildDowntimePrompt(event, party)
    assert(
      systemPrompt.includes(DOWNTIME_PROMPT_VERSION),
      'Prompt uses DOWNTIME_PROMPT_VERSION',
    )
    assert(
      systemPrompt.includes('DOWNTIME EVENT') &&
        systemPrompt.includes('CHARACTERS') &&
        systemPrompt.includes('RELATIONSHIP CONTEXT') &&
        systemPrompt.includes('NARRATIVE RULES'),
      'Prompt contains required sections',
    )
    assert(
      systemPrompt.includes('gender: male') ||
        systemPrompt.includes('gender: female') ||
        systemPrompt.includes('gender: nonbinary') ||
        systemPrompt.includes('gender: other'),
      'Prompt includes character gender identity',
    )
    assert(
      systemPrompt.includes('Character identity') &&
        systemPrompt.includes('immutable and authoritative'),
      'Identity guard present',
    )
    assert(
      systemPrompt.includes('abstract phrases') &&
        systemPrompt.includes('trust deepened'),
      'Abstract summary guard present',
    )
    results.push('Prompt: version and guards')
  }

  console.log('Phase 7.7 downtime smoke passed:', results.join(', '))
}

runSmoke().catch((e) => {
  console.error(e)
  process.exit(1)
})
