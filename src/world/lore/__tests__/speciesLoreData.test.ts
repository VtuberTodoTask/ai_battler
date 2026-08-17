import { describe, expect, it } from 'vitest'
import { SPECIES_LIST } from '../../../core/identity/worldData.ts'
import { SPECIES_LORE_ENTRIES } from '../speciesLore.ts'
import {
  getSpeciesLoreEntry,
  getWorldLoreEntries,
  validateWorldLoreIndex,
} from '../worldLoreIndex.ts'

const REQUIRED_SECTION_HEADINGS = [
  '概要',
  '身体的特徴',
  '寿命・成長',
  '人口・分布',
  '歴史・社会',
  '生活上の特徴',
  '他種族からの見られ方',
  '冒険者として',
  '注意事項',
]

describe('speciesLoreData', () => {
  it('has exactly 9 species', () => {
    expect(SPECIES_LORE_ENTRIES.length).toBe(9)
    expect(getWorldLoreEntries('species').length).toBe(9)
  })

  it('species ids match the existing SpeciesId list', () => {
    const speciesIds = new Set(
      SPECIES_LORE_ENTRIES.map((entry) => entry.speciesId),
    )
    expect(speciesIds.size).toBe(SPECIES_LORE_ENTRIES.length)
    for (const id of SPECIES_LIST) {
      expect(speciesIds.has(id)).toBe(true)
    }
  })

  it('each species has the required section headings', () => {
    for (const entry of SPECIES_LORE_ENTRIES) {
      const headings = entry.sections.map((section) => section.heading)
      for (const required of REQUIRED_SECTION_HEADINGS) {
        expect(headings).toContain(required)
      }
      expect(entry.title).toBeTruthy()
      expect(entry.shortDescription).toBeTruthy()
    }
  })

  it('each species entry ends with a non-stereotyping note', () => {
    for (const entry of SPECIES_LORE_ENTRIES) {
      const lastSection = entry.sections[entry.sections.length - 1]
      expect(lastSection).toBeDefined()
      expect(lastSection.heading).toBe('注意事項')
      expect(lastSection.body).toContain(
        '個人の性格・価値観・職業を決定するものではない',
      )
    }
  })

  it('each SpeciesId resolves through the lore index', () => {
    for (const id of SPECIES_LIST) {
      const entry = getSpeciesLoreEntry(id)
      expect(entry.speciesId).toBe(id)
      expect(entry.category).toBe('species')
    }
  })

  it('passes the global validation', () => {
    const errors = validateWorldLoreIndex()
    expect(errors).toHaveLength(0)
  })
})
