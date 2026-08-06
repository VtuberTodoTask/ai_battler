import fs from 'node:fs'
import path from 'node:path'
import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import {
  calculateAbilityThreat,
  generateEnemy,
} from '../src/core/generators/enemyGenerator.ts'
import {
  actionEconomyMultiplier,
  calculatePartyThreat,
  effectiveEncounterThreat,
  generateEncounter,
} from '../src/core/generators/encounterGenerator.ts'
import { runBattle } from '../src/core/battle/battle.ts'
import {
  ABILITY_THREAT_COST,
  DIFFICULTY_BUDGET_MULTIPLIER,
  ENEMY_BASE_THREAT,
  TIER_THREAT_MULTIPLIER,
} from '../src/core/balance/constants.ts'
import type { AbilityId, Adventurer, Enemy } from '../src/core/models/types.ts'

const FAVORABLE = ['victory', 'costlyVictory', 'partialVictory'] as const

const seedArg = process.argv[2] ?? 'phase1-7-ability-cost-v1'

const benchmarkConfig = {
  trialsPerRank: 5000,
  ranks: ['E', 'D', 'C', 'B', 'A', 'S'] as const,
  difficulty: 'normal' as const,
  roles: ['vanguard', 'guardian', 'mage', 'healer'] as const,
  baseSeed: seedArg,
}

const RANK_INDEX: Record<Enemy['rank'], number> = {
  E: 1,
  D: 2,
  C: 3,
  B: 4,
  A: 5,
  S: 6,
  DISASTER: 7,
}

const ALL_ABILITY_IDS: AbilityId[] = [
  'flight',
  'poisonAttack',
  'bleedAttack',
  'areaAttack',
  'revive',
  'regeneration',
  'frontDefense',
  'magicResist',
  'physicalResist',
  'darknessBoost',
  'corpseExplosion',
  'summon',
  'taunt',
  'fear',
  'healBlock',
  'counter',
  'stealthStart',
  'swarmCoordination',
]

function isFavorable(outcome: string): boolean {
  return (FAVORABLE as readonly string[]).includes(outcome)
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

function enemyBodyScale(enemy: Enemy): number {
  const base =
    ENEMY_BASE_THREAT[enemy.rank] * TIER_THREAT_MULTIPLIER[enemy.tier]
  const abilityThreat = calculateAbilityThreat(enemy.abilities)
  return base > 0 ? (enemy.threatCost - abilityThreat) / base : 1
}

function enemyBodyThreat(enemy: Enemy): number {
  return enemy.threatCost - calculateAbilityThreat(enemy.abilities)
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
  let totalRankIndex = 0
  let totalBodyScale = 0
  let minBodyScale = Infinity
  let maxBodyScale = -Infinity
  let totalAbilityThreat = 0
  let totalActualThreat = 0
  let totalBodyThreat = 0
  let totalTargetThreat = 0
  let totalError = 0
  const shapeCounts: Record<string, number> = {}

  const abilityAppearances: Record<string, { count: number; fav: number }> = {}

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

    const budget =
      partyThreat * DIFFICULTY_BUDGET_MULTIPLIER[benchmarkConfig.difficulty]
    const mult = actionEconomyMultiplier(enemies.length, 4)
    const slotTarget = budget / enemies.length / mult

    enemyCount += enemies.length
    enemyTotalHp += enemies.reduce((s, e) => s + e.maxHp, 0)
    enemyAbilityCount += enemies.reduce((s, e) => s + e.abilities.length, 0)

    const raw = enemies.reduce((s, e) => s + e.threatCost, 0)
    rawRatio += raw / partyThreat
    adjRatio += effectiveEncounterThreat(raw, enemies.length, 4) / partyThreat

    for (const enemy of enemies) {
      totalRankIndex += RANK_INDEX[enemy.rank]
      const bs = enemyBodyScale(enemy)
      totalBodyScale += bs
      minBodyScale = Math.min(minBodyScale, bs)
      maxBodyScale = Math.max(maxBodyScale, bs)
      const at = calculateAbilityThreat(enemy.abilities)
      const bt = enemyBodyThreat(enemy)
      totalAbilityThreat += at
      totalActualThreat += enemy.threatCost
      totalBodyThreat += bt
      totalTargetThreat += slotTarget
      totalError += Math.abs(enemy.threatCost - slotTarget)

      for (const ability of enemy.abilities) {
        const entry = abilityAppearances[ability.abilityId] ?? {
          count: 0,
          fav: 0,
        }
        entry.count++
        abilityAppearances[ability.abilityId] = entry
      }
    }

    const result = runBattle(
      `${benchmarkConfig.baseSeed}-battle-${rank}-${t}`,
      party,
      enemies,
    )
    outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1
    const favorable = isFavorable(result.outcome)
    if (favorable) fav++
    rounds += result.rounds
    enemyActions += result.enemyActionCount / Math.max(1, result.rounds)

    if (favorable) {
      for (const enemy of enemies) {
        for (const ability of enemy.abilities) {
          const entry = abilityAppearances[ability.abilityId]
          if (entry) entry.fav++
        }
      }
    }
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
    avgEnemyRankIndex: totalRankIndex / enemyCount,
    avgBodyScale: totalBodyScale / enemyCount,
    minBodyScale,
    maxBodyScale,
    abilityThreatPerEnemy: totalAbilityThreat / enemyCount,
    abilityThreatPerEncounter: totalAbilityThreat / trials,
    bodyThreatPerEnemy: totalBodyThreat / enemyCount,
    bodyThreatPerEncounter: totalBodyThreat / trials,
    actualThreatPerEnemy: totalActualThreat / enemyCount,
    actualThreatPerEncounter: totalActualThreat / trials,
    abilitiesPerEnemy: enemyAbilityCount / enemyCount,
    abilitiesPerEncounter: enemyAbilityCount / trials,
    avgTargetThreat: totalTargetThreat / enemyCount,
    avgThreatError: totalError / enemyCount,
    shapeCounts,
    abilityAppearances,
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

  const lines: string[] = []
  lines.push(`同一敵: ${enc.map((e) => `${e.rank}:${e.tier}`).join(',')}`)
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
        if (isFavorable(result.outcome)) fav++
      }
      out.push(`${rank}:${(fav / 300).toFixed(3)}`)
    }
    lines.push(`  ${comp.name}: ${out.join(' ')}`)
  }
  return lines.join('\n')
}

