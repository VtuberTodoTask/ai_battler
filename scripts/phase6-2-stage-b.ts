import fs from 'node:fs'
import path from 'node:path'
import { deepClone } from '../src/core/util.ts'
import { runExpedition } from '../src/core/expedition/expedition.ts'
import { SeededRng } from '../src/core/rng/seededRng.ts'
import {
  evaluateOffer,
  toPublicRequestProfile,
} from '../src/core/tavern/acceptance.ts'
import { generateAdventurerParty } from '../src/core/tavern/partyGenerator.ts'
import { PARTY_TEMPLATES } from '../src/core/tavern/partyTemplates.ts'
import {
  TAVERN_REQUEST_TEMPLATES,
  TEMPLATES_BY_OBJECTIVE_TYPE,
} from '../src/core/tavern/requestTemplates.ts'
import type {
  AdventurerParty,
  TavernRequestOffer,
} from '../src/core/tavern/types.ts'
import type { AdventurerRank } from '../src/core/models/types.ts'
import type {
  BattleOutcome,
  ExpeditionOutcome,
  ExpeditionResult,
  ObjectiveType,
} from '../src/core/expedition/types.ts'
import { buildPredictionSeed } from '../src/core/tavern/prediction/predictionSeed.ts'

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

const STAGE_B_PAIRS: {
  partyRank: AdventurerRank
  requestRank: AdventurerRank
}[] = [
  { partyRank: 'E', requestRank: 'E' },
  { partyRank: 'D', requestRank: 'E' },
  { partyRank: 'D', requestRank: 'D' },
  { partyRank: 'C', requestRank: 'E' },
  { partyRank: 'C', requestRank: 'D' },
  { partyRank: 'C', requestRank: 'C' },
]

const OPTIONAL_BATTLE_OBJECTIVES: ObjectiveType[] = [
  'investigation',
  'rescue',
  'escort',
  'retrieval',
  'survey',
]

