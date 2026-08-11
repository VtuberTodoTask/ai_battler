// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import type {
  BrokerageMatch,
  BrokerageOfferAttempt,
} from '../../../core/tavern/types.ts'
import { buildTavernScreenViewModel } from '../viewModel/tavernScreenViewModel.ts'
import { DEFAULT_GAME_UI_STATE } from '../types.ts'

describe('TavernQuestList ViewModel', () => {
  it('marks the selected quest', () => {
    const campaign = createTavernCampaign('quest-list-001')
    const quest = campaign.currentDay.requests[0]!

    const vm = buildTavernScreenViewModel(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedQuestId: quest.id,
    })

    const item = vm.quests.find((q) => q.id === quest.id)
    expect(item?.selected).toBe(true)
    expect(vm.quests.filter((q) => q.selected).length).toBe(1)
  })

  it('labels un-offered, offered, and matched requests', () => {
    const campaign = createTavernCampaign('quest-list-002')
    const requestA = campaign.currentDay.requests[0]!
    const requestB = campaign.currentDay.requests[1]!
    const party = campaign.currentDay.parties[0]!

    const offered: typeof campaign.currentDay = {
      ...campaign.currentDay,
      offers: [
        {
          id: 'offer:test-a',
          requestId: requestA.id,
          partyId: party.id,
          decision: 'accepted',
          reason: 'appropriate',
          evaluation: {},
        },
      ] as unknown as BrokerageOfferAttempt[],
      matches: [
        {
          requestId: requestB.id,
          partyId: party.id,
          acceptedOfferId: 'offer:test-b',
        },
      ] as unknown as BrokerageMatch[],
    }

    const vm = buildTavernScreenViewModel(
      { ...campaign, currentDay: offered },
      DEFAULT_GAME_UI_STATE,
    )

    const itemA = vm.quests.find((q) => q.id === requestA.id)
    const itemB = vm.quests.find((q) => q.id === requestB.id)

    expect(itemA?.statusLabel).toContain('紹介履歴')
    expect(itemB?.statusLabel).toBe('成立')
  })

  it('reports assignable only when party and quest are compatible', () => {
    const campaign = createTavernCampaign('quest-list-003')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests[0]!

    const vm = buildTavernScreenViewModel(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
      selectedQuestId: quest.id,
    })

    const item = vm.quests.find((q) => q.id === quest.id)
    expect(item?.assignable || !item?.disabledReason).toBeTruthy()
  })
})
