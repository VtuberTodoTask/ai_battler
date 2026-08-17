import type { CountryId, SpeciesId } from '../../core/identity/types.ts'

export type WorldEncyclopediaCategory = 'world' | 'countries' | 'species'

export interface WorldLoreSection {
  id: string
  heading: string
  body: string
}

export interface WorldLoreEntry {
  id: string
  category: WorldEncyclopediaCategory
  title: string
  shortDescription: string
  sections: WorldLoreSection[]
}

export interface CountryLoreEntry extends WorldLoreEntry {
  countryId: CountryId
}

export interface SpeciesLoreEntry extends WorldLoreEntry {
  speciesId: SpeciesId
}