function rankValue(rank: AdventurerRank): number {
  return RANKS.indexOf(rank)
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

const PARTY_NAMES = [
  '灰狼の牙',
  '銀灯',
  '赤鴉団',
  '星読み',
  '鉄靴団',
  '蒼穹の槍',
  '白銀の盾',
  '翠葉の風',
  '黒曜の斧',
  '静寂の矢',
  '鋼の絆',
  '夜明の鈴',
  '炎獅子団',
  '流水の滴',
  '風鳴り',
  '雷鳴の足跡',
  '森影',
  '砂塵の露',
  '月灯',
  '石楠の棘',
  '虹橋',
  '鉄梟',
  '玻璃の鏡',
  '山猫の爪',
]

function generateParty(
  templateId: string,
  rank: AdventurerRank,
  scenarioSeed: string,
  index: number,
): AdventurerParty {
  return generateAdventurerParty(
    `${scenarioSeed}:party:${templateId}:rank:${rank}`,
    index,
    PARTY_NAMES[index % PARTY_NAMES.length],
    rank,
    templateId,
  )
}

interface SampleRecord {
  sampleIndex: number
  outcome: ExpeditionOutcome
  objectiveCompleted: boolean
  objectiveProgress: number
  battleOccurred: boolean
  battleOutcome?: BattleOutcome
  battleFavorable: boolean
  favorableBattleThenExpeditionFailure: boolean
  preBattleHpTotal: number
  finalHpTotal: number
  casualties: number
  incapacitated: number
  objectiveDiagnostics: Record<string, unknown>
}

interface CellRecord {
  objectiveType: ObjectiveType
  requestTemplateId: string
  requestRank: AdventurerRank
  partyTemplateId: string
  partyRank: AdventurerRank
  scenarioSeed: string
  rankAdvantage: number
  sampleCount: number
  estimatedSuccessRate: number
  completeSuccessRate: number
  successRate: number
  partialSuccessRate: number
  failedObjectiveRate: number
  forcedRetreatRate: number
  lostExpeditionRate: number
  objectiveCompletedRate: number
  avgObjectiveProgress: number
  medianObjectiveProgress: number
  objectiveProgressP10: number
  objectiveProgressP90: number
  battleOccurredRate: number
  battleOutcomeCounts: Record<string, number>
  battleFavorableRate: number
  favorableBattleThenExpeditionFailureRate: number
  avgPreBattleHpTotal: number
  avgFinalHpTotal: number
  avgCasualties: number
  avgIncapacitated: number
  acceptanceDecision: 'accepted' | 'declined'
  acceptanceReason: string
  relevantRoleCount: number
  leaderJudgment: number
  objectiveDiagnosticsSummary: Record<string, unknown>
  battleAblationSummary?: {
    battleEnabledEstimatedSuccessRate: number
    battleDisabledEstimatedSuccessRate: number
    delta: number
  }
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

function sumHp(hp: Record<string, number>): number {
  return Object.values(hp).reduce((a, b) => a + b, 0)
}

function collectObjectiveDiagnostics(
  result: ExpeditionResult,
): Record<string, unknown> {
  const state = result.state
  const obj = state.objectiveState
  const base = {
    objectiveProgress: state.objectiveProgress,
    objectiveCompleted: state.objectiveCompleted,
  }

  if (!obj) return base

  switch (obj.type) {
    case 'investigation': {
      return {
        ...base,
        discoveredInformationCount: state.information.length,
        completeInformationCount: state.information.filter(
          (i) => i.completeness === 'complete',
        ).length,
        discoveredThreatsCount: state.discoveredThreats.length,
      }
    }
    case 'elimination': {
      return {
        ...base,
        requiredTargetCount: obj.requiredTargetIds.length,
        defeatedCount: obj.defeatedTargetIds.length,
        escapedCount: obj.escapedTargetIds.length,
        survivingCount: obj.survivingTargetIds.length,
        unknownCount: obj.unknownTargetIds.length,
        confirmedCount: obj.confirmedTargetIds.length,
        confirmationRequired: obj.confirmationRequired,
      }
    }
    case 'rescue': {
      return {
        ...base,
        targetMaxHp: obj.maxHp,
        targetFinalHp: obj.currentHp,
        located: obj.located,
        reached: obj.reached,
        stabilized: obj.stabilized,
        evacuated: obj.evacuated,
        returned: obj.returned,
        abandoned: obj.abandoned,
      }
    }
    case 'escort': {
      return {
        ...base,
        targetMaxHp: obj.maxHp,
        targetFinalHp: obj.currentHp,
        routeProgress: obj.routeProgress,
        destinationReached: obj.destinationReached,
        handoffStatus: obj.handoffStatus,
        delivered: obj.delivered,
        returnedToOrigin: obj.returnedToOrigin,
        stranded: obj.stranded,
        stress: obj.travelStress,
      }
    }
    case 'retrieval': {
      return {
        ...base,
        initialIntegrity: obj.initialIntegrity,
        minimumAcceptableIntegrity: obj.minimumAcceptableIntegrity,
        finalIntegrity: obj.currentIntegrity,
        located: obj.located,
        secured: obj.secured,
        extracted: obj.extracted,
        returned: obj.returned,
        abandoned: obj.abandoned,
        lostDuringReturn: obj.lostDuringReturn,
      }
    }
    case 'survey': {
      const sectors = obj.sectors ?? []
      const surveyedCount = sectors.filter((s) => s.surveyed).length
      return {
        ...base,
        coveragePercent: obj.coveragePercent,
        averageQuality: obj.averageQuality,
        minimumAcceptableQuality: obj.minimumAcceptableQuality,
        reportReturned: obj.reportReturned,
        reportPrepared: obj.reportPrepared,
        surveyedSectorCount: surveyedCount,
        totalSectorCount: sectors.length,
      }
    }
    default:
      return base
  }
}

function summarizeValues(values: unknown[]): Record<string, unknown> {
  const numeric = values.filter((v): v is number => typeof v === 'number')
  const sorted = [...numeric].sort((a, b) => a - b)
  const categorical = values.filter((v): v is boolean => typeof v === 'boolean')
  const trueRate = categorical.length
    ? categorical.filter((v) => v).length / categorical.length
    : 0
  return {
    count: values.length,
    mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
    median: percentile(sorted, 0.5),
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    trueRate,
  }
}

function mergeDiagnostics(samples: SampleRecord[]): Record<string, unknown> {
  const keys = new Set<string>()
  for (const s of samples) {
    for (const k of Object.keys(s.objectiveDiagnostics)) {
      keys.add(k)
    }
  }
  const summary: Record<string, unknown> = {}
  for (const key of keys) {
    const values = samples.map((s) => s.objectiveDiagnostics[key])
    summary[key] = summarizeValues(values)
  }
  return summary
}

function runSample(
  requestOffer: TavernRequestOffer,
  party: AdventurerParty,
  sampleIndex: number,
  forceBattle?: boolean,
): SampleRecord {
  const sampleRequest = deepClone(requestOffer.expeditionRequest)
  const sampleParty = deepClone(party.members)
  const sampleSeed = buildPredictionSeed(requestOffer.id, party.id, sampleIndex)
  sampleRequest.seed = sampleSeed

  if (forceBattle !== undefined) {
    if (forceBattle) {
      sampleRequest.battle = {
        enabled: true,
        seed: `${sampleSeed}:battle:0`,
        triggerPhase: 'afterExploration',
      }
    } else {
      sampleRequest.battle = undefined
    }
  } else if (sampleRequest.battle) {
    sampleRequest.battle.seed = `${sampleSeed}:battle:0`
  }

  const result = runExpedition(sampleRequest, sampleParty)
  const state = result.state
  const battleRecord = state.battles[state.battles.length - 1]
  const battleOccurred = state.battles.length > 0
  const battleOutcome = battleRecord?.outcome
  const battleFavorable =
    battleOutcome === 'victory' ||
    battleOutcome === 'costlyVictory' ||
    battleOutcome === 'partialVictory'
  const preBattleHpTotal = battleRecord
    ? sumHp(battleRecord.entrySnapshot.initialHp)
    : sumHp(Object.fromEntries(sampleParty.map((a) => [a.id, a.currentHp])))
  const finalHpTotal = sumHp(state.partyHp)

  return {
    sampleIndex,
    outcome: result.outcome,
    objectiveCompleted: state.objectiveCompleted,
    objectiveProgress: state.objectiveProgress,
    battleOccurred,
    battleOutcome,
    battleFavorable,
    favorableBattleThenExpeditionFailure:
      battleFavorable &&
      (result.outcome === 'failedObjective' ||
        result.outcome === 'forcedRetreat' ||
        result.outcome === 'lostExpedition'),
    preBattleHpTotal,
    finalHpTotal,
    casualties: state.casualties.length,
    incapacitated: state.incapacitated.length,
    objectiveDiagnostics: collectObjectiveDiagnostics(result),
  }
}

function buildCellRecord(
  objectiveType: ObjectiveType,
  requestTemplateId: string,
  requestRank: AdventurerRank,
  partyTemplateId: string,
  partyRank: AdventurerRank,
  scenarioSeed: string,
  requestOffer: TavernRequestOffer,
  party: AdventurerParty,
  sampleCount: number,
  includeBattleAblation: boolean,
): CellRecord {
  const samples: SampleRecord[] = []
  const battleAblationSamples: SampleRecord[] = []

  for (let i = 0; i < sampleCount; i++) {
    samples.push(runSample(requestOffer, party, i))
    if (
      includeBattleAblation &&
      OPTIONAL_BATTLE_OBJECTIVES.includes(objectiveType)
    ) {
      battleAblationSamples.push(runSample(requestOffer, party, i, false))
    }
  }

  const outcomeCounts = {
    completeSuccess: 0,
    success: 0,
    partialSuccess: 0,
    failedObjective: 0,
    forcedRetreat: 0,
    lostExpedition: 0,
  }
  for (const s of samples) {
    outcomeCounts[s.outcome] += 1
  }
  const rates = {
    completeSuccess: outcomeCounts.completeSuccess / sampleCount,
    success: outcomeCounts.success / sampleCount,
    partialSuccess: outcomeCounts.partialSuccess / sampleCount,
    failedObjective: outcomeCounts.failedObjective / sampleCount,
    forcedRetreat: outcomeCounts.forcedRetreat / sampleCount,
    lostExpedition: outcomeCounts.lostExpedition / sampleCount,
  }
  const estimatedSuccessRate =
    (outcomeCounts.completeSuccess + outcomeCounts.success) / sampleCount

  const battleOutcomeCounts: Record<string, number> = {}
  for (const s of samples) {
    if (s.battleOutcome) {
      battleOutcomeCounts[s.battleOutcome] =
        (battleOutcomeCounts[s.battleOutcome] ?? 0) + 1
    }
  }

  const progressValues = samples
    .map((s) => s.objectiveProgress)
    .sort((a, b) => a - b)

  const offer = evaluateOffer(toPublicRequestProfile(requestOffer), party)

  const preBattleTotals = samples.map((s) => s.preBattleHpTotal)
  const finalTotals = samples.map((s) => s.finalHpTotal)

  let battleAblationSummary: CellRecord['battleAblationSummary'] | undefined
  if (includeBattleAblation && battleAblationSamples.length > 0) {
    const enabledSuccess =
      samples.filter(
        (s) => s.outcome === 'completeSuccess' || s.outcome === 'success',
      ).length / sampleCount
    const disabledSuccess =
      battleAblationSamples.filter(
        (s) => s.outcome === 'completeSuccess' || s.outcome === 'success',
      ).length / sampleCount
    battleAblationSummary = {
      battleEnabledEstimatedSuccessRate: enabledSuccess,
      battleDisabledEstimatedSuccessRate: disabledSuccess,
      delta: enabledSuccess - disabledSuccess,
    }
  }

  return {
    objectiveType,
    requestTemplateId,
    requestRank,
    partyTemplateId,
    partyRank,
    scenarioSeed,
    rankAdvantage: rankValue(partyRank) - rankValue(requestRank),
    sampleCount,
    estimatedSuccessRate,
    completeSuccessRate: rates.completeSuccess,
    successRate: rates.success,
    partialSuccessRate: rates.partialSuccess,
    failedObjectiveRate: rates.failedObjective,
    forcedRetreatRate: rates.forcedRetreat,
    lostExpeditionRate: rates.lostExpedition,
    objectiveCompletedRate:
      samples.filter((s) => s.objectiveCompleted).length / sampleCount,
    avgObjectiveProgress:
      progressValues.reduce((a, b) => a + b, 0) / progressValues.length,
    medianObjectiveProgress: percentile(progressValues, 0.5),
    objectiveProgressP10: percentile(progressValues, 0.1),
    objectiveProgressP90: percentile(progressValues, 0.9),
    battleOccurredRate:
      samples.filter((s) => s.battleOccurred).length / sampleCount,
    battleOutcomeCounts,
    battleFavorableRate:
      samples.filter((s) => s.battleFavorable).length / sampleCount,
    favorableBattleThenExpeditionFailureRate:
      samples.filter((s) => s.favorableBattleThenExpeditionFailure).length /
      sampleCount,
    avgPreBattleHpTotal:
      preBattleTotals.reduce((a, b) => a + b, 0) / preBattleTotals.length,
    avgFinalHpTotal:
      finalTotals.reduce((a, b) => a + b, 0) / finalTotals.length,
    avgCasualties:
      samples.reduce((a, s) => a + s.casualties, 0) / samples.length,
    avgIncapacitated:
      samples.reduce((a, s) => a + s.incapacitated, 0) / samples.length,
    acceptanceDecision: offer.decision,
    acceptanceReason: offer.reason,
    relevantRoleCount: offer.relevantRoleCount,
    leaderJudgment: offer.leaderJudgment,
    objectiveDiagnosticsSummary: mergeDiagnostics(samples),
    battleAblationSummary,
  }
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function buildSummary(records: CellRecord[]) {
  const byRankPair: Record<
    string,
    {
      estimatedSuccessRates: number[]
      records: CellRecord[]
    }
  > = {}
  const byObjectiveRankPair: Record<
    ObjectiveType,
    Record<string, { estimatedSuccessRates: number[]; records: CellRecord[] }>
  > = {
    investigation: {},
    elimination: {},
    rescue: {},
    escort: {},
    retrieval: {},
    survey: {},
  }

  for (const r of records) {
    const pairKey = `${r.partyRank}->${r.requestRank}`
    byRankPair[pairKey] ??= { estimatedSuccessRates: [], records: [] }
    byRankPair[pairKey].estimatedSuccessRates.push(r.estimatedSuccessRate)
    byRankPair[pairKey].records.push(r)

    byObjectiveRankPair[r.objectiveType][pairKey] ??= {
      estimatedSuccessRates: [],
      records: [],
    }
    byObjectiveRankPair[r.objectiveType][pairKey].estimatedSuccessRates.push(
      r.estimatedSuccessRate,
    )
    byObjectiveRankPair[r.objectiveType][pairKey].records.push(r)
  }

  const rankPairSummary: Record<
    string,
    { count: number; median: number; mean: number; p10: number; p90: number }
  > = {}
  for (const [key, data] of Object.entries(byRankPair)) {
    const sorted = [...data.estimatedSuccessRates].sort((a, b) => a - b)
    rankPairSummary[key] = {
      count: sorted.length,
      median: percentile(sorted, 0.5),
      mean: mean(sorted),
      p10: percentile(sorted, 0.1),
      p90: percentile(sorted, 0.9),
    }
  }

  const objectiveRankPairSummary: Record<
    ObjectiveType,
    Record<
      string,
      { count: number; median: number; mean: number; p10: number; p90: number }
    >
  > = {
    investigation: {},
    elimination: {},
    rescue: {},
    escort: {},
    retrieval: {},
    survey: {},
  }
  for (const objective of OBJECTIVES) {
    for (const [key, data] of Object.entries(byObjectiveRankPair[objective])) {
      const sorted = [...data.estimatedSuccessRates].sort((a, b) => a - b)
      objectiveRankPairSummary[objective][key] = {
        count: sorted.length,
        median: percentile(sorted, 0.5),
        mean: mean(sorted),
        p10: percentile(sorted, 0.1),
        p90: percentile(sorted, 0.9),
      }
    }
  }

  const appropriate = records.filter(
    (r) =>
      r.acceptanceDecision === 'accepted' &&
      r.acceptanceReason === 'appropriate',
  )
  const appropriateByPair = groupByPair(appropriate)
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
  for (const [key, data] of Object.entries(appropriateByPair)) {
    const sorted = [...data.estimatedSuccessRates].sort((a, b) => a - b)
    appropriateSummary[key] = {
      count: sorted.length,
      median: percentile(sorted, 0.5),
      p10: percentile(sorted, 0.1),
      p25: percentile(sorted, 0.25),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
    }
  }

  return {
    rankPairSummary,
    objectiveRankPairSummary,
    appropriateSummary,
    totalRecords: records.length,
    overallEstimatedSuccessRateMean: mean(
      records.map((r) => r.estimatedSuccessRate),
    ),
  }
}

function groupByPair(records: CellRecord[]) {
  const byRankPair: Record<
    string,
    { estimatedSuccessRates: number[]; records: CellRecord[] }
  > = {}
  for (const r of records) {
    const key = `${r.partyRank}->${r.requestRank}`
    byRankPair[key] ??= { estimatedSuccessRates: [], records: [] }
    byRankPair[key].estimatedSuccessRates.push(r.estimatedSuccessRate)
    byRankPair[key].records.push(r)
  }
  return byRankPair
}

function calculateFailureDecomposition(
  records: CellRecord[],
  objective: ObjectiveType,
) {
  if (objective !== 'elimination') return undefined
  const relevant = records.filter((r) => r.objectiveType === 'elimination')
  let a = 0
  let b = 0
  let c = 0
  let d = 0
  let e = 0
  for (const r of relevant) {
    const summary = r.objectiveDiagnosticsSummary
    const required = (summary.requiredTargetCount as Record<string, unknown>)
      ?.mean as number | undefined
    const defeated = (summary.defeatedCount as Record<string, unknown>)
      ?.mean as number | undefined
    const confirmed = (summary.confirmedCount as Record<string, unknown>)
      ?.mean as number | undefined
    const battleFav = r.battleFavorableRate
    const forced = r.forcedRetreatRate
    if (!battleFav || battleFav < 0.5) {
      a += 1
    } else if (
      required !== undefined &&
      defeated !== undefined &&
      defeated < required
    ) {
      b += 1
    } else if (
      required !== undefined &&
      confirmed !== undefined &&
      defeated !== undefined &&
      defeated >= required &&
      confirmed < required
    ) {
      c += 1
    } else if (forced > 0.5) {
      d += 1
    } else {
      e += 1
    }
  }
  return {
    battleUnfavorableCells: a,
    requiredNotDefeatedCells: b,
    defeatedButNotConfirmedCells: c,
    forcedRetreatDominantCells: d,
    otherCells: e,
  }
}

export function runStageB(options?: {
  sampleCount?: number
  includeBattleAblation?: boolean
  outputPath?: string
  progressFrequency?: number
}) {
  const sampleCount = options?.sampleCount ?? 100
  const includeBattleAblation = options?.includeBattleAblation ?? true
  const progressFrequency = options?.progressFrequency ?? 50
  const outputPath =
    options?.outputPath ??
    path.resolve(process.cwd(), 'reports/phase6_2_before_early_rank_deep.json')

  const requestTemplatesPerObjective = OBJECTIVES.reduce(
    (sum, obj) => sum + TEMPLATES_BY_OBJECTIVE_TYPE[obj].length,
    0,
  )
  const totalCells =
    requestTemplatesPerObjective *
    SCENARIO_SEEDS.length *
    PARTY_TEMPLATES.length *
    STAGE_B_PAIRS.length
  const estimatedRuns =
    totalCells * sampleCount * (includeBattleAblation ? 2 : 1)

  console.log(`[Stage B] Total cells: ${totalCells}`)
  console.log(`[Stage B] Samples per cell: ${sampleCount}`)
  console.log(`[Stage B] Battle ablation: ${includeBattleAblation}`)
  console.log(`[Stage B] Estimated runExpedition calls: ${estimatedRuns}`)

  const records: CellRecord[] = []
  const start = Date.now()
  let cellIndex = 0

  for (const objective of OBJECTIVES) {
    const templates = TEMPLATES_BY_OBJECTIVE_TYPE[objective]
    for (const requestTemplate of templates) {
      for (const { partyRank, requestRank } of STAGE_B_PAIRS) {
        for (const scenarioSeed of SCENARIO_SEEDS) {
          const requestOffer = generateRequestOffer(
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
            const party = generateParty(
              partyTemplate.id,
              partyRank,
              scenarioSeed,
              partyTemplateIndex,
            )

            const cellRecord = buildCellRecord(
              objective,
              requestTemplate.id,
              requestRank,
              partyTemplate.id,
              partyRank,
              scenarioSeed,
              requestOffer,
              party,
              sampleCount,
              includeBattleAblation,
            )
            records.push(cellRecord)

            cellIndex++
            if (cellIndex % progressFrequency === 0) {
              const elapsed = (Date.now() - start) / 1000
              console.log(
                `[Stage B] ${cellIndex} / ${totalCells} cells | Elapsed: ${elapsed.toFixed(1)}s | Objective: ${objective} | ${partyRank}->${requestRank}`,
              )
            }
          }
        }
      }
    }
  }

  const summary = buildSummary(records)
  const eliminationDecomposition = calculateFailureDecomposition(
    records,
    'elimination',
  )

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(
    outputPath,
    JSON.stringify({ records, summary, eliminationDecomposition }, null, 2),
  )

  return { records, summary, eliminationDecomposition, outputPath }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const start = Date.now()
  const { summary, outputPath } = runStageB()
  console.log(JSON.stringify(summary, null, 2))
  console.log(`Saved: ${outputPath}`)
  console.log(`Elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`)
}
