import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import type {
  Adventurer,
  AdventurerRank,
  AdventurerRole,
} from '../models/types.ts'
import type {
  ExpeditionRequest,
  ExpeditionResult,
  ExpeditionState,
} from './types.ts'
import { runExpedition } from './expedition.ts'

export function makeRequest(
  seed: string,
  overrides?: Partial<ExpeditionRequest>,
): ExpeditionRequest {
  return {
    id: `test-${seed}`,
    seed,
    rank: 'C',
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
    ...overrides,
  }
}

export function makeParty(
  roles: AdventurerRole[],
  seedBase: string,
  rank: AdventurerRank = 'C',
): Adventurer[] {
  return roles.map((role, i) =>
    generateAdventurer({
      seed: `${seedBase}-${role}-${i}`,
      rank,
      role,
    }),
  )
}

export function cloneParty(party: Adventurer[]): Adventurer[] {
  return structuredClone(party)
}

export function runBatch(
  requestBuilder: (seed: string) => ExpeditionRequest,
  roles: AdventurerRole[],
  n = 50,
): ExpeditionResult[] {
  const results: ExpeditionResult[] = []
  for (let i = 0; i < n; i++) {
    const party = makeParty(roles, `batch-${i}`)
    const request = requestBuilder(`batch-${i}`)
    results.push(runExpedition(request, party))
  }
  return results
}

export function averageMetric(
  results: ExpeditionResult[],
  getter: (r: ExpeditionResult) => number,
): number {
  return results.reduce((sum, r) => sum + getter(r), 0) / results.length
}

export function totalHp(r: ExpeditionResult): number {
  return Object.values(r.state.partyHp).reduce((a, b) => a + b, 0)
}

export function minimalAdventurer(id = 'a', name = 'Test'): Adventurer {
  return { id, name } as unknown as Adventurer
}

export function minimalExpeditionState(hp = 5): ExpeditionState {
  return {
    currentPhase: 'exploration',
    elapsedTime: 0,
    partyHp: { a: hp },
    partyMp: { a: 10 },
    partyMorale: { a: 50 },
    partyStatusEffects: { a: [] },
    supplies: { food: 10, medicine: 10, tools: 10 },
    information: [],
    injuries: [],
    casualties: [],
    incapacitated: [],
    objectiveProgress: 0,
    objectiveCompleted: false,
    discoveredThreats: [],
    avoidedThreats: [],
    logs: [],
    battles: [],
  }
}

export function battleConfig(
  overrides?: Partial<NonNullable<ExpeditionRequest['battle']>>,
): NonNullable<ExpeditionRequest['battle']> {
  return {
    enabled: true,
    seed: 'battle-seed',
    triggerPhase: 'afterExploration',
    ...overrides,
  }
}

export function findBattleLog(result: ExpeditionResult): boolean {
  return result.state.logs.some((l) => l.type === 'battleSummary')
}

export function emptyBattleEntrySnapshot(
  surprise: 'partyAdvantage' | 'neutral' | 'enemyAdvantage' = 'neutral',
) {
  return {
    surprise,
    initialHp: {},
    initialMp: {},
    initialMorale: {},
    initialStatusEffects: {},
    knownEnemyWeaknesses: [],
    knownEnemyAbilities: [],
    environmentEffects: [],
  }
}

export function makeEliminationRequest(
  seed: string,
  rank: AdventurerRank = 'C',
  confirmationRequired = false,
  shape: 'standard' | 'swarm' | 'eliteGroup' | 'boss' = 'standard',
): ExpeditionRequest {
  return makeRequest(seed, {
    objectiveType: 'elimination',
    rank,
    hiddenInformation: [],
    battle: battleConfig({
      seed: `${seed}:battle:0`,
      shape,
    }),
    elimination: { mode: 'allEnemies', confirmationRequired },
  })
}

export function makeEliminationParty(
  seedBase: string,
  rank: AdventurerRank,
): Adventurer[] {
  return makeParty(['vanguard', 'guardian', 'mage', 'healer'], seedBase, rank)
}
