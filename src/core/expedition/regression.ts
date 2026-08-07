import { runExpedition } from './expedition.ts'
import type { ExpeditionRequest } from './types.ts'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import type {
  Adventurer,
  AdventurerRank,
  AdventurerRole,
} from '../models/types.ts'

export function makeInvestigationRequest(
  seed: string,
  rank: AdventurerRank,
): ExpeditionRequest {
  return {
    id: `phase3-1-${seed}`,
    seed,
    rank,
    difficulty: 'normal',
    objectiveType: 'investigation',
    environment: 'forest',
    distance: 3,
    features: ['traps', 'poorVisibility'],
    knownInformation: [],
    hiddenInformation: [
      {
        id: 'info-1',
        name: '敵の痕跡',
        description: '敵が近くにいる証拠',
        difficulty: 5,
      },
      {
        id: 'info-2',
        name: '古い地図',
        description: '遺跡の配置がわかる',
        difficulty: 15,
        requiredSkill: 'scouting',
      },
      {
        id: 'info-3',
        name: '魔力の残滓',
        description: '魔法の気配',
        difficulty: 20,
        requiredSkill: 'monsterKnowledge',
      },
    ],
    battle: {
      enabled: true,
      seed: `${seed}:battle:0`,
      triggerPhase: 'afterExploration',
    },
  }
}

export function makeEliminationRequest(
  seed: string,
  rank: AdventurerRank,
  confirmationRequired: boolean,
): ExpeditionRequest {
  return {
    id: `phase3-2-${seed}`,
    seed,
    rank,
    difficulty: 'normal',
    objectiveType: 'elimination',
    environment: 'forest',
    distance: 3,
    features: ['traps', 'poorVisibility'],
    knownInformation: [],
    hiddenInformation: [],
    battle: {
      enabled: true,
      seed: `${seed}:battle:0`,
      triggerPhase: 'afterExploration',
      shape: 'standard',
    },
    elimination: { mode: 'allEnemies', confirmationRequired },
  }
}

export function makeRescueRequest(
  seed: string,
  rank: AdventurerRank,
  battleEnabled = true,
): ExpeditionRequest {
  return {
    id: `phase3-3-${seed}`,
    seed,
    rank,
    difficulty: 'normal',
    objectiveType: 'rescue',
    environment: 'forest',
    distance: 3,
    features: ['traps', 'poorVisibility'],
    knownInformation: [],
    hiddenInformation: [],
    battle: battleEnabled
      ? {
          enabled: true,
          seed: `${seed}:battle:0`,
          triggerPhase: 'afterExploration',
        }
      : undefined,
    rescue: {
      target: {
        id: 'target-1',
        name: '救出対象',
        maxHp: 40,
        initialHp: 40,
        mobility: 'mobile',
        initialStatusEffects: [],
        locationKnown: false,
        discoveryDifficulty: 15,
        accessDifficulty: 15,
        stabilizationDifficulty: 15,
        evacuationDifficulty: 15,
      },
    },
  }
}

export function makeEscortRequest(
  seed: string,
  rank: AdventurerRank,
  battleEnabled = true,
): ExpeditionRequest {
  return {
    id: `phase3-4-${seed}`,
    seed,
    rank,
    difficulty: 'normal',
    objectiveType: 'escort',
    environment: 'forest',
    distance: 3,
    features: ['traps', 'poorVisibility'],
    knownInformation: [],
    hiddenInformation: [],
    battle: battleEnabled
      ? {
          enabled: true,
          seed: `${seed}:battle:0`,
          triggerPhase: 'afterExploration',
        }
      : undefined,
    escort: {
      target: {
        id: 'target-1',
        name: '護衛対象',
        maxHp: 40,
        initialHp: 40,
        mobility: 'mobile',
        initialStatusEffects: [],
        initialStress: 0,
        coordinationDifficulty: 15,
        routeDifficulty: 15,
        protectionDifficulty: 15,
        careDifficulty: 15,
      },
      destination: {
        id: 'destination-1',
        name: '目的地',
        handoffRequirement: 'standard',
        handoffDifficulty: 15,
      },
    },
  }
}

export function makeParty(
  roles: AdventurerRole[],
  seedBase: string,
  rank: AdventurerRank,
): Adventurer[] {
  return roles.map((role, i) =>
    generateAdventurer({
      seed: `${seedBase}-${role}-${i}`,
      rank,
      role,
    }),
  )
}

