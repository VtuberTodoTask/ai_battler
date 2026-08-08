import fs from 'node:fs'
import path from 'node:path'
import { SeededRng } from '../src/core/rng/seededRng.ts'
import { predictExpeditionOutcome } from '../src/core/tavern/prediction/prediction.ts'
import {
  evaluateOffer,
  toPublicRequestProfile,
} from '../src/core/tavern/acceptance.ts'
import { generateAdventurerParty } from '../src/core/tavern/partyGenerator.ts'
import { PARTY_TEMPLATES } from '../src/core/tavern/partyTemplates.ts'
import { TAVERN_REQUEST_TEMPLATES } from '../src/core/tavern/requestTemplates.ts'
import type {
  AdventurerParty,
  TavernRequestOffer,
} from '../src/core/tavern/types.ts'
import type { AdventurerRank } from '../src/core/models/types.ts'
import type { ObjectiveType } from '../src/core/expedition/types.ts'

const RANKS: AdventurerRank[] = ['E', 'D', 'C', 'B', 'A', 'S']
const OBJECTIVES: ObjectiveType[] = [
  'investigation',
  'elimination',
  'rescue',
  'escort',
  'retrieval',
  'survey',
]
const SCENARIO_SEEDS = [
  'phase6-2:scenario:0',
  'phase6-2:scenario:1',
  'phase6-2:scenario:2',
]
const PARTY_NAMES = PARTY_TEMPLATES.map((_, i) => `matrix-party-${i}`)

function rankValue(rank: AdventurerRank): number {
  return RANKS.indexOf(rank)
}

