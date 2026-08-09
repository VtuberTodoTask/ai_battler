import { writeFileSync } from 'node:fs'
import { ROLE_MAP } from '../src/data/roles.ts'
import type { AdventurerRank } from '../src/core/models/types.ts'
import type { ObjectiveType } from '../src/core/expedition/types.ts'
import { SeededRng } from '../src/core/rng/seededRng.ts'
import {
  evaluateOffer,
  toPublicRequestProfile,
} from '../src/core/tavern/acceptance.ts'
import { generateAdventurerParty } from '../src/core/tavern/partyGenerator.ts'
import { PARTY_TEMPLATES } from '../src/core/tavern/partyTemplates.ts'
import { predictExpeditionOutcome } from '../src/core/tavern/prediction/prediction.ts'
import { TAVERN_REQUEST_TEMPLATES } from '../src/core/tavern/requestTemplates.ts'
import type {
  AcceptanceContext,
  AdventurerParty,
  OfferEvaluation,
  PartyRiskTolerance,
  PublicRequestProfile,
  TavernRequestOffer,
} from '../src/core/tavern/types.ts'

const RANKS: AdventurerRank[] = ['E', 'D', 'C', 'B', 'A', 'S']

function rankValue(rank: AdventurerRank): number {
  return RANKS.indexOf(rank)
}

const SCENARIO_SEEDS = [
  'phase6-5-accept-001',
  'phase6-5-accept-002',
  'phase6-5-accept-003',
]

const PARTY_RANKS: AdventurerRank[] = ['E', 'D', 'C']
const RANK_GAPS = [0, 1, 2]

const PARTY_NAMES = [
  '灰狼の牙',
  '銀灯',
  '赤鴉団',
  '星読み',
  '鉄靴団',
  '蒼穹の槍',
  '白銀の盾',
  '翠葉の風',
]

interface ContextScenario {
  label: string
  affinity: number
  financialPressure: number
  riskTolerance: PartyRiskTolerance
  growthMilestones: number
}

const CONTEXTS: ContextScenario[] = [
  {
    label: 'Newcomer',
    affinity: 10,
    financialPressure: 40,
    riskTolerance: 'balanced',
    growthMilestones: 0,
  },
  {
    label: 'Trusted',
    affinity: 70,
    financialPressure: 40,
    riskTolerance: 'balanced',
    growthMilestones: 0,
  },
  {
    label: 'Broke',
    affinity: 10,
    financialPressure: 85,
    riskTolerance: 'balanced',
    growthMilestones: 0,
  },
  {
    label: 'Bold',
    affinity: 10,
    financialPressure: 40,
    riskTolerance: 'bold',
    growthMilestones: 0,
  },
  {
    label: 'Veteran',
    affinity: 40,
    financialPressure: 40,
    riskTolerance: 'balanced',
    growthMilestones: 4,
  },
  {
    label: 'Trusted+Broke+Bold',
    affinity: 80,
    financialPressure: 85,
    riskTolerance: 'bold',
    growthMilestones: 4,
  },
]

interface AcceptanceRecord {
  seed: string
  objectiveType: ObjectiveType
  requestTemplateId: string
  requestTitle: string
  requestRank: AdventurerRank
  partyTemplateId: string
  partyRank: AdventurerRank
  rankGap: number
  context: string
  decision: 'accepted' | 'declined'
  reason: string
  score: number
  threshold: number
  modifiers: OfferEvaluation['modifiers']
  relevantRoleCount: number
  leaderJudgment: number
}

interface PredictionCell {
  seed: string
  objectiveType: ObjectiveType
  requestTemplateId: string
  requestTitle: string
  requestRank: AdventurerRank
  partyTemplateId: string
  partyRank: AdventurerRank
  partyName: string
  predictedSuccessRate: number
  sampleCount: number
  byContext: Record<
    string,
    {
      decision: 'accepted' | 'declined'
      reason: string
      score: number
      threshold: number
      relevantRoleCount: number
      leaderJudgment: number
    }
  >
}

