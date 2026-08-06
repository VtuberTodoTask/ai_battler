import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import { generateEnemy } from '../src/core/generators/enemyGenerator.ts'
import { runBattle } from '../src/core/battle/battle.ts'
import type {
  Adventurer,
  AdventurerRole,
  BattleContext,
  BattleResult,
  Enemy,
  EnemyRank,
  EnemyTier,
} from '../src/core/models/types.ts'
import { ABILITIES, ABILITY_MAP } from '../src/data/enemyData.ts'
import {
  ENEMY_BASE_THREAT,
  TIER_THREAT_MULTIPLIER,
} from '../src/core/balance/constants.ts'
import * as fs from 'fs'
import * as path from 'path'

const ABILITY_IDS = ABILITIES.map((a) => a.id)
const RANKS: EnemyRank[] = ['E', 'C', 'B', 'S']
const TIERS: EnemyTier[] = ['standard', 'elite', 'boss']
const STANDARD_ROLES: AdventurerRole[] = [
  'vanguard',
  'guardian',
  'mage',
  'healer',
]
const PARTY_RANKS: EnemyRank[] = ['E', 'D', 'C', 'B', 'A', 'S']
const TRIALS = 2000
const PILOT_TRIALS = 100
const SENSITIVITY_TRIALS = 300

interface AbilityAblationScenario {
  abilityId: string
  rank: EnemyRank
  tier: EnemyTier
  partyRank: EnemyRank
  trials: number
  baselineFavorableRate: number
  abilityFavorableRate: number
  favorableRateDelta: number
  baselineEnemyDamage: number
  abilityEnemyDamage: number
  enemyDamageDelta: number
  baselineRounds: number
  abilityRounds: number
  roundDelta: number
  activationRate: number
  averageUses: number
  sensitivity: number
  estimatedCost: number
}

interface AbilitySummary {
  abilityId: string
  estimatedCost: number
  avgActivationRate: number
  avgDelta: number
  scenarioCount: number
}

const FAVORABLE = ['victory', 'costlyVictory', 'partialVictory']

function isFavorable(outcome: BattleResult['outcome']): boolean {
  return FAVORABLE.includes(outcome)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2
  return sorted[mid]
}

function makeParty(rank: EnemyRank, seed: string): Adventurer[] {
  return STANDARD_ROLES.map((role, i) =>
    generateAdventurer({
      seed: `${seed}-party-${rank}-${role}-${i}`,
      rank,
      role,
    }),
  )
}

function makeBaseEnemy(
  seed: string,
  rank: EnemyRank,
  tier: EnemyTier,
  archetype: 'assault' | 'controller',
  threatScale = 1,
): Enemy {
  return generateEnemy(seed, {
    rank,
    tier,
    species: 'beast',
    archetype,
    threatScale,
  })
}

function cloneEnemy(e: Enemy, newId: string): Enemy {
  return { ...e, id: newId, seed: newId }
}

function makeEnemies(
  seedBase: string,
  rank: EnemyRank,
  tier: EnemyTier,
  archetype: 'assault' | 'controller',
  abilityId?: string,
  threatScale = 1,
): Enemy[] {
  const base = makeBaseEnemy(
    `${seedBase}-base`,
    rank,
    tier,
    archetype,
    threatScale,
  )
  const enemies: Enemy[] = []
  for (let i = 0; i < 4; i++) {
    const id = `${rank}-${tier}-${archetype}-${seedBase}-${i}`
    const clone = cloneEnemy(base, id)
    clone.abilities = []
    if (i === 0 && abilityId) {
      const def = ABILITY_MAP[abilityId]
      clone.abilities = [{ abilityId, name: def?.name ?? abilityId }]
      clone.behavior = { ...clone.behavior, usesAbilitiesFirst: true }
    }
    enemies.push(clone)
  }
  return enemies
}

