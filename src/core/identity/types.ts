export const SPECIES_IDS = [
  'human',
  'long_eared',
  'mountainfolk',
  'smallfolk',
  'tuskfolk',
  'goblinfolk',
  'scalefolk',
  'wingfolk',
  'finfolk',
] as const

export type SpeciesId = (typeof SPECIES_IDS)[number]

export const COUNTRY_IDS = [
  'alden',
  'velga',
  'kared',
  'celesta',
  'eldia',
  'ragna',
  'halma',
] as const

export type CountryId = (typeof COUNTRY_IDS)[number]

export const GENDER_IDS = ['male', 'female', 'nonbinary', 'other'] as const

export type GenderId = (typeof GENDER_IDS)[number]

export const CULTURAL_ATTITUDES = [
  'embraced',
  'mostly_accepted',
  'ambivalent',
  'rejected',
  'reversed',
] as const

export type CulturalAttitude = (typeof CULTURAL_ATTITUDES)[number]

export const ROMANCE_ATTITUDES = [
  'romantic',
  'open',
  'cautious',
  'reserved',
  'avoidant',
  'uninterested',
] as const

export type RomanceAttitude = (typeof ROMANCE_ATTITUDES)[number]

export const RELATIONSHIP_STATUSES = [
  'single',
  'partnered',
  'engaged',
  'married',
  'widowed',
  'separated',
  'unspecified',
] as const

export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number]

export const ROMANTIC_ORIENTATIONS = [
  'opposite_gender',
  'same_gender',
  'multiple_genders',
  'any_gender',
  'none',
  'unspecified',
] as const

export type RomanticOrientation = (typeof ROMANTIC_ORIENTATIONS)[number]

export interface CharacterIdentity {
  species: SpeciesId
  gender: GenderId
  countryOfOrigin: CountryId
  regionOfOrigin?: string
  socialOrigin?: string
  familyBackground?: string
}

export interface FormativeExperience {
  summary: string
  interpretation?: string
  importance?: number
}

export interface CharacterLifeBackground {
  childhood?: string
  education?: string
  formerOccupation?: string
  formativeExperiences?: FormativeExperience[]
  reasonForAdventuring?: string
}

export interface CulturalInfluence {
  source: CountryId | string
  value: string
  strength?: number
  attitude: CulturalAttitude
  personalInterpretation?: string
}

export interface PersonalityContradiction {
  sideA: string
  sideB: string
  expression?: string
}

export interface RomanticAttraction {
  genders?: GenderId[]
  openness?: number
  orientation?: RomanticOrientation
}

export interface CharacterRomanticProfile {
  attraction?: RomanticAttraction
  romanceAttitude?: RomanceAttitude
  relationshipStatus?: RelationshipStatus
  romanticHistory?: string[]
}

export interface BackgroundCompatibilityHint {
  characterAId: string
  characterBId: string
  themes: string[]
}
