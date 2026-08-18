import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { InMemorySaveRepository } from './inMemorySaveRepository.ts'
import { loadFromSlot, saveToSlot, serializeGameSave } from './serializer.ts'
import { offerRequestToParty } from '../tavern/brokerage.ts'
import { SaveValidationErrorClass } from './validation.ts'
import type { GameSaveData } from './types.ts'

function findAcceptingPair(campaign: ReturnType<typeof createTavernCampaign>) {
  for (const request of campaign.currentDay.requests) {
    for (const party of campaign.currentDay.parties) {
      const next = offerRequestToParty(
        campaign.currentDay,
        request.id,
        party.id,
      )
      if (next.matches.some((m) => m.requestId === request.id)) {
        return { requestId: request.id, partyId: party.id, next }
      }
    }
  }
  return null
}

function resolveFirstAcceptingPair(seed: string) {
  let campaign = createTavernCampaign(seed)
  const pair = findAcceptingPair(campaign)
  if (!pair) throw new Error(`No accepting pair found for seed ${seed}`)
  campaign = { ...campaign, currentDay: pair.next }
  campaign = resolveCampaignDay(campaign)
  campaign = advanceCampaignDay(campaign)
  return campaign
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

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

  it('malformed save load is atomic and does not alter repository data', async () => {
    const repo = new InMemorySaveRepository()
    const campaign = resolveFirstAcceptingPair('atomic-load')
    const save = serializeGameSave({ campaign })
    const bad = clone(save)
    const resolved = bad.campaign.history[0].results.find(
      (r) => r.status === 'resolved',
    )!
    delete (resolved as { settlement?: unknown }).settlement
    repo.seed('slot-corrupt', bad as GameSaveData)

    await expect(loadFromSlot(repo, 'slot-corrupt')).rejects.toThrow(
      SaveValidationErrorClass,
    )
    expect(repo.getRaw('slot-corrupt')).toEqual(bad)
  })
})