export function makeSurveyRequest(
  seed: string,
  rank: AdventurerRank,
  areaOverrides: {
    id?: string
    name?: string
    minimumAcceptableQuality?: number
    sectors?: {
      id: string
      name: string
      focus: 'route' | 'terrain' | 'hazard' | 'arcane'
      difficulty: number
    }[]
  } = {},
  battleEnabled = true,
): ExpeditionRequest {
  const area = {
    id: 'area-1',
    name: '測量地域',
    minimumAcceptableQuality: 70,
    sectors: [
      { id: 'north', name: '北区画', focus: 'route' as const, difficulty: 15 },
      {
        id: 'center',
        name: '中央区画',
        focus: 'terrain' as const,
        difficulty: 15,
      },
      { id: 'south', name: '南区画', focus: 'arcane' as const, difficulty: 15 },
    ],
    ...areaOverrides,
  }
  return {
    id: `phase3-6-${seed}`,
    seed,
    rank,
    difficulty: 'normal',
    objectiveType: 'survey',
    environment: 'forest',
    distance: 3,
    features: [],
    knownInformation: [],
    hiddenInformation: [],
    battle: battleEnabled
      ? {
          enabled: true,
          seed: `${seed}:battle:0`,
          triggerPhase: 'afterExploration',
        }
      : undefined,
    survey: { area },
  }
}

export function makeRetrievalRequest(
  seed: string,
  rank: AdventurerRank,
  targetOverrides: {
    initialIntegrity?: number
    minimumAcceptableIntegrity?: number
    locationKnown?: boolean
    discoveryDifficulty?: number
    accessDifficulty?: number
    securingDifficulty?: number
    extractionDifficulty?: number
    protectionDifficulty?: number
    bulk?: 'portable' | 'bulky' | 'heavy'
    handling?: 'standard' | 'delicate' | 'arcane'
    fragility?: 'rugged' | 'standard' | 'fragile'
  } = {},
  battleEnabled = true,
): ExpeditionRequest {
  const target = {
    id: 'target-1',
    name: '回収対象',
    initialIntegrity: 80,
    minimumAcceptableIntegrity: 60,
    bulk: 'portable' as const,
    handling: 'standard' as const,
    fragility: 'standard' as const,
    locationKnown: false,
    discoveryDifficulty: 15,
    accessDifficulty: 15,
    securingDifficulty: 15,
    protectionDifficulty: 15,
    extractionDifficulty: 15,
    ...targetOverrides,
  }
  return {
    id: `phase3-5-${seed}`,
    seed,
    rank,
    difficulty: 'normal',
    objectiveType: 'retrieval',
    environment: 'forest',
    distance: 3,
    features: ['traps', 'poorVisibility'],
    knownInformation: [],
    hiddenInformation: [],
    battle: battleEnabled
      ? {
          enabled: true,
          seed: `${seed}:battle:0`,
          triggerPhase: 'afterExploration',
        }
      : undefined,
    retrieval: { target },
  }
}

export interface RegressionScenario {
  name: string
  request: ExpeditionRequest
  party: Adventurer[]
}

