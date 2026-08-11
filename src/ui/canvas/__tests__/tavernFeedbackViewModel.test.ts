// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../../core/tavern/brokerage.ts'
import { getOfferErrors } from '../../../core/tavern/brokerage.ts'
import type {
  DowntimeEvent,
  NarrativeCandidate,
  NarrativeContext,
  NarrativeGenerationRecord,
  NarrativePartySnapshot,
} from '../../../core/narrative/types.ts'
import type { BrokerageOfferAttempt } from '../../../core/tavern/types.ts'
import {
  buildTavernFeedbackItems,
  sortFeedbackItems,
  type TavernFeedbackItem,
} from '../viewModel/tavernFeedbackViewModel.ts'

describe('TavernFeedbackViewModel', () => {
  it('projects party arrivals and downtime events', () => {
    const campaign = createTavernCampaign('feedback-arrival')
    const party = campaign.currentDay.parties[0]!
    const event: DowntimeEvent = {
      id: 'downtime:test-feedback',
      day: campaign.dayNumber,
      type: 'shared_meal',
      participantIds: party.party.members.slice(0, 2).map((m) => m.id),
      valence: 'positive',
      importance: 2,
      relationshipDeltas: [],
      memoryEligible: true,
      narrativeKey: 'shared_meal',
      createdAtDay: campaign.dayNumber,
      narrativeStatus: 'unseen',
      fallbackSummary: 'AとBが食事を共にした。',
    }
    party.downtimeEvents = [event]

    const items = buildTavernFeedbackItems(campaign)
    const arrival = items.find((i) => i.kind === 'party_arrival')
    const downtime = items.find((i) => i.id === event.id)

    expect(arrival).toBeDefined()
    expect(arrival?.importance).toBe('high')
    expect(downtime).toBeDefined()
    expect(downtime?.kind).toBe('downtime')
    expect(downtime?.canOpen).toBe(true)
  })

  it('projects quest offer results with structured reasons', () => {
    const campaign = createTavernCampaign('feedback-offer')
    const party = campaign.currentDay.parties[0]!
    const offer: BrokerageOfferAttempt = {
      id: 'offer:test',
      requestId: campaign.currentDay.requests[0]!.id,
      partyId: party.id,
      decision: 'declined',
      reason: 'tooDangerous',
      evaluation: {
        decision: 'declined',
        reason: 'tooDangerous',
        requestRank: 'C',
        partyRank: 'C',
        rankGap: 0,
        relevantRoleCount: 0,
        leaderJudgment: 0,
        acceptanceScore: 0,
        acceptanceThreshold: 0,
        modifiers: {
          base: 0,
          roleFit: 0,
          leaderJudgment: 0,
          relevantCapability: 0,
          growth: 0,
          affinity: 0,
          financialPressure: 0,
          risk: 0,
          hpReadiness: 0,
          moraleReadiness: 0,
          specialization: 0,
        },
        specializationMatch: 'neutral',
        affinity: 0,
        financialPressure: 0,
        riskTolerance: 'balanced',
      },
    }
    campaign.currentDay.offers = [offer]

    const items = buildTavernFeedbackItems(campaign)
    const rejected = items.find((i) => i.kind === 'quest_rejected')

    expect(rejected).toBeDefined()
    expect(rejected?.title).toContain('断り')
    expect(rejected?.summary).toContain('危険')
    expect(rejected?.canOpen).toBe(true)
  })

  it('projects expedition return as high-importance feedback after resolve', () => {
    let campaign = createTavernCampaign('feedback-return')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests.find(
      (r) => getOfferErrors(campaign.currentDay, r.id, party.id).length === 0,
    )
    if (!quest) return

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }
    const resolved = resolveCampaignDay(campaign)

    const items = buildTavernFeedbackItems(resolved)
    const expedition = items.find((i) => i.kind === 'expedition_return')

    expect(expedition).toBeDefined()
    expect(expedition?.importance).toBe('high')
    expect(expedition?.canOpen).toBe(true)
    expect(expedition?.reportId).toBeTruthy()
    expect(expedition?.title).toContain(quest.title)
  })

  it('projects stay extension with primary and secondary reasons', () => {
    const campaign = createTavernCampaign('feedback-stay')
    const party = campaign.currentDay.parties[0]!
    const stayEvent = {
      type: 'stayExtended' as const,
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: campaign.dayNumber,
      previousDepartureDay: 3,
      newDepartureDay: 5,
      extensionDays: 2,
      affinity: party.relationship?.affinity ?? 0,
      primaryReason: 'training' as const,
      secondaryReason: 'recovery' as const,
      presentationPlan: {
        id: 'stay-test',
        framing: 'close_up',
        openingCategory: 'dialogue_first' as const,
        speakingCharacterIds: [],
        endingStyle: 'concrete_action' as const,
      },
    }
    campaign.history = [
      {
        dayNumber: campaign.dayNumber,
        daySeed: campaign.currentDay.seed,
        reputationBefore: campaign.reputation,
        reputationAfter: campaign.reputation,
        reputationChange: {
          before: campaign.reputation,
          rawDelta: 0,
          appliedDelta: 0,
          after: campaign.reputation,
          entries: [],
        },
        results: [],
        partyEvents: [],
        progressionEvents: [],
        relationshipEvents: [stayEvent],
      },
    ]

    const items = buildTavernFeedbackItems(campaign)
    const stay = items.find((i) => i.kind === 'stay_extension')

    expect(stay).toBeDefined()
    expect(stay?.title).toContain(party.party.name)
    expect(stay?.summary).toContain('訓練')
    expect(stay?.summary).toContain('回復')
    expect(stay?.importance).toBe('medium')
  })

  it('feedbackImportance: sorts high before medium before low, unread before read', () => {
    const items: TavernFeedbackItem[] = [
      {
        id: 'low-read',
        title: 'low read',
        summary: '',
        unread: false,
        narrativeStatus: 'viewed',
        kind: 'other',
        canOpen: false,
        importance: 'low',
      },
      {
        id: 'medium-unread',
        title: 'medium unread',
        summary: '',
        unread: true,
        narrativeStatus: 'unseen',
        kind: 'downtime',
        canOpen: true,
        importance: 'medium',
      },
      {
        id: 'high-read',
        title: 'high read',
        summary: '',
        unread: false,
        narrativeStatus: 'viewed',
        kind: 'party_arrival',
        canOpen: true,
        importance: 'high',
      },
      {
        id: 'medium-read',
        title: 'medium read',
        summary: '',
        unread: false,
        narrativeStatus: 'viewed',
        kind: 'quest_accepted',
        canOpen: true,
        importance: 'medium',
      },
    ]

    const sorted = sortFeedbackItems(items)
    expect(sorted[0]!.id).toBe('high-read')
    expect(sorted[1]!.id).toBe('medium-unread')
    expect(sorted[2]!.id).toBe('medium-read')
    expect(sorted[3]!.id).toBe('low-read')
  })

  it('feedbackDeduplication: buildTavernFeedbackItems collapses duplicate ids', () => {
    const campaign = createTavernCampaign('dedup')
    const party = campaign.currentDay.parties[0]!
    const event: DowntimeEvent = {
      id: 'downtime:dedup',
      day: campaign.dayNumber,
      type: 'shared_meal',
      participantIds: party.party.members.slice(0, 2).map((m) => m.id),
      valence: 'positive',
      importance: 1,
      relationshipDeltas: [],
      memoryEligible: true,
      narrativeKey: 'shared_meal',
      createdAtDay: campaign.dayNumber,
      narrativeStatus: 'unseen',
      fallbackSummary: 'AとBが食事を共にした。',
    }
    party.downtimeEvents = [event, { ...event }]

    const items = buildTavernFeedbackItems(campaign)
    expect(items.filter((i) => i.id === event.id)).toHaveLength(1)
  })

  it('questRejectionFeedback: declined offer exposes structured reason label', () => {
    const campaign = createTavernCampaign('feedback-rejection')
    const party = campaign.currentDay.parties[0]!
    const offer: BrokerageOfferAttempt = {
      id: 'offer:rejected',
      requestId: campaign.currentDay.requests[0]!.id,
      partyId: party.id,
      decision: 'declined',
      reason: 'tooDangerous',
      evaluation: {
        decision: 'declined',
        reason: 'tooDangerous',
        requestRank: 'C',
        partyRank: 'C',
        rankGap: 0,
        relevantRoleCount: 0,
        leaderJudgment: 0,
        acceptanceScore: 0,
        acceptanceThreshold: 0,
        modifiers: {
          base: 0,
          roleFit: 0,
          leaderJudgment: 0,
          relevantCapability: 0,
          growth: 0,
          affinity: 0,
          financialPressure: 0,
          risk: 0,
          hpReadiness: 0,
          moraleReadiness: 0,
          specialization: 0,
        },
        specializationMatch: 'neutral',
        affinity: 0,
        financialPressure: 0,
        riskTolerance: 'balanced',
      },
    }
    campaign.currentDay.offers = [offer]

    const items = buildTavernFeedbackItems(campaign)
    const rejected = items.find((i) => i.kind === 'quest_rejected')

    expect(rejected).toBeDefined()
    expect(rejected?.title).toContain('断り')
    expect(rejected?.summary).toContain('理由：')
    expect(rejected?.summary).toContain('危険すぎる')
    expect(rejected?.canOpen).toBe(true)
  })

  it('structured feedback unread is controlled by viewedActivityIds', () => {
    const campaign = createTavernCampaign('feedback-unread')
    const party = campaign.currentDay.parties[0]!
    const offer: BrokerageOfferAttempt = {
      id: 'offer:rejected',
      requestId: campaign.currentDay.requests[0]!.id,
      partyId: party.id,
      decision: 'declined',
      reason: 'tooDangerous',
      evaluation: {
        decision: 'declined',
        reason: 'tooDangerous',
        requestRank: 'C',
        partyRank: 'C',
        rankGap: 0,
        relevantRoleCount: 0,
        leaderJudgment: 0,
        acceptanceScore: 0,
        acceptanceThreshold: 0,
        modifiers: {
          base: 0,
          roleFit: 0,
          leaderJudgment: 0,
          relevantCapability: 0,
          growth: 0,
          affinity: 0,
          financialPressure: 0,
          risk: 0,
          hpReadiness: 0,
          moraleReadiness: 0,
          specialization: 0,
        },
        specializationMatch: 'neutral',
        affinity: 0,
        financialPressure: 0,
        riskTolerance: 'balanced',
      },
    }
    campaign.currentDay.offers = [offer]

    const allUnread = buildTavernFeedbackItems(campaign)
    const rejected = allUnread.find((i) => i.kind === 'quest_rejected')!
    expect(rejected.unread).toBe(true)

    const viewed = buildTavernFeedbackItems(campaign, [rejected.id])
    const rejectedViewed = viewed.find((i) => i.kind === 'quest_rejected')!
    expect(rejectedViewed.unread).toBe(false)
  })

  it('stay extension links to narrative candidate when available', () => {
    const campaign = createTavernCampaign('feedback-stay-narrative')
    const party = campaign.currentDay.parties[0]!

    const candidate = {
      id: 'stay-candidate-1',
      version: 1 as const,
      category: 'characterEvent' as const,
      eventType: 'stayExtended' as const,
      dayNumber: campaign.dayNumber,
      partyId: party.id,
      partyName: party.party.name,
      priority: 1,
      title: '滞在延長',
      context: {
        kind: 'characterEvent' as const,
        eventType: 'stayExtended' as const,
        secondaryTriggers: [],
        party: {} as unknown as NarrativePartySnapshot,
        eventFacts: {},
      } as unknown as NarrativeContext,
      state: 'available' as const,
      activeGenerationId: undefined,
    } as unknown as NarrativeCandidate
    campaign.narrativeCandidates = [candidate]

    const stayEvent = {
      type: 'stayExtended' as const,
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: campaign.dayNumber,
      previousDepartureDay: 3,
      newDepartureDay: 5,
      extensionDays: 2,
      affinity: party.relationship?.affinity ?? 0,
      primaryReason: 'training' as const,
      secondaryReason: 'recovery' as const,
      presentationPlan: {
        id: 'stay-test',
        framing: 'close_up',
        openingCategory: 'dialogue_first' as const,
        speakingCharacterIds: [],
        endingStyle: 'concrete_action' as const,
      },
    }
    campaign.history = [
      {
        dayNumber: campaign.dayNumber,
        daySeed: campaign.currentDay.seed,
        reputationBefore: campaign.reputation,
        reputationAfter: campaign.reputation,
        reputationChange: {
          before: campaign.reputation,
          rawDelta: 0,
          appliedDelta: 0,
          after: campaign.reputation,
          entries: [],
        },
        results: [],
        partyEvents: [],
        progressionEvents: [],
        relationshipEvents: [stayEvent],
      },
    ]

    const items = buildTavernFeedbackItems(campaign)
    const stay = items.find((i) => i.kind === 'stay_extension')!

    expect(stay.narrativeTargetId).toBe(candidate.id)
    expect(stay.narrativeStatus).toBe('unseen')
    expect(stay.canOpen).toBe(true)

    const generation = {
      id: 'gen-1',
      candidateId: candidate.id,
      generatedText: '滞在延長の物語',
      promptVersion: 'v2',
      providerId: 'test',
      createdAt: new Date().toISOString(),
    } as unknown as NarrativeGenerationRecord

    const generatedCandidate = {
      ...candidate,
      state: 'generated' as const,
      activeGenerationId: generation.id,
    } as unknown as NarrativeCandidate

    const generatedCampaign = {
      ...campaign,
      narrativeCandidates: [generatedCandidate],
      narrativeGenerations: [generation],
    }

    const generatedItems = buildTavernFeedbackItems(generatedCampaign)
    const generatedStay = generatedItems.find(
      (i) => i.kind === 'stay_extension',
    )!
    expect(generatedStay.narrativeStatus).toBe('generated')
  })

  it('high importance feedback exposes notification action fields', () => {
    const campaign = createTavernCampaign('feedback-notification')
    const party = campaign.currentDay.parties[0]!

    // Party arrival on the current day is high importance and can open party summary.
    const items = buildTavernFeedbackItems(campaign)
    const arrival = items.find((i) => i.kind === 'party_arrival')!
    expect(arrival.importance).toBe('high')
    expect(arrival.canOpen).toBe(true)
    expect(arrival.partyId).toBe(party.id)

    // Expedition return exposes the stable report id.
    const quest = campaign.currentDay.requests.find(
      (r) => getOfferErrors(campaign.currentDay, r.id, party.id).length === 0,
    )
    if (quest) {
      const nextDay = offerRequestToParty(
        campaign.currentDay,
        quest.id,
        party.id,
      )
      const resolved = resolveCampaignDay({
        ...campaign,
        currentDay: nextDay,
      })
      const resolvedItems = buildTavernFeedbackItems(resolved)
      const expedition = resolvedItems.find(
        (i) => i.kind === 'expedition_return',
      )
      if (expedition) {
        expect(expedition.importance).toBe('high')
        expect(expedition.canOpen).toBe(true)
        expect(expedition.reportId).toBeTruthy()
      }
    }
  })
})
