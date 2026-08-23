import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../../../core/tavern/brokerage.ts'
import { buildDayResultsSceneViewModel } from './dayResultsViewModel.ts'
import {
  deriveResolveCandidates,
  mergeCandidates,
} from '../../../../core/narrative/candidates.ts'
import { BOND_CONVERSATION_UI_LABELS } from '../../../../core/narrative/bondConversation.ts'
import { deriveTavernRank } from '../../../../core/tavern/campaign/reputation.ts'
import { buildNarrativePartySnapshot } from '../../../../core/narrative/context.ts'
import type {
  CampaignRelationshipEvent,
  TavernDayRecord,
} from '../../../../core/tavern/campaign/types.ts'
import type { CampaignPartyEvent } from '../../../../core/tavern/types.ts'
import type { NarrativeCandidate } from '../../../../core/narrative/types.ts'

function findAcceptingOffers(
  campaign: ReturnType<typeof createTavernCampaign>,
  max = 1,
): ReturnType<typeof createTavernCampaign> {
  let state = campaign.currentDay
  const matchedPartyIds = new Set<string>()
  const matchedRequestIds = new Set<string>()

  for (const request of state.requests) {
    if (matchedRequestIds.has(request.id)) continue
    for (const party of state.parties) {
      if (matchedPartyIds.has(party.id)) continue
      if (party.availability === 'recovering') continue
      try {
        const next = offerRequestToParty(state, request.id, party.id)
        if (next.matches.length > 0) {
          matchedPartyIds.add(party.id)
          matchedRequestIds.add(request.id)
          state = next
          if (matchedPartyIds.size >= max) break
        }
      } catch {
        // continue
      }
    }
    if (matchedPartyIds.size >= max) break
  }

  return { ...campaign, currentDay: state }
}

function resolveAndAdvance(
  campaign: ReturnType<typeof createTavernCampaign>,
): ReturnType<typeof createTavernCampaign> {
  return advanceCampaignDay(resolveCampaignDay(campaign))
}

