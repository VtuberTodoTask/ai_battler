// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
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
    const arrival = items.find((i) => i.kind === 'party_lifecycle')
    const downtime = items.find((i) => i.id === event.id)

    expect(arrival).toBeDefined()
    expect(arrival?.importance).toBe('high')
    expect(arrival?.summary).toContain(`「${party.party.name}」`)
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
        reputationSummary: {
          beforeScore: campaign.reputation.score,
          delta: 0,
          afterScore: campaign.reputation.score,
          beforeRank: 1,
          afterRank: 1,
          promoted: false,
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
        reputationSummary: {
          beforeScore: campaign.reputation.score,
          delta: 0,
          afterScore: campaign.reputation.score,
          beforeRank: 1,
          afterRank: 1,
          promoted: false,
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

    // Party arrivals on the current day are consolidated into a single
    // high-importance, openable "来訪者の動き" feedback item.
    const items = buildTavernFeedbackItems(campaign)
    const arrival = items.find((i) => i.kind === 'party_lifecycle')!
    expect(arrival.importance).toBe('high')
    expect(arrival.canOpen).toBe(true)
    expect(arrival.summary).toContain(`「${party.party.name}」`)

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

  it('surfaces a high-importance tavern_rank_up item on a promotion day', () => {
    let campaign = createTavernCampaign('feedback-rank-up')
    let found = false

    for (let day = 1; day <= 30 && !found; day++) {
      let state = campaign.currentDay
      for (const request of state.requests) {
        for (const party of state.parties) {
          if (party.availability === 'recovering') continue
          try {
            const next = offerRequestToParty(state, request.id, party.id)
            if (next.matches.some((m) => m.requestId === request.id)) {
              state = next
              break
            }
          } catch {
            // continue
          }
        }
      }
      campaign = resolveCampaignDay({ ...campaign, currentDay: state })
      const lastRecord = campaign.history[campaign.history.length - 1]!
      if (lastRecord.reputationSummary.promoted) {
        const items = buildTavernFeedbackItems(campaign)
        const rankUp = items.find((i) => i.kind === 'tavern_rank_up')
        expect(rankUp).toBeDefined()
        expect(rankUp?.importance).toBe('high')
        expect(rankUp?.id).toBe(
          `tavern-rank-up:${lastRecord.reputationSummary.afterRank}`,
        )
        found = true
        break
      }
      if (day < 30) {
        campaign = advanceCampaignDay(campaign)
      }
    }

    expect(found).toBe(true)
  })

  describe('tavern rank-up activity lifecycle', () => {
    function buildPlanningFixture(
      dayNumber: number,
      historyOverrides: {
        dayNumber: number
        beforeRank: 1 | 2 | 3 | 4 | 5
        afterRank: 1 | 2 | 3 | 4 | 5
        promoted: boolean
      }[],
    ) {
      const campaign = createTavernCampaign('rank-up-fixture')
      return {
        ...campaign,
        dayNumber,
        currentDay: { ...campaign.currentDay, status: 'planning' as const },
        history: historyOverrides.map((h) => ({
          dayNumber: h.dayNumber,
          daySeed: `fixture-day-${h.dayNumber}`,
          reputationSummary: {
            beforeScore: 0,
            delta: 0,
            afterScore: 0,
            beforeRank: h.beforeRank,
            afterRank: h.afterRank,
            promoted: h.promoted,
          },
          results: [],
          partyEvents: [],
          progressionEvents: [],
          relationshipEvents: [],
        })),
      }
    }

    it('shows exactly one rank-up activity for the most recently resolved day while in planning state', () => {
      const fixture = buildPlanningFixture(6, [
        { dayNumber: 5, beforeRank: 1, afterRank: 2, promoted: true },
      ])

      const items = buildTavernFeedbackItems(fixture)
      const rankUpItems = items.filter((i) => i.kind === 'tavern_rank_up')

      expect(rankUpItems).toHaveLength(1)
      const rankUp = rankUpItems[0]!
      expect(rankUp.id).toBe('tavern-rank-up:2')
      expect(rankUp.day).toBe(5)
      expect(rankUp.canOpen).toBe(true)
      expect(rankUp.importance).toBe('high')
      expect(rankUp.unread).toBe(true)
    })

    it('marks the rank-up activity as read once its stable id is in viewedActivityIds', () => {
      const fixture = buildPlanningFixture(6, [
        { dayNumber: 5, beforeRank: 1, afterRank: 2, promoted: true },
      ])

      const items = buildTavernFeedbackItems(fixture, ['tavern-rank-up:2'])
      const rankUp = items.find((i) => i.kind === 'tavern_rank_up')

      expect(rankUp).toBeDefined()
      expect(rankUp?.unread).toBe(false)
    })

    it('shows no rank-up activity when the most recently resolved day did not promote', () => {
      const fixture = buildPlanningFixture(6, [
        { dayNumber: 5, beforeRank: 2, afterRank: 2, promoted: false },
      ])

      const items = buildTavernFeedbackItems(fixture)
      expect(items.filter((i) => i.kind === 'tavern_rank_up')).toHaveLength(0)
    })

    it('does not resurface an old promotion once a later, non-promoting day has resolved', () => {
      // Day 5 promoted 1 -> 2, but days 6-9 resolved with no further
      // promotion. Now on day 10 planning, only day 9 (non-promoting) is
      // the "most recent" day to check.
      const fixture = buildPlanningFixture(10, [
        { dayNumber: 5, beforeRank: 1, afterRank: 2, promoted: true },
        { dayNumber: 6, beforeRank: 2, afterRank: 2, promoted: false },
        { dayNumber: 7, beforeRank: 2, afterRank: 2, promoted: false },
        { dayNumber: 8, beforeRank: 2, afterRank: 2, promoted: false },
        { dayNumber: 9, beforeRank: 2, afterRank: 2, promoted: false },
      ])

      const items = buildTavernFeedbackItems(fixture)
      expect(items.filter((i) => i.kind === 'tavern_rank_up')).toHaveLength(0)
    })

    it('surfaces the rank-up activity for the current day while it is still resolved (before advancing)', () => {
      const campaign = createTavernCampaign('rank-up-fixture-resolved')
      const fixture = {
        ...campaign,
        dayNumber: 5,
        currentDay: { ...campaign.currentDay, status: 'resolved' as const },
        history: [
          {
            dayNumber: 5,
            daySeed: 'fixture-day-5',
            reputationSummary: {
              beforeScore: 15,
              delta: 10,
              afterScore: 25,
              beforeRank: 1 as const,
              afterRank: 2 as const,
              promoted: true,
            },
            results: [],
            partyEvents: [],
            progressionEvents: [],
            relationshipEvents: [],
          },
        ],
      }

      const items = buildTavernFeedbackItems(fixture)
      const rankUpItems = items.filter((i) => i.kind === 'tavern_rank_up')
      expect(rankUpItems).toHaveLength(1)
      expect(rankUpItems[0]!.day).toBe(5)
    })
  })
})
