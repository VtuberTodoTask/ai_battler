import { describe, expect, it } from 'vitest'
import { createTavernCampaign } from '../tavern/campaign/campaign.ts'
import { buildNarrativePartySnapshot } from './context.ts'
import type { NarrativeCandidate } from './types.ts'
import {
  BOND_CONVERSATION_EVENT_TYPE,
  bondMilestoneForEventType,
  deriveBondMilestoneCrossings,
  hasBondMilestoneOccurred,
  isBondConversationEventType,
  selectBondConversationFocalCharacter,
} from './bondConversation.ts'

describe('deriveBondMilestoneCrossings', () => {
  it('detects a familiar crossing (before < 20 <= after)', () => {
    expect(deriveBondMilestoneCrossings(15, 25)).toEqual(['familiar'])
  })

  it('detects a trusted crossing (before < 40 <= after)', () => {
    expect(deriveBondMilestoneCrossings(35, 45)).toEqual(['trusted'])
  })

  it('detects a regular crossing (before < 60 <= after)', () => {
    expect(deriveBondMilestoneCrossings(55, 65)).toEqual(['regular'])
  })

  it('detects a favorite crossing (before < 80 <= after)', () => {
    expect(deriveBondMilestoneCrossings(75, 85)).toEqual(['favorite'])
  })

  it('detects no crossing when the delta stays within the same band', () => {
    expect(deriveBondMilestoneCrossings(65, 68)).toEqual([])
  })

  it('detects no crossing on a drop (Affinity only crosses moving up)', () => {
    expect(deriveBondMilestoneCrossings(85, 10)).toEqual([])
  })

  it('detects every crossed milestone, highest priority first, on a rare multi-threshold jump', () => {
    expect(deriveBondMilestoneCrossings(10, 85)).toEqual([
      'favorite',
      'regular',
      'trusted',
      'familiar',
    ])
  })

  it('re-crossing the same threshold after a drop and re-rise is still reported as a crossing by this pure function', () => {
    // hasBondMilestoneOccurred is what prevents the SAME milestone from
    // firing twice for a given Party — this function is intentionally
    // stateless and just reports the arithmetic crossing.
    expect(deriveBondMilestoneCrossings(55, 63)).toEqual(['regular'])
  })
})

describe('hasBondMilestoneOccurred', () => {
  it('is false for a fresh Campaign with no Narrative Candidates', () => {
    const campaign = createTavernCampaign('bond-occurred-001')
    const party = campaign.parties[0]
    expect(hasBondMilestoneOccurred(campaign, party.id, 'regular')).toBe(false)
  })

  it('is true once a matching characterEvent candidate exists for this Party, in ANY state', () => {
    const campaign = createTavernCampaign('bond-occurred-002')
    const party = campaign.parties[0]
    const candidate: NarrativeCandidate = {
      id: 'narrative:v1:1:characterEvent:becameRegular:' + party.id,
      version: 1,
      category: 'characterEvent',
      eventType: 'becameRegular',
      dayNumber: 1,
      partyId: party.id,
      partyName: party.party.name,
      priority: 70,
      title: 'test',
      context: {
        kind: 'characterEvent',
        eventType: 'becameRegular',
        secondaryTriggers: [],
        party: buildNarrativePartySnapshot(party),
        eventFacts: {},
        recentHighlights: [],
      },
      state: 'dismissed',
    }
    const next = {
      ...campaign,
      narrativeCandidates: [...campaign.narrativeCandidates, candidate],
    }
    expect(hasBondMilestoneOccurred(next, party.id, 'regular')).toBe(true)
    // A different Party, or a different milestone, is unaffected.
    expect(hasBondMilestoneOccurred(next, party.id, 'favorite')).toBe(false)
    expect(hasBondMilestoneOccurred(next, 'some-other-party', 'regular')).toBe(
      false,
    )
  })
})

describe('BOND_CONVERSATION_EVENT_TYPE / bondMilestoneForEventType round trip', () => {
  it('round-trips all four milestones', () => {
    for (const milestone of [
      'familiar',
      'trusted',
      'regular',
      'favorite',
    ] as const) {
      const eventType = BOND_CONVERSATION_EVENT_TYPE[milestone]
      expect(bondMilestoneForEventType(eventType)).toBe(milestone)
      expect(isBondConversationEventType(eventType)).toBe(true)
    }
  })

  it('returns undefined/false for non-Bond-Conversation event types', () => {
    expect(bondMilestoneForEventType('farewell')).toBeUndefined()
    expect(bondMilestoneForEventType(undefined)).toBeUndefined()
    expect(isBondConversationEventType('casualtyDeparture')).toBe(false)
    expect(isBondConversationEventType(undefined)).toBe(false)
  })
})

describe('selectBondConversationFocalCharacter', () => {
  it('never selects a deceased member', () => {
    const campaign = createTavernCampaign('bond-focal-dead-001')
    const party = campaign.parties[0]
    expect(party.party.members.length).toBeGreaterThan(1)
    const deadId = party.party.members[0].id
    const deadParty = {
      ...party,
      party: {
        ...party.party,
        members: party.party.members.map((m, i) =>
          i === 0 ? { ...m, currentHp: 0 } : m,
        ),
      },
    }
    const nextCampaign = {
      ...campaign,
      parties: campaign.parties.map((p) => (p.id === party.id ? deadParty : p)),
    }

    for (let day = 1; day <= 20; day++) {
      const focalId = selectBondConversationFocalCharacter(
        nextCampaign,
        deadParty,
        day,
        'regular',
      )
      expect(focalId).not.toBe(deadId)
    }
  })

  it('returns undefined when every member of the Party is deceased', () => {
    const campaign = createTavernCampaign('bond-focal-dead-002')
    const party = campaign.parties[0]
    const allDeadParty = {
      ...party,
      party: {
        ...party.party,
        members: party.party.members.map((m) => ({ ...m, currentHp: 0 })),
      },
    }
    const focalId = selectBondConversationFocalCharacter(
      campaign,
      allDeadParty,
      1,
      'regular',
    )
    expect(focalId).toBeUndefined()
  })

  it('is deterministic for the same seed/day/party/milestone', () => {
    const campaign = createTavernCampaign('bond-focal-determinism-001')
    const party = campaign.parties[0]

    const first = selectBondConversationFocalCharacter(
      campaign,
      party,
      3,
      'trusted',
    )
    const second = selectBondConversationFocalCharacter(
      campaign,
      party,
      3,
      'trusted',
    )
    expect(first).toBeDefined()
    expect(first).toBe(second)
  })

  it('always selects a living member of the Party', () => {
    const campaign = createTavernCampaign('bond-focal-membership-001')
    const party = campaign.parties[0]
    const memberIds = new Set(party.party.members.map((m) => m.id))

    for (let day = 1; day <= 10; day++) {
      const focalId = selectBondConversationFocalCharacter(
        campaign,
        party,
        day,
        'familiar',
      )
      expect(focalId).toBeDefined()
      expect(memberIds.has(focalId!)).toBe(true)
    }
  })
})