describe('buildDayResultsSceneViewModel', () => {
  it('returns initial important_events step', () => {
    const campaign = createTavernCampaign('vm-step')
    const advanced = resolveAndAdvance(campaign)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const vm = buildDayResultsSceneViewModel(
      {
        campaign: advanced,
        resolvedDay: previousRecord.dayNumber,
        nextDay: advanced.dayNumber,
      },
      [],
    )

    expect(vm.step).toBe('important_events')
    expect(vm.resolvedDay).toBe(previousRecord.dayNumber)
    expect(vm.nextDay).toBe(advanced.dayNumber)
  })

  it('selects the first expedition result by default', () => {
    const campaign = createTavernCampaign('vm-select')
    const prepared = findAcceptingOffers(campaign, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const vm = buildDayResultsSceneViewModel(
      {
        campaign: advanced,
        resolvedDay: previousRecord.dayNumber,
        nextDay: advanced.dayNumber,
      },
      [],
    )

    if (vm.expeditionResults.length > 0) {
      expect(vm.selectedResult).toBeDefined()
      expect(vm.selectedIndex).toBe(0)
    }
  })

  it('respects provided selectedResultId', () => {
    const campaign = createTavernCampaign('vm-selected')
    const prepared = findAcceptingOffers(campaign, 2)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const first = buildDayResultsSceneViewModel(
      {
        campaign: advanced,
        resolvedDay: previousRecord.dayNumber,
        nextDay: advanced.dayNumber,
      },
      [],
    )
    if (first.expeditionResults.length < 2) return

    const secondId = first.expeditionResults[1].id
    const vm = buildDayResultsSceneViewModel(
      {
        campaign: advanced,
        resolvedDay: previousRecord.dayNumber,
        nextDay: advanced.dayNumber,
        selectedResultId: secondId,
      },
      [],
    )

    expect(vm.selectedResult?.id).toBe(secondId)
    expect(vm.selectedIndex).toBe(1)
  })

  it('marks seen results correctly', () => {
    const campaign = createTavernCampaign('vm-seen')
    const prepared = findAcceptingOffers(campaign, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const first = buildDayResultsSceneViewModel(
      {
        campaign: advanced,
        resolvedDay: previousRecord.dayNumber,
        nextDay: advanced.dayNumber,
      },
      [],
    )
    if (first.expeditionResults.length === 0) return
    const resultId = first.expeditionResults[0].id

    const vm = buildDayResultsSceneViewModel(
      {
        campaign: advanced,
        resolvedDay: previousRecord.dayNumber,
        nextDay: advanced.dayNumber,
      },
      [resultId],
    )

    expect(vm.expeditionResults[0].seen).toBe(true)
  })

  it('produces deterministic summary lines across rebuilds', () => {
    const campaign = createTavernCampaign('vm-deterministic')
    const prepared = findAcceptingOffers(campaign, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const a = buildDayResultsSceneViewModel(
      {
        campaign: advanced,
        resolvedDay: previousRecord.dayNumber,
        nextDay: advanced.dayNumber,
      },
      [],
    )
    const b = buildDayResultsSceneViewModel(
      {
        campaign: advanced,
        resolvedDay: previousRecord.dayNumber,
        nextDay: advanced.dayNumber,
      },
      [],
    )

    if (a.expeditionResults.length > 0 && b.expeditionResults.length > 0) {
      expect(a.expeditionResults[0].summaryLines).toEqual(
        b.expeditionResults[0].summaryLines,
      )
    }
  })

  it('computes daily finance summary from ledger entries', () => {
    const campaign = createTavernCampaign('vm-finance-summary')
    const prepared = findAcceptingOffers(campaign, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const vm = buildDayResultsSceneViewModel(
      {
        campaign: advanced,
        resolvedDay: previousRecord.dayNumber,
        nextDay: advanced.dayNumber,
      },
      [],
    )

    expect(vm.dailyFinanceSummary).toBeDefined()
    expect(vm.dailyFinanceSummary.operatingCost).toBe(-10)
    expect(vm.dailyFinanceSummary.currentFunds).toBe(advanced.finance.funds)
    expect(
      vm.dailyFinanceSummary.commissionIncome +
        vm.dailyFinanceSummary.operatingCost,
    ).toBe(vm.dailyFinanceSummary.net)
  })

  it('computes daily reputation summary matching the resolved day record', () => {
    const campaign = createTavernCampaign('vm-reputation-summary')
    const prepared = findAcceptingOffers(campaign, 1)
    const advanced = resolveAndAdvance(prepared)
    const previousRecord = advanced.history[advanced.history.length - 1]!

    const vm = buildDayResultsSceneViewModel(
      {
        campaign: advanced,
        resolvedDay: previousRecord.dayNumber,
        nextDay: advanced.dayNumber,
      },
      [],
    )

    expect(vm.dailyReputationSummary).toBeDefined()
    expect(vm.dailyReputationSummary!.beforeScore).toBe(
      previousRecord.reputationSummary.beforeScore,
    )
    expect(vm.dailyReputationSummary!.delta).toBe(
      previousRecord.reputationSummary.delta,
    )
    expect(vm.dailyReputationSummary!.afterScore).toBe(
      previousRecord.reputationSummary.afterScore,
    )
    expect(vm.dailyReputationSummary!.afterRankLabel).toContain('酒場ランク')
  })

  it('leaves dailyReputationSummary undefined when no history record exists for resolvedDay, rather than fabricating a 0/Rank 1 result', () => {
    const campaign = createTavernCampaign('vm-reputation-missing')

    const vm = buildDayResultsSceneViewModel(
      {
        campaign,
        // No history record exists yet (day 1 hasn't been resolved).
        resolvedDay: campaign.dayNumber,
        nextDay: campaign.dayNumber,
      },
      [],
    )

    expect(vm.dailyReputationSummary).toBeUndefined()
  })

  it('surfaces a rank-up important event when the day promotes the tavern rank', () => {
    let campaign = createTavernCampaign('vm-rank-up')
    let advanced: ReturnType<typeof createTavernCampaign> | null = null

    // Simulate enough successful days to cross the rank-2 threshold (peak >= 20).
    for (let day = 1; day <= 30; day++) {
      const prepared = findAcceptingOffers(campaign, 4)
      campaign = resolveCampaignDay(prepared)
      const lastRecord = campaign.history[campaign.history.length - 1]!
      if (lastRecord.reputationSummary.promoted) {
        advanced = advanceCampaignDay(campaign)
        const vm = buildDayResultsSceneViewModel(
          {
            campaign: advanced,
            resolvedDay: lastRecord.dayNumber,
            nextDay: advanced.dayNumber,
          },
          [],
        )
        const rankUpEvent = vm.importantEvents.find(
          (e) => e.kind === 'tavernRankUp',
        )
        expect(rankUpEvent).toBeDefined()
        expect(rankUpEvent?.importance).toBe('high')
        break
      }
      campaign = advanceCampaignDay(campaign)
    }

    expect(advanced).not.toBeNull()
  })
})

describe('Bond Conversation DayResults row (Phase 9.10)', () => {
  it('surfaces a bondConversation row with the correct label and narrativeTargetId when a Milestone candidate exists for that day', () => {
    const campaign = createTavernCampaign('vm-bond-001')
    const party = campaign.parties[0]
    party.relationship.affinity = 59
    const event: CampaignRelationshipEvent = {
      type: 'affinityChanged',
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: campaign.dayNumber,
      outcome: 'success',
      before: 59,
      delta: 8,
      after: 67,
    }
    const derived = deriveResolveCandidates(
      {
        ...campaign,
        currentDay: { ...campaign.currentDay, status: 'resolved', results: [] },
      },
      [event],
    )
    const bondCandidate = derived.find(
      (c) => c.eventType === 'becameRegular' && c.partyId === party.id,
    )!

    const rank = deriveTavernRank(campaign.reputation.peakScore)
    const dayRecord: TavernDayRecord = {
      dayNumber: campaign.dayNumber,
      daySeed: campaign.currentDay.seed,
      reputationSummary: {
        beforeScore: campaign.reputation.score,
        delta: 0,
        afterScore: campaign.reputation.score,
        beforeRank: rank,
        afterRank: rank,
        promoted: false,
      },
      results: [],
      partyEvents: [],
      progressionEvents: [],
      relationshipEvents: [event],
      questChainEvents: [],
      worldEventEvents: [],
      mainQuestEvents: [],
    }

    const campaignWithHistory = {
      ...campaign,
      narrativeCandidates: mergeCandidates(
        campaign.narrativeCandidates,
        derived,
      ),
      history: [...campaign.history, dayRecord],
    }

    const vm = buildDayResultsSceneViewModel(
      {
        campaign: campaignWithHistory,
        resolvedDay: dayRecord.dayNumber,
        nextDay: campaignWithHistory.dayNumber,
      },
      [],
    )

    const bondRow = vm.importantEvents.find(
      (e) => e.kind === 'bondConversation',
    )
    expect(bondRow).toBeDefined()
    expect(bondRow?.title).toBe(BOND_CONVERSATION_UI_LABELS.regular)
    expect(bondRow?.narrativeTargetId).toBe(bondCandidate.id)
    expect(bondRow?.partyId).toBe(party.id)

    // The generic "affinity swung a lot" row must not ALSO appear for the
    // same event once the Bond Conversation row has claimed it.
    const relationshipChangeRow = vm.importantEvents.find(
      (e) => e.kind === 'relationshipChange' && e.partyId === party.id,
    )
    expect(relationshipChangeRow).toBeUndefined()
  })

  it('does not surface a bondConversation row when no Milestone is crossed', () => {
    const campaign = createTavernCampaign('vm-bond-002')
    const party = campaign.parties[0]
    party.relationship.affinity = 61
    const event: CampaignRelationshipEvent = {
      type: 'affinityChanged',
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: campaign.dayNumber,
      outcome: 'success',
      before: 61,
      delta: 12,
      after: 73,
    }

    const rank = deriveTavernRank(campaign.reputation.peakScore)
    const dayRecord: TavernDayRecord = {
      dayNumber: campaign.dayNumber,
      daySeed: campaign.currentDay.seed,
      reputationSummary: {
        beforeScore: campaign.reputation.score,
        delta: 0,
        afterScore: campaign.reputation.score,
        beforeRank: rank,
        afterRank: rank,
        promoted: false,
      },
      results: [],
      partyEvents: [],
      progressionEvents: [],
      relationshipEvents: [event],
      questChainEvents: [],
      worldEventEvents: [],
      mainQuestEvents: [],
    }

    const campaignWithHistory = {
      ...campaign,
      history: [...campaign.history, dayRecord],
    }

    const vm = buildDayResultsSceneViewModel(
      {
        campaign: campaignWithHistory,
        resolvedDay: dayRecord.dayNumber,
        nextDay: campaignWithHistory.dayNumber,
      },
      [],
    )

    expect(
      vm.importantEvents.find((e) => e.kind === 'bondConversation'),
    ).toBeUndefined()
    // No Milestone crossed, but the delta is still >= 10, so the ordinary
    // relationshipChange notice must still appear.
    const relationshipChangeRow = vm.importantEvents.find(
      (e) => e.kind === 'relationshipChange' && e.partyId === party.id,
    )
    expect(relationshipChangeRow).toBeDefined()
  })
})

describe('DayResults Character Event candidate day-scoping (PR #60 final review)', () => {
  function makeDayRecord(
    campaign: ReturnType<typeof createTavernCampaign>,
    dayNumber: number,
    overrides: Partial<TavernDayRecord> = {},
  ): TavernDayRecord {
    const rank = deriveTavernRank(campaign.reputation.peakScore)
    return {
      dayNumber,
      daySeed: campaign.currentDay.seed,
      reputationSummary: {
        beforeScore: campaign.reputation.score,
        delta: 0,
        afterScore: campaign.reputation.score,
        beforeRank: rank,
        afterRank: rank,
        promoted: false,
      },
      results: [],
      partyEvents: [],
      progressionEvents: [],
      relationshipEvents: [],
      questChainEvents: [],
      worldEventEvents: [],
      mainQuestEvents: [],
      ...overrides,
    }
  }

  it('Regression A: does not resurface an old day’s Bond Conversation candidate when the same milestone is re-crossed on a later day', () => {
    const campaign = createTavernCampaign('vm-bond-day-scope-a')
    const party = campaign.parties[0]
    party.relationship.affinity = 59

    const day10Event: CampaignRelationshipEvent = {
      type: 'affinityChanged',
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: 10,
      outcome: 'success',
      before: 59,
      delta: 6,
      after: 65,
    }
    const day10Derived = deriveResolveCandidates(
      { ...campaign, dayNumber: 10 },
      [day10Event],
    )
    const day10Candidate = day10Derived.find(
      (c) => c.eventType === 'becameRegular' && c.partyId === party.id,
    )!
    expect(day10Candidate).toBeDefined()

    const campaignAfterDay10 = {
      ...campaign,
      dayNumber: 20,
      narrativeCandidates: mergeCandidates(
        campaign.narrativeCandidates,
        day10Derived,
      ),
    }

    const day20Event: CampaignRelationshipEvent = {
      type: 'affinityChanged',
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: 20,
      outcome: 'success',
      before: 55,
      delta: 10,
      after: 65,
    }
    // Core sanity check: no new candidate for the re-crossed milestone.
    const day20Derived = deriveResolveCandidates(campaignAfterDay10, [
      day20Event,
    ])
    expect(
      day20Derived.filter(
        (c) => c.eventType === 'becameRegular' && c.partyId === party.id,
      ),
    ).toHaveLength(0)

    const campaignWithHistory = {
      ...campaignAfterDay10,
      history: [
        ...campaign.history,
        makeDayRecord(campaign, 20, { relationshipEvents: [day20Event] }),
      ],
    }

    const vm = buildDayResultsSceneViewModel(
      { campaign: campaignWithHistory, resolvedDay: 20, nextDay: 21 },
      [],
    )

    expect(
      vm.importantEvents.find((e) => e.kind === 'bondConversation'),
    ).toBeUndefined()
    // The stale Day 10 candidate id must never be reused as today's target.
    expect(
      vm.importantEvents.some((e) => e.narrativeTargetId === day10Candidate.id),
    ).toBe(false)
  })

  it('Regression B: a fresh first-time Bond crossing still surfaces, with narrativeTargetId pointing at that same day’s own candidate', () => {
    const campaign = createTavernCampaign('vm-bond-day-scope-b')
    const party = campaign.parties[0]
    party.relationship.affinity = 59

    const event: CampaignRelationshipEvent = {
      type: 'affinityChanged',
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: 10,
      outcome: 'success',
      before: 59,
      delta: 6,
      after: 65,
    }
    const derived = deriveResolveCandidates({ ...campaign, dayNumber: 10 }, [
      event,
    ])
    const candidate = derived.find(
      (c) => c.eventType === 'becameRegular' && c.partyId === party.id,
    )!
    expect(candidate).toBeDefined()

    const campaignWithHistory = {
      ...campaign,
      dayNumber: 11,
      narrativeCandidates: mergeCandidates(
        campaign.narrativeCandidates,
        derived,
      ),
      history: [
        ...campaign.history,
        makeDayRecord(campaign, 10, { relationshipEvents: [event] }),
      ],
    }

    const vm = buildDayResultsSceneViewModel(
      { campaign: campaignWithHistory, resolvedDay: 10, nextDay: 11 },
      [],
    )

    const bondRow = vm.importantEvents.find(
      (e) => e.kind === 'bondConversation',
    )
    expect(bondRow).toBeDefined()
    expect(bondRow?.title).toBe(BOND_CONVERSATION_UI_LABELS.regular)
    expect(bondRow?.narrativeTargetId).toBe(candidate.id)
  })

  it('Regression C: milestones consumed as secondaryTriggers by a multi-threshold jump never resurface on a later re-cross', () => {
    const campaign = createTavernCampaign('vm-bond-day-scope-c')
    const party = campaign.parties[0]
    party.relationship.affinity = 10

    const jumpEvent: CampaignRelationshipEvent = {
      type: 'affinityChanged',
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: 10,
      outcome: 'success',
      before: 10,
      delta: 75,
      after: 85,
    }
    const jumpDerived = deriveResolveCandidates(
      { ...campaign, dayNumber: 10 },
      [jumpEvent],
    )
    const favoriteCandidate = jumpDerived.find(
      (c) => c.eventType === 'becameFavorite' && c.partyId === party.id,
    )!
    expect(favoriteCandidate).toBeDefined()

    const campaignAfterDay10 = {
      ...campaign,
      dayNumber: 20,
      narrativeCandidates: mergeCandidates(
        campaign.narrativeCandidates,
        jumpDerived,
      ),
    }

    const day20Event: CampaignRelationshipEvent = {
      type: 'affinityChanged',
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: 20,
      outcome: 'success',
      before: 55,
      delta: 10,
      after: 65,
    }
    expect(
      deriveResolveCandidates(campaignAfterDay10, [day20Event]).filter(
        (c) => c.eventType === 'becameRegular' && c.partyId === party.id,
      ),
    ).toHaveLength(0)

    const campaignWithHistory = {
      ...campaignAfterDay10,
      history: [
        ...campaign.history,
        makeDayRecord(campaign, 20, { relationshipEvents: [day20Event] }),
      ],
    }

    const vm = buildDayResultsSceneViewModel(
      { campaign: campaignWithHistory, resolvedDay: 20, nextDay: 21 },
      [],
    )

    expect(
      vm.importantEvents.find((e) => e.kind === 'bondConversation'),
    ).toBeUndefined()
    expect(
      vm.importantEvents.some(
        (e) => e.narrativeTargetId === favoriteCandidate.id,
      ),
    ).toBe(false)
  })

  it('Regression D: a partyArrival candidate from one day is not attached to a different day’s arrival event for the same Party', () => {
    const campaign = createTavernCampaign('vm-bond-day-scope-d')
    const party = campaign.parties[0]

    const day5ArrivalCandidate: NarrativeCandidate = {
      id: `narrative:v1:5:characterEvent:partyArrival:${party.id}`,
      version: 1,
      category: 'characterEvent',
      eventType: 'partyArrival',
      dayNumber: 5,
      partyId: party.id,
      partyName: party.party.name,
      priority: 10,
      title: 'day5 arrival',
      context: {
        kind: 'characterEvent',
        eventType: 'partyArrival',
        secondaryTriggers: [],
        party: buildNarrativePartySnapshot(party),
        eventFacts: {},
        recentHighlights: [],
      },
      state: 'available',
    }

    const day15ArrivalEvent: CampaignPartyEvent = {
      type: 'arrived',
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: 15,
    }

    const campaignWithHistory = {
      ...campaign,
      narrativeCandidates: [
        ...campaign.narrativeCandidates,
        day5ArrivalCandidate,
      ],
      history: [
        ...campaign.history,
        makeDayRecord(campaign, 15, { partyEvents: [day15ArrivalEvent] }),
      ],
    }

    const vm = buildDayResultsSceneViewModel(
      { campaign: campaignWithHistory, resolvedDay: 15, nextDay: 16 },
      [],
    )

    const arrivalRow = vm.importantEvents.find(
      (e) => e.kind === 'partyArrival' && e.partyId === party.id,
    )
    expect(arrivalRow).toBeDefined()
    expect(arrivalRow?.narrativeTargetId).toBeUndefined()
  })
})
