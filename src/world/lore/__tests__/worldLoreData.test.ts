import { describe, expect, it } from 'vitest'
import { WORLD_LORE_ENTRIES } from '../worldLore.ts'
import {
  getWorldLoreEntries,
  validateWorldLoreIndex,
} from '../worldLoreIndex.ts'

describe('worldLoreData', () => {
  it('has at least the required world topics', () => {
    const required = [
      '七国世界',
      '冒険者',
      '冒険者の酒場',
      'ダンジョン',
      'マナ',
      '内燃と昇華',
      '技術と生活',
      '交通と物流',
      '宗教とマナ観',
      '魔族',
      '七国の共通社会',
      '暦・時間・距離感',
    ]
    const titles = new Set(WORLD_LORE_ENTRIES.map((entry) => entry.title))
    for (const title of required) {
      expect(titles.has(title)).toBe(true)
    }
  })

  it('contains only world category entries', () => {
    for (const entry of WORLD_LORE_ENTRIES) {
      expect(entry.category).toBe('world')
      expect(entry.id).toBeTruthy()
      expect(entry.title).toBeTruthy()
      expect(entry.shortDescription).toBeTruthy()
      expect(entry.sections.length).toBeGreaterThan(0)
    }
  })

  it('has unique ids among world entries', () => {
    const ids = WORLD_LORE_ENTRIES.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is reachable from worldLoreIndex', () => {
    const indexEntries = getWorldLoreEntries('world')
    expect(indexEntries.length).toBeGreaterThanOrEqual(12)
    expect(indexEntries[0]).toBeDefined()
  })

  it('passes the global validation', () => {
    const errors = validateWorldLoreIndex()
    expect(errors).toHaveLength(0)
  })
})
