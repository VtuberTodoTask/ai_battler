import { describe, expect, it } from 'vitest'
import type { Adventurer } from '../models/types.ts'
import type { AdventurerParty, PublicRequestProfile } from './types.ts'
import {
  evaluateOffer,
  acceptanceReasonText,
  toPublicRequestProfile,
} from './acceptance.ts'
import { TEMPLATES_BY_OBJECTIVE_TYPE } from './requestTemplates.ts'
import { generateTavernDay } from './dayGenerator.ts'

function makeMember(
  id: string,
  role: string,
  overrides?: { int?: number; per?: number; leadership?: number },
): Adventurer {
  return {
    id,
    name: `member-${id}`,
    role: role as Adventurer['role'],
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
      int: overrides?.int ?? 10,
      per: overrides?.per ?? 10,
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
      leadership: overrides?.leadership ?? 10,
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
      weapon: {
        id: 'w',
        name: 'weapon',
        kind: 'melee',
        damage: 10,
      },
      armor: {
        id: 'a',
        name: 'armor',
        reduction: 5,
      },
    },
    statusEffects: [],
    seed: `seed-${id}`,
  }
}

function makeParty(
  rank: 'E' | 'D' | 'C' | 'B' | 'A' | 'S',
  roles: string[],
  leaderSlot: 0 | 1 | 2 | 3,
  leaderOverrides?: { int?: number; per?: number; leadership?: number },
  specialization?: { strongObjective?: string; weakObjective?: string },
): AdventurerParty {
  const members = roles.map((role, i) =>
    i === leaderSlot
      ? makeMember(`leader-${role}`, role, leaderOverrides)
      : makeMember(`m${i}-${role}`, role),
  )
  return {
    id: `party-${rank}-${roles.join('-')}`,
    name: 'Test Party',
    rank,
    leaderId: members[leaderSlot].id,
    members,
    archetypeId: 'test',
    missionSpecialization: {
      strongObjective: (specialization?.strongObjective ??
        'survey') as AdventurerParty['missionSpecialization']['strongObjective'],
      weakObjective: (specialization?.weakObjective ??
        'investigation') as AdventurerParty['missionSpecialization']['weakObjective'],
    },
  }
}

function makeRequest(
  objectiveType: PublicRequestProfile['objectiveType'],
  rank: 'E' | 'D' | 'C' | 'B' | 'A' | 'S',
  environment: PublicRequestProfile['environment'] = 'forest',
): PublicRequestProfile {
  return {
    id: `req-${objectiveType}-${rank}`,
    objectiveType,
    rank,
    environment,
    publicTags: ['test'],
  }
}