export const regressionScenarios: RegressionScenario[] = [
  {
    name: 'investigation-completeSuccess',
    request: makeInvestigationRequest('phase3-1-a-10', 'D'),
    party: makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'phase3-1-a-10',
      'D',
    ),
  },
  {
    name: 'investigation-failedObjective',
    request: makeInvestigationRequest('phase3-1-b-12', 'D'),
    party: makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'phase3-1-b-12',
      'D',
    ),
  },
  {
    name: 'investigation-partialSuccess',
    request: makeInvestigationRequest('phase3-1-c-77', 'D'),
    party: makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'phase3-1-c-77',
      'D',
    ),
  },
  {
    name: 'elimination-completeSuccess',
    request: makeEliminationRequest('s37', 'S', false),
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's37', 'S'),
  },
  {
    name: 'elimination-success',
    request: makeEliminationRequest('s325', 'C', false),
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's325', 'C'),
  },
  {
    name: 'elimination-partialSuccess',
    request: makeEliminationRequest('s1', 'C', false),
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's1', 'C'),
  },
  {
    name: 'elimination-failedObjective',
    request: makeEliminationRequest('s45', 'S', true),
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's45', 'S'),
  },
  {
    name: 'rescue-completeSuccess',
    request: makeRescueRequest('s23', 'C'),
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's23', 'C'),
  },
  {
    name: 'rescue-success',
    request: makeRescueRequest('s43', 'C'),
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's43', 'C'),
  },
  {
    name: 'rescue-failedObjective',
    request: makeRescueRequest('s1', 'C'),
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's1', 'C'),
  },
  {
    name: 'escort-completeSuccess',
    request: makeEscortRequest('s17', 'C'),
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's17', 'C'),
  },
  {
    name: 'escort-success',
    request: makeEscortRequest('s21', 'C'),
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's21', 'C'),
  },
  {
    name: 'escort-partialSuccess',
    request: makeEscortRequest('s9', 'C'),
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's9', 'C'),
  },
  {
    name: 'escort-failedObjective',
    request: makeEscortRequest('s1', 'C'),
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's1', 'C'),
  },
  {
    name: 'retrieval-completeSuccess',
    request: {
      ...makeRetrievalRequest(
        's1',
        'S',
        {
          locationKnown: true,
          discoveryDifficulty: 0,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 0,
          protectionDifficulty: 0,
        },
        false,
      ),
      features: [],
    },
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's1', 'S'),
  },
  {
    name: 'retrieval-success',
    request: {
      ...makeRetrievalRequest(
        's0',
        'C',
        {
          locationKnown: true,
          discoveryDifficulty: 0,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 0,
          protectionDifficulty: 0,
          minimumAcceptableIntegrity: 30,
        },
        false,
      ),
      features: [],
    },
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's0', 'C'),
  },
  {
    name: 'retrieval-partialSuccess',
    request: {
      ...makeRetrievalRequest(
        's0',
        'C',
        {
          locationKnown: true,
          discoveryDifficulty: 0,
          accessDifficulty: 0,
          securingDifficulty: 0,
          extractionDifficulty: 0,
          protectionDifficulty: 0,
          initialIntegrity: 100,
          minimumAcceptableIntegrity: 98,
        },
        false,
      ),
      features: [],
    },
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's0', 'C'),
  },
  {
    name: 'retrieval-failedObjective',
    request: {
      ...makeRetrievalRequest(
        's0',
        'C',
        {
          locationKnown: true,
          discoveryDifficulty: 0,
          accessDifficulty: 0,
          securingDifficulty: 1000,
          extractionDifficulty: 0,
          protectionDifficulty: 0,
          initialIntegrity: 4,
          minimumAcceptableIntegrity: 1,
        },
        false,
      ),
      features: [],
    },
    party: makeParty(['vanguard', 'guardian', 'mage', 'healer'], 's0', 'C'),
  },
  {
    name: 'survey-completeSuccess',
    request: makeSurveyRequest('s49', 'S'),
    party: makeParty(['scout', 'ranger', 'mage', 'support'], 's49', 'S'),
  },
  {
    name: 'survey-success',
    request: makeSurveyRequest('s1', 'C'),
    party: makeParty(['scout', 'ranger', 'mage', 'support'], 's1', 'C'),
  },
  {
    name: 'survey-partialSuccess',
    request: makeSurveyRequest('s109', 'C'),
    party: makeParty(['scout', 'ranger', 'mage', 'support'], 's109', 'C'),
  },
  {
    name: 'survey-failedObjective',
    request: makeSurveyRequest('s1', 'C', {
      sectors: [
        {
          id: 'north',
          name: '北区画',
          focus: 'route' as const,
          difficulty: 1000,
        },
        {
          id: 'center',
          name: '中央区画',
          focus: 'terrain' as const,
          difficulty: 1000,
        },
        {
          id: 'south',
          name: '南区画',
          focus: 'arcane' as const,
          difficulty: 1000,
        },
      ],
    }),
    party: makeParty(['scout', 'ranger', 'mage', 'support'], 's1', 'C'),
  },
]

export function captureScenario(scenario: RegressionScenario) {
  const result = runExpedition(scenario.request, scenario.party)
  return {
    outcome: result.outcome,
    state: result.state,
  }
}

export function cleanForCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cleanForCompare)
  }
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      sorted[key] = cleanForCompare((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}
