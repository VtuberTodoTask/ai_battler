import type {
  CampaignParty,
  CampaignRelationshipEvent,
} from '../src/core/tavern/campaign/types.ts'
import type { Adventurer } from '../src/core/models/types.ts'
import {
  buildDowntimePrompt,
  DEFAULT_DOWNTIME_CONFIG,
  DOWNTIME_PROMPT_VERSION,
  generateDowntimeNarrative,
  resolveDowntimeForParty,
} from '../src/core/narrative/downtime.ts'
import { buildCharacterEventPrompt } from '../src/core/narrative/prompt.ts'
import {
  auditMinorSceneDiversity,
  auditMinorScenePhrases,
  buildMinorScenePresentationPlan,
} from '../src/core/narrative/minorScenes.ts'
import { SeededRng } from '../src/core/rng/seededRng.ts'
import { buildNarrativePartySnapshot } from '../src/core/narrative/context.ts'
import { tryExtendStay } from '../src/core/tavern/campaign/relationship.ts'
import type {
  CharacterEventNarrativeContext,
  DowntimeEvent,
} from '../src/core/narrative/types.ts'

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
      rank: 'D',
      leaderId: adventurers[0]!.id,
      archetypeId: 'balanced',
      missionSpecialization: {
        strongObjective: 'investigation',
        weakObjective: 'escort',
        dominantSkill: 'melee',
        weakSkill: 'healing',
      },
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

function forcedConfig(
  relationshipEventChance: number,
  flavorEventChance = 0,
): typeof DEFAULT_DOWNTIME_CONFIG {
  return {
    ...DEFAULT_DOWNTIME_CONFIG,
    relationshipEventChance,
    flavorEventChance,
  }
}

function buildStayContext(
  party: CampaignParty,
  event: Extract<CampaignRelationshipEvent, { type: 'stayExtended' }>,
): CharacterEventNarrativeContext {
  return {
    kind: 'characterEvent',
    eventType: 'stayExtended',
    secondaryTriggers: [],
    party: buildNarrativePartySnapshot(party),
    eventFacts: {
      previousDepartureDay: event.previousDepartureDay,
      newDepartureDay: event.newDepartureDay,
      extensionDays: event.extensionDays,
      affinity: event.affinity,
      primaryReason: event.primaryReason,
      secondaryReason: event.secondaryReason,
      presentationPlan: event.presentationPlan,
      relevantCharacterIds: event.relevantCharacterIds,
    },
    recentHighlights: [],
  }
}

