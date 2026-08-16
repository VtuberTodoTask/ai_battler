import { createTavernCampaign } from '../tavern/campaign/campaign.ts'
import { serializeGameSave } from './serializer.ts'
import { InMemorySaveRepository } from './inMemorySaveRepository.ts'

describe('save repository', () => {
  it('セーブ/ロード/削除の一連の操作ができる', async () => {
    const repo = new InMemorySaveRepository()
    const campaign = createTavernCampaign('repo-test')
    const save = serializeGameSave({ campaign })

    await repo.save('slot-1', save)
    const loaded = await repo.load('slot-1')
    expect(loaded).not.toBeNull()
    expect(loaded!.campaign.seed).toBe('repo-test')

    const list = await repo.list()
    expect(list).toHaveLength(1)
    expect(list[0].slotId).toBe('slot-1')

    await repo.delete('slot-1')
    expect(await repo.load('slot-1')).toBeNull()
  })

  it('存在しないスロットはnullを返す', async () => {
    const repo = new InMemorySaveRepository()
    expect(await repo.load('empty-slot')).toBeNull()
  })
})
