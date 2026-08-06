import fs from 'node:fs'
import path from 'node:path'
import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import { generateEnemy } from '../src/core/generators/enemyGenerator.ts'
import { runBattle } from '../src/core/battle/battle.ts'
import { SeededRng } from '../src/core/rng/seededRng.ts'
import type {
  AdventurerRank,
  EnemyRank,
  EnemyTier,
} from '../src/core/models/types.ts'

const FAVORABLE = ['victory', 'costlyVictory', 'partialVictory'] as const
const TRIALS = 100
const RANKS: AdventurerRank[] = ['E', 'D', 'C', 'B', 'A', 'S']
const ENEMY_RANKS: EnemyRank[] = ['E', 'D', 'C', 'B', 'A', 'S']
const TIERS: EnemyTier[] = ['standard', 'elite', 'boss']
const ROLES = ['vanguard', 'guardian', 'mage', 'healer'] as const
const SCALES = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5]

function isFavorable(outcome: string): boolean {
  return (FAVORABLE as readonly string[]).includes(outcome)
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

function makeParty(rank: AdventurerRank, seed: string) {
  return ROLES.map((role, i) =>
    generateAdventurer({
      seed: `${seed}-party-${rank}-${role}-${i}`,
      rank,
      role,
    }),
  )
}

function makeEnemies(
  rank: EnemyRank,
  tier: EnemyTier,
  seedBase: string,
  firstScale: number,
) {
  return Array.from({ length: 4 }, (_, i) =>
    generateEnemy(`${seedBase}-enemy-${i}`, {
      rank,
      tier,
      species: 'beast',
      archetype: 'assault',
      abilities: [],
      threatScale: i === 0 ? firstScale : 1,
    }),
  )
}

function measure(
  enemyRank: EnemyRank,
  enemyTier: EnemyTier,
  partyRank: AdventurerRank,
  firstScale: number,
  seedBase: string,
): number {
  let fav = 0
  for (let t = 0; t < TRIALS; t++) {
    const party = makeParty(partyRank, `${seedBase}-party-${t}`)
    const enemies = makeEnemies(
      enemyRank,
      enemyTier,
      `${seedBase}-enc-${t}`,
      firstScale,
    )
    const result = runBattle(`${seedBase}-battle-${t}`, party, enemies, {
      context: generateContext(`${seedBase}-ctx-${t}`),
    })
    if (isFavorable(result.outcome)) fav++
  }
  return fav / TRIALS
}

function main() {
  const results: {
    enemyRank: EnemyRank
    enemyTier: EnemyTier
    partyRank: AdventurerRank
    firstScale: number
    rate: number
  }[] = []
  let done = 0
  const total = ENEMY_RANKS.length * TIERS.length * RANKS.length * SCALES.length
  for (const enemyRank of ENEMY_RANKS) {
    for (const enemyTier of TIERS) {
      for (const partyRank of RANKS) {
        for (const firstScale of SCALES) {
          const seedBase = `grid-${enemyRank}-${enemyTier}-${partyRank}-${firstScale.toFixed(1)}`
          const rate = measure(
            enemyRank,
            enemyTier,
            partyRank,
            firstScale,
            seedBase,
          )
          results.push({ enemyRank, enemyTier, partyRank, firstScale, rate })
          done++
          if (done % 50 === 0) {
            console.log(`grid ${done}/${total}`)
          }
        }
      }
    }
  }
  const outDir = path.resolve(process.cwd(), 'reports')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    path.join(outDir, 'ability-baseline-grid.json'),
    JSON.stringify(results, null, 2),
  )
  console.log('saved reports/ability-baseline-grid.json')
}

main()
