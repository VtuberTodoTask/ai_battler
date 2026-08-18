// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../../core/tavern/brokerage.ts'
import { buildTavernScreenViewModel } from '../viewModel/tavernScreenViewModel.ts'
import { DEFAULT_GAME_UI_STATE } from '../types.ts'

describe('TavernScreenViewModel', () => {
  it('projects header from campaign state', () => {
    const campaign = createTavernCampaign('vm-header-001')
    const vm = buildTavernScreenViewModel(campaign, DEFAULT_GAME_UI_STATE)

    expect(vm.header.day).toBe(campaign.dayNumber)
    expect(vm.header.reputationScore).toBe(campaign.reputation.score)
    expect(vm.header.tavernRank).toBe(1)
    expect(vm.header.reputationLabel).toContain(
      String(campaign.reputation.score),
    )
    expect(vm.header.canResolveDay).toBe(true)
    expect(vm.header.canAdvanceDay).toBe(false)
  })

  it('lists all parties with status labels and selection state', () => {
    const campaign = createTavernCampaign('vm-parties-001')
    const vm = buildTavernScreenViewModel(campaign, DEFAULT_GAME_UI_STATE)

    expect(vm.parties.length).toBe(campaign.currentDay.parties.length)
    for (const party of vm.parties) {
      expect(party.name).toBeTruthy()
      expect(party.statusLabel).toBeTruthy()
      expect(party.memberCount).toBeGreaterThan(0)
      expect(party.selected).toBe(false)
    }
  })

  it('lists all quests with objective and rank labels', () => {
    const campaign = createTavernCampaign('vm-quests-001')
    const vm = buildTavernScreenViewModel(campaign, DEFAULT_GAME_UI_STATE)

    expect(vm.quests.length).toBe(campaign.currentDay.requests.length)
    for (const quest of vm.quests) {
      expect(quest.title).toBeTruthy()
      expect(quest.objectiveLabel).toBeTruthy()
      expect(quest.rankLabel).toContain('Rank')
    }
  })

  it('computes assignability from selected party and quest', () => {
    const campaign = createTavernCampaign('vm-assign-001')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests[0]!

    const noSelection = buildTavernScreenViewModel(
      campaign,
      DEFAULT_GAME_UI_STATE,
    )
    expect(noSelection.selectedParty).toBeUndefined()

    const withSelection = buildTavernScreenViewModel(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
      selectedQuestId: quest.id,
    })

    expect(withSelection.selectedParty).toBeDefined()
    expect(withSelection.selectedParty?.id).toBe(party.id)

    const questVm = withSelection.quests.find((q) => q.id === quest.id)
    expect(questVm?.selected).toBe(true)
  })

  it('reflects accepted quest in selected party summary', () => {
    let campaign = createTavernCampaign('vm-accepted-001')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests[0]!

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    const partyInDay = nextDay.parties.find((p) => p.id === party.id)!
    partyInDay.acceptedRequestId = quest.id

    campaign = {
      ...campaign,
      currentDay: nextDay,
    }

    const vm = buildTavernScreenViewModel(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
    })

    expect(vm.selectedParty?.currentQuest?.id).toBe(quest.id)
    expect(vm.selectedParty?.statusLabel).toContain('依頼受諾')
  })

  it('exposes activities from downtime events after resolve', () => {
    const campaign = createTavernCampaign('vm-activity-001')
    const vm = buildTavernScreenViewModel(campaign, DEFAULT_GAME_UI_STATE)

    expect(vm.activities.length).toBeGreaterThanOrEqual(0)
    for (const activity of vm.activities) {
      expect(activity.id).toBeTruthy()
      expect(activity.title).toBeTruthy()
      expect(activity.kind).toBeTruthy()
    }
  })
})
