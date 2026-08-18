import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { InMemorySaveRepository } from './inMemorySaveRepository.ts'
import { loadFromSlot, saveToSlot } from './serializer.ts'

describe('save/load determinism', () => {
  it('save → continue と save → load → continue は同じ状態になる', async () => {
    const repo = new InMemorySaveRepository()

    const a = createTavernCampaign('determinism-test')
    await saveToSlot(repo, 'slot-1', { campaign: a })

    const loaded = await loadFromSlot(repo, 'slot-1')
    const resolvedLoaded = resolveCampaignDay(loaded.campaign)
    const afterLoad = advanceCampaignDay(resolvedLoaded)

    const resolvedDirect = resolveCampaignDay(a)
    const direct = advanceCampaignDay(resolvedDirect)

    expect(afterLoad.seed).toBe(direct.seed)
    expect(afterLoad.dayNumber).toBe(direct.dayNumber)
    expect(afterLoad.parties.length).toBe(direct.parties.length)
    expect(afterLoad.currentDay.requests.length).toBe(
      direct.currentDay.requests.length,
    )
    expect(afterLoad.history.length).toBe(direct.history.length)
    expect(afterLoad.finance).toEqual(direct.finance)
    expect(afterLoad.history).toEqual(direct.history)
    expect(afterLoad.currentDay.requests[0]?.rewardTerms).toEqual(
      direct.currentDay.requests[0]?.rewardTerms,
    )
    expect(afterLoad.history[0]?.results[0]?.settlement).toEqual(
      direct.history[0]?.results[0]?.settlement,
    )
  })
})
