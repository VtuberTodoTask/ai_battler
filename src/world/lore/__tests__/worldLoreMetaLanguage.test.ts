import { describe, expect, it } from 'vitest'
import {
  COUNTRY_LORE_ENTRIES,
  SPECIES_LORE_ENTRIES,
  WORLD_LORE_ENTRIES,
} from '../worldLoreIndex.ts'

describe('worldLoreMetaLanguage', () => {
  it('player-facing lore does not contain developer or meta language', () => {
    const blacklist = [
      'Player',
      'Canon',
      'Phase 8.9',
      '現在のゲーム',
      '現実の人間',
      '〜と定義する',
      '〜とは定義しない',
      '一般贸易',
      '時間の感感覚',
      'Party',
      'Role',
    ]

    const all = [
      ...WORLD_LORE_ENTRIES,
      ...COUNTRY_LORE_ENTRIES,
      ...SPECIES_LORE_ENTRIES,
    ]
    let combined = ''
    for (const entry of all) {
      combined += entry.title + '\n'
      combined += entry.shortDescription + '\n'
      for (const section of entry.sections) {
        combined += section.heading + '\n' + section.body + '\n'
      }
    }

    const found: string[] = []
    for (const token of blacklist) {
      if (combined.includes(token)) {
        found.push(token)
      }
    }
    expect(found).toEqual([])
  })

  it('country and species entries do not contain English party term', () => {
    const all = [...COUNTRY_LORE_ENTRIES, ...SPECIES_LORE_ENTRIES]
    for (const entry of all) {
      const full =
        entry.title +
        entry.shortDescription +
        entry.sections.map((s) => s.heading + s.body).join('')
      expect(full).not.toMatch(/\bParty\b/)
    }
  })
})
