import { describe, expect, it } from 'vitest'
import { MAX_SKILL_NORMAL, MAX_SKILL_S } from '../../balance/constants.ts'
import { ROLE_MAP } from '../../../data/roles.ts'
import { generateAdventurerParty } from '../partyGenerator.ts'
import { PARTY_TEMPLATES } from '../partyTemplates.ts'
import type { AdventurerRank, SkillSet } from '../../models/types.ts'
import {
  EXPEDITION_GROWTH_XP,
  PARTY_GROWTH_XP_THRESHOLD,
  TRAINING_GROWTH_XP,
  awardPartyGrowthXp,
} from './progression.ts'
import type { CampaignParty } from './types.ts'

function makeParty(seed: string, rank: AdventurerRank = 'E'): CampaignParty {
  const party = generateAdventurerParty(
    seed,
    0,
    'Test Party',
    rank,
    PARTY_TEMPLATES[0].id,
  )
  return {
    id: 'party-1',
    party,
    arrivalSerial: 0,
    arrivalDay: 1,
    plannedDepartureDay: 10,
    condition: { incapacitatedIds: [], injuries: [] },
    stats: {
      totalExpeditions: 0,
      completeSuccesses: 0,
      successes: 0,
      partialSuccesses: 0,
      failures: 0,
      retreats: 0,
    },
    progression: {
      growthXp: 0,
      totalGrowthXp: 0,
      growthMilestones: 0,
      trainingDays: 0,
    },
    relationship: {
      affinity: 10,
      financialPressure: 40,
      riskTolerance: 'balanced',
      stayExtensionDaysUsed: 0,
    },
    lifecycle: { status: 'staying', firstArrivalDay: 1, visitCount: 1 },
  }
}

function cloneSkills(skills: SkillSet): SkillSet {
  return { ...skills } as SkillSet
}

function findChangedSkill(
  before: SkillSet,
  after: SkillSet,
): keyof SkillSet | null {
  for (const key of Object.keys(before) as Array<keyof SkillSet>) {
    if (before[key] !== after[key]) {
      return key
    }
  }
  return null
}

