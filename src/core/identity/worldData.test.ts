import { describe, expect, it } from 'vitest'
import {
  COUNTRY_WORLD_PROFILES,
  COUNTRY_LIST,
  isVariantFolk,
  SPECIES_LIST,
  SPECIES_WORLD_PROFILES,
} from './worldData.ts'

describe('worldData', () => {
  it('has 9 canonical species', () => {
    expect(SPECIES_LIST).toHaveLength(9)
    expect(SPECIES_LIST).not.toContain('variantfolk')
    expect(SPECIES_LIST).not.toContain('demon')
  })

  it('has 7 canonical countries', () => {
    expect(COUNTRY_LIST).toHaveLength(7)
  })

  it('provides Japanese labels for every species', () => {
    for (const id of SPECIES_LIST) {
      const profile = SPECIES_WORLD_PROFILES[id]
      expect(profile).toBeDefined()
      expect(profile.nameJa.length).toBeGreaterThan(0)
      expect(profile.physicalTraits.length).toBeGreaterThan(0)
      expect(profile.stereotypeWarnings?.length).toBeGreaterThan(0)
    }
  })

  it('provides Japanese labels and cultural values for every country', () => {
    for (const id of COUNTRY_LIST) {
      const profile = COUNTRY_WORLD_PROFILES[id]
      expect(profile).toBeDefined()
      expect(profile.nameJa.length).toBeGreaterThan(0)
      expect(profile.culturalValues.length).toBeGreaterThan(0)
    }
  })

  it('identifies variant folk as scalefolk/wingfolk/finfolk only', () => {
    expect(isVariantFolk('scalefolk')).toBe(true)
    expect(isVariantFolk('wingfolk')).toBe(true)
    expect(isVariantFolk('finfolk')).toBe(true)
    expect(isVariantFolk('human')).toBe(false)
    expect(isVariantFolk('long_eared')).toBe(false)
  })
})
