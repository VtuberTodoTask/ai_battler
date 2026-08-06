import fs from 'node:fs'
import path from 'node:path'
import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import { generateEnemy } from '../src/core/generators/enemyGenerator.ts'
import { runBattle } from '../src/core/battle/battle.ts'
import { SeededRng } from '../src/core/rng/seededRng.ts'
import {
  ENEMY_BASE_THREAT,
  TIER_THREAT_MULTIPLIER,
} from '../src/core/balance/constants.ts'
import { ABILITIES, ABILITY_MAP } from '../src/data/enemyData.ts'
import type {
  AbilityId,
  Adventurer,
  AdventurerRank,
  AdventurerRole,
  BattleContext,
  BattleResult,
  Enemy,
  EnemyRank,
  EnemyTier,
} from '../src/core/models/types.ts'

const FAVORABLE = ['victory', 'costlyVictory', 'partialVictory'] as const
const TRIALS = 3000
const SENSITIVITY_TRIALS = 800
const ROLE_TRIALS = 300

const ALL_ABILITY_IDS = ABILITIES.map((a) => a.id as AbilityId)

const COMPOSITIONS: { name: string; roles: AdventurerRole[] }[] = [
  { name: 'standard', roles: ['vanguard', 'guardian', 'mage', 'healer'] },
  {
    name: 'guardian-heavy',
    roles: ['guardian', 'guardian', 'guardian', 'guardian'],
  },
  { name: 'attack-heavy', roles: ['vanguard', 'vanguard', 'ranger', 'mage'] },
]

interface GridEntry {
  enemyRank: EnemyRank
  enemyTier: EnemyTier
  partyRank: AdventurerRank
  firstScale: number
  rate: number
}

interface AbilityAblationScenario {
  abilityId: AbilityId
  enemyRank: EnemyRank
  enemyTier: EnemyTier
  partyRank: AdventurerRank
  composition: string
  firstScale: number
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
  cost: number
  costLower: number
  costUpper: number
  trials: number
}

interface RoleEffect {
  composition: string
  partyRank: AdventurerRank
  cost: number
  activationRate: number
  baselineFavorableRate: number
  abilityFavorableRate: number
}

interface AbilityResult {
  abilityId: AbilityId
  cost: number
  costLower: number
  costUpper: number
  activationRate: number
  averageUses: number
  effectiveBattleRate: number
  costWhenActivated: number
  provisional: boolean
  confidence: 'high' | 'medium' | 'low'
  scenarioCount: number
  roleEffects: RoleEffect[]
  scenarios: AbilityAblationScenario[]
}

function isFavorable(outcome: BattleResult['outcome']): boolean {
  return (FAVORABLE as readonly string[]).includes(outcome)
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

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted.length > base + 1) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  }
  return sorted[base]
}

