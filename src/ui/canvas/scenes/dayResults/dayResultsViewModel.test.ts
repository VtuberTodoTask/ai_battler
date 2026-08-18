import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../../../core/tavern/brokerage.ts'
import { buildDayResultsSceneViewModel } from './dayResultsViewModel.ts'

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