async function runSmoke(): Promise<void> {
  const results: string[] = []

  // Case A: Cache isolation for downtime events.
  {
    const partyA = makeParty([
      { id: 'A1', name: 'Alpha' },
      { id: 'A2', name: 'Beta' },
    ])
    const partyB = makeParty([
      { id: 'A3', name: 'Ari' },
      { id: 'A4', name: 'Ava' },
    ])
    const eventsA = resolveDowntimeForParty(partyA, 1, 'smoke-a')
    const eventsB = resolveDowntimeForParty(partyB, 2, 'smoke-a')
    assert(eventsA.length > 0, 'Case A: events generated for party A')
    assert(eventsB.length > 0, 'Case A: events generated for party B')
    assert(
      eventsA[0]!.presentationPlan!.id !== eventsB[0]!.presentationPlan!.id,
      'Case A: different day/party produces different presentation plan id',
    )

    let calls = 0
    const fakeProvider = {
      id: 'fake',
      generate: async (req: { systemPrompt: string; userPrompt: string }) => {
        calls++
        return {
          text: `${req.systemPrompt.slice(0, 40)}:${calls}`,
          model: 'fake',
        }
      },
    }
    const textA = await generateDowntimeNarrative(
      eventsA[0]!,
      partyA,
      fakeProvider,
    )
    const textB = await generateDowntimeNarrative(
      eventsB[0]!,
      partyB,
      fakeProvider,
    )
    assert(
      textA !== textB,
      'Case A: generated narratives differ for different events',
    )
    results.push('A: cache isolation')
  }

  // Case B: Reopen same event returns cached narrative.
  {
    const party = makeParty([
      { id: 'B1', name: 'Bran' },
      { id: 'B2', name: 'Bria' },
    ])
    const [event] = resolveDowntimeForParty(
      party,
      1,
      'smoke-b',
      forcedConfig(100),
    )
    assert(event !== undefined, 'Case B: event generated')
    let calls = 0
    const fakeProvider = {
      id: 'fake',
      generate: async () => {
        calls++
        return { text: `cached-call-${calls}`, model: 'fake' }
      },
    }
    const text1 = await generateDowntimeNarrative(event!, party, fakeProvider)
    const text2 = await generateDowntimeNarrative(event!, party, fakeProvider)
    assert(text1 === text2, 'Case B: reopen returns cached text')
    assert(calls === 1, 'Case B: provider called only once')
    results.push('B: reopen cache')
  }

  // Case C: Framing diversity across multiple stay extensions.
  {
    const framings = new Set<string>()
    const party = makeParty([
      { id: 'C1', name: 'Cal' },
      { id: 'C2', name: 'Cara' },
    ])
    for (let day = 6; day <= 25; day++) {
      const rng = new SeededRng(`smoke-c:${day}`)
      const plan = buildMinorScenePresentationPlan(rng, party, {
        eventType: 'stayExtended',
        isStayExtension: true,
        extensionReason: 'training',
        dayNumber: day,
      })
      framings.add(plan.framing)
    }
    assert(framings.size >= 4, `Case C: framing variety (${framings.size})`)
    results.push('C: framing variety')
  }

  // Case D: Speaker budget stays within 1-4 and group_discussion is rare.
  {
    let overTwo = 0
    let total = 0
    for (let i = 0; i < 50; i++) {
      const party = makeParty([
        { id: `D1-${i}`, name: 'Dale' },
        { id: `D2-${i}`, name: 'Dara' },
        { id: `D3-${i}`, name: 'Dion' },
        { id: `D4-${i}`, name: 'Dina' },
      ])
      party.plannedDepartureDay = 5
      party.relationship.stayExtensionDaysUsed = 0
      const event = tryExtendStay(party, 6, 6, `smoke-d-${i}`)
      if (!event) continue
      total++
      const count = event.presentationPlan.speakingCharacterIds.length
      assert(count >= 1 && count <= 4, 'Case D: speaker count in budget')
      if (count > 2) overTwo++
    }
    assert(total > 0, 'Case D: events generated')
    assert(overTwo < total * 0.3, 'Case D: group_discussion is not dominant')
    results.push('D: speaker budget')
  }

  // Case E: Training-oriented party tends toward training reason.
  {
    let training = 0
    for (let i = 0; i < 50; i++) {
      const party = makeParty([
        { id: `E1-${i}`, name: 'El' },
        { id: `E2-${i}`, name: 'Eva' },
      ])
      party.plannedDepartureDay = 5
      party.relationship.stayExtensionDaysUsed = 0
      party.progression.trainingDays = 10
      party.progression.growthMilestones = 2
      const event = tryExtendStay(party, 6, 6, `smoke-e-${i}`)
      if (event && event.primaryReason === 'training') training++
    }
    assert(training > 0, 'Case E: training reason appears')
    results.push('E: training reason')
  }

  // Case F: Injured party tends toward recovery reason.
  {
    let recovery = 0
    for (let i = 0; i < 50; i++) {
      const party = makeParty([
        { id: `F1-${i}`, name: 'Fin' },
        { id: `F2-${i}`, name: 'Fae' },
      ])
      party.plannedDepartureDay = 5
      party.relationship.stayExtensionDaysUsed = 0
      party.condition.injuries = [
        {
          id: 'i1',
          adventurerId: party.party.members[0]!.id,
          type: 'light',
          cause: 'test',
          hpLoss: 5,
          status: 'active',
        },
      ]
      const event = tryExtendStay(party, 6, 6, `smoke-f-${i}`)
      if (event && event.primaryReason === 'recovery') recovery++
    }
    assert(
      recovery > 10,
      `Case F: recovery dominates injured stays (${recovery})`,
    )
    results.push('F: recovery reason')
  }

  // Case G: Direct decision repetition guard.
  {
    let direct = 0
    for (let i = 0; i < 50; i++) {
      const party = makeParty([
        { id: `G1-${i}`, name: 'Gor' },
        { id: `G2-${i}`, name: 'Gia' },
      ])
      party.plannedDepartureDay = 5
      party.relationship.stayExtensionDaysUsed = 0
      const event = tryExtendStay(party, 6, 6, `smoke-g-${i}`)
      if (event?.presentationPlan.communicateDecisionDirectly) direct++
    }
    assert(
      direct < 50,
      'Case G: not every stay extension states the decision directly',
    )
    results.push('G: direct decision guard')
  }

  // Case H: Duration repetition guard.
  {
    let mentionDays = 0
    for (let i = 0; i < 100; i++) {
      const party = makeParty([
        { id: `H1-${i}`, name: 'Hal' },
        { id: `H2-${i}`, name: 'Hia' },
      ])
      party.plannedDepartureDay = 5
      party.relationship.stayExtensionDaysUsed = 0
      const event = tryExtendStay(party, 6, 6, `smoke-h-${i}`)
      if (event?.presentationPlan.mentionExtensionDays) mentionDays++
    }
    assert(
      mentionDays < 50,
      `Case H: extension days are rarely mentioned (${mentionDays})`,
    )
    results.push('H: duration repetition guard')
  }

  // Case I: Mundane ending diversity.
  {
    const endings = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const party = makeParty([
        { id: `I1-${i}`, name: 'Ike' },
        { id: `I2-${i}`, name: 'Ila' },
      ])
      party.plannedDepartureDay = 5
      party.relationship.stayExtensionDaysUsed = 0
      const event = tryExtendStay(party, 6, 6, `smoke-i-${i}`)
      if (event) endings.add(event.presentationPlan.endingStyle)
    }
    assert(endings.size >= 3, `Case I: ending style variety (${endings.size})`)
    results.push('I: ending diversity')
  }

  // Case J: Zero AI calls when narrative is already generated.
  {
    const party = makeParty([
      { id: 'J1', name: 'Jor' },
      { id: 'J2', name: 'Jia' },
    ])
    const [event] = resolveDowntimeForParty(
      party,
      1,
      'smoke-j',
      forcedConfig(100),
    )
    assert(event !== undefined, 'Case J: event generated')
    event!.narrativeStatus = 'generated'
    event!.generatedText = 'zero-call-cache'
    const provider = {
      id: 'should-not-run',
      generate: async () => {
        throw new Error('provider should not be called')
      },
    }
    const text = await generateDowntimeNarrative(event!, party, provider)
    assert(text === 'zero-call-cache', 'Case J: zero calls returns cache')
    results.push('J: zero calls')
  }

  // Case K: Provider failure fallback.
  {
    const party = makeParty([
      { id: 'K1', name: 'Kor' },
      { id: 'K2', name: 'Kia' },
    ])
    const [event] = resolveDowntimeForParty(
      party,
      1,
      'smoke-k',
      forcedConfig(100),
    )
    assert(event !== undefined, 'Case K: event generated')
    const failingProvider = {
      id: 'failing',
      generate: async () => {
        throw new Error('network error')
      },
    }
    const text = await generateDowntimeNarrative(event!, party, failingProvider)
    assert(
      text === event!.fallbackSummary,
      'Case K: fallback on provider failure',
    )
    results.push('K: provider failure fallback')
  }

  // Case L: Old save compatibility - event without presentationPlan still generates a prompt.
  {
    const party = makeParty([
      { id: 'L1', name: 'Leo' },
      { id: 'L2', name: 'Lia' },
    ])
    const [event] = resolveDowntimeForParty(
      party,
      1,
      'smoke-l',
      forcedConfig(100),
    )
    assert(event !== undefined, 'Case L: event generated')
    const oldEvent = { ...event!, presentationPlan: undefined } as DowntimeEvent
    const { systemPrompt } = buildDowntimePrompt(oldEvent, party)
    assert(
      systemPrompt.includes(DOWNTIME_PROMPT_VERSION),
      'Case L: prompt still valid without presentationPlan',
    )
    const text = await generateDowntimeNarrative(oldEvent, party, null)
    assert(text.length > 0, 'Case L: fallback generated for old save')
    results.push('L: old save compatibility')
  }

  // Additional: stay extension prompt includes SCENE PRESENTATION and minor event rules.
  {
    const party = makeParty([
      { id: 'X1', name: 'Xan' },
      { id: 'X2', name: 'Xia' },
    ])
    party.plannedDepartureDay = 5
    party.relationship.stayExtensionDaysUsed = 0
    const event = tryExtendStay(party, 6, 6, 'smoke-x')
    assert(event !== null, 'Additional: stay extension event generated')
    if (!event) return
    const context = buildStayContext(party, event)
    const prompt = buildCharacterEventPrompt(context)
    assert(
      prompt.includes('SCENE PRESENTATION'),
      'Additional: stay prompt has SCENE PRESENTATION',
    )
    assert(
      prompt.includes('MINOR EVENT NARRATIVE RULES'),
      'Additional: stay prompt has MINOR EVENT NARRATIVE RULES',
    )
    assert(
      prompt.includes('primaryReason'),
      'Additional: stay prompt has reason facts',
    )
    assert(
      prompt.includes('Framing:') &&
        prompt.includes('Opening:') &&
        prompt.includes('Ending Style:'),
      'Additional: stay prompt has presentation plan fields',
    )
    results.push('Prompt: stay extension presentation')
  }

  // Additional: diversity audit run across generated downtime events.
  {
    const party = makeParty([
      { id: 'Y1', name: 'Yan' },
      { id: 'Y2', name: 'Yva' },
      { id: 'Y3', name: 'Yor' },
      { id: 'Y4', name: 'Yia' },
    ])
    const events = resolveDowntimeForParty(
      party,
      1,
      'smoke-y',
      forcedConfig(100),
    )
    assert(events.length > 0, 'Additional: events for audit')
    const audit = auditMinorSceneDiversity(
      events.map((e) => e.presentationPlan!),
      () => undefined,
    )
    assert(
      Object.keys(audit.framingDistribution).length >= 1,
      'Additional: framing distribution computed',
    )
    assert(
      Object.keys(audit.endingStyleDistribution).length >= 1,
      'Additional: ending distribution computed',
    )
    results.push('Audit: diversity computed')
  }

  // Additional: phrase repetition audit.
  {
    const { warnings } = auditMinorScenePhrases(
      '酒場の一角で静かな気配を感じながら、彼らは顔を寄せた。',
    )
    assert(warnings.length >= 2, 'Additional: stock phrases detected')
    results.push('Audit: phrase repetition')
  }

  console.log(
    'Phase 7.7.1 minor narrative diversity smoke passed:',
    results.join(', '),
  )
}

runSmoke().catch((e) => {
  console.error(e)
  process.exit(1)
})