interface MatrixRecord {
  objectiveType: ObjectiveType
  requestTemplateId: string
  requestRank: AdventurerRank
  partyTemplateId: string
  partyRank: AdventurerRank
  rankAdvantage: number
  scenarioSeed: string
  battleEnabled: boolean
  estimatedSuccessRate: number
  completeSuccessRate: number
  successRate: number
  partialSuccessRate: number
  failedObjectiveRate: number
  forcedRetreatRate: number
  lostExpeditionRate: number
  acceptanceDecision: 'accepted' | 'declined'
  acceptanceReason: string
  relevantRoleCount: number
  leaderJudgment: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const index = (sorted.length - 1) * p
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  const weight = index - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function generateRequestOffer(
  templateId: string,
  rank: AdventurerRank,
  scenarioSeed: string,
): TavernRequestOffer {
  const template = TAVERN_REQUEST_TEMPLATES.find((t) => t.id === templateId)!
  const requestId = `${scenarioSeed}:request:${templateId}:rank:${rank}`
  const requestSeed = `${requestId}:expedition`
  const rng = new SeededRng(`${requestSeed}:battle-chance`)
  const battleEnabled =
    template.battleChance >= 100 || rng.chance(template.battleChance)
  return template.build({ requestId, seed: requestSeed, rank, battleEnabled })
}

export function generateParty(
  templateId: string,
  rank: AdventurerRank,
  scenarioSeed: string,
  index: number,
): AdventurerParty {
  const name = PARTY_NAMES[index % PARTY_NAMES.length]
  return generateAdventurerParty(
    `${scenarioSeed}:party:${templateId}:rank:${rank}`,
    index,
    name,
    rank,
    templateId,
  )
}

export function runMatrixAudit(options?: {
  sampleCount?: number
  outputPath?: string
  partialPath?: string
  progressFrequency?: number
  checkpointFrequency?: number
  rankFilter?: (
    requestRank: AdventurerRank,
    partyRank: AdventurerRank,
  ) => boolean
}): {
  records: MatrixRecord[]
  summary: ReturnType<typeof buildSummary>
  outputPath: string
} {
  const sampleCount = options?.sampleCount ?? 100
  const progressFrequency = options?.progressFrequency ?? 100
  const checkpointFrequency = options?.checkpointFrequency ?? 500
  const outputPath =
    options?.outputPath ??
    path.resolve(process.cwd(), 'reports/phase6_2_before.json')
  const partialPath =
    options?.partialPath ??
    path.resolve(process.cwd(), 'reports/phase6_2_before.partial.json')

  const totalRequestTemplates = OBJECTIVES.reduce(
    (sum, objective) =>
      sum +
      TAVERN_REQUEST_TEMPLATES.filter((t) => t.objectiveType === objective)
        .length,
    0,
  )
  const partyRankCombinations = PARTY_TEMPLATES.length * RANKS.length
  const requestRankCombinations =
    totalRequestTemplates * RANKS.length * SCENARIO_SEEDS.length
  const totalCells = requestRankCombinations * partyRankCombinations
  const estimatedExpeditionRuns = totalCells * sampleCount

  console.log(`[Matrix] Total cells: ${totalCells}`)
  console.log(`[Matrix] Samples per cell: ${sampleCount}`)
  console.log(
    `[Matrix] Estimated runExpedition calls: ${estimatedExpeditionRuns}`,
  )

  const records: MatrixRecord[] = []
  const start = Date.now()
  let recordIndex = 0

  for (const objective of OBJECTIVES) {
    const templates = TAVERN_REQUEST_TEMPLATES.filter(
      (t) => t.objectiveType === objective,
    )
    for (const requestTemplate of templates) {
      for (const requestRank of RANKS) {
        for (const scenarioSeed of SCENARIO_SEEDS) {
          const request = generateRequestOffer(
            requestTemplate.id,
            requestRank,
            scenarioSeed,
          )
          for (
            let partyTemplateIndex = 0;
            partyTemplateIndex < PARTY_TEMPLATES.length;
            partyTemplateIndex++
          ) {
            const partyTemplate = PARTY_TEMPLATES[partyTemplateIndex]
            for (const partyRank of RANKS) {
              if (
                options?.rankFilter &&
                !options.rankFilter(requestRank, partyRank)
              ) {
                continue
              }

              const party = generateParty(
                partyTemplate.id,
                partyRank,
                scenarioSeed,
                partyTemplateIndex,
              )
              const prediction = predictExpeditionOutcome(request, party, {
                sampleCount,
              })
              const publicProfile = toPublicRequestProfile(request)
              const offer = evaluateOffer(publicProfile, party)

              records.push({
                objectiveType: objective,
                requestTemplateId: requestTemplate.id,
                requestRank,
                partyTemplateId: partyTemplate.id,
                partyRank,
                rankAdvantage: rankValue(partyRank) - rankValue(requestRank),
                scenarioSeed,
                battleEnabled: request.expeditionRequest.battle !== undefined,
                estimatedSuccessRate: prediction.estimatedSuccessRate,
                completeSuccessRate: prediction.rates.completeSuccess,
                successRate: prediction.rates.success,
                partialSuccessRate: prediction.rates.partialSuccess,
                failedObjectiveRate: prediction.rates.failedObjective,
                forcedRetreatRate: prediction.rates.forcedRetreat,
                lostExpeditionRate: prediction.rates.lostExpedition,
                acceptanceDecision: offer.decision,
                acceptanceReason: offer.reason,
                relevantRoleCount: offer.relevantRoleCount,
                leaderJudgment: offer.leaderJudgment,
              })

              recordIndex++
              if (recordIndex % progressFrequency === 0) {
                const elapsed = (Date.now() - start) / 1000
                console.log(
                  `[Matrix] ${recordIndex} / ${totalCells} records | Elapsed: ${elapsed.toFixed(1)}s | Objective: ${objective} | RequestRank: ${requestRank} | PartyRank: ${partyRank}`,
                )
              }

              if (recordIndex % checkpointFrequency === 0) {
                const summary = buildSummary(records)
                fs.mkdirSync(path.dirname(partialPath), { recursive: true })
                fs.writeFileSync(
                  partialPath,
                  JSON.stringify({ records, summary }, null, 2),
                )
              }
            }
          }
        }
      }
    }
  }

  const summary = buildSummary(records)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify({ records, summary }, null, 2))

  return { records, summary, outputPath }
}