describe('evaluateOffer', () => {
  it('declines rank gap >= 2 as tooDangerous regardless of role fit', () => {
    const party = makeParty('D', ['vanguard', 'guardian', 'mage', 'healer'], 0)
    const request = makeRequest('elimination', 'B')
    const result = evaluateOffer(request, party)
    expect(result.decision).toBe('declined')
    expect(result.reason).toBe('tooDangerous')
    expect(result.rankGap).toBe(2)
  })

  it('accepts one-rank higher request with strong role fit and capable leader', () => {
    // C rescue, relevant roles: scout, guardian, healer, vanguard
    const party = makeParty(
      'C',
      ['scout', 'guardian', 'healer', 'vanguard'],
      0,
      { int: 60, per: 60, leadership: 55 },
    )
    const request = makeRequest('rescue', 'B')
    const result = evaluateOffer(request, party, { affinity: 40 })
    expect(result.decision).toBe('accepted')
    expect(result.reason).toBe('challengingButSuitable')
    expect(result.rankGap).toBe(1)
    expect(result.relevantRoleCount).toBe(4)
    expect(result.leaderJudgment).toBeGreaterThanOrEqual(55)
  })

  it('declines one-rank higher request with insufficient role fit', () => {
    const party = makeParty('C', ['ranger', 'mage', 'support', 'scout'], 0, {
      int: 60,
      per: 60,
      leadership: 60,
    })
    const request = makeRequest('rescue', 'B')
    const result = evaluateOffer(request, party)
    expect(result.decision).toBe('declined')
    expect(result.reason).toBe('poorFit')
  })

  it('declines one-rank higher request when leader judgment is too low', () => {
    const party = makeParty(
      'C',
      ['scout', 'guardian', 'healer', 'vanguard'],
      0,
      { int: 10, per: 10, leadership: 10 },
    )
    const request = makeRequest('rescue', 'B')
    const result = evaluateOffer(request, party)
    expect(result.decision).toBe('declined')
    expect(result.reason).toBe('tooDangerous')
  })

  it('accepts same-rank request with at least one relevant role', () => {
    const party = makeParty('C', ['vanguard', 'guardian', 'mage', 'healer'], 0)
    const request = makeRequest('elimination', 'C')
    const result = evaluateOffer(request, party)
    expect(result.decision).toBe('accepted')
    expect(result.reason).toBe('appropriate')
    expect(result.rankGap).toBe(0)
  })

  it('declines same-rank request with zero relevant roles', () => {
    const party = makeParty(
      'C',
      ['support', 'support', 'support', 'support'],
      0,
    )
    const request = makeRequest('elimination', 'C', 'forest')
    const result = evaluateOffer(request, party)
    expect(result.decision).toBe('declined')
    expect(result.reason).toBe('poorFit')
  })

  it('accepts higher-rank party even with zero role fit', () => {
    const party = makeParty('B', ['scout', 'ranger', 'support', 'healer'], 0)
    const request = makeRequest('elimination', 'D')
    const result = evaluateOffer(request, party)
    expect(result.decision).toBe('accepted')
    expect(result.reason).toBe('appropriate')
    expect(result.rankGap).toBe(-2)
  })

  it('adds Mage as relevant for magical environment', () => {
    const party = makeParty('C', ['vanguard', 'guardian', 'mage', 'healer'], 0)
    const request = makeRequest('elimination', 'C', 'magical')
    const result = evaluateOffer(request, party)
    expect(result.relevantRoleCount).toBeGreaterThanOrEqual(2)
    expect(result.decision).toBe('accepted')
    expect(result.reason).toBe('appropriate')
  })

  it('adds Scout as relevant for cave environment', () => {
    const party = makeParty('C', ['scout', 'ranger', 'support', 'healer'], 0)
    const request = makeRequest('elimination', 'C', 'cave')
    const result = evaluateOffer(request, party)
    expect(result.relevantRoleCount).toBeGreaterThanOrEqual(1)
  })

  it('adds Ranger as relevant for forest environment', () => {
    const party = makeParty('C', ['vanguard', 'guardian', 'mage', 'ranger'], 0)
    const request = makeRequest('elimination', 'C', 'forest')
    const result = evaluateOffer(request, party)
    expect(result.relevantRoleCount).toBeGreaterThanOrEqual(2)
  })

  it('counts leader judgment from leader INT/PER/leadership only', () => {
    const members = [
      {
        ...makeMember('leader', 'vanguard'),
        stats: { ...makeMember('leader', 'vanguard').stats, int: 10, per: 10 },
        skills: { ...makeMember('leader', 'vanguard').skills, leadership: 10 },
      } as Adventurer,
      {
        ...makeMember('m1', 'guardian'),
        stats: { ...makeMember('m1', 'guardian').stats, int: 100, per: 100 },
        skills: { ...makeMember('m1', 'guardian').skills, leadership: 100 },
      } as Adventurer,
      makeMember('m2', 'mage'),
      makeMember('m3', 'healer'),
    ]
    const party: AdventurerParty = {
      id: 'leader-test',
      name: 'Leader Test',
      rank: 'C',
      leaderId: members[0].id,
      members,
      archetypeId: 'test',
      missionSpecialization: {
        strongObjective: 'survey',
        weakObjective: 'investigation',
      },
    }
    const request = makeRequest('elimination', 'C')
    const result = evaluateOffer(request, party)
    expect(result.leaderJudgment).toBe(10)
  })

  it('is deterministic and independent of hidden expedition config', () => {
    const template = TEMPLATES_BY_OBJECTIVE_TYPE['rescue'][0]
    const requestA = template.build({
      requestId: 'hidden-test',
      seed: 'hidden-a',
      rank: 'C',
      battleEnabled: true,
    })
    const requestB = template.build({
      requestId: 'hidden-test',
      seed: 'hidden-b',
      rank: 'C',
      battleEnabled: false,
    })

    const day = generateTavernDay('hidden-party')
    const party = day.parties[0].party

    const profileA = toPublicRequestProfile(requestA)
    const profileB = toPublicRequestProfile(requestB)

    expect(profileA).toEqual(profileB)

    const resultA = evaluateOffer(profileA, party)
    const resultB = evaluateOffer(profileB, party)

    expect(resultA).toEqual(resultB)
  })

  describe('dynamic score modifiers', () => {
    it('keeps rank gap >=2 as a hard gate', () => {
      const party = makeParty(
        'D',
        ['vanguard', 'guardian', 'mage', 'healer'],
        0,
      )
      const request = makeRequest('elimination', 'B')
      const result = evaluateOffer(request, party, {
        affinity: 100,
        financialPressure: 100,
        riskTolerance: 'bold',
        growthMilestones: 4,
      })
      expect(result.decision).toBe('declined')
      expect(result.reason).toBe('tooDangerous')
    })

    it('accepts same-rank requests with at least one relevant role', () => {
      const party = makeParty(
        'C',
        ['vanguard', 'guardian', 'mage', 'healer'],
        0,
      )
      const request = makeRequest('elimination', 'C')
      const result = evaluateOffer(request, party)
      expect(result.decision).toBe('accepted')
      expect(result.reason).toBe('appropriate')
      expect(result.acceptanceScore).toBeGreaterThanOrEqual(
        result.acceptanceThreshold,
      )
    })

    it('supports poor-fit +1 acceptance when affinity and risk are high', () => {
      const party = makeParty(
        'C',
        ['ranger', 'mage', 'support', 'vanguard'],
        0,
        {
          int: 80,
          per: 80,
          leadership: 80,
        },
      )
      party.members[3].skills.melee = 70
      party.members[3].skills.defense = 70
      const request = makeRequest('rescue', 'B', 'cave')
      const result = evaluateOffer(request, party, {
        affinity: 40,
        financialPressure: 40,
        riskTolerance: 'bold',
        growthMilestones: 0,
      })
      expect(result.decision).toBe('accepted')
      expect(result.reason).toBe('boldChallenge')
      expect(result.modifiers.roleFit).toBe(-10)
    })

    it('reflects high affinity as trustedBroker', () => {
      const party = makeParty(
        'C',
        ['scout', 'guardian', 'healer', 'vanguard'],
        0,
      )
      const request = makeRequest('rescue', 'B')
      const result = evaluateOffer(request, party, {
        affinity: 80,
        financialPressure: 40,
        riskTolerance: 'balanced',
        growthMilestones: 0,
      })
      expect(result.decision).toBe('accepted')
      expect(result.reason).toBe('trustedBroker')
      expect(result.modifiers.affinity).toBe(18)
    })

    it('reflects financial pressure as needsIncome', () => {
      const party = makeParty(
        'C',
        ['scout', 'guardian', 'healer', 'vanguard'],
        0,
      )
      const request = makeRequest('rescue', 'B')
      const result = evaluateOffer(request, party, {
        affinity: 40,
        financialPressure: 85,
        riskTolerance: 'balanced',
        growthMilestones: 0,
      })
      expect(result.decision).toBe('accepted')
      expect(result.reason).toBe('needsIncome')
      expect(result.modifiers.financialPressure).toBe(15)
    })

    it('penalizes cautious risk tolerance', () => {
      const party = makeParty(
        'C',
        ['scout', 'guardian', 'healer', 'vanguard'],
        0,
      )
      const request = makeRequest('rescue', 'B')
      const result = evaluateOffer(request, party, {
        affinity: 80,
        financialPressure: 40,
        riskTolerance: 'cautious',
        growthMilestones: 0,
      })
      expect(result.decision).toBe('declined')
      expect(result.reason).toBe('cautious')
      expect(result.modifiers.risk).toBe(-10)
    })

    it('penalizes low HP readiness', () => {
      const party = makeParty(
        'C',
        ['vanguard', 'guardian', 'mage', 'healer'],
        0,
      )
      party.members.forEach((m) => {
        m.currentHp = 30
      })
      const request = makeRequest('elimination', 'C')
      const result = evaluateOffer(request, party, { financialPressure: 10 })
      expect(result.decision).toBe('declined')
      expect(result.reason).toBe('notReady')
      expect(result.modifiers.hpReadiness).toBe(-15)
    })

    it('penalizes low morale readiness', () => {
      const party = makeParty(
        'C',
        ['vanguard', 'guardian', 'mage', 'healer'],
        0,
      )
      party.members.forEach((m) => {
        m.morale = 30
      })
      const request = makeRequest('elimination', 'C')
      const result = evaluateOffer(request, party, { financialPressure: 10 })
      expect(result.decision).toBe('declined')
      expect(result.reason).toBe('notReady')
      expect(result.modifiers.moraleReadiness).toBe(-10)
    })

    it('rewards growth milestones', () => {
      const party = makeParty(
        'C',
        ['vanguard', 'guardian', 'mage', 'healer'],
        0,
      )
      const request = makeRequest('elimination', 'C')
      const base = evaluateOffer(request, party)
      const grown = evaluateOffer(request, party, { growthMilestones: 4 })
      expect(grown.modifiers.growth).toBe(base.modifiers.growth + 4 * 3)
      expect(grown.acceptanceScore - base.acceptanceScore).toBe(12)
    })

    it('exposes score, threshold and modifier breakdown', () => {
      const party = makeParty(
        'C',
        ['vanguard', 'guardian', 'mage', 'healer'],
        0,
      )
      const request = makeRequest('elimination', 'C')
      const result = evaluateOffer(request, party)
      expect(result.acceptanceScore).toBeGreaterThan(0)
      expect(result.acceptanceThreshold).toBe(50)
      expect(result.modifiers.base).toBe(60)
      expect(result.modifiers.roleFit).toBe(15)
    })
  })
})

describe('acceptanceReasonText', () => {
  it('returns a non-empty string for every reason code', () => {
    for (const reason of [
      'appropriate',
      'challengingButSuitable',
      'trustedBroker',
      'needsIncome',
      'boldChallenge',
      'tooDangerous',
      'poorFit',
      'cautious',
      'notReady',
      'specialtyMatch',
      'specialtyMismatch',
    ] as const) {
      expect(acceptanceReasonText(reason)).toBeTruthy()
    }
  })
})
