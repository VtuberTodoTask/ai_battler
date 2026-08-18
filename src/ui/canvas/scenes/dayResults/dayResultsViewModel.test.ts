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
})
