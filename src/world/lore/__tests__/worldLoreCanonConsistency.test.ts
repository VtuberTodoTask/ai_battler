import { describe, expect, it } from 'vitest'
import {
  COUNTRY_LIST,
  COUNTRY_WORLD_PROFILES,
  SPECIES_LIST,
  SPECIES_WORLD_PROFILES,
} from '../../../core/identity/worldData.ts'
import {
  COUNTRY_LORE_ENTRIES,
  SPECIES_LORE_ENTRIES,
  WORLD_LORE_ENTRIES,
} from '../worldLoreIndex.ts'

describe('worldLoreCanonConsistency', () => {
  it('world entry ids are unique', () => {
    const ids = WORLD_LORE_ENTRIES.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('country entry ids are unique and match CountryId list', () => {
    const ids = COUNTRY_LORE_ENTRIES.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    const countryIds = new Set(COUNTRY_LORE_ENTRIES.map((e) => e.countryId))
    for (const id of COUNTRY_LIST) {
      expect(countryIds.has(id)).toBe(true)
    }
  })

  it('country titles match COUNTRY_WORLD_PROFILES nameJa', () => {
    for (const entry of COUNTRY_LORE_ENTRIES) {
      expect(entry.title).toBe(COUNTRY_WORLD_PROFILES[entry.countryId].nameJa)
    }
  })

  it('species entry ids are unique and match SpeciesId list', () => {
    const ids = SPECIES_LORE_ENTRIES.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    const speciesIds = new Set(SPECIES_LORE_ENTRIES.map((e) => e.speciesId))
    for (const id of SPECIES_LIST) {
      expect(speciesIds.has(id)).toBe(true)
    }
  })

  it('species titles match SPECIES_WORLD_PROFILES nameJa', () => {
    for (const entry of SPECIES_LORE_ENTRIES) {
      expect(entry.title).toBe(SPECIES_WORLD_PROFILES[entry.speciesId].nameJa)
    }
  })

  it('all lore entry ids are unique across categories', () => {
    const all = [
      ...WORLD_LORE_ENTRIES,
      ...COUNTRY_LORE_ENTRIES,
      ...SPECIES_LORE_ENTRIES,
    ]
    const ids = all.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('section ids are unique within each entry', () => {
    const all = [
      ...WORLD_LORE_ENTRIES,
      ...COUNTRY_LORE_ENTRIES,
      ...SPECIES_LORE_ENTRIES,
    ]
    for (const entry of all) {
      const sectionIds = entry.sections.map((section) => section.id)
      expect(new Set(sectionIds).size).toBe(sectionIds.length)
    }
  })
})
