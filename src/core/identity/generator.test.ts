import { describe, expect, it } from 'vitest'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import { initializePartyMemberRelationships } from '../narrative/characterRelationships.ts'
import { generateAdventurerParty } from '../tavern/partyGenerator.ts'
import {
  generateAdventurerIdentity,
  generateCharacterIdentity,
  buildCharacterNarrativeProfile,
} from './generator.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { SPECIES_LIST, COUNTRY_LIST } from './worldData.ts'

describe('character identity generation', () => {
  it('produces deterministic identity from seed', () => {
    const a = generateAdventurerIdentity('id-seed-1')
    const b = generateAdventurerIdentity('id-seed-1')
    expect(a.identity).toEqual(b.identity)
    expect(a.lifeBackground).toEqual(b.lifeBackground)
    expect(a.romanticProfile).toEqual(b.romanticProfile)
    expect(a.culturalInfluences).toEqual(b.culturalInfluences)
  })

  it('uses canonical species and countries only', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateCharacterIdentity(
        new SeededRng(`species-country-${i}`),
      )
      expect(SPECIES_LIST).toContain(id.species)
      expect(COUNTRY_LIST).toContain(id.countryOfOrigin)
    }
  })

  it('includes gender in identity', () => {
    const id = generateCharacterIdentity(new SeededRng('gender-check'))
    expect(['male', 'female', 'nonbinary', 'other']).toContain(id.gender)
    expect(id.regionOfOrigin).toBeDefined()
    expect(id.socialOrigin).toBeDefined()
    expect(id.familyBackground).toBeDefined()
  })

  it('does not determine personality from gender', () => {
    const males: string[] = []
    const females: string[] = []
    for (let i = 0; i < 80; i++) {
      const m = generateAdventurer({
        seed: `gender-personality-${i}`,
        rank: 'C',
        role: 'vanguard',
      })
      if (m.identity?.gender === 'male')
        males.push(m.narrativeProfile?.temperament ?? '')
      if (m.identity?.gender === 'female')
        females.push(m.narrativeProfile?.temperament ?? '')
    }
    expect(males.length).toBeGreaterThan(0)
    expect(females.length).toBeGreaterThan(0)
    expect(new Set(males).size).toBeGreaterThan(1)
    expect(new Set(females).size).toBeGreaterThan(1)
  })

  it('does not determine romantic target from gender', () => {
    let maleToMale = 0
    let femaleToFemale = 0
    for (let i = 0; i < 100; i++) {
      const m = generateAdventurer({
        seed: `romance-${i}`,
        rank: 'C',
        role: 'ranger',
      })
      const genders = m.romanticProfile?.attraction?.genders
      if (m.identity?.gender === 'male' && genders?.includes('male'))
        maleToMale++
      if (m.identity?.gender === 'female' && genders?.includes('female'))
        femaleToFemale++
    }
    expect(maleToMale).toBeGreaterThan(0)
    expect(femaleToFemale).toBeGreaterThan(0)
  })

  it('allows attraction to be independent of affinity', () => {
    const party = generateAdventurerParty(
      'romance-independence',
      0,
      '',
      'C',
      'balanced',
    )
    const rels = initializePartyMemberRelationships(party.members)
    let found = false
    for (const source of party.members) {
      for (const target of party.members) {
        if (source.id === target.id) continue
        const rel = rels[`${source.id}:${target.id}`]
        if (
          rel &&
          rel.affinity >= 50 &&
          (rel.romanticAttraction === undefined || rel.romanticAttraction === 0)
        ) {
          found = true
        }
      }
    }
    expect(found).toBe(true)
  })

  it('directional romantic attraction can be one-sided', () => {
    const party = generateAdventurerParty(
      'directional-romance',
      0,
      '',
      'C',
      'balanced',
    )
    const rels = initializePartyMemberRelationships(party.members)
    let found = false
    for (const source of party.members) {
      for (const target of party.members) {
        if (source.id === target.id) continue
        const forward = rels[`${source.id}:${target.id}`]
        const reverse = rels[`${target.id}:${source.id}`]
        if (!forward || !reverse) continue
        const f = forward.romanticAttraction
        const r = reverse.romanticAttraction
        if (typeof f === 'number' && (r === undefined || f !== r)) {
          found = true
        }
      }
    }
    expect(found).toBe(true)
  })

  it('does not derive romantic profile from species stereotype', () => {
    const a = generateAdventurer({
      seed: 'species-romance-1',
      rank: 'C',
      role: 'mage',
    })
    const b = generateAdventurer({
      seed: 'species-romance-2',
      rank: 'C',
      role: 'mage',
    })
    expect(a.narrativeProfile).toBeDefined()
    expect(b.narrativeProfile).toBeDefined()
    if (a.identity?.species === b.identity?.species) {
      expect(a.narrativeProfile?.values).not.toEqual(b.narrativeProfile?.values)
    }
  })

  it('produces varied cultural attitudes', () => {
    const attitudes = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const id = generateAdventurerIdentity(`culture-${i}`)
      for (const inf of id.culturalInfluences) {
        attitudes.add(inf.attitude)
      }
    }
    expect(attitudes.size).toBeGreaterThan(1)
  })

  it('keeps romantic profile separate from personality fields', () => {
    const m = generateAdventurer({
      seed: 'romance-separate',
      rank: 'C',
      role: 'healer',
    })
    expect(m.romanticProfile).toBeDefined()
    expect(m.personality).toBeDefined()
    expect(m.identity).toBeDefined()
    expect(m.narrativeProfile?.beliefs?.length).toBeGreaterThan(0)
  })

  it('narrative profile is derived from background and identity', () => {
    const rng = new SeededRng('profile-derivation')
    const id = generateCharacterIdentity(rng)
    const life = generateAdventurerIdentity('profile-derivation').lifeBackground
    const profile = buildCharacterNarrativeProfile({
      role: 'scout',
      personality: {
        bravery: 1,
        caution: 0,
        cooperation: 0,
        discipline: 0,
        altruism: 0,
        greed: 0,
      },
      traits: [],
      identity: id,
      lifeBackground: life,
      culturalInfluences: [],
    } as Parameters<typeof buildCharacterNarrativeProfile>[0])
    expect(profile.temperament).toBeDefined()
    expect(profile.beliefs?.length).toBeGreaterThan(0)
  })
})
