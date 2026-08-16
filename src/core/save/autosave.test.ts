import { createTavernCampaign } from '../tavern/campaign/campaign.ts'
import { InMemorySaveRepository } from './inMemorySaveRepository.ts'
import { loadFromSlot, saveToSlot } from './serializer.ts'

describe('autosave', () => {
  it('autosaveスロットに正しく書き込める', async () => {
    const repo = new InMemorySaveRepository()
    const campaign = createTavernCampaign('autosave-test')

    await saveToSlot(repo, 'autosave', { campaign })
    const loaded = await loadFromSlot(repo, 'autosave')

    expect(loaded.metadata.slotId).toBe('autosave')
    expect(loaded.campaign.seed).toBe('autosave-test')
    expect(loaded.metadata.currentDay).toBe(campaign.dayNumber)
  })
})
