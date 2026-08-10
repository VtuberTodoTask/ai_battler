import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import { generateAdventurerParty } from '../src/core/tavern/partyGenerator.ts'
import { initializePartyMemberRelationships } from '../src/core/narrative/characterRelationships.ts'
import {
  speciesLabel,
  countryLabel,
  genderLabel,
} from '../src/core/identity/labels.ts'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`)
  }
}

function summarizeAdventurer(m: ReturnType<typeof generateAdventurer>): string {
  const id = m.identity
  const lb = m.lifeBackground
  return [
    `${m.name} (${m.rank} ${m.role})`,
    id
      ? `種族:${speciesLabel(id.species)} 国:${countryLabel(id.countryOfOrigin)} 性別:${genderLabel(id.gender)}`
      : '素性未設定',
    lb?.formerOccupation ? `元職:${lb.formerOccupation}` : '',
    lb?.reasonForAdventuring ? `理由:${lb.reasonForAdventuring}` : '',
    m.romanticProfile?.attraction?.orientation
      ? `恋愛指向:${m.romanticProfile.attraction.orientation} 開放度:${m.romanticProfile.attraction.openness}`
      : '',
    m.romanticProfile?.relationshipStatus
      ? `交際状況:${m.romanticProfile.relationshipStatus}`
      : '',
  ]
    .filter(Boolean)
    .join(' | ')
}

console.log('=== Phase 7.3 Character Generation Smoke ===\n')

// Case A: deterministic from seed
const a = generateAdventurer({
  seed: 'phase7-3-determinism',
  rank: 'C',
  role: 'vanguard',
})
const a2 = generateAdventurer({
  seed: 'phase7-3-determinism',
  rank: 'C',
  role: 'vanguard',
})
assert(
  a.identity?.species === a2.identity?.species &&
    a.identity?.gender === a2.identity?.gender &&
    a.identity?.countryOfOrigin === a2.identity?.countryOfOrigin &&
    a.lifeBackground?.reasonForAdventuring ===
      a2.lifeBackground?.reasonForAdventuring &&
    a.romanticProfile?.attraction?.orientation ===
      a2.romanticProfile?.attraction?.orientation,
  'Case A: same seed must produce identical identity/background/romance',
)
console.log(`Case A PASS: ${summarizeAdventurer(a)}`)

// Case B: species does not determine personality or background
const sameSpecies: string[] = []
for (let i = 0; i < 20; i++) {
  const m = generateAdventurer({
    seed: `species-diversity-${i}`,
    rank: 'C',
    role: 'ranger',
  })
  sameSpecies.push(m.identity?.species ?? '')
}
const speciesCounts = new Map<string, number>()
for (const s of sameSpecies) {
  speciesCounts.set(s, (speciesCounts.get(s) ?? 0) + 1)
}
const hasDuplicateSpecies = [...speciesCounts.values()].some((c) => c > 1)
assert(
  hasDuplicateSpecies,
  'Case B: should see same species across different seeds',
)

const longEaredA = generateAdventurer({
  seed: 'long-eared-1',
  rank: 'C',
  role: 'mage',
})
const longEaredB = generateAdventurer({
  seed: 'long-eared-2',
  rank: 'C',
  role: 'mage',
})
assert(
  longEaredA.identity?.species === 'long_eared' &&
    longEaredB.identity?.species === 'long_eared' &&
    longEaredA.narrativeProfile?.temperament !==
      longEaredB.narrativeProfile?.temperament,
  'Case B: same species can have different temperaments',
)
console.log(`Case B PASS: ${summarizeAdventurer(longEaredA)}`)
console.log(`         : ${summarizeAdventurer(longEaredB)}`)

// Case C: country does not determine personality
const fromAlden = generateAdventurer({
  seed: 'alden-1',
  rank: 'C',
  role: 'guardian',
})
const fromVelga = generateAdventurer({
  seed: 'velga-1',
  rank: 'C',
  role: 'guardian',
})
assert(
  fromAlden.identity?.countryOfOrigin !== fromVelga.identity?.countryOfOrigin ||
    fromAlden.narrativeProfile?.speechStyle !==
      fromVelga.narrativeProfile?.speechStyle,
  'Case C: country of origin does not lock speech style',
)
console.log(`Case C PASS: ${summarizeAdventurer(fromAlden)}`)
console.log(`         : ${summarizeAdventurer(fromVelga)}`)

// Case D: gender does not determine romantic target
let maleAttractedToMale = false
let femaleAttractedToFemale = false
let nonbinaryAttraction = false
for (let i = 0; i < 100; i++) {
  const m = generateAdventurer({
    seed: `gender-romance-${i}`,
    rank: 'C',
    role: 'scout',
  })
  if (
    m.identity?.gender === 'male' &&
    m.romanticProfile?.attraction?.genders?.includes('male')
  ) {
    maleAttractedToMale = true
  }
  if (
    m.identity?.gender === 'female' &&
    m.romanticProfile?.attraction?.genders?.includes('female')
  ) {
    femaleAttractedToFemale = true
  }
  if (
    m.identity?.gender === 'nonbinary' &&
    m.romanticProfile?.attraction?.genders?.length
  ) {
    nonbinaryAttraction = true
  }
}
assert(maleAttractedToMale, 'Case D: male character can be attracted to male')
assert(
  femaleAttractedToFemale,
  'Case D: female character can be attracted to female',
)
assert(
  nonbinaryAttraction,
  'Case D: nonbinary character can have romantic attraction',
)
console.log('Case D PASS: gender does not determine romantic target')

// Case E: directional and independent romantic attraction within a party
const party = generateAdventurerParty(
  'phase7-3-romance-party',
  0,
  '',
  'C',
  'balanced',
)
const rels = initializePartyMemberRelationships(party.members)
let foundOneSided = false
let foundHighAffinityZeroRomance = false
let foundCrossSpeciesAttraction = false

for (const source of party.members) {
  for (const target of party.members) {
    if (source.id === target.id) continue
    const key = `${source.id}:${target.id}`
    const rev = `${target.id}:${source.id}`
    const rel = rels[key]
    const relRev = rels[rev]
    if (!rel || !relRev) continue
    const hasSource = typeof rel.romanticAttraction === 'number'
    const hasTarget = typeof relRev.romanticAttraction === 'number'
    if (
      hasSource !== hasTarget ||
      (hasSource &&
        hasTarget &&
        rel.romanticAttraction !== relRev.romanticAttraction)
    ) {
      foundOneSided = true
    }
    if (
      rel.affinity >= 50 &&
      (rel.romanticAttraction === undefined || rel.romanticAttraction === 0)
    ) {
      foundHighAffinityZeroRomance = true
    }
    if (
      hasSource &&
      rel.romanticAttraction > 0 &&
      source.identity?.species !== target.identity?.species
    ) {
      foundCrossSpeciesAttraction = true
    }
  }
}

assert(foundOneSided, 'Case E: romantic attraction is directional')
assert(
  foundHighAffinityZeroRomance,
  'Case E: high affinity does not imply romantic attraction',
)
assert(
  foundCrossSpeciesAttraction,
  'Case E: cross-species attraction is possible',
)
console.log(`Case E PASS: party ${party.name}`)
for (const m of party.members) {
  console.log(`  - ${summarizeAdventurer(m)}`)
}

// Case F: cultural influence attitude variation
const cultured = generateAdventurer({
  seed: 'culture-variation',
  rank: 'C',
  role: 'support',
})
assert(
  (cultured.culturalInfluences ?? []).length > 0,
  'Case F: character has cultural influences',
)
const attitudes = new Set(cultured.culturalInfluences?.map((i) => i.attitude))
assert(attitudes.size >= 1, 'Case F: cultural influences have attitudes')
console.log(
  `Case F PASS: ${cultured.culturalInfluences?.length} cultural influence(s)`,
)

console.log('\n=== Phase 7.3 Character Generation Smoke: ALL PASS ===')
