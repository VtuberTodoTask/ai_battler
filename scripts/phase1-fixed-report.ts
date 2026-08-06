import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import {
  calculatePartyThreat,
  effectiveEncounterThreat,
  generateEncounter,
} from '../src/core/generators/encounterGenerator.ts'
import { runBattle } from '../src/core/battle/battle.ts'
import type { Adventurer, Enemy } from '../src/core/models/types.ts'

const FAVORABLE = ['victory', 'costlyVictory', 'partialVictory'] as const
const benchmarkConfig = {
  trialsPerRank: 5000,
  ranks: ['E', 'D', 'C', 'B', 'A', 'S'] as const,
  difficulty: 'normal' as const,
  roles: ['vanguard', 'guardian', 'mage', 'healer'] as const,
  baseSeed: 'phase1-fixed-count-v1',
}

function classifyShape(enemies: Enemy[]): string {
  if (enemies.some((e) => e.tier === 'boss')) return 'boss'
  const minionRate =
    enemies.filter((e) => e.tier === 'minion').length / enemies.length
  if (enemies.length === 7 && minionRate >= 0.5) return 'swarm'
  const eliteRate =
    enemies.filter((e) => e.tier === 'elite').length / enemies.length
  if (eliteRate >= 0.5) return 'eliteGroup'
  return 'standard'
}

function buildParty(
  rank: 'E' | 'D' | 'C' | 'B' | 'A' | 'S',
  trial: number,
): Adventurer[] {
  return benchmarkConfig.roles.map((role, i) =>
    generateAdventurer({
      seed: `${benchmarkConfig.baseSeed}-party-${trial}-${role}-${i}`,
      rank,
      role,
    }),
  )
}

function runBenchmark(rank: 'E' | 'D' | 'C' | 'B' | 'A' | 'S', trials: number) {
  let fav = 0
  const outcomes: Record<string, number> = {}
  let rounds = 0
  let enemyCount = 0
  let enemyTotalHp = 0
  let enemyAbilityCount = 0
  let enemyActions = 0
  let rawRatio = 0
  let adjRatio = 0
  const shapeCounts: Record<string, number> = {}

  for (let t = 0; t < trials; t++) {
    const party = buildParty(rank, t)
    const partyThreat = calculatePartyThreat(party)
    const planSeed = `${benchmarkConfig.baseSeed}-plan-${t}`
    const enemies = generateEncounter({
      seed: `${benchmarkConfig.baseSeed}-encounter-${rank}-${t}`,
      planSeed,
      partyThreat,
      difficulty: benchmarkConfig.difficulty,
      partySize: 4,
    })
    const shape = classifyShape(enemies)
    shapeCounts[shape] = (shapeCounts[shape] ?? 0) + 1

    enemyCount += enemies.length
    enemyTotalHp += enemies.reduce((s, e) => s + e.maxHp, 0)
    enemyAbilityCount += enemies.reduce((s, e) => s + e.abilities.length, 0)

    const raw = enemies.reduce((s, e) => s + e.threatCost, 0)
    rawRatio += raw / partyThreat
    adjRatio += effectiveEncounterThreat(raw, enemies.length, 4) / partyThreat

    const result = runBattle(
      `${benchmarkConfig.baseSeed}-battle-${rank}-${t}`,
      party,
      enemies,
    )
    outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1
    if ((FAVORABLE as readonly string[]).includes(result.outcome)) fav++
    rounds += result.rounds
    enemyActions += result.enemyActionCount / Math.max(1, result.rounds)
  }

  return {
    favRate: fav / trials,
    outcomes,
    avgRounds: rounds / trials,
    avgEnemyCount: enemyCount / trials,
    avgEnemyTotalHp: enemyTotalHp / trials,
    avgEnemyAbilityCount: enemyAbilityCount / trials,
    avgEnemyActions: enemyActions / trials,
    avgRawRatio: rawRatio / trials,
    avgAdjRatio: adjRatio / trials,
    shapeCounts,
  }
}