function runBatch(
  party: Adventurer[],
  enemies: Enemy[],
  trials: number,
  seedBase: string,
  context?: BattleContext,
): {
  favRate: number
  avgEnemyDamage: number
  avgRounds: number
  avgAbilityUsage: number
  activationRate: number
} {
  const abilityId = enemies[0].abilities[0]?.abilityId
  let fav = 0
  let damage = 0
  let rounds = 0
  let activated = 0
  let uses = 0
  for (let i = 0; i < trials; i++) {
    const result = runBattle(`${seedBase}-${i}`, party, enemies, { context })
    if (isFavorable(result.outcome)) fav++
    damage += result.enemyDamageDealt
    rounds += result.rounds
    if (abilityId) {
      const u = result.abilityUsage[abilityId] ?? 0
      if (u > 0) activated++
      uses += u
    }
  }
  return {
    favRate: fav / trials,
    avgEnemyDamage: damage / trials,
    avgRounds: rounds / trials,
    avgAbilityUsage: abilityId ? uses / trials : 0,
    activationRate: abilityId ? activated / trials : 0,
  }
}

function measureSensitivity(
  party: Adventurer[],
  enemies: Enemy[],
  seedBase: string,
  context?: BattleContext,
): number {
  const rank = enemies[0].rank
  const tier = enemies[0].tier
  const archetype = enemies[0].archetype as 'assault' | 'controller'
  const results: { scale: number; favRate: number }[] = []
  for (const scale of [0.9, 1.1]) {
    const scaled = makeEnemies(
      `${seedBase}-sens-${scale}`,
      rank,
      tier,
      archetype,
      undefined,
      scale,
    )
    const batch = runBatch(
      party,
      scaled,
      SENSITIVITY_TRIALS,
      `${seedBase}-sens-${scale}`,
      context,
    )
    results.push({ scale, favRate: batch.favRate })
  }
  const deltaFav = results[1].favRate - results[0].favRate
  const baseThreat = ENEMY_BASE_THREAT[rank] * TIER_THREAT_MULTIPLIER[tier]
  const totalThreatDelta =
    4 * baseThreat * (results[1].scale - results[0].scale)
  if (Math.abs(totalThreatDelta) < 0.001) return 0
  return deltaFav / totalThreatDelta
}

function findOptimalPartyRank(
  rank: EnemyRank,
  tier: EnemyTier,
  archetype: 'assault' | 'controller',
  seedBase: string,
  context?: BattleContext,
): EnemyRank {
  let bestRank: EnemyRank = 'C'
  let bestDistance = Infinity
  for (const partyRank of PARTY_RANKS) {
    const party = makeParty(partyRank, `${seedBase}-pilot`)
    const enemies = makeEnemies(`${seedBase}-pilot`, rank, tier, archetype)
    const batch = runBatch(
      party,
      enemies,
      PILOT_TRIALS,
      `${seedBase}-pilot-${partyRank}`,
      context,
    )
    const distance = Math.abs(batch.favRate - 0.5)
    if (distance < bestDistance) {
      bestDistance = distance
      bestRank = partyRank
    }
  }
  return bestRank
}

function archetypeForAbility(abilityId: string): 'assault' | 'controller' {
  const active = ['summon', 'revive', 'healBlock', 'fear']
  return active.includes(abilityId) ? 'controller' : 'assault'
}

function contextForAbility(abilityId: string): BattleContext | undefined {
  return abilityId === 'darknessBoost'
    ? { lighting: 'dark', noise: 0, water: false, smoke: false }
    : undefined
}

