import { generateTavernDay } from '../src/core/tavern/dayGenerator.ts'
import {
  evaluateOffer,
  toPublicRequestProfile,
} from '../src/core/tavern/acceptance.ts'
import type {
  AcceptanceReasonCode,
  TavernRequestOffer,
} from '../src/core/tavern/types.ts'

const SEED_COUNT = 1000
const PAIRS_PER_DAY = 12

type Reason = AcceptanceReasonCode

interface Stats {
  total: number
  accepted: number
  declined: number
  byReason: Record<Reason, number>
  byRankGap: Record<
    string,
    { total: number; accepted: number; declined: number }
  >
  byObjective: Record<
    TavernRequestOffer['objectiveType'],
    { total: number; accepted: number; declined: number }
  >
  byTemplate: Record<
    string,
    { total: number; accepted: number; declined: number }
  >
  rankGap1: {
    total: number
    challengingButSuitable: number
    poorFit: number
    tooDangerous: number
  }
}

const stats: Stats = {
  total: 0,
  accepted: 0,
  declined: 0,
  byReason: {
    appropriate: 0,
    challengingButSuitable: 0,
    tooDangerous: 0,
    poorFit: 0,
  },
  byRankGap: {
    '<=-2': { total: 0, accepted: 0, declined: 0 },
    '-1': { total: 0, accepted: 0, declined: 0 },
    '0': { total: 0, accepted: 0, declined: 0 },
    '1': { total: 0, accepted: 0, declined: 0 },
    '>=2': { total: 0, accepted: 0, declined: 0 },
  },
  byObjective: {
    investigation: { total: 0, accepted: 0, declined: 0 },
    elimination: { total: 0, accepted: 0, declined: 0 },
    rescue: { total: 0, accepted: 0, declined: 0 },
    escort: { total: 0, accepted: 0, declined: 0 },
    retrieval: { total: 0, accepted: 0, declined: 0 },
    survey: { total: 0, accepted: 0, declined: 0 },
  },
  byTemplate: {},
  rankGap1: {
    total: 0,
    challengingButSuitable: 0,
    poorFit: 0,
    tooDangerous: 0,
  },
}

function rankGapKey(rankGap: number): string {
  if (rankGap <= -2) return '<=-2'
  if (rankGap === -1) return '-1'
  if (rankGap === 0) return '0'
  if (rankGap === 1) return '1'
  return '>=2'
}

function percent(n: number, total: number): string {
  if (total === 0) return '0.00'
  return ((n / total) * 100).toFixed(2)
}

for (let i = 0; i < SEED_COUNT; i++) {
  const seed = `tavern-stat-${i.toString().padStart(4, '0')}`
  const day = generateTavernDay(seed)

  for (const request of day.requests) {
    const profile = toPublicRequestProfile(request)
    for (const tavernParty of day.parties) {
      const party = tavernParty.party
      const evaluation = evaluateOffer(profile, party)
      const accepted = evaluation.decision === 'accepted'

      stats.total++
      if (accepted) {
        stats.accepted++
      } else {
        stats.declined++
      }

      stats.byReason[evaluation.reason]++

      const gapKey = rankGapKey(evaluation.rankGap)
      const gapBucket = stats.byRankGap[gapKey]
      gapBucket.total++
      if (accepted) {
        gapBucket.accepted++
      } else {
        gapBucket.declined++
      }

      const objective = request.objectiveType
      const objectiveBucket = stats.byObjective[objective]
      objectiveBucket.total++
      if (accepted) {
        objectiveBucket.accepted++
      } else {
        objectiveBucket.declined++
      }

      const templateId = party.archetypeId
      if (!stats.byTemplate[templateId]) {
        stats.byTemplate[templateId] = { total: 0, accepted: 0, declined: 0 }
      }
      const templateBucket = stats.byTemplate[templateId]
      templateBucket.total++
      if (accepted) {
        templateBucket.accepted++
      } else {
        templateBucket.declined++
      }

      if (evaluation.rankGap === 1) {
        stats.rankGap1.total++
        if (evaluation.reason === 'challengingButSuitable') {
          stats.rankGap1.challengingButSuitable++
        } else if (evaluation.reason === 'poorFit') {
          stats.rankGap1.poorFit++
        } else if (evaluation.reason === 'tooDangerous') {
          stats.rankGap1.tooDangerous++
        }
      }

      // Invariant checks
      if (evaluation.rankGap >= 2 && evaluation.decision === 'accepted') {
        throw new Error(
          `Invariant violation: rankGap >= 2 accepted for seed ${seed}`,
        )
      }
      if (evaluation.rankGap < 0 && evaluation.decision === 'declined') {
        throw new Error(
          `Invariant violation: rankGap < 0 declined for seed ${seed}`,
        )
      }
      if (evaluation.reason === 'challengingButSuitable') {
        if (
          evaluation.rankGap !== 1 ||
          evaluation.relevantRoleCount < 3 ||
          evaluation.leaderJudgment < 55
        ) {
          throw new Error(
            `Invariant violation: challengingButSuitable conditions not met for seed ${seed}`,
          )
        }
      }
    }
  }
}