interface RepresentativeFixture {
  seed: string
  requestTemplateId: string
  requestTitle: string
  requestRank: AdventurerRank
  partyTemplateId: string
  partyRank: AdventurerRank
  partyName: string
  predictedSuccessRate: number
  relevantRoleCount: number
  leaderJudgment: number
  relevantSkillAverage: number
  contexts: Record<
    string,
    {
      decision: 'accepted' | 'declined'
      reason: string
      score: number
      threshold: number
    }
  >
}

function generateRequestOffer(
  templateId: string,
  rank: AdventurerRank,
  scenarioSeed: string,
): TavernRequestOffer {
  const template = TAVERN_REQUEST_TEMPLATES.find((t) => t.id === templateId)!
  const requestId = `${scenarioSeed}:audit:request:${templateId}:rank:${rank}`
  const requestSeed = `${requestId}:expedition`
  const rng = new SeededRng(`${requestId}:battle-chance`)
  const battleEnabled =
    template.battleChance >= 100 || rng.chance(template.battleChance)
  return template.build({ requestId, seed: requestSeed, rank, battleEnabled })
}

function generateParty(
  templateId: string,
  rank: AdventurerRank,
  scenarioSeed: string,
  templateIndex: number,
): AdventurerParty {
  const seed = `${scenarioSeed}:audit:party:${templateId}:rank:${rank}`
  const name = PARTY_NAMES[templateIndex % PARTY_NAMES.length]
  return generateAdventurerParty(seed, templateIndex, name, rank, templateId)
}

function getRelevantRoles(profile: PublicRequestProfile): Set<string> {
  const objectiveRoles: Record<ObjectiveType, string[]> = {
    investigation: ['scout', 'ranger', 'mage', 'support'],
    elimination: ['vanguard', 'guardian', 'mage', 'healer'],
    rescue: ['scout', 'guardian', 'healer', 'vanguard'],
    escort: ['guardian', 'support', 'ranger', 'healer'],
    retrieval: ['scout', 'vanguard', 'support', 'ranger'],
    survey: ['scout', 'ranger', 'mage', 'support'],
  }
  const environmentRoles: Record<string, string[]> = {
    magical: ['mage'],
    cave: ['scout'],
    ruins: ['scout'],
    urban: ['scout'],
    forest: ['ranger'],
    mountain: ['ranger'],
    plains: ['ranger'],
    swamp: ['ranger'],
    desert: ['ranger'],
  }
  const roles = new Set<string>(objectiveRoles[profile.objectiveType] ?? [])
  for (const role of environmentRoles[profile.environment] ?? []) {
    roles.add(role)
  }
  return roles
}

function computeRelevantSkillAverage(
  party: AdventurerParty,
  profile: PublicRequestProfile,
): number {
  const roles = getRelevantRoles(profile)
  const members = party.members.filter((m) => roles.has(m.role))
  if (members.length === 0) return 0
  const values = members.map((m) => {
    const expert = ROLE_MAP[m.role]?.expertSkills ?? []
    if (expert.length === 0) return 0
    return Math.max(...expert.map((skill) => m.skills[skill] as number))
  })
  return values.reduce((a, b) => a + b, 0) / values.length
}

