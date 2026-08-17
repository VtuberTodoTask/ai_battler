import { describe, expect, it } from 'vitest'
import { COUNTRY_LIST } from '../../../core/identity/worldData.ts'
import { COUNTRY_LORE_ENTRIES } from '../countryLore.ts'
import {
  getCountryLoreEntry,
  getWorldLoreEntries,
  validateWorldLoreIndex,
} from '../worldLoreIndex.ts'

const REQUIRED_SECTION_HEADINGS = [
  '概要',
  '地理',
  '歴史',
  '政治',
  '社会・文化',
  '産業・経済',
  '軍事・治安',
  '種族・人口',
  '他国との関係',
  '冒険者',
]

describe('countryLoreData', () => {
  it('has exactly 7 countries', () => {
    expect(COUNTRY_LORE_ENTRIES.length).toBe(7)
    expect(getWorldLoreEntries('countries').length).toBe(7)
  })

  it('country ids match the existing CountryId list', () => {
    const countryIds = new Set(
      COUNTRY_LORE_ENTRIES.map((entry) => entry.countryId),
    )
    expect(countryIds.size).toBe(COUNTRY_LORE_ENTRIES.length)
    for (const id of COUNTRY_LIST) {
      expect(countryIds.has(id)).toBe(true)
    }
  })

  it('each country has the required section headings', () => {
    for (const entry of COUNTRY_LORE_ENTRIES) {
      const headings = entry.sections.map((section) => section.heading)
      for (const required of REQUIRED_SECTION_HEADINGS) {
        expect(headings).toContain(required)
      }
      expect(entry.title).toBeTruthy()
      expect(entry.shortDescription).toBeTruthy()
    }
  })

  it('each CountryId resolves through the lore index', () => {
    for (const id of COUNTRY_LIST) {
      const entry = getCountryLoreEntry(id)
      expect(entry.countryId).toBe(id)
      expect(entry.category).toBe('countries')
    }
  })

  it('passes the global validation', () => {
    const errors = validateWorldLoreIndex()
    expect(errors).toHaveLength(0)
  })
})
