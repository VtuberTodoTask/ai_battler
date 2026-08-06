import fs from 'node:fs'
import path from 'node:path'
import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import {
  calculatePartyThreat,
  generateEncounter,
} from '../src/core/generators/encounterGenerator.ts'
import { runBattle } from '../src/core/battle/battle.ts'
import { ADVENTURER_THREAT } from '../src/core/balance/constants.ts'
import type { AdventurerRank } from '../src/core/models/types.ts'

const FAVORABLE = ['victory', 'costlyVictory', 'partialVictory'] as const
const TRIALS = 5000
const MULTIPLIERS = [0.9, 1.0, 1.1] as const
const ROLES = ['vanguard', 'guardian', 'mage', 'healer'] as const
const RANKS: AdventurerRank[] = ['E', 'D', 'C', 'B', 'A', 'S']

interface RankSensitivity {
  rank: AdventurerRank
  rateAt90: number
  rateAt100: number
  rateAt110: number
  interpolatedMultiplier: number
  newAdventurerThreat: number
}

function isFavorable(outcome: string): boolean {
  return (FAVORABLE as readonly string[]).includes(outcome)
}

function buildParty(
  rank: AdventurerRank,
  trial: number,
): { members: ReturnType<typeof generateAdventurer>[]; threat: number } {
  const members = ROLES.map((role, i) =>
    generateAdventurer({
      seed: `phase1-7b-sens-party-${trial}-${rank}-${role}-${i}`,
      rank,
      role,
    }),
  )
  return { members, threat: calculatePartyThreat(members) }
}

function measureRate(
  rank: AdventurerRank,
  multiplier: number,
  seedBase: string,
): number {
  let fav = 0
  for (let t = 0; t < TRIALS; t++) {
    const { members, threat } = buildParty(rank, t)
    const scaledThreat = threat * multiplier
    const enemies = generateEncounter({
      seed: `${seedBase}-${rank}-${multiplier}-${t}`,
      planSeed: `${seedBase}-plan-${t}`,
      partyThreat: scaledThreat,
      difficulty: 'normal',
      partySize: 4,
    })
    const result = runBattle(
      `${seedBase}-battle-${rank}-${multiplier}-${t}`,
      members,
      enemies,
    )
    if (isFavorable(result.outcome)) fav++
  }
  return fav / TRIALS
}

function interpolateMultiplier(
  rateAt90: number,
  rateAt100: number,
  rateAt110: number,
): number {
  const points = [
    { m: 0.9, r: rateAt90 },
    { m: 1.0, r: rateAt100 },
    { m: 1.1, r: rateAt110 },
  ]
  const target = 0.65

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    if ((a.r >= target && b.r <= target) || (a.r <= target && b.r >= target)) {
      if (Math.abs(b.r - a.r) < 0.001) return 1.0
      return a.m + ((target - a.r) * (b.m - a.m)) / (b.r - a.r)
    }
  }

  // Extrapolate from the nearest interval
  const a = points[1]
  const b = points[2]
  if (Math.abs(b.r - a.r) < 0.001) return 1.0
  return a.m + ((target - a.r) * (b.m - a.m)) / (b.r - a.r)
}

function main() {
  const results: RankSensitivity[] = []
  const lines: string[] = []
  lines.push('=== Phase 1.7B ADVENTURER_THREAT 局所感度測定 ===')
  lines.push(`trials: ${TRIALS}`)
  lines.push(`multipliers: ${MULTIPLIERS.join(', ')}`)
  lines.push('')

  for (const rank of RANKS) {
    const rateAt90 = measureRate(rank, 0.9, 'phase1-7b-sens')
    const rateAt100 = measureRate(rank, 1.0, 'phase1-7b-sens')
    const rateAt110 = measureRate(rank, 1.1, 'phase1-7b-sens')

    let m = interpolateMultiplier(rateAt90, rateAt100, rateAt110)
    m = Math.max(0.85, Math.min(1.15, m))

    // Keep currently in-range ranks unchanged as a principle
    if (rateAt100 >= 0.55 && rateAt100 <= 0.75) {
      m = 1.0
    }

    const newThreat = ADVENTURER_THREAT[rank] * m
    results.push({
      rank,
      rateAt90,
      rateAt100,
      rateAt110,
      interpolatedMultiplier: m,
      newAdventurerThreat: newThreat,
    })
    lines.push(
      `${rank}: x0.90=${rateAt90.toFixed(3)} x1.00=${rateAt100.toFixed(3)} x1.10=${rateAt110.toFixed(3)} -> m=${m.toFixed(3)} newThreat=${newThreat.toFixed(2)} (current=${ADVENTURER_THREAT[rank]})`,
    )
  }

  const report = lines.join('\n')
  console.log(report)

  const outDir = path.resolve(process.cwd(), 'reports')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    path.join(outDir, 'phase1-7b-sensitivity.json'),
    JSON.stringify(results, null, 2),
  )
  fs.writeFileSync(path.join(outDir, 'phase1-7b-sensitivity.txt'), report)
}

main()
