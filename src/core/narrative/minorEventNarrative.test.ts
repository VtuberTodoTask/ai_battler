import { describe, expect, it } from 'vitest'
import type {
  CampaignParty,
  CampaignRelationshipEvent,
} from '../tavern/campaign/types.ts'
import { generateCampaignParty } from '../tavern/campaign/generators.ts'
import {
  buildDowntimePrompt,
  createDowntimeEvent,
  DOWNTIME_PROMPT_VERSION,
  generateDowntimeNarrative,
  resolveDowntimeForParty,
} from './downtime.ts'
import { buildCharacterEventPrompt } from './prompt.ts'
import {
  auditMinorSceneDiversity,
  auditMinorScenePhrases,
  buildMinorScenePresentationPlan,
  selectStayExtensionReason,
} from './minorScenes.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { tryExtendStay } from '../tavern/campaign/relationship.ts'
import { buildNarrativePartySnapshot } from './context.ts'
import type { CharacterEventNarrativeContext } from './types.ts'

type StayEvent = Extract<CampaignRelationshipEvent, { type: 'stayExtended' }>

function makeParty(seed = 'minor-test'): CampaignParty {
  const party = generateCampaignParty(seed, 0, 10, 1)
  party.relationship.affinity = 50
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
  party.minorNarrativeFingerprints ??= []
  return party
}

