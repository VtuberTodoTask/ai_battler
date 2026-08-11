// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import { buildTavernScreenViewModel } from '../viewModel/tavernScreenViewModel.ts'
import { DEFAULT_GAME_UI_STATE } from '../types.ts'

describe('TavernPartyList ViewModel', () => {
  it('marks the selected party', () => {
    const campaign = createTavernCampaign('party-list-001')
    const party = campaign.currentDay.parties[0]!

    const vm = buildTavernScreenViewModel(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
    })

    const item = vm.parties.find((p) => p.id === party.id)
    expect(item?.selected).toBe(true)
    expect(vm.parties.filter((p) => p.selected).length).toBe(1)
  })

  it('labels recovering parties and counts unread downtime events', () => {
    const campaign = createTavernCampaign('party-list-002')
    const party = campaign.currentDay.parties[0]!
    party.availability = 'recovering'
    party.recoveryDaysRemaining = 2
    party.downtimeEvents = [
      {
        id: 'downtime:test',
        day: campaign.dayNumber,
        type: 'shared_meal',
        participantIds: party.party.members.slice(0, 2).map((m) => m.id),
        valence: 'positive',
        importance: 3,
        relationshipDeltas: [],
        memoryEligible: true,
        narrativeKey: 'shared_meal',
        createdAtDay: campaign.dayNumber,
        narrativeStatus: 'unseen',
      },
    ] as import('../../../core/narrative/types.ts').DowntimeEvent[]

    const vm = buildTavernScreenViewModel(campaign, {
      ...DEFAULT_GAME_UI_STATE,
      selectedPartyId: party.id,
    })

    const item = vm.parties.find((p) => p.id === party.id)
    expect(item?.status).toBe('recovering')
    expect(item?.statusLabel).toContain('療養中')
    expect(item?.unreadEventCount).toBe(1)
  })
})
