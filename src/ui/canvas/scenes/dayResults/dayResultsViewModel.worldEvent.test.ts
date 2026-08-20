import { describe, expect, it } from 'vitest'
import { buildDayResultsSceneViewModel } from './dayResultsViewModel.ts'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../../../core/tavern/brokerage.ts'
import { getWorldEventDefinition } from '../../../../core/tavern/campaign/worldEvents.ts'
import type { TavernCampaignState } from '../../../../core/tavern/campaign/types.ts'

function acceptAllPossible(campaign: TavernCampaignState): TavernCampaignState {
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
        if (next.matches.some((m) => m.requestId === request.id)) {
          matchedPartyIds.add(party.id)
          matchedRequestIds.add(request.id)
          state = next
          break
        }
      } catch {
        // continue
      }
    }
  }
  return { ...campaign, currentDay: state }
}

function advanceOneDayAcceptingAll(
  campaign: TavernCampaignState,
): TavernCampaignState {
  let c = resolveCampaignDay(acceptAllPossible(campaign))
  c = advanceCampaignDay(c)
  return c
}

describe('Phase 9.7.1 DayResults — unresolved World Event shows final progress', () => {
  it('includes the definition title and final response points when an event ends unresolved', () => {
    for (let s = 0; s < 60; s++) {
      let campaign: TavernCampaignState = createTavernCampaign(
        `dayresults-worldevent-unresolved-${s}`,
      )
      let unresolvedDay: number | undefined
      let unresolvedEventId: string | undefined
      for (let day = 0; day < 20 && !unresolvedDay; day++) {
        campaign = advanceOneDayAcceptingAll(campaign)
        const record = campaign.history[campaign.history.length - 1]
        const unresolved = record.worldEventEvents.find(
          (e) => e.type === 'unresolved',
        )
        if (unresolved) {
          unresolvedDay = record.dayNumber
          unresolvedEventId = unresolved.eventId
        }
      }
      if (!unresolvedDay || !unresolvedEventId) continue

      const event = campaign.worldEvents.find(
        (e) => e.id === unresolvedEventId,
      )!
      const definitionTitle = getWorldEventDefinition(event.definitionId)!.title

      const vm = buildDayResultsSceneViewModel({
        campaign,
        resolvedDay: unresolvedDay,
        nextDay: unresolvedDay + 1,
      })

      const unresolvedItem = vm.importantEvents.find(
        (e) => e.kind === 'worldEvent' && e.title.includes('対応期間が終了'),
      )
      expect(unresolvedItem).toBeDefined()
      expect(unresolvedItem!.summary).toContain(definitionTitle)
      expect(unresolvedItem!.summary).toContain(
        `対応状況 ${event.responsePoints} / 4`,
      )
      return
    }
    throw new Error('no unresolved world event found within search budget')
  })
})
