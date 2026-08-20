import { describe, expect, it } from 'vitest'
import { buildTavernScreenViewModel } from '../tavernScreenViewModel.ts'
import { createTavernCampaign } from '../../../../core/tavern/campaign/campaign.ts'
import { buildWorldEventRequestForDay } from '../../../../core/tavern/campaign/worldEvents.ts'
import type { WorldEventState } from '../../../../core/tavern/campaign/types.ts'

function buildFakeEvent(
  overrides: Partial<WorldEventState> = {},
): WorldEventState {
  return {
    id: 'world-event:1:monster_migration',
    definitionId: 'monster_migration',
    status: 'active',
    startedDay: 1,
    plannedEndDay: 3,
    requestRank: 'E',
    responsePoints: 2,
    ...overrides,
  }
}

const EMPTY_UI_STATE = {
  selectedPartyId: null,
  selectedQuestId: null,
  openCharacterId: null,
  modalOpen: false,
  viewedReportIds: [],
  viewedActivityIds: [],
}

describe('Phase 9.7 tavern screen viewModel — world event integration', () => {
  it('shows the header world event banner while an event is active', () => {
    const campaign = createTavernCampaign('tavern-vm-banner')
    campaign.worldEvents = [buildFakeEvent()]
    const vm = buildTavernScreenViewModel(campaign, EMPTY_UI_STATE)
    expect(vm.header.worldEventBanner).toEqual({
      eventTitle: '魔獣群の移動',
      statusProgressLabel: '対応状況 2 / 4',
      remainingDaysLabel: '残り 3日',
    })
  })

  it('hides the header world event banner when there is no active event', () => {
    const campaign = createTavernCampaign('tavern-vm-no-banner')
    campaign.worldEvents = []
    const vm = buildTavernScreenViewModel(campaign, EMPTY_UI_STATE)
    expect(vm.header.worldEventBanner).toBeUndefined()
  })

  it('tags a world-event request with a badge and detail, never a chain badge', () => {
    const campaign = createTavernCampaign('tavern-vm-badge')
    const event = buildFakeEvent()
    campaign.worldEvents = [event]
    const eventRequest = buildWorldEventRequestForDay(event, 1)
    campaign.currentDay.requests = [eventRequest]

    const vm = buildTavernScreenViewModel(campaign, {
      ...EMPTY_UI_STATE,
      selectedQuestId: eventRequest.id,
    })

    const questItem = vm.quests.find((q) => q.id === eventRequest.id)!
    expect(questItem.worldEventBadgeLabel).toBe('情勢依頼')
    expect(questItem.chainBadgeLabel).toBeUndefined()

    const detail = vm.decision?.selectedQuest
    expect(detail?.worldEvent).toEqual({
      badgeLabel: '情勢依頼',
      eventTitle: '魔獣群の移動',
      noteText:
        'この情勢の影響によって発生した依頼です。\n対応すると世界情勢の収束に寄与します。',
      progressLabel: '現在 2 / 4',
    })
    expect(detail?.chain).toBeUndefined()
  })

  it('falls back to a no-raw-id message when the referenced event cannot be found', () => {
    const campaign = createTavernCampaign('tavern-vm-badge-fallback')
    const event = buildFakeEvent()
    const eventRequest = buildWorldEventRequestForDay(event, 1)
    campaign.currentDay.requests = [eventRequest]
    campaign.worldEvents = [] // event missing from state

    const vm = buildTavernScreenViewModel(campaign, {
      ...EMPTY_UI_STATE,
      selectedQuestId: eventRequest.id,
    })

    const detail = vm.decision?.selectedQuest
    expect(detail?.worldEvent?.noteText).toBe(
      '世界情勢（詳細を確認できません）',
    )
    expect(detail?.worldEvent?.noteText).not.toContain('world-event:')
    expect(detail?.worldEvent?.noteText).not.toContain('monster_migration')
  })

  it('a normal request has neither a world event badge nor detail', () => {
    const campaign = createTavernCampaign('tavern-vm-normal')
    const normalRequest = campaign.currentDay.requests[0]
    const vm = buildTavernScreenViewModel(campaign, {
      ...EMPTY_UI_STATE,
      selectedQuestId: normalRequest.id,
    })
    const questItem = vm.quests.find((q) => q.id === normalRequest.id)!
    expect(questItem.worldEventBadgeLabel).toBeUndefined()
    expect(vm.decision?.selectedQuest?.worldEvent).toBeUndefined()
  })
})
