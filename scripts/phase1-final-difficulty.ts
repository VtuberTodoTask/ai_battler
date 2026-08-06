import { generateAdventurer } from '../src/core/generators/adventurerGenerator.ts'
import {
  calculatePartyThreat,
  generateEncounter,
} from '../src/core/generators/encounterGenerator.ts'
import { runBattle } from '../src/core/battle/battle.ts'

const RANKS = ['E', 'D', 'C', 'B', 'A', 'S'] as const
const DIFFICULTIES = ['easy', 'normal', 'hard', 'deadly'] as const
const TRIALS = 5000
const BASE_SEED = 'phase1-final-difficulty-validation-v1'
const ROLES = ['vanguard', 'guardian', 'mage', 'healer'] as const

function buildParty(rank: (typeof RANKS)[number], t: number) {
  return ROLES.map((role, i) =>
    generateAdventurer({
      seed: `${BASE_SEED}-party-${rank}-${t}-${role}-${i}`,
      rank,
      role,
    }),
  )
}

function main() {
  const lines: string[] = []
  lines.push(`# Phase 1 最終定数 難易度別ベンチマーク`)
  lines.push(`seed: ${BASE_SEED}`)
  lines.push(`trials per combination: ${TRIALS}`)
  lines.push(`composition: ${ROLES.join('/')}`)
  lines.push('')
  lines.push(
    '| 等級 | 難易度 | victory | costlyVictory | partialVictory | favorable | retreat | defeat | totalLoss | stalemate | 平均ラウンド |',
  )
  lines.push(
    '| ---- | ------ | ------- | ------------- | -------------- | --------- | ------- | ------ | --------- | --------- | -------------- |',
  )

  for (const rank of RANKS) {
    for (const difficulty of DIFFICULTIES) {
      const counts = {
        victory: 0,
        costlyVictory: 0,
        partialVictory: 0,
        retreat: 0,
        defeat: 0,
        totalLoss: 0,
        stalemate: 0,
      }
      let totalRounds = 0
      for (let t = 0; t < TRIALS; t++) {
        const party = buildParty(rank, t)
        const enemies = generateEncounter({
          seed: `${BASE_SEED}-${rank}-${difficulty}-${t}`,
          planSeed: `${BASE_SEED}-plan-${rank}-${difficulty}-${t}`,
          partyThreat: calculatePartyThreat(party),
          difficulty,
          partySize: 4,
        })
        const result = runBattle(
          `${BASE_SEED}-battle-${rank}-${difficulty}-${t}`,
          party,
          enemies,
        )
        totalRounds += result.rounds
        switch (result.outcome) {
          case 'victory':
            counts.victory++
            break
          case 'costlyVictory':
            counts.costlyVictory++
            break
          case 'partialVictory':
            counts.partialVictory++
            break
          case 'retreat':
            counts.retreat++
            break
          case 'defeat':
            counts.defeat++
            break
          case 'totalLoss':
            counts.totalLoss++
            break
          case 'stalemate':
            counts.stalemate++
            break
        }
      }
      const favorable =
        counts.victory + counts.costlyVictory + counts.partialVictory
      const avgRounds = totalRounds / TRIALS
      lines.push(
        `| ${rank} | ${difficulty} | ${(counts.victory / TRIALS).toFixed(3)} | ${(counts.costlyVictory / TRIALS).toFixed(3)} | ${(counts.partialVictory / TRIALS).toFixed(3)} | ${(favorable / TRIALS).toFixed(3)} | ${(counts.retreat / TRIALS).toFixed(3)} | ${(counts.defeat / TRIALS).toFixed(3)} | ${(counts.totalLoss / TRIALS).toFixed(3)} | ${(counts.stalemate / TRIALS).toFixed(3)} | ${avgRounds.toFixed(1)} |`,
      )
    }
  }

  console.log(lines.join('\n'))
}

main()