function sameEnemyMonotonicity() {
  const baseParty = buildParty('C', 0)
  const planSeed = `${benchmarkConfig.baseSeed}-mono-plan`
  const enc = generateEncounter({
    seed: `${benchmarkConfig.baseSeed}-mono-enc`,
    planSeed,
    partyThreat: calculatePartyThreat(baseParty),
    difficulty: benchmarkConfig.difficulty,
    partySize: 4,
  })
  console.log(
    `\n同一敵（C級生成）: ${enc.map((e) => `${e.rank}:${e.tier}`).join(',')}`,
  )

  const rolesList = [
    { name: '標準編成', roles: benchmarkConfig.roles },
    {
      name: 'guardian偏重',
      roles: ['guardian', 'guardian', 'guardian', 'guardian'] as const,
    },
    {
      name: '攻撃偏重',
      roles: ['vanguard', 'vanguard', 'ranger', 'mage'] as const,
    },
  ]

  for (const comp of rolesList) {
    const out: string[] = []
    for (const rank of ['E', 'D', 'C', 'B', 'A', 'S'] as const) {
      let fav = 0
      for (let t = 0; t < 300; t++) {
        const party = comp.roles.map((role, i) =>
          generateAdventurer({
            seed: `${benchmarkConfig.baseSeed}-mono-party-${comp.name}-${rank}-${t}-${i}`,
            rank,
            role,
          }),
        )
        const result = runBattle(
          `${benchmarkConfig.baseSeed}-mono-battle-${comp.name}-${rank}-${t}`,
          party,
          enc,
        )
        if ((FAVORABLE as readonly string[]).includes(result.outcome)) fav++
      }
      out.push(`${rank}:${(fav / 300).toFixed(3)}`)
    }
    console.log(`  ${comp.name}: ${out.join(' ')}`)
  }
}

function perShapeBenchmark(trials: number) {
  console.log('\n=== 遭遇形状別ベンチマーク（標準編成）===')
  for (const shape of ['standard', 'eliteGroup', 'swarm', 'boss'] as const) {
    console.log(`\n-- shape: ${shape} --`)
    for (const rank of ['E', 'D', 'C', 'B', 'A', 'S'] as const) {
      let fav = 0
      let enemyCount = 0
      let enemyActions = 0
      for (let t = 0; t < trials; t++) {
        const party = buildParty(rank, t)
        const enemies = generateEncounter({
          seed: `${benchmarkConfig.baseSeed}-shape-${shape}-${rank}-${t}`,
          planSeed: `${benchmarkConfig.baseSeed}-shape-plan-${t}`,
          partyThreat: calculatePartyThreat(party),
          difficulty: benchmarkConfig.difficulty,
          shape,
          partySize: 4,
        })
        enemyCount += enemies.length
        const result = runBattle(
          `${benchmarkConfig.baseSeed}-shape-battle-${shape}-${rank}-${t}`,
          party,
          enemies,
        )
        if ((FAVORABLE as readonly string[]).includes(result.outcome)) fav++
        enemyActions += result.enemyActionCount / Math.max(1, result.rounds)
      }
      console.log(
        `${rank}: fav=${(fav / trials).toFixed(3)} enemies=${(enemyCount / trials).toFixed(2)} enemyActions=${(enemyActions / trials).toFixed(2)}`,
      )
    }
  }
}

function difficultyBenchmark(trials: number) {
  console.log('\n=== 難易度単調性（標準編成）===')
  for (const difficulty of ['easy', 'normal', 'hard', 'deadly'] as const) {
    const out: string[] = []
    for (const rank of ['E', 'D', 'C', 'B', 'A', 'S'] as const) {
      let fav = 0
      for (let t = 0; t < trials; t++) {
        const party = buildParty(rank, t)
        const enemies = generateEncounter({
          seed: `${benchmarkConfig.baseSeed}-diff-${difficulty}-${rank}-${t}`,
          planSeed: `${benchmarkConfig.baseSeed}-diff-plan-${t}`,
          partyThreat: calculatePartyThreat(party),
          difficulty,
          partySize: 4,
        })
        const result = runBattle(
          `${benchmarkConfig.baseSeed}-diff-battle-${difficulty}-${rank}-${t}`,
          party,
          enemies,
        )
        if ((FAVORABLE as readonly string[]).includes(result.outcome)) fav++
      }
      out.push(`${rank}:${(fav / trials).toFixed(3)}`)
    }
    console.log(`${difficulty}: ${out.join(' ')}`)
  }
}

console.log('=== 標準編成 Normal 5000試行 ===')
for (const rank of benchmarkConfig.ranks) {
  const r = runBenchmark(rank, benchmarkConfig.trialsPerRank)
  const outcomeStr = Object.entries(r.outcomes)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')
  console.log(
    `${rank}: fav=${r.favRate.toFixed(3)} | ${outcomeStr} | rounds=${r.avgRounds.toFixed(1)} enemies=${r.avgEnemyCount.toFixed(2)} hp=${r.avgEnemyTotalHp.toFixed(1)} abilities=${r.avgEnemyAbilityCount.toFixed(2)} enemyActions=${r.avgEnemyActions.toFixed(2)} rawRatio=${r.avgRawRatio.toFixed(2)} adjRatio=${r.avgAdjRatio.toFixed(2)}`,
  )
  console.log(`   shapes: ${JSON.stringify(r.shapeCounts)}`)
}

sameEnemyMonotonicity()
perShapeBenchmark(1000)
difficultyBenchmark(1000)
