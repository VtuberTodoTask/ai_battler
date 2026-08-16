import { createTavernCampaign } from '../tavern/campaign/campaign.ts'
import { serializeGameSave, deserializeGameSave } from './serializer.ts'

describe('save serialization', () => {
  it('セーブデータをシリアライズして復元できる', () => {
    const campaign = createTavernCampaign('test-seed-001')
    const save = serializeGameSave({ campaign })

    expect(save.metadata.gameVersion).toBeDefined()
    expect(save.metadata.saveFormatVersion).toBeDefined()
    expect(save.metadata.campaignSeed).toBe(campaign.seed)
    expect(save.metadata.currentDay).toBe(campaign.dayNumber)
    expect(save.campaign.seed).toBe(campaign.seed)
    expect(save.campaign.dayNumber).toBe(campaign.dayNumber)
    expect(save.randomState.initialSeed).toBe(campaign.seed)

    const restored = deserializeGameSave(save)
    expect(restored.campaign.seed).toBe(campaign.seed)
    expect(restored.campaign.dayNumber).toBe(campaign.dayNumber)
    expect(restored.persistentPresentationState.viewedActivityIds).toEqual([])
    expect(restored.persistentPresentationState.viewedReportIds).toEqual([])
  })

  it('JSON文字列から復元できる', () => {
    const campaign = createTavernCampaign('json-test')
    const save = serializeGameSave({ campaign })
    const json = JSON.stringify(save)
    const restored = deserializeGameSave(json)
    expect(restored.campaign.seed).toBe(campaign.seed)
  })
})
