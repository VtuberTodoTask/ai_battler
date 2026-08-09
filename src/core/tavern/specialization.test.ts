import { describe, expect, it } from 'vitest'
import { runExpedition } from '../expedition/expedition.ts'
import type {
  Adventurer,
  AdventurerRank,
  AdventurerRole,
} from '../models/types.ts'
import {
  cloneParty,
  makeEliminationRequest,
  makeParty,
  makeRequest,
} from '../expedition/test-utils.ts'
import { evaluateOffer } from './acceptance.ts'
import { generateAdventurerParty } from './partyGenerator.ts'
import { PARTY_TEMPLATES } from './partyTemplates.ts'
import {
  ELIMINATION_SPECIALIZATION_THREAT_MULTIPLIER,
  generateMissionSpecialization,
  getMissionSpecializationMatch,
  MISSION_SPECIALIZATION_CHECK_MODIFIER,
  MISSION_SPECIALIZATION_OBJECTIVES,
} from './specialization.ts'
import type { AdventurerParty, PublicRequestProfile } from './types.ts'

function makeTestMember(
  id: string,
  role: AdventurerRole,
  leader = false,
): Adventurer {
  return {
    id,
    name: id,
    role,
    rank: 'C',
    level: 1,
    maxHp: 100,
    currentHp: 100,
    maxMp: 100,
    currentMp: 100,
    morale: 100,
    stats: {
      str: 10,
      con: 10,
      dex: 10,
      int: leader ? 70 : 10,
      per: leader ? 70 : 10,
      wil: 10,
      soc: 10,
    },
    skills: {
      melee: 10,
      ranged: 10,
      defense: 10,
      tactics: 10,
      attackMagic: 10,
      defenseMagic: 10,
      healing: 10,
      scouting: 10,
      stealth: 10,
      trapDetection: 10,
      trapDisarm: 10,
      survival: 10,
      monsterKnowledge: 10,
      firstAid: 10,
      leadership: leader ? 70 : 10,
    },
    traits: [],
    personality: {
      bravery: 50,
      caution: 50,
      cooperation: 50,
      discipline: 50,
      altruism: 50,
      greed: 50,
    },
    equipment: {
      weapon: { id: 'w', name: 'weapon', kind: 'melee', damage: 10 },
      armor: { id: 'a', name: 'armor', reduction: 5 },
    },
    statusEffects: [],
    seed: id,
  }
}

function buildTestParty(
  rank: AdventurerRank = 'C',
  strongObjective: AdventurerParty['missionSpecialization']['strongObjective'] = 'investigation',
  weakObjective: AdventurerParty['missionSpecialization']['weakObjective'] = 'elimination',
  leader = true,
): AdventurerParty {
  const roles: AdventurerRole[] = ['vanguard', 'guardian', 'scout', 'healer']
  const members = roles.map((role, i) =>
    makeTestMember(
      i === 0 ? `leader-${role}` : `${role}-${i}`,
      role,
      leader && i === 0,
    ),
  )
  return {
    id: `test-party-${rank}`,
    name: 'Test Party',
    rank,
    leaderId: members[0].id,
    members,
    archetypeId: 'balanced',
    missionSpecialization: { strongObjective, weakObjective },
  }
}

function requestProfile(
  objectiveType: PublicRequestProfile['objectiveType'],
  rank: AdventurerRank = 'C',
): PublicRequestProfile {
  return {
    id: `req-${objectiveType}-${rank}`,
    objectiveType,
    rank,
    environment: 'forest',
    publicTags: ['test'],
  }
}

describe('Mission specialization generation', () => {
  it('generates deterministic strong and weak objectives', () => {
    const a = generateMissionSpecialization('seed-a', 1)
    const b = generateMissionSpecialization('seed-a', 1)
    expect(a).toEqual(b)
    expect(a.strongObjective).not.toBe(a.weakObjective)
    expect(MISSION_SPECIALIZATION_OBJECTIVES).toContain(a.strongObjective)
    expect(MISSION_SPECIALIZATION_OBJECTIVES).toContain(a.weakObjective)
  })

  it('changes specialization when seed or index changes', () => {
    const a = generateMissionSpecialization('seed-a', 0)
    const b = generateMissionSpecialization('seed-a', 1)
    const c = generateMissionSpecialization('seed-b', 0)
    expect(b).not.toEqual(a)
    expect(c).not.toEqual(a)
  })

  it('does not correlate specialization with party archetype', () => {
    const seen = new Set<string>()
    for (const template of PARTY_TEMPLATES.slice(0, 4)) {
      for (let i = 0; i < 20; i++) {
        const party = generateAdventurerParty(
          `no-correlation-${template.id}`,
          i,
          'Test',
          'C',
          template.id,
        )
        seen.add(
          `${party.missionSpecialization.strongObjective}-${party.missionSpecialization.weakObjective}`,
        )
      }
    }
    const possiblePairs =
      MISSION_SPECIALIZATION_OBJECTIVES.length *
      (MISSION_SPECIALIZATION_OBJECTIVES.length - 1)
    expect(seen.size).toBeGreaterThanOrEqual(Math.min(possiblePairs, 12))
  })

  it('getMissionSpecializationMatch returns strong, weak, or neutral', () => {
    const spec: AdventurerParty['missionSpecialization'] = {
      strongObjective: 'rescue',
      weakObjective: 'survey',
    }
    expect(getMissionSpecializationMatch(spec, 'rescue')).toBe('strong')
    expect(getMissionSpecializationMatch(spec, 'survey')).toBe('weak')
    expect(getMissionSpecializationMatch(spec, 'investigation')).toBe('neutral')
    expect(getMissionSpecializationMatch(undefined, 'investigation')).toBe(
      'neutral',
    )
  })
})