const output = `## Acceptance Statistics

Evaluated ${SEED_COUNT} day seeds × ${PAIRS_PER_DAY} pairs = ${stats.total} request-party pairs.

### Overall

| Metric | Count | Percentage |
| ------ | ----- | ---------- |
| Total evaluated pairs | ${stats.total} | 100.00 |
| Accepted | ${stats.accepted} | ${percent(stats.accepted, stats.total)} |
| Declined | ${stats.declined} | ${percent(stats.declined, stats.total)} |
| Acceptance rate | — | ${percent(stats.accepted, stats.total)} |

### By reason

| Reason | Count | Percentage |
| ------ | ----- | ---------- |
| appropriate | ${stats.byReason.appropriate} | ${percent(stats.byReason.appropriate, stats.total)} |
| challengingButSuitable | ${stats.byReason.challengingButSuitable} | ${percent(stats.byReason.challengingButSuitable, stats.total)} |
| tooDangerous | ${stats.byReason.tooDangerous} | ${percent(stats.byReason.tooDangerous, stats.total)} |
| poorFit | ${stats.byReason.poorFit} | ${percent(stats.byReason.poorFit, stats.total)} |

### By rankGap

| rankGap | Offers | Accepted | Declined | Acceptance rate |
| ------- | ------ | -------- | -------- | --------------- |
| <= -2 | ${stats.byRankGap['<=-2'].total} | ${stats.byRankGap['<=-2'].accepted} | ${stats.byRankGap['<=-2'].declined} | ${percent(stats.byRankGap['<=-2'].accepted, stats.byRankGap['<=-2'].total)} |
| -1 | ${stats.byRankGap['-1'].total} | ${stats.byRankGap['-1'].accepted} | ${stats.byRankGap['-1'].declined} | ${percent(stats.byRankGap['-1'].accepted, stats.byRankGap['-1'].total)} |
| 0 | ${stats.byRankGap['0'].total} | ${stats.byRankGap['0'].accepted} | ${stats.byRankGap['0'].declined} | ${percent(stats.byRankGap['0'].accepted, stats.byRankGap['0'].total)} |
| 1 | ${stats.byRankGap['1'].total} | ${stats.byRankGap['1'].accepted} | ${stats.byRankGap['1'].declined} | ${percent(stats.byRankGap['1'].accepted, stats.byRankGap['1'].total)} |
| >= 2 | ${stats.byRankGap['>=2'].total} | ${stats.byRankGap['>=2'].accepted} | ${stats.byRankGap['>=2'].declined} | ${percent(stats.byRankGap['>=2'].accepted, stats.byRankGap['>=2'].total)} |

### rankGap = 1 breakdown

| Decision | Count | Percentage within rankGap=1 |
| -------- | ----- | --------------------------- |
| Total rankGap=1 | ${stats.rankGap1.total} | 100.00 |
| challengingButSuitable | ${stats.rankGap1.challengingButSuitable} | ${percent(stats.rankGap1.challengingButSuitable, stats.rankGap1.total)} |
| poorFit | ${stats.rankGap1.poorFit} | ${percent(stats.rankGap1.poorFit, stats.rankGap1.total)} |
| tooDangerous | ${stats.rankGap1.tooDangerous} | ${percent(stats.rankGap1.tooDangerous, stats.rankGap1.total)} |

### By objective

| Objective | Evaluated | Accepted | Declined | Acceptance rate |
| --------- | --------- | -------- | -------- | --------------- |
| investigation | ${stats.byObjective.investigation.total} | ${stats.byObjective.investigation.accepted} | ${stats.byObjective.investigation.declined} | ${percent(stats.byObjective.investigation.accepted, stats.byObjective.investigation.total)} |
| elimination | ${stats.byObjective.elimination.total} | ${stats.byObjective.elimination.accepted} | ${stats.byObjective.elimination.declined} | ${percent(stats.byObjective.elimination.accepted, stats.byObjective.elimination.total)} |
| rescue | ${stats.byObjective.rescue.total} | ${stats.byObjective.rescue.accepted} | ${stats.byObjective.rescue.declined} | ${percent(stats.byObjective.rescue.accepted, stats.byObjective.rescue.total)} |
| escort | ${stats.byObjective.escort.total} | ${stats.byObjective.escort.accepted} | ${stats.byObjective.escort.declined} | ${percent(stats.byObjective.escort.accepted, stats.byObjective.escort.total)} |
| retrieval | ${stats.byObjective.retrieval.total} | ${stats.byObjective.retrieval.accepted} | ${stats.byObjective.retrieval.declined} | ${percent(stats.byObjective.retrieval.accepted, stats.byObjective.retrieval.total)} |
| survey | ${stats.byObjective.survey.total} | ${stats.byObjective.survey.accepted} | ${stats.byObjective.survey.declined} | ${percent(stats.byObjective.survey.accepted, stats.byObjective.survey.total)} |

### By party template

| Template | Offers | Accepted | Declined | Acceptance rate |
| -------- | ------ | -------- | -------- | --------------- |
${Object.entries(stats.byTemplate)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(
    ([id, bucket]) =>
      `| ${id} | ${bucket.total} | ${bucket.accepted} | ${bucket.declined} | ${percent(bucket.accepted, bucket.total)} |`,
  )
  .join('\n')}

### Invariant checks

- rankGap >= 2 → accepted = 0: PASS
- rankGap < 0 → declined = 0: PASS
- challengingButSuitable → rankGap == 1, relevantRoleCount >= 3, leaderJudgment >= 55: PASS

Acceptance engine code was not modified; these statistics are observational only.
`

console.log(output)