describe('Party progression', () => {
  it('initializes progression to zero', () => {
    const party = makeParty('initial-zero')
    expect(party.progression.growthXp).toBe(0)
    expect(party.progression.totalGrowthXp).toBe(0)
    expect(party.progression.growthMilestones).toBe(0)
    expect(party.progression.trainingDays).toBe(0)
  })

  it('awards complete success XP and triggers one milestone', () => {
    const party = makeParty('complete-success')
    const events = awardPartyGrowthXp(
      'seed',
      party,
      EXPEDITION_GROWTH_XP.completeSuccess,
      {
        source: 'completeSuccess',
        dayNumber: 1,
      },
    )

    expect(party.progression.growthXp).toBe(0)
    expect(party.progression.totalGrowthXp).toBe(
      EXPEDITION_GROWTH_XP.completeSuccess,
    )
    expect(party.progression.growthMilestones).toBe(1)
    expect(events.some((e) => e.type === 'experienceGained')).toBe(true)
    expect(events.some((e) => e.type === 'skillImproved')).toBe(true)
  })

  it('carries over surplus XP across multiple milestones', () => {
    const party = makeParty('carry-over')
    party.progression.growthXp = 3
    const events = awardPartyGrowthXp('seed', party, 9, {
      source: 'success',
      dayNumber: 1,
    })

    expect(party.progression.growthXp).toBe(0)
    expect(party.progression.growthMilestones).toBe(3)
    expect(events.filter((e) => e.type === 'skillImproved')).toHaveLength(
      3 * party.party.members.length,
    )
  })

  it('ranks growth as completeSuccess > success > partialSuccess >= training', () => {
    expect(EXPEDITION_GROWTH_XP.completeSuccess).toBeGreaterThan(
      EXPEDITION_GROWTH_XP.success,
    )
    expect(EXPEDITION_GROWTH_XP.success).toBeGreaterThan(
      EXPEDITION_GROWTH_XP.partialSuccess,
    )
    expect(EXPEDITION_GROWTH_XP.partialSuccess).toBeGreaterThanOrEqual(
      TRAINING_GROWTH_XP,
    )
    expect(EXPEDITION_GROWTH_XP.failedObjective).toBe(TRAINING_GROWTH_XP)
    expect(EXPEDITION_GROWTH_XP.forcedRetreat).toBe(TRAINING_GROWTH_XP)
    expect(EXPEDITION_GROWTH_XP.lostExpedition).toBe(0)
  })

  it('success then training reaches a milestone', () => {
    const party = makeParty('success-then-train')
    awardPartyGrowthXp('seed', party, EXPEDITION_GROWTH_XP.success, {
      source: 'success',
      dayNumber: 1,
    })
    expect(party.progression.growthXp).toBe(
      EXPEDITION_GROWTH_XP.success % PARTY_GROWTH_XP_THRESHOLD,
    )
    expect(party.progression.growthMilestones).toBe(0)

    awardPartyGrowthXp('seed', party, TRAINING_GROWTH_XP, {
      source: 'training',
      dayNumber: 2,
    })
    expect(party.progression.growthMilestones).toBe(1)
    expect(party.progression.trainingDays).toBe(1)
  })

  it('skips progression for departing casualty parties', () => {
    const party = makeParty('casualty-skip')
    party.departingCasualty = true
    const events = awardPartyGrowthXp(
      'seed',
      party,
      EXPEDITION_GROWTH_XP.success,
      {
        source: 'success',
        dayNumber: 1,
      },
    )

    expect(party.progression.totalGrowthXp).toBe(0)
    expect(events.some((e) => e.type === 'progressionSkipped')).toBe(true)
  })

  it('selects role-relevant skills for growth', () => {
    const party = makeParty('role-relevant')
    const beforeSnapshots = party.party.members.map((m) => ({
      role: m.role,
      skills: cloneSkills(m.skills),
    }))

    awardPartyGrowthXp('seed', party, PARTY_GROWTH_XP_THRESHOLD, {
      source: 'success',
      dayNumber: 1,
    })

    expect(party.progression.growthMilestones).toBe(1)

    for (let i = 0; i < party.party.members.length; i++) {
      const member = party.party.members[i]
      const before = beforeSnapshots[i].skills
      const changed = findChangedSkill(before, member.skills)
      expect(changed).not.toBeNull()
      const role = ROLE_MAP[member.role]
      const relevant = new Set([...role.expertSkills, ...role.trainedSkills])
      expect(relevant.has(changed!)).toBe(true)
    }
  })

  it('caps skill growth at max normal rank', () => {
    const party = makeParty('cap-normal')
    const member = party.party.members[0]
    const target: keyof SkillSet = 'melee'
    const role = ROLE_MAP[member.role]

    for (const skill of role.expertSkills) {
      member.skills[skill] = MAX_SKILL_NORMAL
    }
    for (const skill of role.trainedSkills) {
      member.skills[skill] = MAX_SKILL_NORMAL
    }
    member.skills[target] = MAX_SKILL_NORMAL - 1

    awardPartyGrowthXp('seed', party, PARTY_GROWTH_XP_THRESHOLD, {
      source: 'success',
      dayNumber: 1,
    })

    expect(member.skills[target]).toBe(MAX_SKILL_NORMAL)
  })

  it('caps S-rank members at MAX_SKILL_S', () => {
    const party = makeParty('cap-s', 'S')
    const member = party.party.members[0]
    const target: keyof SkillSet = 'melee'
    const role = ROLE_MAP[member.role]

    member.rank = 'S'
    for (const skill of role.expertSkills) {
      member.skills[skill] = MAX_SKILL_S
    }
    for (const skill of role.trainedSkills) {
      member.skills[skill] = MAX_SKILL_S
    }
    member.skills[target] = MAX_SKILL_S - 1

    awardPartyGrowthXp('seed', party, PARTY_GROWTH_XP_THRESHOLD, {
      source: 'success',
      dayNumber: 1,
    })

    expect(member.skills[target]).toBe(MAX_SKILL_S)
  })

  it('consumes milestone even when all role skills are capped', () => {
    const party = makeParty('all-capped')
    for (const member of party.party.members) {
      for (const skill of Object.keys(member.skills) as Array<keyof SkillSet>) {
        member.skills[skill] =
          member.rank === 'S' ? MAX_SKILL_S : MAX_SKILL_NORMAL
      }
    }

    awardPartyGrowthXp('seed', party, PARTY_GROWTH_XP_THRESHOLD, {
      source: 'success',
      dayNumber: 1,
    })

    expect(party.progression.growthMilestones).toBe(1)
    expect(party.progression.growthXp).toBe(0)
  })

  it('produces deterministic skill selection for the same seed/serial/milestone/member', () => {
    const partyA = makeParty('det-growth')
    const partyB = makeParty('det-growth')
    const beforeA = partyA.party.members.map((m) => cloneSkills(m.skills))
    const beforeB = partyB.party.members.map((m) => cloneSkills(m.skills))

    awardPartyGrowthXp('seed', partyA, PARTY_GROWTH_XP_THRESHOLD, {
      source: 'success',
      dayNumber: 1,
    })
    awardPartyGrowthXp('seed', partyB, PARTY_GROWTH_XP_THRESHOLD, {
      source: 'success',
      dayNumber: 1,
    })

    for (let i = 0; i < partyA.party.members.length; i++) {
      const skillA = findChangedSkill(
        beforeA[i],
        partyA.party.members[i].skills,
      )
      const skillB = findChangedSkill(
        beforeB[i],
        partyB.party.members[i].skills,
      )
      expect(skillA).not.toBeNull()
      expect(skillB).toBe(skillA)
      expect(partyB.party.members[i].skills[skillB!]).toBe(
        partyA.party.members[i].skills[skillA!],
      )
    }
  })

  it('training does not recover HP/MP/Morale', () => {
    const party = makeParty('training-no-heal')
    const beforeHp = party.party.members[0].currentHp
    const beforeMp = party.party.members[0].currentMp
    const beforeMorale = party.party.members[0].morale

    awardPartyGrowthXp('seed', party, TRAINING_GROWTH_XP, {
      source: 'training',
      dayNumber: 1,
    })

    expect(party.party.members[0].currentHp).toBe(beforeHp)
    expect(party.party.members[0].currentMp).toBe(beforeMp)
    expect(party.party.members[0].morale).toBe(beforeMorale)
  })

  it('gives training XP to available parties that did not dispatch', () => {
    const party = makeParty('training-dispatch')
    const beforeTotal = party.progression.totalGrowthXp
    const events = awardPartyGrowthXp('seed', party, TRAINING_GROWTH_XP, {
      source: 'training',
      dayNumber: 1,
    })

    expect(party.progression.totalGrowthXp).toBe(
      beforeTotal + TRAINING_GROWTH_XP,
    )
    expect(party.progression.trainingDays).toBe(1)
    expect(events.some((e) => e.type === 'experienceGained')).toBe(true)
  })
})
