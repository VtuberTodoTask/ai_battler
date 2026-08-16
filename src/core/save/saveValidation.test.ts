import { createTavernCampaign } from '../tavern/campaign/campaign.ts'
import { serializeGameSave } from './serializer.ts'
import { SaveValidationErrorClass, validateGameSave } from './validation.ts'

describe('save validation', () => {
  it('有効なセーブを検証する', () => {
    const campaign = createTavernCampaign('valid-test')
    const save = serializeGameSave({ campaign })
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('メタデータがないセーブを拒否する', () => {
    expect(() =>
      validateGameSave({ campaign: createTavernCampaign('x') }),
    ).toThrow(SaveValidationErrorClass)
  })

  it('キャンペーンがないセーブを拒否する', () => {
    const save = serializeGameSave({ campaign: createTavernCampaign('x') })
    expect(() => validateGameSave({ ...save, campaign: undefined })).toThrow(
      SaveValidationErrorClass,
    )
  })

  it('seedがないセーブを拒否する', () => {
    const save = serializeGameSave({ campaign: createTavernCampaign('x') })
    const bad = { ...save, campaign: { ...save.campaign, seed: undefined } }
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })
})
