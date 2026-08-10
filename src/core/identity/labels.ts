import { COUNTRY_WORLD_PROFILES, SPECIES_WORLD_PROFILES } from './worldData.ts'
import type { CountryId, GenderId, SpeciesId } from './types.ts'

export function speciesLabel(species: SpeciesId): string {
  return SPECIES_WORLD_PROFILES[species]?.nameJa ?? species
}

export function countryLabel(country: CountryId): string {
  return COUNTRY_WORLD_PROFILES[country]?.nameJa ?? country
}

export function genderLabel(gender: GenderId): string {
  switch (gender) {
    case 'male':
      return '男性'
    case 'female':
      return '女性'
    case 'nonbinary':
      return 'ノンバイナリー'
    case 'other':
      return 'その他'
    default:
      return String(gender)
  }
}