describe('minor event narrative diversity', () => {
  it('uses DOWNTIME_PROMPT_VERSION v2', () => {
    expect(DOWNTIME_PROMPT_VERSION).toBe('v2')
  })

  it('creates downtime events with a deterministic presentation plan', () => {
    const party = makeParty()
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [party.party.members[0]!.id, party.party.members[1]!.id],
      1,
      'idle',
    )
    expect(event.presentationPlan).toBeDefined()
    expect(event.presentationPlan!.framing).toBeTruthy()
    expect(event.presentationPlan!.endingStyle).toBeTruthy()
    expect(event.presentationPlan!.speakingCharacterIds.length).toBeGreaterThan(
      0,
    )
    expect(party.minorNarrativeFingerprints!.length).toBe(1)
  })

  it('includes SCENE PRESENTATION and MINOR EVENT NARRATIVE RULES in downtime prompt', () => {
    const party = makeParty()
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [party.party.members[0]!.id, party.party.members[1]!.id],
      1,
      'idle',
    )
    const { systemPrompt } = buildDowntimePrompt(event, party)
    expect(systemPrompt).toContain('SCENE PRESENTATION')
    expect(systemPrompt).toContain('MINOR EVENT NARRATIVE RULES')
    expect(systemPrompt).toContain('Framing:')
    expect(systemPrompt).toContain('Opening:')
    expect(systemPrompt).toContain('Ending Style:')
  })

  it('generates deterministic downtime narratives with a fake provider and caches the result', async () => {
    const party = makeParty()
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [party.party.members[0]!.id, party.party.members[1]!.id],
      1,
      'idle',
    )
    let calls = 0
    const fakeProvider = {
      id: 'fake',
      generate: async () => {
        calls++
        return {
          text: `fake:${event.id}:${calls}`,
          model: 'fake',
          usage: { totalTokens: 1 },
        }
      },
    }
    const text1 = await generateDowntimeNarrative(event, party, fakeProvider)
    const text2 = await generateDowntimeNarrative(event, party, fakeProvider)
    expect(text1).toBe(text2)
    expect(calls).toBe(1)
    expect(event.narrativeStatus).toBe('generated')
  })

  it('falls back to fallback summary when the provider fails', async () => {
    const party = makeParty()
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [party.party.members[0]!.id, party.party.members[1]!.id],
      1,
      'idle',
    )
    const failingProvider = {
      id: 'failing',
      generate: async () => {
        throw new Error('provider down')
      },
    }
    const text = await generateDowntimeNarrative(event, party, failingProvider)
    expect(text).toBe(event.fallbackSummary)
    expect(event.narrativeStatus).toBe('generated')
  })

  it('does not call the provider when narrative is already generated', async () => {
    const party = makeParty()
    const event = createDowntimeEvent(
      party,
      'shared_meal',
      [party.party.members[0]!.id, party.party.members[1]!.id],
      1,
      'idle',
    )
    event.narrativeStatus = 'generated'
    event.generatedText = 'cached'
    const provider = {
      id: 'should-not-run',
      generate: async () => {
        throw new Error('should not be called')
      },
    }
    const text = await generateDowntimeNarrative(event, party, provider)
    expect(text).toBe('cached')
  })

  it('produces different downtime events for different days (cache isolation)', () => {
    const partyA = makeParty('iso-a')
    const partyB = makeParty('iso-b')
    const eventsA = resolveDowntimeForParty(partyA, 1, 'iso-seed')
    const eventsB = resolveDowntimeForParty(partyB, 2, 'iso-seed')
    if (eventsA.length > 0 && eventsB.length > 0) {
      expect(eventsA[0]!.presentationPlan!.id).not.toBe(
        eventsB[0]!.presentationPlan!.id,
      )
    }
  })

  it('includes SCENE PRESENTATION and reason facts in stay extension character event prompt', () => {
    const party = makeParty('stay-prompt')
    party.plannedDepartureDay = 5
    party.relationship.stayExtensionDaysUsed = 0
    const event = tryExtendStay(
      party,
      6,
      6,
      'stay-prompt-seed',
    ) as StayEvent | null
    expect(event).not.toBeNull()
    if (!event) return
    const context: CharacterEventNarrativeContext = {
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
    const prompt = buildCharacterEventPrompt(context)
    expect(prompt).toContain('SCENE PRESENTATION')
    expect(prompt).toContain('primaryReason')
    expect(prompt).toContain('MINOR EVENT NARRATIVE RULES')
    expect(prompt).toContain('200～500字')
  })

  it('selects stay extension reasons deterministically for the same seed', () => {
    const party = makeParty('reason-seed')
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
    const rng1 = new SeededRng('reason-seed-1')
    const rng2 = new SeededRng('reason-seed-1')
    const result1 = selectStayExtensionReason(rng1, party)
    const result2 = selectStayExtensionReason(rng2, party)
    expect(result1.primary).toBe(result2.primary)
  })

  it('biases stay extension reasons toward recovery when injuries exist', () => {
    const counts: Record<string, number> = {}
    for (let i = 0; i < 100; i++) {
      const party = makeParty(`reason-bias-${i}`)
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
      const rng = new SeededRng(`reason-bias-${i}`)
      const { primary } = selectStayExtensionReason(rng, party)
      counts[primary] = (counts[primary] ?? 0) + 1
    }
    expect(counts.recovery ?? 0).toBeGreaterThan(counts.training ?? 0)
    expect(counts.recovery ?? 0).toBeGreaterThan(0)
  })

  it('builds diverse minor scene presentation plans (framing variety)', () => {
    const party = makeParty('variety')
    const framings = new Set<string>()
    const plans = []
    for (let i = 0; i < 30; i++) {
      const rng = new SeededRng(`variety-${i}`)
      const plan = buildMinorScenePresentationPlan(rng, party, {
        eventType: 'shared_meal',
        isStayExtension: false,
        dayNumber: i + 1,
      })
      plans.push(plan)
      framings.add(plan.framing)
    }
    expect(framings.size).toBeGreaterThanOrEqual(4)
    const audit = auditMinorSceneDiversity(plans)
    expect(
      Object.keys(audit.framingDistribution).length,
    ).toBeGreaterThanOrEqual(4)
  })

  it('avoids repeating the same framing consecutively', () => {
    const party = makeParty('repeat')
    let lastFraming = ''
    for (let i = 0; i < 20; i++) {
      const rng = new SeededRng(`repeat-${i}`)
      const plan = buildMinorScenePresentationPlan(rng, party, {
        eventType: 'shared_meal',
        isStayExtension: false,
        dayNumber: i + 1,
      })
      expect(plan.framing).not.toBe(lastFraming)
      lastFraming = plan.framing
    }
  })

  it('keeps the speaker budget between 1 and 4', () => {
    const party = makeParty('speakers')
    for (let i = 0; i < 30; i++) {
      const rng = new SeededRng(`speakers-${i}`)
      const plan = buildMinorScenePresentationPlan(rng, party, {
        eventType: 'shared_meal',
        isStayExtension: false,
        dayNumber: i + 1,
      })
      expect(plan.speakingCharacterIds.length).toBeGreaterThanOrEqual(1)
      expect(plan.speakingCharacterIds.length).toBeLessThanOrEqual(4)
    }
  })

  it('flags warned stock phrases in narrative text', () => {
    const text = '酒場の一角で、二人は顔を寄せた。静かな気配が広がった。'
    const { warnings } = auditMinorScenePhrases(text)
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('does not flag normal text without stock phrases', () => {
    const text = '彼は椅子に腰掛け、鍋を前に押した。'
    const { warnings } = auditMinorScenePhrases(text)
    expect(warnings).toEqual([])
  })
})