function makeContext(context: ContextScenario): AcceptanceContext {
  return {
    affinity: context.affinity,
    financialPressure: context.financialPressure,
    riskTolerance: context.riskTolerance,
    growthMilestones: context.growthMilestones,
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

function runAudit() {
  const allRecords: AcceptanceRecord[] = []
  const predictionCells: PredictionCell[] = []
  const fixtures: RepresentativeFixture[] = []

  for (const seed of SCENARIO_SEEDS) {
    for (const requestTemplate of TAVERN_REQUEST_TEMPLATES) {
      for (const partyTemplate of PARTY_TEMPLATES) {
        const partyTemplateIndex = PARTY_TEMPLATES.indexOf(partyTemplate)
        for (const partyRank of PARTY_RANKS) {
          for (const rankGap of RANK_GAPS) {
            const requestRankIndex = rankValue(partyRank) + rankGap
            if (requestRankIndex >= RANKS.length) continue
            const requestRank = RANKS[requestRankIndex]

            const requestOffer = generateRequestOffer(
              requestTemplate.id,
              requestRank,
              seed,
            )
            const party = generateParty(
              partyTemplate.id,
              partyRank,
              seed,
              partyTemplateIndex,
            )
            const publicProfile = toPublicRequestProfile(requestOffer)

            const cellRecords: AcceptanceRecord[] = []
            for (const context of CONTEXTS) {
              const evalContext = makeContext(context)
              const result = evaluateOffer(publicProfile, party, evalContext)
              const record: AcceptanceRecord = {
                seed,
                objectiveType: requestOffer.objectiveType,
                requestTemplateId: requestTemplate.id,
                requestTitle: requestOffer.title,
                requestRank,
                partyTemplateId: partyTemplate.id,
                partyRank,
                rankGap,
                context: context.label,
                decision: result.decision,
                reason: result.reason,
                score: result.acceptanceScore,
                threshold: result.acceptanceThreshold,
                modifiers: result.modifiers,
                relevantRoleCount: result.relevantRoleCount,
                leaderJudgment: result.leaderJudgment,
              }
              cellRecords.push(record)
              allRecords.push(record)
            }

            if (rankGap === 1) {
              const prediction = predictExpeditionOutcome(requestOffer, party, {
                sampleCount: 200,
              })
              const byContext: PredictionCell['byContext'] = {}
              for (const record of cellRecords) {
                byContext[record.context] = {
                  decision: record.decision,
                  reason: record.reason,
                  score: record.score,
                  threshold: record.threshold,
                  relevantRoleCount: record.relevantRoleCount,
                  leaderJudgment: record.leaderJudgment,
                }
              }
              const cell: PredictionCell = {
                seed,
                objectiveType: requestOffer.objectiveType,
                requestTemplateId: requestTemplate.id,
                requestTitle: requestOffer.title,
                requestRank,
                partyTemplateId: partyTemplate.id,
                partyRank,
                partyName: party.name,
                predictedSuccessRate: prediction.estimatedSuccessRate,
                sampleCount: prediction.sampleCount,
                byContext,
              }
              predictionCells.push(cell)

              if (prediction.estimatedSuccessRate >= 0.8) {
                const relevantSkillAverage = computeRelevantSkillAverage(
                  party,
                  publicProfile,
                )
                const fixture: RepresentativeFixture = {
                  seed,
                  requestTemplateId: requestTemplate.id,
                  requestTitle: requestOffer.title,
                  requestRank,
                  partyTemplateId: partyTemplate.id,
                  partyRank,
                  partyName: party.name,
                  predictedSuccessRate: prediction.estimatedSuccessRate,
                  relevantRoleCount: cellRecords[0].relevantRoleCount,
                  leaderJudgment: cellRecords[0].leaderJudgment,
                  relevantSkillAverage,
                  contexts: Object.fromEntries(
                    cellRecords.map((r) => [
                      r.context,
                      {
                        decision: r.decision,
                        reason: r.reason,
                        score: r.score,
                        threshold: r.threshold,
                      },
                    ]),
                  ),
                }
                fixtures.push(fixture)
              }
            }
          }
        }
      }
    }
  }

  // Determinism check
  const first = allRecords[0]
  let deterministic = true
  if (first) {
    const requestOffer = generateRequestOffer(
      first.requestTemplateId,
      first.requestRank,
      first.seed,
    )
    const templateIndex = PARTY_TEMPLATES.findIndex(
      (t) => t.id === first.partyTemplateId,
    )
    const party = generateParty(
      first.partyTemplateId,
      first.partyRank,
      first.seed,
      templateIndex,
    )
    const profile = toPublicRequestProfile(requestOffer)
    const context = CONTEXTS.find((c) => c.label === first.context)!
    const a = evaluateOffer(profile, party, makeContext(context))
    const b = evaluateOffer(profile, party, makeContext(context))
    deterministic = JSON.stringify(a) === JSON.stringify(b)
  }

  // +2 hard gate
  const hardGateRecords = allRecords.filter((r) => r.rankGap >= 2)
  const hardGatePassed = hardGateRecords.every((r) => r.decision === 'declined')

  // By rank gap
  const byRankGap: Record<number, { total: number; accepted: number }> = {}
  for (const r of allRecords) {
    byRankGap[r.rankGap] ??= { total: 0, accepted: 0 }
    byRankGap[r.rankGap].total += 1
    if (r.decision === 'accepted') byRankGap[r.rankGap].accepted += 1
  }

  // By context (overall)
  const byContext: Record<
    string,
    { total: number; accepted: number; rate: number }
  > = {}
  for (const r of allRecords) {
    byContext[r.context] ??= { total: 0, accepted: 0, rate: 0 }
    byContext[r.context].total += 1
    if (r.decision === 'accepted') byContext[r.context].accepted += 1
  }
  for (const key of Object.keys(byContext)) {
    const c = byContext[key]
    c.rate = c.total > 0 ? c.accepted / c.total : 0
  }

  // +1 summary
  const plusOneRecords = allRecords.filter((r) => r.rankGap === 1)
  const plusOneByContext: Record<
    string,
    { total: number; accepted: number; rate: number }
  > = {}
  const plusOneReasons: Record<string, Record<string, number>> = {}
  for (const r of plusOneRecords) {
    plusOneByContext[r.context] ??= { total: 0, accepted: 0, rate: 0 }
    plusOneByContext[r.context].total += 1
    if (r.decision === 'accepted') plusOneByContext[r.context].accepted += 1
    plusOneReasons[r.context] ??= {}
    plusOneReasons[r.context][r.reason] =
      (plusOneReasons[r.context][r.reason] ?? 0) + 1
  }
  for (const key of Object.keys(plusOneByContext)) {
    const c = plusOneByContext[key]
    c.rate = c.total > 0 ? c.accepted / c.total : 0
  }

  // Prediction band aggregation for +1
  type Band = '<50%' | '50-64%' | '65-79%' | '80-89%' | '>=90%'
  function band(rate: number): Band {
    if (rate < 0.5) return '<50%'
    if (rate < 0.65) return '50-64%'
    if (rate < 0.8) return '65-79%'
    if (rate < 0.9) return '80-89%'
    return '>=90%'
  }

  const predictionBandSummary: Record<
    Band,
    Record<string, { total: number; accepted: number; rate: number }>
  > = {
    '<50%': {},
    '50-64%': {},
    '65-79%': {},
    '80-89%': {},
    '>=90%': {},
  }

  for (const cell of predictionCells) {
    const b = band(cell.predictedSuccessRate)
    for (const [contextLabel, result] of Object.entries(cell.byContext)) {
      const entry = predictionBandSummary[b][contextLabel] ?? {
        total: 0,
        accepted: 0,
        rate: 0,
      }
      entry.total += 1
      if (result.decision === 'accepted') entry.accepted += 1
      predictionBandSummary[b][contextLabel] = entry
    }
  }
  for (const b of Object.keys(predictionBandSummary) as Band[]) {
    for (const contextLabel of Object.keys(predictionBandSummary[b])) {
      const entry = predictionBandSummary[b][contextLabel]
      entry.rate = entry.total > 0 ? entry.accepted / entry.total : 0
    }
  }

  // High prediction (>=80%) by context
  const highPredictionCells = predictionCells.filter(
    (c) => c.predictedSuccessRate >= 0.8,
  )
  const highPredictionByContext: Record<
    string,
    { total: number; accepted: number; rate: number }
  > = {}
  const highPredictionReasons: Record<string, Record<string, number>> = {}
  for (const cell of highPredictionCells) {
    for (const [contextLabel, result] of Object.entries(cell.byContext)) {
      highPredictionByContext[contextLabel] ??= {
        total: 0,
        accepted: 0,
        rate: 0,
      }
      highPredictionByContext[contextLabel].total += 1
      if (result.decision === 'accepted') {
        highPredictionByContext[contextLabel].accepted += 1
      }
      highPredictionReasons[contextLabel] ??= {}
      highPredictionReasons[contextLabel][result.reason] =
        (highPredictionReasons[contextLabel][result.reason] ?? 0) + 1
    }
  }
  for (const key of Object.keys(highPredictionByContext)) {
    const c = highPredictionByContext[key]
    c.rate = c.total > 0 ? c.accepted / c.total : 0
  }

  // Sanity target
  const sanityContext = 'Trusted+Broke+Bold'
  const sanity = highPredictionByContext[sanityContext]
  const sanityTargetMet = sanity !== undefined && sanity.rate >= 0.5

  // Trend checks
  const highPredictionTrends = {
    trustedGreaterThanNewcomer:
      (highPredictionByContext['Trusted']?.rate ?? 0) >
      (highPredictionByContext['Newcomer']?.rate ?? 0),
    brokeGreaterThanNewcomer:
      (highPredictionByContext['Broke']?.rate ?? 0) >
      (highPredictionByContext['Newcomer']?.rate ?? 0),
    boldGreaterThanNewcomer:
      (highPredictionByContext['Bold']?.rate ?? 0) >
      (highPredictionByContext['Newcomer']?.rate ?? 0),
    veteranGreaterOrEqualNewcomer:
      (highPredictionByContext['Veteran']?.rate ?? 0) >=
      (highPredictionByContext['Newcomer']?.rate ?? 0),
  }

  // Representative fixtures: E -> D, prediction >= 80%, at least one decline and one accept
  const eToDFixtures = fixtures
    .filter(
      (f) =>
        f.partyRank === 'E' &&
        f.requestRank === 'D' &&
        f.predictedSuccessRate >= 0.8,
    )
    .slice(0, 3)

  // 90% problem fixture: E -> D, prediction >= 90%, Newcomer declines, some context accepts
  const problem90Fixture =
    fixtures.find(
      (f) =>
        f.partyRank === 'E' &&
        f.requestRank === 'D' &&
        f.predictedSuccessRate >= 0.9 &&
        f.contexts['Newcomer']?.decision === 'declined' &&
        Object.values(f.contexts).some((c) => c.decision === 'accepted'),
    ) ??
    fixtures.find(
      (f) =>
        f.partyRank === 'E' &&
        f.requestRank === 'D' &&
        f.predictedSuccessRate >= 0.8 &&
        f.contexts['Newcomer']?.decision === 'declined' &&
        Object.values(f.contexts).some((c) => c.decision === 'accepted'),
    )

  // Distribution of prediction rates among +1 E->D
  const eToDPredictions = predictionCells
    .filter((c) => c.partyRank === 'E' && c.requestRank === 'D')
    .map((c) => c.predictedSuccessRate)
    .sort((a, b) => a - b)

  const json = {
    deterministic,
    hardGatePassed,
    scenarioSeedCount: SCENARIO_SEEDS.length,
    totalAcceptanceRecords: allRecords.length,
    byRankGap,
    byContext,
    plusOneByContext,
    plusOneReasons,
    predictionBandSummary,
    highPredictionByContext,
    highPredictionReasons,
    sanityTargetMet,
    highPredictionTrends,
    predictionCellCount: predictionCells.length,
    eToDPredictionMedian: percentile(eToDPredictions, 0.5),
    eToDPredictionP10: percentile(eToDPredictions, 0.1),
    eToDPredictionP90: percentile(eToDPredictions, 0.9),
    representativeFixtures: eToDFixtures,
    problem90Fixture: problem90Fixture ?? null,
  }

  writeFileSync(
    'reports/phase6_5_acceptance_audit.json',
    JSON.stringify(json, null, 2),
  )

  console.log('Phase 6.5.1 acceptance audit complete')
  console.log('Total acceptance records:', allRecords.length)
  console.log(
    'Prediction cells (+1, 200 samples each):',
    predictionCells.length,
  )
  console.log('Hard gate (rankGap >= 2 => declined):', hardGatePassed)
  console.log('By rank gap:', byRankGap)
  console.log('+1 by context:', plusOneByContext)
  console.log('High prediction (>=80%) by context:', highPredictionByContext)
  console.log(
    'Sanity target (>=80% + Trusted+Broke+Bold >= 50%):',
    sanityTargetMet,
  )
  console.log('Representative E->D fixtures:', eToDFixtures.length)
  console.log('90% problem fixture found:', problem90Fixture ? 'yes' : 'no')
}

runAudit()