function buildSummary(records: MatrixRecord[]) {
  const byRankAdvantage: Record<
    number,
    {
      estimatedSuccessRate: number[]
      completeSuccess: number[]
      success: number[]
    }
  > = {}
  const byObjectiveRankAdvantage: Record<
    ObjectiveType,
    Record<number, number[]>
  > = {
    investigation: {},
    elimination: {},
    rescue: {},
    escort: {},
    retrieval: {},
    survey: {},
  }
  const byPartyTemplate: Record<
    string,
    { overall: number[]; sameRank: number[]; plus1: number[]; plus2: number[] }
  > = {}

  for (const r of records) {
    byRankAdvantage[r.rankAdvantage] ??= {
      estimatedSuccessRate: [],
      completeSuccess: [],
      success: [],
    }
    byRankAdvantage[r.rankAdvantage].estimatedSuccessRate.push(
      r.estimatedSuccessRate,
    )
    byRankAdvantage[r.rankAdvantage].completeSuccess.push(r.completeSuccessRate)
    byRankAdvantage[r.rankAdvantage].success.push(r.successRate)

    byObjectiveRankAdvantage[r.objectiveType][r.rankAdvantage] ??= []
    byObjectiveRankAdvantage[r.objectiveType][r.rankAdvantage].push(
      r.estimatedSuccessRate,
    )

    byPartyTemplate[r.partyTemplateId] ??= {
      overall: [],
      sameRank: [],
      plus1: [],
      plus2: [],
    }
    const pt = byPartyTemplate[r.partyTemplateId]
    pt.overall.push(r.estimatedSuccessRate)
    if (r.rankAdvantage === 0) pt.sameRank.push(r.estimatedSuccessRate)
    if (r.rankAdvantage === 1) pt.plus1.push(r.estimatedSuccessRate)
    if (r.rankAdvantage >= 2) pt.plus2.push(r.estimatedSuccessRate)
  }

  const rankAdvantageSummary: Record<
    string,
    {
      count: number
      estimatedSuccessRateMedian: number
      completeSuccessMedian: number
      successMedian: number
      p10: number
      p25: number
      p75: number
      p90: number
    }
  > = {}

  for (const [adv, data] of Object.entries(byRankAdvantage)) {
    const sorted = [...data.estimatedSuccessRate].sort((a, b) => a - b)
    const completeSorted = [...data.completeSuccess].sort((a, b) => a - b)
    const successSorted = [...data.success].sort((a, b) => a - b)
    rankAdvantageSummary[adv] = {
      count: sorted.length,
      estimatedSuccessRateMedian: percentile(sorted, 0.5),
      completeSuccessMedian: percentile(completeSorted, 0.5),
      successMedian: percentile(successSorted, 0.5),
      p10: percentile(sorted, 0.1),
      p25: percentile(sorted, 0.25),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
    }
  }

  const objectiveSummary: Record<
    ObjectiveType,
    Record<string, { median: number; mean: number; p10: number; p90: number }>
  > = {
    investigation: {},
    elimination: {},
    rescue: {},
    escort: {},
    retrieval: {},
    survey: {},
  }
  for (const objective of OBJECTIVES) {
    const advMap = byObjectiveRankAdvantage[objective]
    for (const [adv, values] of Object.entries(advMap)) {
      const sorted = [...values].sort((a, b) => a - b)
      objectiveSummary[objective][adv] = {
        median: percentile(sorted, 0.5),
        mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
        p10: percentile(sorted, 0.1),
        p90: percentile(sorted, 0.9),
      }
    }
  }

  const partyTemplateSummary: Record<
    string,
    {
      overall: { median: number; mean: number }
      sameRank: { median: number; mean: number }
      plus1: { median: number; mean: number }
      plus2: { median: number; mean: number }
    }
  > = {}
  for (const [id, data] of Object.entries(byPartyTemplate)) {
    const summarize = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b)
      return {
        median: percentile(sorted, 0.5),
        mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      }
    }
    partyTemplateSummary[id] = {
      overall: summarize(data.overall),
      sameRank: summarize(data.sameRank),
      plus1: summarize(data.plus1),
      plus2: summarize(data.plus2),
    }
  }

  const appropriateRecords = records.filter(
    (r) =>
      r.acceptanceDecision === 'accepted' &&
      r.acceptanceReason === 'appropriate',
  )
  const appropriateByRankAdvantage: Record<number, number[]> = {}
  for (const r of appropriateRecords) {
    appropriateByRankAdvantage[r.rankAdvantage] ??= []
    appropriateByRankAdvantage[r.rankAdvantage].push(r.estimatedSuccessRate)
  }
  const appropriateSummary: Record<
    string,
    {
      count: number
      median: number
      p10: number
      p25: number
      p75: number
      p90: number
    }
  > = {}
  for (const [adv, values] of Object.entries(appropriateByRankAdvantage)) {
    const sorted = [...values].sort((a, b) => a - b)
    appropriateSummary[adv] = {
      count: sorted.length,
      median: percentile(sorted, 0.5),
      p10: percentile(sorted, 0.1),
      p25: percentile(sorted, 0.25),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
    }
  }

  const challengingRecords = records.filter(
    (r) => r.acceptanceReason === 'challengingButSuitable',
  )
  const challengingByRankAdvantage: Record<number, number[]> = {}
  for (const r of challengingRecords) {
    challengingByRankAdvantage[r.rankAdvantage] ??= []
    challengingByRankAdvantage[r.rankAdvantage].push(r.estimatedSuccessRate)
  }
  const challengingSummary: Record<
    string,
    { count: number; median: number; p10: number; p90: number }
  > = {}
  for (const [adv, values] of Object.entries(challengingByRankAdvantage)) {
    const sorted = [...values].sort((a, b) => a - b)
    challengingSummary[adv] = {
      count: sorted.length,
      median: percentile(sorted, 0.5),
      p10: percentile(sorted, 0.1),
      p90: percentile(sorted, 0.9),
    }
  }

  const battleComparison: Record<
    ObjectiveType,
    { battleEnabled: number[]; battleDisabled: number[] }
  > = {
    investigation: { battleEnabled: [], battleDisabled: [] },
    elimination: { battleEnabled: [], battleDisabled: [] },
    rescue: { battleEnabled: [], battleDisabled: [] },
    escort: { battleEnabled: [], battleDisabled: [] },
    retrieval: { battleEnabled: [], battleDisabled: [] },
    survey: { battleEnabled: [], battleDisabled: [] },
  }
  for (const r of records) {
    const target = r.battleEnabled
      ? battleComparison[r.objectiveType].battleEnabled
      : battleComparison[r.objectiveType].battleDisabled
    target.push(r.estimatedSuccessRate)
  }
  const battleSummary: Record<
    ObjectiveType,
    {
      battleEnabledMedian: number
      battleDisabledMedian: number
    }
  > = {
    investigation: { battleEnabledMedian: 0, battleDisabledMedian: 0 },
    elimination: { battleEnabledMedian: 0, battleDisabledMedian: 0 },
    rescue: { battleEnabledMedian: 0, battleDisabledMedian: 0 },
    escort: { battleEnabledMedian: 0, battleDisabledMedian: 0 },
    retrieval: { battleEnabledMedian: 0, battleDisabledMedian: 0 },
    survey: { battleEnabledMedian: 0, battleDisabledMedian: 0 },
  }
  for (const objective of OBJECTIVES) {
    const data = battleComparison[objective]
    battleSummary[objective] = {
      battleEnabledMedian: percentile(
        [...data.battleEnabled].sort((a, b) => a - b),
        0.5,
      ),
      battleDisabledMedian: percentile(
        [...data.battleDisabled].sort((a, b) => a - b),
        0.5,
      ),
    }
  }

  return {
    rankAdvantageSummary,
    objectiveSummary,
    partyTemplateSummary,
    appropriateSummary,
    challengingSummary,
    battleSummary,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const start = Date.now()
  const { summary, outputPath } = runMatrixAudit({
    sampleCount: 10,
    outputPath: path.resolve(
      process.cwd(),
      'reports/phase6_2_before_coarse.json',
    ),
  })
  console.log(JSON.stringify(summary, null, 2))
  console.log(`Saved: ${outputPath}`)
  console.log(`Elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`)
}
