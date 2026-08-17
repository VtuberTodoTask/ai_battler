import { describe, expect, it } from 'vitest'
import { SPECIES_LIST } from '../../../core/identity/worldData.ts'
import { SPECIES_LORE_ENTRIES } from '../speciesLore.ts'
import {
  getSpeciesLoreEntry,
  getWorldLoreEntries,
  validateWorldLoreIndex,
} from '../worldLoreIndex.ts'

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

  it('each species has the canonical headings', () => {
    for (const entry of SPECIES_LORE_ENTRIES) {
      const headings = entry.sections.map((section) => section.heading)
      expect(headings).toContain('概要')
      expect(headings).toContain('注意事項')
      expect(headings.some((h) => h === '身体' || h.startsWith('身体'))).toBe(
        true,
      )
      expect(headings).toContain('冒険者')
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
        '個人の性格・価値観・職業を決めるものではない',
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
