import { SeededRng } from '../rng/seededRng.ts'
import {
  type Adventurer,
  type AdventurerRank,
  type AdventurerRole,
  type Difficulty,
  type EncounterShape,
} from '../models/types.ts'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import {
  calculatePartyThreat,
  effectiveEncounterThreat,
  generateEncounter,
} from '../generators/encounterGenerator.ts'
import { runBattle } from './battle.ts'

export interface CrossRankBenchmarkOptions {
  ranks: AdventurerRank[]
  difficulty: Difficulty
  trialsPerRank: number
  roles: AdventurerRole[]
  seed: string
  shape?: EncounterShape
}

export interface CrossRankResult {
  rank: AdventurerRank
  victoryRate: number
  costlyVictoryRate: number
  partialVictoryRate: number
  retreatRate: number
  defeatRate: number
  totalLossRate: number
  stalemateRate: number
  favorableOutcomeRate: number
  avgRounds: number
  avgEnemyCount: number
  avgEnemyTotalHp: number
  avgEnemyRank: number
  avgEnemyTier: number
  avgEnemyAbilityCount: number
  avgPartyTotalHp: number
  avgPartyDamageDealt: number
  avgEnemyDamageDealt: number
  avgAdventurerActionsPerRound: number
  avgEnemyActionsPerRound: number
  rawThreatRatio: number
  actionEconomyAdjustedThreatRatio: number
}

export interface CrossRankBenchmarkSummary {
  options: CrossRankBenchmarkOptions
  results: CrossRankResult[]
}

const RANK_VALUES: Record<AdventurerRank | 'DISASTER', number> = {
  E: 1,
  D: 2,
  C: 3,
  B: 4,
  A: 5,
  S: 6,
  DISASTER: 7,
}

