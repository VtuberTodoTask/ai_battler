// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import { buildTavernScreenViewModel } from '../viewModel/tavernScreenViewModel.ts'
import { DEFAULT_GAME_UI_STATE } from '../types.ts'
import type { DowntimeEvent } from '../../../core/narrative/types.ts'

describe('TavernActivity ViewModel', () => {
  it('exposes downtime activities as openable and unread by default', () => {
    const campaign = createTavernCampaign('activity-001')
    const party = campaign.currentDay.parties[0]!
    const event: DowntimeEvent = {
      id: 'downtime:test-001',
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
      fallbackSummary: 'AとBが食事を共にした。',
    }
    party.downtimeEvents = [event]

    const vm = buildTavernScreenViewModel(campaign, DEFAULT_GAME_UI_STATE)
    const activity = vm.activities.find((a) => a.id === event.id)

    expect(activity).toBeDefined()
    expect(activity?.kind).toBe('downtime')
    expect(activity?.canOpen).toBe(true)
    expect(activity?.unread).toBe(true)
  })

  it('uses generated text as summary once narrativeStatus is generated', () => {
    const campaign = createTavernCampaign('activity-002')
    const party = campaign.currentDay.parties[0]!
    const event: DowntimeEvent = {
      id: 'downtime:test-002',
      day: campaign.dayNumber,
      type: 'casual_conversation',
      participantIds: party.party.members.slice(0, 2).map((m) => m.id),
      valence: 'positive',
      importance: 2,
      relationshipDeltas: [],
      memoryEligible: true,
      narrativeKey: 'casual_conversation',
      createdAtDay: campaign.dayNumber,
      narrativeStatus: 'generated',
      generatedText: '生成された会話の本文',
      fallbackSummary: 'fallback',
    }
    party.downtimeEvents = [event]

    const vm = buildTavernScreenViewModel(campaign, DEFAULT_GAME_UI_STATE)
    const activity = vm.activities.find((a) => a.id === event.id)

    expect(activity?.summary).toBe('生成された会話の本文')
  })

  it('marks viewed activities as not unread', () => {
    const campaign = createTavernCampaign('activity-003')
    const party = campaign.currentDay.parties[0]!
    const event: DowntimeEvent = {
      id: 'downtime:test-003',
      day: campaign.dayNumber,
      type: 'quiet_company',
      participantIds: party.party.members.slice(0, 2).map((m) => m.id),
      valence: 'neutral',
      importance: 1,
      relationshipDeltas: [],
      memoryEligible: false,
      narrativeKey: 'quiet_company',
      createdAtDay: campaign.dayNumber,
      narrativeStatus: 'viewed',
      generatedText: '既読の本文',
    }
    party.downtimeEvents = [event]

    const vm = buildTavernScreenViewModel(campaign, DEFAULT_GAME_UI_STATE)
    const activity = vm.activities.find((a) => a.id === event.id)

    expect(activity?.unread).toBe(false)
    expect(activity?.canOpen).toBe(true)
  })
})
