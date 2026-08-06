import fs from 'node:fs'
import path from 'node:path'
import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import { generateEnemy } from '../src/core/generators/enemyGenerator.ts'
import { runBattle } from '../src/core/battle/battle.ts'
import { ABILITY_THREAT_COST } from '../src/core/balance/constants.ts'
import type { AbilityId, Adventurer, Enemy } from '../src/core/models/types.ts'

const FAVORABLE = ['victory', 'costlyVictory', 'partialVictory'] as const
const TRIALS = 500
const ROLES = ['vanguard', 'guardian', 'mage', 'healer'] as const
const SEED = 'phase1-6-synergy-v1'

const SYNERGIES: Array<[AbilityId, AbilityId]> = [
  ['summon', 'revive'],
  ['regeneration', 'frontDefense'],
  ['physicalResist', 'magicResist'],
  ['areaAttack', 'poisonAttack'],
  ['areaAttack', 'bleedAttack'],
  ['healBlock', 'poisonAttack'],
  ['counter', 'taunt'],
  ['corpseExplosion', 'revive'],
]

function buildParty(
  rank: 'E' | 'D' | 'C' | 'B' | 'A' | 'S',
  t: number,
): Adventurer[] {
  return ROLES.map((role, i) =>
    generateAdventurer({
      seed: `${SEED}-party-${rank}-${t}-${role}-${i}`,
      rank,
      role,
    }),
  )
}

function makeEnemies(seedBase: string, abilities: AbilityId[]): Enemy[] {
  const enemies: Enemy[] = []
  for (let i = 0; i < 4; i++) {
    const base = generateEnemy(`${seedBase}-${i}`, {
      rank: 'C',
      tier: 'standard',
      species: 'beast',
      archetype: 'assault',
      abilities: [],
    })
    const e = { ...base, id: `${seedBase}-${i}`, seed: `${seedBase}-${i}` }
    if (i === 0) {
      e.abilities = abilities.map((abilityId) => ({
        abilityId,
        name: abilityId,
      }))
      const active = new Set<AbilityId>([
        'summon',
        'revive',
        'regeneration',
        'fear',
        'healBlock',
        'areaAttack',
        'corpseExplosion',
      ])
      if (abilities.some((a) => active.has(a))) {
        e.behavior = { ...e.behavior, usesAbilitiesFirst: true }
      }
    }
    enemies.push(e)
  }
  return enemies
}

function runScenario(
  abilities: AbilityId[],
  rank: 'E' | 'D' | 'C' | 'B' | 'A' | 'S',
): number {
  let fav = 0
  for (let t = 0; t < TRIALS; t++) {
    const party = buildParty(rank, t)
    const enemies = makeEnemies(
      `${SEED}-${abilities.join('+')}-${rank}-${t}`,
      abilities,
    )
    const result = runBattle(
      `${SEED}-battle-${abilities.join('+')}-${rank}-${t}`,
      party,
      enemies,
    )
    if ((FAVORABLE as readonly string[]).includes(result.outcome)) fav++
  }
  return fav / TRIALS
}

function main() {
  const lines: string[] = []
  lines.push('=== 能力シナジー診断 ===')
  lines.push(`seed: ${SEED}`)
  lines.push(`trials per scenario: ${TRIALS}`)
  lines.push('')

  for (const [a, b] of SYNERGIES) {
    const sumCost = ABILITY_THREAT_COST[a] + ABILITY_THREAT_COST[b]
    lines.push(`\n-- ${a} + ${b} (sumCost=${sumCost.toFixed(3)}) --`)
    for (const rank of ['E', 'D', 'C', 'B', 'A', 'S'] as const) {
      const none = runScenario([], rank)
      const singleA = runScenario([a], rank)
      const singleB = runScenario([b], rank)
      const pair = runScenario([a, b], rank)
      const expectedPair = none - (none - singleA) - (none - singleB)
      const synergy = pair - expectedPair
      lines.push(
        `${rank}: none=${none.toFixed(3)} ${a}=${singleA.toFixed(3)} ${b}=${singleB.toFixed(3)} pair=${pair.toFixed(3)} expected=${expectedPair.toFixed(3)} synergy=${synergy.toFixed(3)}`,
      )
    }
  }

  const report = lines.join('\n')
  console.log(report)
  const outDir = path.resolve(process.cwd(), 'reports')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'ability-synergy.txt'), report)
}

main()