const TIER_VALUES: Record<'minion' | 'standard' | 'elite' | 'boss', number> = {
  minion: 1,
  standard: 2,
  elite: 3,
  boss: 4,
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function generateContext(seed: string) {
  const rng = new SeededRng(seed)
  const lightings: ('dark' | 'bright' | 'normal')[] = [
    'dark',
    'bright',
    'normal',
  ]
  return {
    lighting: rng.pick(lightings),
    noise: rng.integer(0, 20),
    water: rng.chance(20),
    smoke: rng.chance(20),
  }
}

export function runCrossRankBenchmark(
  options: CrossRankBenchmarkOptions,
): CrossRankBenchmarkSummary {
  const partySize = options.roles.length || 4
  const results: CrossRankResult[] = []

  for (const rank of options.ranks) {
    const perRank: {
      outcome: ReturnType<typeof runBattle>['outcome']
      rounds: number
      enemyCount: number
      enemyTotalHp: number
      enemyRanks: number[]
      enemyTiers: number[]
      enemyAbilityCount: number
      partyTotalHp: number
      partyDamage: number
      enemyDamage: number
      adventurerActions: number
      enemyActions: number
      rawThreat: number
      adjustedThreat: number
      partyThreat: number
    }[] = []

    for (let trial = 0; trial < options.trialsPerRank; trial++) {
      const planSeed = `${options.seed}-rank-benchmark-plan-${trial}`
      const contextSeed = `${options.seed}-rank-benchmark-context-${trial}`
      const context = generateContext(contextSeed)

      const party: Adventurer[] = []
      for (let i = 0; i < partySize; i++) {
        const role = options.roles[i]
        party.push(
          generateAdventurer({
            seed: `${options.seed}-rank-benchmark-party-${trial}-${i}`,
            rank,
            role,
          }),
        )
      }

      const partyThreat = calculatePartyThreat(party)
      const enemies = generateEncounter({
        seed: `${options.seed}-rank-benchmark-encounter-${rank}-${options.difficulty}-${trial}`,
        planSeed,
        partyThreat,
        difficulty: options.difficulty,
        partySize,
        shape: options.shape,
      })

      const result = runBattle(
        `${options.seed}-rank-benchmark-battle-${rank}-${options.difficulty}-${trial}`,
        party,
        enemies,
        { context },
      )

      const rawEnemyThreat = enemies.reduce((s, e) => s + e.threatCost, 0)
      const adjustedThreat = effectiveEncounterThreat(
        rawEnemyThreat,
        enemies.length,
        partySize,
      )

      perRank.push({
        outcome: result.outcome,
        rounds: result.rounds,
        enemyCount: enemies.length,
        enemyTotalHp: enemies.reduce((s, e) => s + e.maxHp, 0),
        enemyRanks: enemies.map((e) => RANK_VALUES[e.rank]),
        enemyTiers: enemies.map((e) => TIER_VALUES[e.tier]),
        enemyAbilityCount: enemies.reduce((s, e) => s + e.abilities.length, 0),
        partyTotalHp: party.reduce((s, a) => s + a.maxHp, 0),
        partyDamage: result.partyDamageDealt,
        enemyDamage: result.enemyDamageDealt,
        adventurerActions: result.adventurerActionCount,
        enemyActions: result.enemyActionCount,
        rawThreat: rawEnemyThreat,
        adjustedThreat,
        partyThreat,
      })
    }

    const favorable = ['victory', 'costlyVictory', 'partialVictory'] as const
    results.push({
      rank,
      victoryRate: averageCount(perRank, (r) =>
        r.outcome === 'victory' ? 1 : 0,
      ),
      costlyVictoryRate: averageCount(perRank, (r) =>
        r.outcome === 'costlyVictory' ? 1 : 0,
      ),
      partialVictoryRate: averageCount(perRank, (r) =>
        r.outcome === 'partialVictory' ? 1 : 0,
      ),
      retreatRate: averageCount(perRank, (r) =>
        r.outcome === 'retreat' ? 1 : 0,
      ),
      defeatRate: averageCount(perRank, (r) =>
        r.outcome === 'defeat' ? 1 : 0,
      ),
      totalLossRate: averageCount(perRank, (r) =>
        r.outcome === 'totalLoss' ? 1 : 0,
      ),
      stalemateRate: averageCount(perRank, (r) =>
        r.outcome === 'stalemate' ? 1 : 0,
      ),
      favorableOutcomeRate: averageCount(perRank, (r) =>
        favorable.includes(r.outcome as (typeof favorable)[number]) ? 1 : 0,
      ),
      avgRounds: average(perRank.map((r) => r.rounds)),
      avgEnemyCount: average(perRank.map((r) => r.enemyCount)),
      avgEnemyTotalHp: average(perRank.map((r) => r.enemyTotalHp)),
      avgEnemyRank: average(perRank.flatMap((r) => r.enemyRanks)),
      avgEnemyTier: average(perRank.flatMap((r) => r.enemyTiers)),
      avgEnemyAbilityCount: average(perRank.map((r) => r.enemyAbilityCount)),
      avgPartyTotalHp: average(perRank.map((r) => r.partyTotalHp)),
      avgPartyDamageDealt: average(perRank.map((r) => r.partyDamage)),
      avgEnemyDamageDealt: average(perRank.map((r) => r.enemyDamage)),
      avgAdventurerActionsPerRound: average(
        perRank.map((r) => (r.rounds > 0 ? r.adventurerActions / r.rounds : 0)),
      ),
      avgEnemyActionsPerRound: average(
        perRank.map((r) => (r.rounds > 0 ? r.enemyActions / r.rounds : 0)),
      ),
      rawThreatRatio: average(perRank.map((r) => r.partyThreat / r.rawThreat)),
      actionEconomyAdjustedThreatRatio: average(
        perRank.map((r) => r.partyThreat / r.adjustedThreat),
      ),
    })
  }

  return { options, results }
}

function averageCount<T>(items: T[], fn: (item: T) => number): number {
  return items.reduce((s, item) => s + fn(item), 0) / items.length
}
