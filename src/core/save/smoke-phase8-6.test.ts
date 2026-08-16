import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { generateCampaignSeed } from './seed.ts'
import { InMemorySaveRepository } from './inMemorySaveRepository.ts'
import {
  listSaveSlotSummaries,
  loadFromSlot,
  saveToSlot,
} from './serializer.ts'
import { validateGameSave } from './validation.ts'

describe('Phase 8.6 smoke: title/save/load/seed lifecycle', () => {
  it('新規seed生成 → セーブ → ロード → 次のDAYが確定的', async () => {
    const seed = generateCampaignSeed()
    expect(seed).toMatch(/^[0-9A-F]{32}$/)

    const repo = new InMemorySaveRepository()
    const campaign = createTavernCampaign(seed)
    await saveToSlot(repo, 'slot-1', { campaign })

    const slots = await listSaveSlotSummaries(repo)
    const slot1 = slots.find((s) => s.slotId === 'slot-1')
    expect(slot1).toBeDefined()
    expect(slot1!.empty).toBe(false)

    const loaded = await loadFromSlot(repo, 'slot-1')
    expect(() => validateGameSave(loaded)).not.toThrow()
    expect(loaded.campaign.seed).toBe(seed)

    const resolvedLoaded = resolveCampaignDay(loaded.campaign)
    const fromSave = advanceCampaignDay(resolvedLoaded)
    const resolvedDirect = resolveCampaignDay(campaign)
    const direct = advanceCampaignDay(resolvedDirect)
    expect(fromSave.dayNumber).toBe(direct.dayNumber)
    expect(fromSave.parties.length).toBe(direct.parties.length)
    expect(fromSave.history.length).toBe(direct.history.length)
  })
})
