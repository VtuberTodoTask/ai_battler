import { COUNTRY_LIST } from '../../core/identity/worldData.ts'
import type { CountryId, SpeciesId } from '../../core/identity/types.ts'
import { SPECIES_LIST } from '../../core/identity/worldData.ts'
import type {
  CountryLoreEntry,
  SpeciesLoreEntry,
  WorldEncyclopediaCategory,
  WorldLoreEntry,
} from './worldLoreTypes.ts'
import { WORLD_LORE_ENTRIES } from './worldLore.ts'
import { COUNTRY_LORE_ENTRIES } from './countryLore.ts'
import { SPECIES_LORE_ENTRIES } from './speciesLore.ts'

export * from './worldLoreTypes.ts'
export { WORLD_LORE_ENTRIES, COUNTRY_LORE_ENTRIES, SPECIES_LORE_ENTRIES }

const ALL_ENTRIES: WorldLoreEntry[] = [
  ...WORLD_LORE_ENTRIES,
  ...COUNTRY_LORE_ENTRIES,
  ...SPECIES_LORE_ENTRIES,
]

export function getWorldEncyclopediaCategories(): WorldEncyclopediaCategory[] {
  return ['world', 'countries', 'species']
}

export function getWorldLoreEntries(
  category: WorldEncyclopediaCategory,
): WorldLoreEntry[] {
  return ALL_ENTRIES.filter((entry) => entry.category === category)
}

export function getWorldLoreEntry(
  category: WorldEncyclopediaCategory,
  id: string,
): WorldLoreEntry | undefined {
  return ALL_ENTRIES.find(
    (entry) => entry.category === category && entry.id === id,
  )
}

export function findWorldLoreEntryById(id: string): WorldLoreEntry | undefined {
  return ALL_ENTRIES.find((entry) => entry.id === id)
}

export function getDefaultWorldLoreEntry(
  category: WorldEncyclopediaCategory = 'world',
): WorldLoreEntry {
  const first = getWorldLoreEntries(category)[0]
  if (!first) {
    throw new Error(`No lore entries for category: ${category}`)
  }
  return first
}

export function getCountryLoreEntry(countryId: CountryId): CountryLoreEntry {
  const entry = COUNTRY_LORE_ENTRIES.find((e) => e.countryId === countryId)
  if (!entry) {
    throw new Error(`Country lore not found: ${countryId}`)
  }
  return entry
}

export function getSpeciesLoreEntry(speciesId: SpeciesId): SpeciesLoreEntry {
  const entry = SPECIES_LORE_ENTRIES.find((e) => e.speciesId === speciesId)
  if (!entry) {
    throw new Error(`Species lore not found: ${speciesId}`)
  }
  return entry
}

export function validateWorldLoreIndex(): string[] {
  const errors: string[] = []
  const seen = new Set<string>()
  for (const entry of ALL_ENTRIES) {
    if (seen.has(entry.id)) {
      errors.push(`Duplicate lore id: ${entry.id}`)
    }
    seen.add(entry.id)
    if (entry.title.length === 0) {
      errors.push(`Empty title: ${entry.id}`)
    }
    if (entry.shortDescription.length === 0) {
      errors.push(`Empty shortDescription: ${entry.id}`)
    }
    if (entry.sections.length === 0) {
      errors.push(`No sections: ${entry.id}`)
    }
    for (const section of entry.sections) {
      if (section.heading.length === 0) {
        errors.push(`Empty section heading: ${entry.id}.${section.id}`)
      }
      if (section.body.length === 0) {
        errors.push(`Empty section body: ${entry.id}.${section.id}`)
      }
    }
  }

  const worldCount = getWorldLoreEntries('world').length
  if (worldCount < 12) {
    errors.push(`World entries too few: ${worldCount}`)
  }
  const countryCount = COUNTRY_LORE_ENTRIES.length
  if (countryCount !== COUNTRY_LIST.length) {
    errors.push(
      `Country count mismatch: ${countryCount} vs ${COUNTRY_LIST.length}`,
    )
  }
  const speciesCount = SPECIES_LORE_ENTRIES.length
  if (speciesCount !== SPECIES_LIST.length) {
    errors.push(
      `Species count mismatch: ${speciesCount} vs ${SPECIES_LIST.length}`,
    )
  }

  for (const countryId of COUNTRY_LIST) {
    if (!COUNTRY_LORE_ENTRIES.some((e) => e.countryId === countryId)) {
      errors.push(`Missing country lore: ${countryId}`)
    }
  }
  for (const speciesId of SPECIES_LIST) {
    if (!SPECIES_LORE_ENTRIES.some((e) => e.speciesId === speciesId)) {
      errors.push(`Missing species lore: ${speciesId}`)
    }
  }

  return errors
}
