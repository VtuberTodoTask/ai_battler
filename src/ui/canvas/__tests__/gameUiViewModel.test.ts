import { describe, expect, it } from 'vitest'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import {
  buildGameUiViewModel,
  buildPartyListItemViewModel,
} from '../viewModel/gameUiViewModel.ts'

describe('gameUiViewModel', () => {
  it('projects campaign day and reputation', () => {
    const campaign = createTavernCampaign('test-viewmodel-001')
    const vm = buildGameUiViewModel(campaign)

    expect(vm.day).toBe(campaign.dayNumber)
    expect(vm.reputation).toBe(campaign.reputation)
    expect(typeof vm.reputationLabel).toBe('string')
  })

  it('projects the current day parties', () => {
    const campaign = createTavernCampaign('test-viewmodel-002')
    const vm = buildGameUiViewModel(campaign)

    expect(vm.parties.length).toBeGreaterThan(0)
    expect(vm.parties.length).toBe(campaign.currentDay.parties.length)

    const firstParty = vm.parties[0]
    const rawParty = campaign.currentDay.parties[0]
    expect(firstParty.id).toBe(rawParty.id)
    expect(firstParty.name).toBe(rawParty.party.name)
    expect(firstParty.memberNames).toEqual(
      rawParty.party.members.map((m) => m.name),
    )
  })

  it('keeps canvas view model independent of core internals', () => {
    const campaign = createTavernCampaign('test-viewmodel-003')
    const vm = buildGameUiViewModel(campaign)

    expect(vm).not.toHaveProperty('seed')
    expect(vm).not.toHaveProperty('currentDay')
    expect(vm).not.toHaveProperty('parties0')
  })

  it('labels a recovering party', () => {
    const campaign = createTavernCampaign('test-viewmodel-004')
    const rawParty = campaign.currentDay.parties[0]
    rawParty.availability = 'recovering'
    rawParty.recoveryDaysRemaining = 2

    const item = buildPartyListItemViewModel(rawParty)
    expect(item.statusLabel).toBe('回復中（残り2日）')
  })

  it('labels a party with an accepted request', () => {
    const campaign = createTavernCampaign('test-viewmodel-005')
    const rawParty = campaign.currentDay.parties[0]
    rawParty.acceptedRequestId = 'request-001'

    const item = buildPartyListItemViewModel(rawParty)
    expect(item.statusLabel).toBe('依頼受諾済み')
  })
})