function generateContext(seed: string): BattleContext {
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

function makeParty(
  rank: AdventurerRank,
  roles: AdventurerRole[],
  seed: string,
): Adventurer[] {
  return roles.map((role, i) =>
    generateAdventurer({
      seed: `${seed}-party-${rank}-${role}-${i}`,
      rank,
      role,
    }),
  )
}

function makeBaseEnemies(
  rank: EnemyRank,
  tier: EnemyTier,
  seedBase: string,
  trial: number,
  firstScale: number,
): Enemy[] {
  return Array.from({ length: 4 }, (_, i) =>
    generateEnemy(`${seedBase}-enc-${trial}-enemy-${i}`, {
      rank,
      tier,
      species: 'beast',
      archetype: 'assault',
      abilities: [],
      threatScale: i === 0 ? firstScale : 1,
    }),
  )
}

const ACTIVE_ABILITIES: AbilityId[] = ['summon', 'revive', 'healBlock', 'fear']

function isActiveAbility(abilityId: AbilityId): boolean {
  return ACTIVE_ABILITIES.includes(abilityId)
}

function cloneWithAbility(baseEnemies: Enemy[], abilityId: AbilityId): Enemy[] {
  return baseEnemies.map((enemy, i) => {
    if (i !== 0) return enemy
    const clone = structuredClone(enemy) as Enemy
    clone.id = `${enemy.id}-ability`
    clone.seed = `${enemy.seed}-ability`
    clone.abilities = [
      { abilityId, name: ABILITY_MAP[abilityId]?.name ?? abilityId },
    ]
    if (isActiveAbility(abilityId) || abilityId === 'fear') {
      clone.behavior = { ...clone.behavior, usesAbilitiesFirst: true }
    }
    return clone
  })
}

function loadGrid(): GridEntry[] {
  const gridPath = path.resolve(
    process.cwd(),
    'reports/ability-baseline-grid.json',
  )
  return JSON.parse(fs.readFileSync(gridPath, 'utf8')) as GridEntry[]
}

function selectCandidates(grid: GridEntry[], count = 3): GridEntry[] {
  const inRange = grid
    .filter((g) => g.rate >= 0.35 && g.rate <= 0.65)
    .map((g) => ({ ...g, dist: Math.abs(g.rate - 0.5) }))
    .sort((a, b) => a.dist - b.dist)
  let chosen = inRange.slice(0, count)
  if (chosen.length < count) {
    const used = new Set(
      chosen.map(
        (c) => `${c.enemyRank}-${c.enemyTier}-${c.partyRank}-${c.firstScale}`,
      ),
    )
    const fallback = grid
      .filter(
        (g) =>
          g.rate >= 0.3 &&
          g.rate <= 0.7 &&
          !used.has(
            `${g.enemyRank}-${g.enemyTier}-${g.partyRank}-${g.firstScale}`,
          ),
      )
      .map((g) => ({ ...g, dist: Math.abs(g.rate - 0.5) }))
      .sort((a, b) => a.dist - b.dist)
    chosen = chosen.concat(fallback).slice(0, count)
  }
  if (chosen.length < count) {
    const used = new Set(
      chosen.map(
        (c) => `${c.enemyRank}-${c.enemyTier}-${c.partyRank}-${c.firstScale}`,
      ),
    )
    const rest = grid
      .filter(
        (g) =>
          !used.has(
            `${g.enemyRank}-${g.enemyTier}-${g.partyRank}-${g.firstScale}`,
          ),
      )
      .map((g) => ({ ...g, dist: Math.abs(g.rate - 0.5) }))
      .sort((a, b) => a.dist - b.dist)
    chosen = chosen.concat(rest).slice(0, count)
  }
  return chosen.map((c) => ({
    enemyRank: c.enemyRank,
    enemyTier: c.enemyTier,
    partyRank: c.partyRank,
    firstScale: c.firstScale,
    rate: c.rate,
  }))
}

function runPairedBatch(
  candidate: GridEntry,
  abilityId: AbilityId | undefined,
  composition: string,
  trials: number,
  seedBase: string,
): {
  favRate: number
  avgEnemyDamage: number
  avgRounds: number
  avgAbilityUsage: number
  activationRate: number
} {
  const roles = COMPOSITIONS.find((c) => c.name === composition)!.roles
  const abilityEnemyId = `${candidate.enemyRank}-${candidate.enemyTier}-${seedBase}-enc-0-ability`
  let fav = 0
  let damage = 0
  let rounds = 0
  let activated = 0
  let uses = 0
  for (let t = 0; t < trials; t++) {
    const party = makeParty(
      candidate.partyRank,
      roles,
      `${seedBase}-party-${t}`,
    )
    const baseEnemies = makeBaseEnemies(
      candidate.enemyRank,
      candidate.enemyTier,
      seedBase,
      t,
      candidate.firstScale,
    )
    const enemies = abilityId
      ? cloneWithAbility(baseEnemies, abilityId)
      : baseEnemies
    const context = generateContext(`${seedBase}-ctx-${t}`)
    const result = runBattle(`${seedBase}-battle-${t}`, party, enemies, {
      context,
    })
    if (isFavorable(result.outcome)) fav++
    damage += result.enemyDamageDealt
    rounds += result.rounds
    if (abilityId) {
      if (abilityId === 'darknessBoost') {
        if (context.lighting === 'dark') {
          activated++
          uses++
        }
      } else if (abilityId === 'corpseExplosion') {
        if (result.defeatedEnemies.includes(abilityEnemyId)) {
          activated++
          uses++
        }
      } else if (abilityId === 'fear') {
        activated++
        uses++
      } else if (isActiveAbility(abilityId)) {
        const u = result.abilityUsage[abilityId] ?? 0
        if (u > 0) {
          activated++
          uses += u
        }
      } else {
        activated++
        uses++
      }
    }
  }
  return {
    favRate: fav / trials,
    avgEnemyDamage: damage / trials,
    avgRounds: rounds / trials,
    avgAbilityUsage: abilityId ? uses / trials : 0,
    activationRate: abilityId ? activated / trials : 1,
  }
}

function measureSensitivity(
  candidate: GridEntry,
  composition: string,
  seedBase: string,
): number {
  const low = runPairedBatch(
    { ...candidate, firstScale: candidate.firstScale * 0.9 },
    undefined,
    composition,
    SENSITIVITY_TRIALS,
    `${seedBase}-sens-low`,
  )
  const high = runPairedBatch(
    { ...candidate, firstScale: candidate.firstScale * 1.1 },
    undefined,
    composition,
    SENSITIVITY_TRIALS,
    `${seedBase}-sens-high`,
  )
  const deltaFav = high.favRate - low.favRate
  const baseThreat =
    ENEMY_BASE_THREAT[candidate.enemyRank] *
    TIER_THREAT_MULTIPLIER[candidate.enemyTier]
  const threatDelta = baseThreat * candidate.firstScale * (1.1 - 0.9)
  if (Math.abs(threatDelta) < 0.001) return 0
  return deltaFav / threatDelta
}

function scenarioConfidence(
  cost: number,
  costLower: number,
  costUpper: number,
  activationRate: number,
): { provisional: boolean; confidence: 'high' | 'medium' | 'low' } {
  if (cost <= 0 || costLower <= 0 || costUpper <= 0) {
    return { provisional: true, confidence: 'low' }
  }
  if (costLower <= 0 || costUpper / cost > 2 || activationRate < 0.05) {
    return { provisional: true, confidence: 'low' }
  }
  if (costUpper / cost > 1.5 || activationRate < 0.2) {
    return { provisional: true, confidence: 'medium' }
  }
  return { provisional: false, confidence: 'high' }
}

function runScenario(
  abilityId: AbilityId,
  candidate: GridEntry,
  composition: string,
  seedBase: string,
): AbilityAblationScenario | undefined {
  const baseline = runPairedBatch(
    candidate,
    undefined,
    composition,
    TRIALS,
    `${seedBase}-base`,
  )
  if (baseline.favRate < 0.3 || baseline.favRate > 0.7) {
    return undefined
  }
  const ability = runPairedBatch(
    candidate,
    abilityId,
    composition,
    TRIALS,
    `${seedBase}-ability`,
  )
  const sensitivity = measureSensitivity(candidate, composition, seedBase)

  const delta = baseline.favRate - ability.favRate
  const seDelta = Math.sqrt(
    (baseline.favRate * (1 - baseline.favRate)) / TRIALS +
      (ability.favRate * (1 - ability.favRate)) / TRIALS,
  )
  const deltaLower = delta - 1.96 * seDelta
  const deltaUpper = delta + 1.96 * seDelta

  let cost = 0
  let costLower = 0
  let costUpper = 0
  if (sensitivity < -0.001) {
    cost = -delta / sensitivity
    costLower = -deltaLower / sensitivity
    costUpper = -deltaUpper / sensitivity
  }

  return {
    abilityId,
    enemyRank: candidate.enemyRank,
    enemyTier: candidate.enemyTier,
    partyRank: candidate.partyRank,
    composition,
    firstScale: candidate.firstScale,
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
    cost,
    costLower,
    costUpper,
    trials: TRIALS,
  }
}

function runAllAblation(): AbilityResult[] {
  const grid = loadGrid()
  const results: AbilityResult[] = []

  for (const abilityId of ALL_ABILITY_IDS) {
    console.log(`\nMeasuring ${abilityId}...`)
    const candidates = selectCandidates(grid, 3)
    const scenarios: AbilityAblationScenario[] = []

    for (const candidate of candidates) {
      const seedBase = `ablation-1.7-${abilityId}-${candidate.enemyRank}-${candidate.enemyTier}-${candidate.partyRank}-${candidate.firstScale.toFixed(1)}`
      const scenario = runScenario(abilityId, candidate, 'standard', seedBase)
      if (scenario) {
        scenarios.push(scenario)
        console.log(
          `  ${candidate.enemyRank}/${candidate.enemyTier} party=${candidate.partyRank} scale=${candidate.firstScale.toFixed(1)} base=${scenario.baselineFavorableRate.toFixed(3)} ability=${scenario.abilityFavorableRate.toFixed(3)} delta=${scenario.favorableRateDelta.toFixed(3)} cost=${scenario.cost.toFixed(3)}`,
        )
      }
    }

    const validScenarios = scenarios.filter(
      (s) =>
        s.baselineFavorableRate >= 0.35 &&
        s.baselineFavorableRate <= 0.65 &&
        s.cost > 0 &&
        s.sensitivity < -0.001 &&
        s.favorableRateDelta > 0.01,
    )

    const costs = validScenarios.map((s) => s.cost)
    let medianCost = 0
    let costLower = 0
    let costUpper = 0
    if (costs.length > 0) {
      medianCost = median(costs)
      costLower = quantile(costs, 0.025)
      costUpper = quantile(costs, 0.975)
    }

    const activationRates = scenarios.map((s) => s.activationRate)
    const avgActivation = average(activationRates)
    const avgUses = average(scenarios.map((s) => s.averageUses))

    const roleEffects: RoleEffect[] = []
    for (const comp of COMPOSITIONS.slice(1)) {
      const std = validScenarios[0] ?? scenarios[0]
      if (!std) continue
      const candidate: GridEntry = {
        enemyRank: std.enemyRank,
        enemyTier: std.enemyTier,
        partyRank: std.partyRank,
        firstScale: std.firstScale,
        rate: std.baselineFavorableRate,
      }
      const seedBase = `ablation-1.7-${abilityId}-role-${comp.name}`
      const baseline = runPairedBatch(
        candidate,
        undefined,
        comp.name,
        ROLE_TRIALS,
        `${seedBase}-base`,
      )
      const ability = runPairedBatch(
        candidate,
        abilityId,
        comp.name,
        ROLE_TRIALS,
        `${seedBase}-ability`,
      )
      const sensitivity = measureSensitivity(
        candidate,
        comp.name,
        `${seedBase}-sens`,
      )
      const delta = baseline.favRate - ability.favRate
      const roleCost =
        sensitivity < -0.001 && delta > 0 ? -delta / sensitivity : 0
      roleEffects.push({
        composition: comp.name,
        partyRank: std.partyRank,
        cost: roleCost,
        activationRate: ability.activationRate,
        baselineFavorableRate: baseline.favRate,
        abilityFavorableRate: ability.favRate,
      })
    }

    const effectiveBattleRate = avgActivation
    const costWhenActivated =
      avgActivation > 0 ? medianCost / avgActivation : medianCost

    const { provisional, confidence } = scenarioConfidence(
      medianCost,
      costLower,
      costUpper,
      avgActivation,
    )

    let finalCost = medianCost
    if (finalCost <= 0) {
      finalCost = 0.05
    }

    results.push({
      abilityId,
      cost: finalCost,
      costLower,
      costUpper,
      activationRate: avgActivation,
      averageUses: avgUses,
      effectiveBattleRate,
      costWhenActivated,
      provisional,
      confidence,
      scenarioCount: validScenarios.length,
      roleEffects,
      scenarios,
    })

    console.log(
      `  -> cost=${finalCost.toFixed(3)} confidence=${confidence} activation=${avgActivation.toFixed(3)} uses=${avgUses.toFixed(3)} scenarios=${validScenarios.length}/${scenarios.length}`,
    )
  }

  return results
}

function main() {
  const results = runAllAblation()

  const costLines: string[] = []
  costLines.push('=== Suggested ABILITY_THREAT_COST ===')
  for (const r of results) {
    const note = r.provisional ? ` // ${r.confidence} provisional` : ''
    costLines.push(`  ${r.abilityId}: ${r.cost.toFixed(3)},${note}`)
  }
  console.log('\n' + costLines.join('\n'))

  const outDir = path.resolve(process.cwd(), 'reports')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    path.join(outDir, 'ability-ablation-1.7.json'),
    JSON.stringify(results, null, 2),
  )
  const summary = results.map((r) => ({
    abilityId: r.abilityId,
    cost: r.cost,
    costLower: r.costLower,
    costUpper: r.costUpper,
    activationRate: r.activationRate,
    averageUses: r.averageUses,
    costWhenActivated: r.costWhenActivated,
    provisional: r.provisional,
    confidence: r.confidence,
    scenarioCount: r.scenarioCount,
    roleEffects: r.roleEffects,
  }))
  fs.writeFileSync(
    path.join(outDir, 'ability-ablation-1.7-summary.json'),
    JSON.stringify(summary, null, 2),
  )
  fs.writeFileSync(
    path.join(outDir, 'ability-ablation-1.7-costs.json'),
    JSON.stringify(
      Object.fromEntries(results.map((r) => [r.abilityId, r.cost])),
      null,
      2,
    ),
  )
}

main()