function perShapeBenchmark(trials: number) {
  const lines: string[] = []
  lines.push('\n=== 遭遇形状別ベンチマーク（標準編成）===')
  for (const shape of ['standard', 'eliteGroup', 'swarm', 'boss'] as const) {
    lines.push(`\n-- shape: ${shape} --`)
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
        if (isFavorable(result.outcome)) fav++
        enemyActions += result.enemyActionCount / Math.max(1, result.rounds)
      }
      lines.push(
        `${rank}: fav=${(fav / trials).toFixed(3)} enemies=${(enemyCount / trials).toFixed(2)} enemyActions=${(enemyActions / trials).toFixed(2)}`,
      )
    }
  }
  return lines.join('\n')
}

function difficultyBenchmark(trials: number) {
  const lines: string[] = []
  lines.push('\n=== 難易度単調性（標準編成）===')
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
        if (isFavorable(result.outcome)) fav++
      }
      out.push(`${rank}:${(fav / trials).toFixed(3)}`)
    }
    lines.push(`${difficulty}: ${out.join(' ')}`)
  }
  return lines.join('\n')
}

function perAbilityBenchmark() {
  const lines: string[] = []
  lines.push('\n=== 能力別単独影響（標準編成 vs C級 standard 4体）===')
  const baseSeed = `${benchmarkConfig.baseSeed}-per-ability`
  const rank = 'C' as const
  const activeAbilities = new Set<AbilityId>([
    'summon',
    'revive',
    'regeneration',
    'fear',
    'healBlock',
    'areaAttack',
    'corpseExplosion',
  ])
  for (const abilityId of ALL_ABILITY_IDS) {
    let favBase = 0
    let favAbility = 0
    const trials = 500
    for (let t = 0; t < trials; t++) {
      const party = buildParty(rank, t)
      const baseEnemies: Enemy[] = []
      const abilityEnemies: Enemy[] = []
      for (let i = 0; i < 4; i++) {
        const template = generateEnemy(`${baseSeed}-${abilityId}-${t}-${i}`, {
          rank,
          tier: 'standard',
          species: 'beast',
          archetype: 'assault',
          abilities: [],
        })
        const idBase = `${abilityId}-${t}-${i}-base`
        const idAbility = `${abilityId}-${t}-${i}-ability`
        baseEnemies.push({ ...template, id: idBase, seed: idBase })
        const abilityEnemy = { ...template, id: idAbility, seed: idAbility }
        abilityEnemy.abilities = [{ abilityId, name: abilityId }]
        if (activeAbilities.has(abilityId)) {
          abilityEnemy.behavior = {
            ...abilityEnemy.behavior,
            usesAbilitiesFirst: true,
          }
        }
        abilityEnemies.push(abilityEnemy)
      }
      const baseResult = runBattle(
        `${baseSeed}-battle-base-${abilityId}-${t}`,
        party,
        baseEnemies,
      )
      const abilityResult = runBattle(
        `${baseSeed}-battle-ability-${abilityId}-${t}`,
        party,
        abilityEnemies,
      )
      if (isFavorable(baseResult.outcome)) favBase++
      if (isFavorable(abilityResult.outcome)) favAbility++
    }
    const delta = (favBase - favAbility) / trials
    const cost = ABILITY_THREAT_COST[abilityId]
    lines.push(
      `${abilityId}: cost=${cost.toFixed(3)} baseFav=${(favBase / trials).toFixed(3)} abilityFav=${(favAbility / trials).toFixed(3)} delta=${delta.toFixed(3)}`,
    )
  }
  return lines.join('\n')
}

