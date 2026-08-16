import { createTavernCampaign } from '../tavern/campaign/campaign.ts'
import { serializeGameSave } from './serializer.ts'
import { validateGameSave } from './validation.ts'

describe('save version compatibility', () => {
  it('同じバージョンのセーブは読み込める', () => {
    const campaign = createTavernCampaign('version-test')
    const save = serializeGameSave({ campaign })
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('ゲームバージョンが異なるセーブを拒否する', () => {
    const campaign = createTavernCampaign('bad-game-version')
    const save = serializeGameSave({ campaign })
    const bad = {
      ...save,
      metadata: { ...save.metadata, gameVersion: '999.0.0' },
    }
    expect(() => validateGameSave(bad)).toThrow(/バージョン/)
  })

  it('セーブ形式バージョンが異なるセーブを拒否する', () => {
    const campaign = createTavernCampaign('bad-format-version')
    const save = serializeGameSave({ campaign })
    const bad = {
      ...save,
      metadata: { ...save.metadata, saveFormatVersion: '999' },
    }
    expect(() => validateGameSave(bad)).toThrow(/形式/)
  })
})