describe('Constants', () => {
  it('exports the expected modifier values', () => {
    expect(MISSION_SPECIALIZATION_CHECK_MODIFIER.strong).toBe(8)
    expect(MISSION_SPECIALIZATION_CHECK_MODIFIER.neutral).toBe(0)
    expect(MISSION_SPECIALIZATION_CHECK_MODIFIER.weak).toBe(-8)
    expect(ELIMINATION_SPECIALIZATION_THREAT_MULTIPLIER.strong).toBe(0.92)
    expect(ELIMINATION_SPECIALIZATION_THREAT_MULTIPLIER.neutral).toBe(1.0)
    expect(ELIMINATION_SPECIALIZATION_THREAT_MULTIPLIER.weak).toBe(1.08)
  })
})

describe('Expedition neutral equivalence', () => {
  it('produces identical results without options and with neutral match', () => {
    const request = makeRequest('neutral-equiv', { features: [] })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'neutral-equiv',
    )
    const noOptions = runExpedition(request, cloneParty(party))
    const neutral = runExpedition(request, cloneParty(party), {
      missionSpecializationMatch: 'neutral',
    })
    expect(noOptions.outcome).toBe(neutral.outcome)
    expect(noOptions.state.objectiveProgress).toBe(
      neutral.state.objectiveProgress,
    )
    expect(noOptions.state.logs).toEqual(neutral.state.logs)
  })
})

describe('Skill check specialization modifier', () => {
  it('raises effective values for strong and lowers them for weak', () => {
    const request = makeRequest('skill-check-spec', {
      rank: 'E',
      difficulty: 'easy',
      features: [],
    })
    const party = makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'skill-check-spec',
      'E',
    )

    const strong = runExpedition(request, cloneParty(party), {
      missionSpecializationMatch: 'strong',
    })
    const neutral = runExpedition(request, cloneParty(party), {
      missionSpecializationMatch: 'neutral',
    })
    const weak = runExpedition(request, cloneParty(party), {
      missionSpecializationMatch: 'weak',
    })

    const average = (result: {
      state: { logs: { check?: { effectiveValue: number } }[] }
    }) => {
      const values = result.state.logs
        .filter((l) => l.check !== undefined)
        .map((l) => l.check!.effectiveValue)
      return values.reduce((a, b) => a + b, 0) / values.length
    }

    expect(average(strong)).toBeGreaterThan(average(neutral))
    expect(average(neutral)).toBeGreaterThan(average(weak))
  })
})

describe('Elimination specialization threat multiplier', () => {
  it('makes strong elimination easier than weak over many seeds', () => {
    const seeds = Array.from({ length: 80 }, (_, i) => `elim-spec-${i}`)
    const roles: AdventurerRole[] = ['vanguard', 'guardian', 'mage', 'healer']

    const rateFor = (match: 'strong' | 'neutral' | 'weak') => {
      const good = seeds.filter((seed) => {
        const request = makeEliminationRequest(seed, 'C', false, 'standard')
        const party = makeParty(roles, seed, 'C')
        const result = runExpedition(request, cloneParty(party), {
          missionSpecializationMatch: match,
        })
        return (
          result.outcome === 'completeSuccess' || result.outcome === 'success'
        )
      }).length
      return good / seeds.length
    }

    const strongRate = rateFor('strong')
    const neutralRate = rateFor('neutral')
    const weakRate = rateFor('weak')

    expect(strongRate).toBeGreaterThanOrEqual(weakRate)
    expect(neutralRate).toBeGreaterThanOrEqual(weakRate)
  })
})

describe('Acceptance specialization modifier', () => {
  it('adds +8 for strong and -8 for weak in the score breakdown', () => {
    const strong = buildTestParty('C', 'rescue', 'elimination', true)
    const neutral = buildTestParty('C', 'investigation', 'elimination', true)
    const weak = buildTestParty('C', 'investigation', 'rescue', true)

    const request = requestProfile('rescue', 'C')
    const neutralResult = evaluateOffer(request, neutral)
    const strongResult = evaluateOffer(request, strong)
    const weakResult = evaluateOffer(request, weak)

    expect(strongResult.modifiers.specialization).toBe(8)
    expect(neutralResult.modifiers.specialization).toBe(0)
    expect(weakResult.modifiers.specialization).toBe(-8)
    expect(strongResult.acceptanceScore - neutralResult.acceptanceScore).toBe(8)
    expect(neutralResult.acceptanceScore - weakResult.acceptanceScore).toBe(8)
  })

  it('returns specialtyMatch when strong specialization tips acceptance', () => {
    const party = buildTestParty('C', 'rescue', 'elimination', true)
    const request = requestProfile('rescue', 'B')
    const result = evaluateOffer(request, party)
    expect(result.specializationMatch).toBe('strong')
    expect(result.modifiers.specialization).toBe(8)
    expect(result.decision).toBe('accepted')
    expect(result.reason).toBe('specialtyMatch')
  })

  it('returns specialtyMismatch when weak specialization tips decline', () => {
    const party = buildTestParty('C', 'investigation', 'rescue', false)
    const request = requestProfile('rescue', 'C')
    const result = evaluateOffer(request, party, { financialPressure: 10 })
    expect(result.specializationMatch).toBe('weak')
    expect(result.modifiers.specialization).toBe(-8)
    expect(result.decision).toBe('declined')
    expect(result.reason).toBe('specialtyMismatch')
  })

  it('keeps +2 rank gap hard gate even with strong specialization', () => {
    const party = buildTestParty('C', 'rescue', 'investigation', true)
    const request = requestProfile('rescue', 'A')
    const result = evaluateOffer(request, party)
    expect(result.decision).toBe('declined')
    expect(result.reason).toBe('tooDangerous')
    expect(result.modifiers.specialization).toBe(8)
  })
})