function main() {
  const lines: string[] = []
  lines.push(`=== Phase 1.7 Benchmark ===`)
  lines.push(`seed: ${benchmarkConfig.baseSeed}`)
  lines.push(`trialsPerRank: ${benchmarkConfig.trialsPerRank}`)
  lines.push(`roles: ${benchmarkConfig.roles.join('/')}`)
  lines.push(`difficulty: ${benchmarkConfig.difficulty}`)
  lines.push('')

  lines.push('=== 標準編成 Normal 5000試行 ===')
  for (const rank of benchmarkConfig.ranks) {
    const r = runBenchmark(rank, benchmarkConfig.trialsPerRank)
    const outcomeStr = Object.entries(r.outcomes)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ')
    lines.push(`${rank}: fav=${r.favRate.toFixed(3)} | ${outcomeStr}`)
    lines.push(
      `   rounds=${r.avgRounds.toFixed(1)} enemies=${r.avgEnemyCount.toFixed(2)} hp=${r.avgEnemyTotalHp.toFixed(1)} enemyActions=${r.avgEnemyActions.toFixed(2)} rawRatio=${r.avgRawRatio.toFixed(2)} adjRatio=${r.avgAdjRatio.toFixed(2)}`,
    )
    lines.push(
      `   avgRankIndex=${r.avgEnemyRankIndex.toFixed(2)} bodyScale=${r.avgBodyScale.toFixed(3)} minBodyScale=${r.minBodyScale.toFixed(3)} maxBodyScale=${r.maxBodyScale.toFixed(3)}`,
    )
    lines.push(
      `   abilitiesPerEnemy=${r.abilitiesPerEnemy.toFixed(2)} abilitiesPerEncounter=${r.abilitiesPerEncounter.toFixed(2)} abilityThreatPerEnemy=${r.abilityThreatPerEnemy.toFixed(3)} abilityThreatPerEncounter=${r.abilityThreatPerEncounter.toFixed(3)} bodyThreatPerEnemy=${r.bodyThreatPerEnemy.toFixed(3)} bodyThreatPerEncounter=${r.bodyThreatPerEncounter.toFixed(3)} actualThreatPerEnemy=${r.actualThreatPerEnemy.toFixed(3)} actualThreatPerEncounter=${r.actualThreatPerEncounter.toFixed(3)}`,
    )
    lines.push(
      `   targetThreat=${r.avgTargetThreat.toFixed(3)} threatError=${r.avgThreatError.toFixed(3)}`,
    )
    lines.push(`   shapes: ${JSON.stringify(r.shapeCounts)}`)
    const abilityEntries = Object.entries(r.abilityAppearances).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )
    if (abilityEntries.length > 0) {
      const abilityLine = abilityEntries
        .map(([id, { count, fav }]) => {
          const rate = count > 0 ? fav / count : 0
          return `${id}:${count}(${rate.toFixed(2)})`
        })
        .join(' ')
      lines.push(`   abilities: ${abilityLine}`)
    }
  }

  lines.push('')
  lines.push(sameEnemyMonotonicity())
  lines.push(perShapeBenchmark(1000))
  lines.push(difficultyBenchmark(1000))
  lines.push(perAbilityBenchmark())

  const report = lines.join('\n')
  console.log(report)

  const outDir = path.resolve(process.cwd(), 'reports')
  fs.mkdirSync(outDir, { recursive: true })
  const fileName = `phase1-7-report-${seedArg}.txt`
  fs.writeFileSync(path.join(outDir, fileName), report)
}

main()
