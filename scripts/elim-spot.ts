import { runExpedition } from '../src/core/expedition/expedition.ts'
import {
  generateRequestOffer,
  generateParty,
} from './expedition-rank-matrix.ts'
import { TAVERN_REQUEST_TEMPLATES } from '../src/core/tavern/requestTemplates.ts'
import { PARTY_TEMPLATES } from '../src/core/tavern/partyTemplates.ts'
import type {
  AdventurerRank,
  EliminationObjectiveState,
} from '../src/core/models/types.ts'

const RANKS: AdventurerRank[] = ['E', 'D', 'C', 'B', 'A', 'S']
const SCENARIO_SEEDS = [
  'phase6-2:scenario:0',
  'phase6-2:scenario:1',
  'phase6-2:scenario:2',
]

const allowed: Array<[string, string]> = [
  ['E', 'E'],
  ['E', 'D'],
  ['D', 'D'],
  ['E', 'C'],
  ['D', 'C'],
  ['C', 'C'],
]

const sampleCount = 100

const totals: Record<
  string,
  {
    samples: number
    defeated: number
    escaped: number
    surviving: number
    unknown: number
    completeSuccess: number
    success: number
    partialSuccess: number
    forcedRetreat: number
    failedObjective: number
    other: number
  }
> = {}

function bucket(rankAdvantage: number): string {
  if (rankAdvantage === 0) return 'same-rank'
  if (rankAdvantage > 0) return `+${rankAdvantage}`
  return `${rankAdvantage}`
}

let cellCount = 0
for (const template of TAVERN_REQUEST_TEMPLATES.filter(
  (t) => t.objectiveType === 'elimination',
)) {
  for (const requestRank of ['E', 'D', 'C'] as AdventurerRank[]) {
    for (const scenarioSeed of SCENARIO_SEEDS) {
      const offer = generateRequestOffer(template.id, requestRank, scenarioSeed)
      for (
        let partyTemplateIndex = 0;
        partyTemplateIndex < PARTY_TEMPLATES.length;
        partyTemplateIndex++
      ) {
        for (const partyRank of ['E', 'D', 'C'] as AdventurerRank[]) {
          if (
            !allowed.some(([pr, pp]) => pr === requestRank && pp === partyRank)
          ) {
            continue
          }
          cellCount++
          const party = generateParty(
            PARTY_TEMPLATES[partyTemplateIndex].id,
            partyRank,
            scenarioSeed,
            partyTemplateIndex,
          )
          const rankAdvantage =
            RANKS.indexOf(partyRank) - RANKS.indexOf(requestRank)
          const key = bucket(rankAdvantage)
          totals[key] ??= {
            samples: 0,
            defeated: 0,
            escaped: 0,
            surviving: 0,
            unknown: 0,
            completeSuccess: 0,
            success: 0,
            partialSuccess: 0,
            forcedRetreat: 0,
            failedObjective: 0,
            other: 0,
          }
          const t = totals[key]
          for (let i = 0; i < sampleCount; i++) {
            const result = runExpedition(offer.expeditionRequest, party.members)
            const obj = result.state.objectiveState as EliminationObjectiveState
            t.samples++
            t.defeated += obj.defeatedTargetIds.length
            t.escaped += obj.escapedTargetIds.length
            t.surviving += obj.survivingTargetIds.length
            t.unknown += obj.unknownTargetIds.length
            if (result.outcome === 'completeSuccess') t.completeSuccess++
            else if (result.outcome === 'success') t.success++
            else if (result.outcome === 'partialSuccess') t.partialSuccess++
            else if (result.outcome === 'forcedRetreat') t.forcedRetreat++
            else if (result.outcome === 'failedObjective') t.failedObjective++
            else t.other++
          }
        }
      }
    }
  }
}

function pct(n: number, total: number) {
  return total === 0 ? '0.0' : ((n / total) * 100).toFixed(1)
}

function avg(n: number, total: number) {
  return total === 0 ? '0.00' : (n / total).toFixed(2)
}

console.log(
  `Elimination spot measurement: ${cellCount} cells x ${sampleCount} samples`,
)
for (const key of ['same-rank', '+1', '+2']) {
  const t = totals[key]
  if (!t) continue
  console.log(`\n${key}`)
  console.log(`  samples: ${t.samples}`)
  console.log(`  avg defeated: ${avg(t.defeated, t.samples)}`)
  console.log(`  avg escaped: ${avg(t.escaped, t.samples)}`)
  console.log(`  avg surviving: ${avg(t.surviving, t.samples)}`)
  console.log(`  avg unknown: ${avg(t.unknown, t.samples)}`)
  console.log(
    `  completeSuccess: ${t.completeSuccess} (${pct(t.completeSuccess, t.samples)}%)`,
  )
  console.log(`  success: ${t.success} (${pct(t.success, t.samples)}%)`)
  console.log(
    `  partialSuccess: ${t.partialSuccess} (${pct(t.partialSuccess, t.samples)}%)`,
  )
  console.log(
    `  forcedRetreat: ${t.forcedRetreat} (${pct(t.forcedRetreat, t.samples)}%)`,
  )
  console.log(
    `  failedObjective: ${t.failedObjective} (${pct(t.failedObjective, t.samples)}%)`,
  )
}