function runAllAblation(): AbilityAblationScenario[] {
  const results: AbilityAblationScenario[] = []
  for (const abilityId of ABILITY_IDS) {
    console.log(`\nMeasuring ${abilityId}...`)
    const archetype = archetypeForAbility(abilityId)
    const context = contextForAbility(abilityId)
    for (const rank of RANKS) {
      for (const tier of TIERS) {
        const seedBase = `ablation-${abilityId}-${rank}-${tier}`
        const partyRank = findOptimalPartyRank(
          rank,
          tier,
          archetype,
          seedBase,
          context,
        )
        const party = makeParty(partyRank, seedBase)

        const baselineEnemies = makeEnemies(
          `${seedBase}-base`,
          rank,
          tier,
          archetype,
        )
        const baseline = runBatch(
          party,
          baselineEnemies,
          TRIALS,
          `${seedBase}-base`,
          context,
        )

        const abilityEnemies = makeEnemies(
          `${seedBase}-ability`,
          rank,
          tier,
          archetype,
          abilityId,
        )
        const ability = runBatch(
          party,
          abilityEnemies,
          TRIALS,
          `${seedBase}-ability`,
          context,
        )

        const sensitivity = measureSensitivity(
          party,
          baselineEnemies,
          seedBase,
          context,
        )

        const delta = baseline.favRate - ability.favRate
        const estimatedCost =
          sensitivity < 0 && delta > 0 ? -delta / sensitivity : 0

        results.push({
          abilityId,
          rank,
          tier,
          partyRank,
          trials: TRIALS,
          baselineFavorableRate: baseline.favRate,
          abilityFavorableRate: ability.favRate,
          favorableRateDelta: delta,
          baselineEnemyDamage: baseline.avgEnemyDamage,
          abilityEnemyDamage: ability.avgEnemyDamage,
          enemyDamageDelta: ability.avgEnemyDamage - baseline.avgEnemyDamage,
          baselineRounds: baseline.avgRounds,
          abilityRounds: ability.avgRounds,
          roundDelta: ability.avgRounds - baseline.avgRounds,
          activationRate: ability.activationRate,
          averageUses: ability.avgAbilityUsage,
          sensitivity,
          estimatedCost,
        })
        console.log(
          `  ${rank}/${tier} party=${partyRank} base=${baseline.favRate.toFixed(3)} ability=${ability.favRate.toFixed(3)} delta=${delta.toFixed(3)} sens=${sensitivity.toFixed(4)} cost=${estimatedCost.toFixed(3)}`,
        )
      }
    }
  }
  return results
}

function summarize(results: AbilityAblationScenario[]): AbilitySummary[] {
  const byAbility = new Map<string, AbilityAblationScenario[]>()
  for (const r of results) {
    const arr = byAbility.get(r.abilityId) ?? []
    arr.push(r)
    byAbility.set(r.abilityId, arr)
  }
  const summaries: AbilitySummary[] = []
  for (const [abilityId, arr] of byAbility.entries()) {
    const valid = arr.filter(
      (r) =>
        r.baselineFavorableRate > 0.1 &&
        r.baselineFavorableRate < 0.9 &&
        r.sensitivity < -0.01 &&
        r.favorableRateDelta > 0.01,
    )
    const positiveCosts = valid.map((r) => r.estimatedCost).filter((c) => c > 0)
    const maxCost = Math.max(0, ...arr.map((r) => r.estimatedCost))
    let cost = 0.1
    if (positiveCosts.length > 0) {
      cost = median(positiveCosts)
    } else if (maxCost > 0) {
      cost = maxCost
    }
    summaries.push({
      abilityId,
      estimatedCost: cost,
      avgActivationRate: average(arr.map((r) => r.activationRate)),
      avgDelta: average(arr.map((r) => r.favorableRateDelta)),
      scenarioCount: arr.length,
    })
  }
  return summaries.sort((a, b) => a.abilityId.localeCompare(b.abilityId))
}

const results = runAllAblation()
const summaries = summarize(results)

const outDir = path.resolve(process.cwd(), 'reports')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(
  path.join(outDir, 'ability-ablation-raw.json'),
  JSON.stringify(results, null, 2),
)
fs.writeFileSync(
  path.join(outDir, 'ability-ablation-summary.json'),
  JSON.stringify(summaries, null, 2),
)

console.log('\n=== Suggested ABILITY_THREAT_COST ===')
for (const s of summaries) {
  console.log(`  ${s.abilityId}: ${s.estimatedCost.toFixed(3)},`)
}
