import { describe, expect, it } from 'vitest'
import type {
  CampaignParty,
  CampaignRelationshipEvent,
} from '../tavern/campaign/types.ts'
import { generateCampaignParty } from '../tavern/campaign/generators.ts'
import { tryExtendStay } from '../tavern/campaign/relationship.ts'
import { buildCharacterEventPrompt } from './prompt.ts'
import { buildNarrativePartySnapshot } from './context.ts'
import type { CharacterEventNarrativeContext } from './types.ts'

type StayEvent = Extract<CampaignRelationshipEvent, { type: 'stayExtended' }>

function makeParty(seed = 'stay-test'): CampaignParty {
  const party = generateCampaignParty(seed, 0, 1, 1)
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
  party.plannedDepartureDay = 5
  party.relationship.stayExtensionDaysUsed = 0
  return party
}

describe('stay extension narrative diversity', () => {
  it('produces a stayExtended event with reason and presentation plan', () => {
    const party = makeParty('stay-plan')
    const event = tryExtendStay(
      party,
      6,
      6,
      'stay-plan-seed',
    ) as StayEvent | null
    expect(event).not.toBeNull()
    if (!event) return
    expect(event.type).toBe('stayExtended')
    expect(event.primaryReason).toBeTruthy()
    expect(event.presentationPlan).toBeDefined()
    expect(event.presentationPlan.speakingCharacterIds.length).toBeGreaterThan(
      0,
    )
    expect(event.relevantCharacterIds).toBeDefined()
    expect(party.minorNarrativeFingerprints!.length).toBe(1)
  })

  it('is deterministic for the same seed and party state', () => {
    const partyA = makeParty('stay-det')
    const partyB = makeParty('stay-det')
    const eventA = tryExtendStay(
      partyA,
      6,
      6,
      'stay-det-seed',
    ) as StayEvent | null
    const eventB = tryExtendStay(
      partyB,
      6,
      6,
      'stay-det-seed',
    ) as StayEvent | null
    expect(eventA).not.toBeNull()
    expect(eventB).not.toBeNull()
    if (!eventA || !eventB) return
    expect(eventA.primaryReason).toBe(eventB.primaryReason)
    expect(eventA.secondaryReason).toBe(eventB.secondaryReason)
    expect(eventA.presentationPlan.framing).toBe(
      eventB.presentationPlan.framing,
    )
    expect(eventA.presentationPlan.endingStyle).toBe(
      eventB.presentationPlan.endingStyle,
    )
  })

  it('uses recovery as the primary reason when injuries are present', () => {
    const party = makeParty('stay-recovery')
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
    const event = tryExtendStay(
      party,
      6,
      6,
      'stay-recovery-seed',
    ) as StayEvent | null
    expect(event).not.toBeNull()
    if (!event) return
    expect(event.primaryReason).toBe('recovery')
  })

  it('uses party_coordination as the primary reason when recurring conflict arcs exist', () => {
    const party = makeParty('stay-coord')
    const [a, b] = [party.party.members[0]!.id, party.party.members[1]!.id]
    party.arcSignals = [
      {
        id: 'arc-1',
        type: 'recurring_conflict',
        sourceCharacterId: a,
        targetCharacterId: b,
        characterIds: [a, b],
        strength: 70,
        confidence: 80,
        supportingMemoryIds: [],
        firstDetectedDay: 1,
        lastUpdatedDay: 1,
        status: 'established',
        direction: 'negative',
      },
    ]
    const event = tryExtendStay(
      party,
      6,
      6,
      'stay-coord-seed',
    ) as StayEvent | null
    expect(event).not.toBeNull()
    if (!event) return
    expect(event.primaryReason).toBe('party_coordination')
  })

  it('does not always set communicateDecisionDirectly to true across framings', () => {
    const seen = { true: 0, false: 0 }
    for (let i = 0; i < 50; i++) {
      const party = makeParty(`stay-comm-${i}`)
      const event = tryExtendStay(
        party,
        6,
        6,
        `stay-comm-${i}`,
      ) as StayEvent | null
      if (!event) continue
      const key = String(event.presentationPlan.communicateDecisionDirectly)
      seen[key as 'true' | 'false']++
    }
    expect(seen.true).toBeGreaterThan(0)
    expect(seen.false).toBeGreaterThan(0)
  })

  it('keeps extension day mentions rare when decision is not communicated directly', () => {
    let directWithMention = 0
    let directWithoutMention = 0
    for (let i = 0; i < 100; i++) {
      const party = makeParty(`stay-days-${i}`)
      const event = tryExtendStay(
        party,
        6,
        6,
        `stay-days-${i}`,
      ) as StayEvent | null
      if (!event) continue
      if (event.presentationPlan.communicateDecisionDirectly) {
        if (event.presentationPlan.mentionExtensionDays) {
          directWithMention++
        } else {
          directWithoutMention++
        }
      }
    }
    expect(directWithMention).toBeGreaterThanOrEqual(0)
    expect(directWithoutMention).toBeGreaterThan(directWithMention)
  })

  it('produces diverse endings across many stay extensions', () => {
    const styles = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const party = makeParty(`stay-ending-${i}`)
      const event = tryExtendStay(
        party,
        6,
        6,
        `stay-ending-${i}`,
      ) as StayEvent | null
      if (!event) continue
      styles.add(event.presentationPlan.endingStyle)
    }
    expect(styles.size).toBeGreaterThanOrEqual(3)
  })

  it('does not always choose the leader as the focal character', () => {
    const focalIds: string[] = []
    for (let i = 0; i < 50; i++) {
      const party = makeParty(`stay-focal-${i}`)
      const event = tryExtendStay(
        party,
        6,
        6,
        `stay-focal-${i}`,
      ) as StayEvent | null
      if (!event) continue
      focalIds.push(event.presentationPlan.focalCharacterId ?? '')
    }
    const unique = new Set(focalIds)
    expect(unique.size).toBeGreaterThanOrEqual(2)
  })

  it('keeps the speaker budget between 1 and 4', () => {
    let overTwo = 0
    for (let i = 0; i < 50; i++) {
      const party = makeParty(`stay-budget-${i}`)
      const event = tryExtendStay(
        party,
        6,
        6,
        `stay-budget-${i}`,
      ) as StayEvent | null
      if (!event) continue
      expect(
        event.presentationPlan.speakingCharacterIds.length,
      ).toBeGreaterThanOrEqual(1)
      expect(
        event.presentationPlan.speakingCharacterIds.length,
      ).toBeLessThanOrEqual(4)
      if (event.presentationPlan.speakingCharacterIds.length > 2) overTwo++
    }
    expect(overTwo).toBeLessThan(15)
  })

  it('builds a stay extension prompt with the presentation plan and reason facts', () => {
    const party = makeParty('stay-prompt-2')
    const event = tryExtendStay(
      party,
      6,
      6,
      'stay-prompt-seed-2',
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
    expect(prompt).toContain(`Framing: ${event.presentationPlan.framing}`)
    expect(prompt).toContain('primaryReason')
    expect(prompt).toContain('MINOR EVENT NARRATIVE RULES')
  })
})
