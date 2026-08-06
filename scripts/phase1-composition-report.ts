import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import {
  calculatePartyThreat,
  effectiveEncounterThreat,
  generateEncounter,
} from '../src/core/generators/encounterGenerator.ts'
import { runBattle } from '../src/core/battle/battle.ts'
import type {
  Adventurer,
  AdventurerRole,
  Enemy,
} from '../src/core/models/types.ts'

const FAVORABLE = ['victory', 'costlyVictory', 'partialVictory'] as const
const baseSeed = 'phase1-fixed-count-v1'
const ranks = ['E', 'D', 'C', 'B', 'A', 'S'] as const

function buildParty(
  rank: 'E' | 'D' | 'C' | 'B' | 'A' | 'S',
  trial: number,
  roles: readonly AdventurerRole[],
): Adventurer[] {
  return roles.map((role, i) =>
    generateAdventurer({
      seed: `${baseSeed}-comp-${roles.join('')}-${rank}-${trial}-${role}-${i}`,
      rank,
      role,
    }),
  )
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

function runComposition(
  name: string,
  roles: readonly AdventurerRole[],
  trials: number,
) {
  console.log(`\n=== ${name} Normal ${trials}試行 ===`)
  for (const rank of ranks) {
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
      const party = buildParty(rank, t, roles)
      const partyThreat = calculatePartyThreat(party)
      const planSeed = `${baseSeed}-comp-plan-${name}-${t}`
      const enemies = generateEncounter({
        seed: `${baseSeed}-comp-encounter-${name}-${rank}-${t}`,
        planSeed,
        partyThreat,
        difficulty: 'normal',
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
        `${baseSeed}-comp-battle-${name}-${rank}-${t}`,
        party,
        enemies,
      )
      outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1
      if ((FAVORABLE as readonly string[]).includes(result.outcome)) fav++
      rounds += result.rounds
      enemyActions += result.enemyActionCount / Math.max(1, result.rounds)
    }

    const outcomeStr = Object.entries(outcomes)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ')
    console.log(
      `${rank}: fav=${(fav / trials).toFixed(3)} | ${outcomeStr} | rounds=${(rounds / trials).toFixed(1)} enemies=${(enemyCount / trials).toFixed(2)} hp=${(enemyTotalHp / trials).toFixed(1)} abilities=${(enemyAbilityCount / trials).toFixed(2)} enemyActions=${(enemyActions / trials).toFixed(2)} rawRatio=${(rawRatio / trials).toFixed(2)} adjRatio=${(adjRatio / trials).toFixed(2)}`,
    )
    console.log(`   shapes: ${JSON.stringify(shapeCounts)}`)
  }
}

runComposition(
  'guardian偏重',
  ['guardian', 'guardian', 'guardian', 'guardian'],
  1000,
)
runComposition('攻撃偏重', ['vanguard', 'vanguard', 'ranger', 'mage'], 1000)
