import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  makeEliminationRequest,
  makeEscortRequest,
  makeParty,
  makeRequest,
  makeRescueRequest,
  makeRetrievalRequest,
  makeSurveyRequest,
  cloneParty,
} from '../src/core/expedition/test-utils.ts'
import { runExpedition } from '../src/core/expedition/expedition.ts'
import { generateAdventurerParty } from '../src/core/tavern/partyGenerator.ts'
import { PARTY_TEMPLATES } from '../src/core/tavern/partyTemplates.ts'
import { evaluateOffer } from '../src/core/tavern/acceptance.ts'
import {
  getMissionSpecializationMatch,
  MISSION_SPECIALIZATION_OBJECTIVES,
  type MissionSpecializationMatch,
  type PartyMissionSpecialization,
} from '../src/core/tavern/specialization.ts'
import type { AdventurerRank, ObjectiveType } from '../src/core/models/types.ts'
import type { PublicRequestProfile } from '../src/core/tavern/types.ts'
import {
  createTavernCampaign,
  resolveCampaignDay,
  advanceCampaignDay,
} from '../src/core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../src/core/tavern/brokerage.ts'

const REPORTS_DIR = join(import.meta.dirname, '../reports')

const OBJECTIVE_REQUEST_BUILDERS: Record<
  ObjectiveType,
  (
    seed: string,
    rank: AdventurerRank,
  ) => import('../src/core/expedition/types.ts').ExpeditionRequest
> = {
  investigation: (seed, rank) =>
    makeRequest(seed, { rank, objectiveType: 'investigation' }),
  elimination: (seed, rank) =>
    makeEliminationRequest(seed, rank, false, 'standard'),
  rescue: (seed, rank) => makeRescueRequest(seed, rank),
  escort: (seed, rank) => makeEscortRequest(seed, rank),
  retrieval: (seed, rank) => makeRetrievalRequest(seed, rank),
  survey: (seed, rank) => makeSurveyRequest(seed, rank),
}

function publicRequest(
  objectiveType: ObjectiveType,
  rank: AdventurerRank,
): PublicRequestProfile {
  return {
    id: `audit-${objectiveType}-${rank}`,
    objectiveType,
    rank,
    environment: 'forest',
    publicTags: ['audit'],
  }
}

type DistributionRecord = {
  seed: string
  templateId: string
  strongObjective: ObjectiveType
  weakObjective: ObjectiveType
}

function runDistributionAudit(): {
  records: DistributionRecord[]
  strongCounts: Record<ObjectiveType, number>
  weakCounts: Record<ObjectiveType, number>
  templateBias: Record<string, Record<ObjectiveType, number>>
  assertion: string
} {
  const records: DistributionRecord[] = []
  const strongCounts = initCounts()
  const weakCounts = initCounts()
  const templateBias: Record<string, Record<ObjectiveType, number>> = {}

  for (let seed = 0; seed < 1000; seed++) {
    PARTY_TEMPLATES.forEach((template, templateIndex) => {
      const party = generateAdventurerParty(
        String(seed),
        templateIndex,
        'Audit',
        'C',
        template.id,
      )
      records.push({
        seed: String(seed),
        templateId: template.id,
        strongObjective: party.missionSpecialization.strongObjective,
        weakObjective: party.missionSpecialization.weakObjective,
      })
      strongCounts[party.missionSpecialization.strongObjective]++
      weakCounts[party.missionSpecialization.weakObjective]++
      templateBias[template.id] ??= initCounts()
      templateBias[template.id][party.missionSpecialization.strongObjective]++
    })
  }

  const expected = records.length / MISSION_SPECIALIZATION_OBJECTIVES.length
  const strongMin = Math.min(...Object.values(strongCounts))
  const strongMax = Math.max(...Object.values(strongCounts))
  const weakMin = Math.min(...Object.values(weakCounts))
  const weakMax = Math.max(...Object.values(weakCounts))
  const ok =
    strongMin >= expected * 0.7 &&
    strongMax <= expected * 1.3 &&
    weakMin >= expected * 0.7 &&
    weakMax <= expected * 1.3

  return {
    records,
    strongCounts,
    weakCounts,
    templateBias,
    assertion: ok
      ? 'PASS: objective distribution within 30% of expected'
      : 'FAIL: objective distribution too skewed',
  }
}

function initCounts(): Record<ObjectiveType, number> {
  return MISSION_SPECIALIZATION_OBJECTIVES.reduce(
    (acc, o) => {
      acc[o] = 0
      return acc
    },
    {} as Record<ObjectiveType, number>,
  )
}

function runPairedSuccessAudit(): {
  perObjective: Record<
    ObjectiveType,
    Record<MissionSpecializationMatch, number>
  >
  assertion: string
} {
  const seeds = 100
  const perObjective: Record<
    ObjectiveType,
    Record<MissionSpecializationMatch, number>
  > = initPerObjectiveRates()
  const roles: Array<import('../src/core/models/types.ts').AdventurerRole> = [
    'vanguard',
    'guardian',
    'mage',
    'healer',
  ]

  for (let s = 0; s < seeds; s++) {
    const seed = `paired-${s}`
    const party = makeParty(roles, seed, 'C')
    for (const objective of MISSION_SPECIALIZATION_OBJECTIVES) {
      const request = OBJECTIVE_REQUEST_BUILDERS[objective](seed, 'C')
      for (const match of [
        'strong',
        'neutral',
        'weak',
      ] as MissionSpecializationMatch[]) {
        const result = runExpedition(request, cloneParty(party), {
          missionSpecializationMatch: match,
        })
        if (
          result.outcome === 'completeSuccess' ||
          result.outcome === 'success'
        ) {
          perObjective[objective][match]++
        }
      }
    }
  }

  for (const objective of MISSION_SPECIALIZATION_OBJECTIVES) {
    for (const match of [
      'strong',
      'neutral',
      'weak',
    ] as MissionSpecializationMatch[]) {
      perObjective[objective][match] /= seeds
    }
  }

  let ok = true
  for (const objective of MISSION_SPECIALIZATION_OBJECTIVES) {
    const rates = perObjective[objective]
    if (rates.strong < rates.neutral || rates.neutral < rates.weak) {
      ok = false
    }
  }

  return {
    perObjective,
    assertion: ok
      ? 'PASS: strong >= neutral >= weak for every objective'
      : 'FAIL: specialization success ordering violated',
  }
}

function initPerObjectiveRates(): Record<
  ObjectiveType,
  Record<MissionSpecializationMatch, number>
> {
  return MISSION_SPECIALIZATION_OBJECTIVES.reduce(
    (acc, o) => {
      acc[o] = { strong: 0, neutral: 0, weak: 0 }
      return acc
    },
    {} as Record<ObjectiveType, Record<MissionSpecializationMatch, number>>,
  )
}

function makeMatchStats() {
  return {
    strong: { total: 0, accepted: 0, rate: 0, scoreSum: 0, avgScore: 0 },
    neutral: { total: 0, accepted: 0, rate: 0, scoreSum: 0, avgScore: 0 },
    weak: { total: 0, accepted: 0, rate: 0, scoreSum: 0, avgScore: 0 },
  }
}

function runAcceptanceScoreShiftAudit(): {
  samples: number
  avgStrongNeutral: number
  avgNeutralWeak: number
  assertion: string
} {
  const diffs: { strongNeutral: number; neutralWeak: number }[] = []

  for (let seed = 0; seed < 200; seed++) {
    const template = PARTY_TEMPLATES[seed % PARTY_TEMPLATES.length]
    const party = generateAdventurerParty(
      `score-shift-${seed}`,
      seed,
      'Audit',
      'C',
      template.id,
    )
    for (const objective of MISSION_SPECIALIZATION_OBJECTIVES) {
      const request = publicRequest(objective, 'C')
      const neutralSpec: PartyMissionSpecialization = {
        strongObjective: getOtherThan(objective),
        weakObjective: getOtherThan(objective, getOtherThan(objective)),
      }
      const strongSpec: PartyMissionSpecialization = {
        strongObjective: objective,
        weakObjective: getOtherThan(objective),
      }
      const weakSpec: PartyMissionSpecialization = {
        strongObjective: getOtherThan(objective),
        weakObjective: objective,
      }
      const neutral = evaluateOffer(request, {
        ...party,
        missionSpecialization: neutralSpec,
      })
      const strong = evaluateOffer(request, {
        ...party,
        missionSpecialization: strongSpec,
      })
      const weak = evaluateOffer(request, {
        ...party,
        missionSpecialization: weakSpec,
      })
      diffs.push({
        strongNeutral: strong.acceptanceScore - neutral.acceptanceScore,
        neutralWeak: neutral.acceptanceScore - weak.acceptanceScore,
      })
    }
  }

  const avgStrongNeutral =
    diffs.reduce((sum, d) => sum + d.strongNeutral, 0) / diffs.length
  const avgNeutralWeak =
    diffs.reduce((sum, d) => sum + d.neutralWeak, 0) / diffs.length

  const ok =
    Math.abs(avgStrongNeutral - 8) < 0.0001 &&
    Math.abs(avgNeutralWeak - 8) < 0.0001

  return {
    samples: diffs.length,
    avgStrongNeutral,
    avgNeutralWeak,
    assertion: ok
      ? 'PASS: acceptance score shifts are exactly +8 and -8'
      : 'FAIL: acceptance score shifts are not exactly +8 and -8',
  }
}

function runAcceptanceAudit(): {
  sameRank: ReturnType<typeof makeMatchStats>
  plusOne: ReturnType<typeof makeMatchStats>
  avgScoreDiff: {
    sameRankStrongNeutral: number
    sameRankNeutralWeak: number
    plusOneStrongNeutral: number
    plusOneNeutralWeak: number
  }
  hardGate: { total: number; accepted: number }
  sameRankReasons: Record<string, number>
  plusOneReasons: Record<string, number>
  assertion: string
} {
  const sameRank = makeMatchStats()
  const plusOne = makeMatchStats()
  const hardGate = { total: 0, accepted: 0 }
  const sameRankReasons: Record<string, number> = {}
  const plusOneReasons: Record<string, number> = {}

  for (let seed = 0; seed < 500; seed++) {
    PARTY_TEMPLATES.forEach((template, templateIndex) => {
      const party = generateAdventurerParty(
        String(seed),
        templateIndex,
        'Audit',
        'C',
        template.id,
      )
      for (const objective of MISSION_SPECIALIZATION_OBJECTIVES) {
        const sameRequest = publicRequest(objective, 'C')
        const sameMatch = getMissionSpecializationMatch(
          party.missionSpecialization,
          objective,
        )
        const sameResult = evaluateOffer(sameRequest, party)
        sameRank[sameMatch].total++
        sameRank[sameMatch].scoreSum += sameResult.acceptanceScore
        if (sameResult.decision === 'accepted') {
          sameRank[sameMatch].accepted++
        }
        sameRankReasons[sameResult.reason] =
          (sameRankReasons[sameResult.reason] ?? 0) + 1

        const plusRequest = publicRequest(objective, 'B')
        const plusMatch = getMissionSpecializationMatch(
          party.missionSpecialization,
          objective,
        )
        const plusResult = evaluateOffer(plusRequest, party)
        plusOne[plusMatch].total++
        plusOne[plusMatch].scoreSum += plusResult.acceptanceScore
        if (plusResult.decision === 'accepted') {
          plusOne[plusMatch].accepted++
        }
        plusOneReasons[plusResult.reason] =
          (plusOneReasons[plusResult.reason] ?? 0) + 1

        // +2 hard gate with strong specialization
        const hardRequest = publicRequest(objective, 'A')
        const hardSpec: PartyMissionSpecialization = {
          strongObjective: objective,
          weakObjective: getOtherObjective(objective),
        }
        const hardResult = evaluateOffer(hardRequest, {
          ...party,
          missionSpecialization: hardSpec,
        })
        hardGate.total++
        if (hardResult.decision === 'accepted') hardGate.accepted++
      }
    })
  }

  for (const container of [sameRank, plusOne] as const) {
    for (const match of [
      'strong',
      'neutral',
      'weak',
    ] as MissionSpecializationMatch[]) {
      const stats = container[match]
      stats.rate = stats.total === 0 ? 0 : stats.accepted / stats.total
      stats.avgScore = stats.total === 0 ? 0 : stats.scoreSum / stats.total
    }
  }

  const avgScoreDiff = {
    sameRankStrongNeutral: sameRank.strong.avgScore - sameRank.neutral.avgScore,
    sameRankNeutralWeak: sameRank.neutral.avgScore - sameRank.weak.avgScore,
    plusOneStrongNeutral: plusOne.strong.avgScore - plusOne.neutral.avgScore,
    plusOneNeutralWeak: plusOne.neutral.avgScore - plusOne.weak.avgScore,
  }

  const ok =
    Math.abs(avgScoreDiff.sameRankStrongNeutral - 8) < 1.0 &&
    Math.abs(avgScoreDiff.sameRankNeutralWeak - 8) < 1.0 &&
    Math.abs(avgScoreDiff.plusOneStrongNeutral - 8) < 1.0 &&
    Math.abs(avgScoreDiff.plusOneNeutralWeak - 8) < 1.0 &&
    hardGate.accepted === 0

  return {
    sameRank,
    plusOne,
    avgScoreDiff,
    hardGate,
    sameRankReasons,
    plusOneReasons,
    assertion: ok
      ? 'PASS: score shifts are ~+8/-8 and +2 hard gate is 0%'
      : 'FAIL: score shift or hard gate violated',
  }
}

function getOtherObjective(objective: ObjectiveType): ObjectiveType {
  return MISSION_SPECIALIZATION_OBJECTIVES.find((o) => o !== objective)!
}

function getOtherThan(
  avoid: ObjectiveType,
  alsoAvoid?: ObjectiveType,
): ObjectiveType {
  return MISSION_SPECIALIZATION_OBJECTIVES.find(
    (o) => o !== avoid && o !== alsoAvoid,
  )!
}

function runCampaignSmoke(): {
  daysRun: number
  expeditions: number
  errors: string[]
  assertion: string
} {
  const errors: string[] = []
  let campaign = createTavernCampaign('phase6-6-smoke')
  let expeditions = 0
  const days = 30

  try {
    for (let day = 0; day < days; day++) {
      const state = campaign.currentDay
      for (const request of state.requests) {
        let matched = false
        for (const party of state.parties) {
          try {
            const next = offerRequestToParty(
              campaign.currentDay,
              request.id,
              party.id,
            )
            campaign = { ...campaign, currentDay: next }
            if (next.matches.some((m) => m.requestId === request.id)) {
              matched = true
              break
            }
          } catch {
            // ignore errors for already-used parties
          }
        }
        if (matched) expeditions++
      }

      if (campaign.currentDay.status !== 'planning') {
        errors.push(`Day ${day + 1} was not in planning status`)
        break
      }
      campaign = resolveCampaignDay(campaign)
      campaign = advanceCampaignDay(campaign)
    }
  } catch (e) {
    errors.push(String(e))
  }

  return {
    daysRun: days,
    expeditions,
    errors,
    assertion:
      errors.length === 0
        ? 'PASS: 30-day campaign smoke completed'
        : 'FAIL: campaign smoke encountered errors',
  }
}

function main() {
  const distribution = runDistributionAudit()
  const paired = runPairedSuccessAudit()
  const scoreShift = runAcceptanceScoreShiftAudit()
  const acceptance = runAcceptanceAudit()
  const campaign = runCampaignSmoke()

  const report = {
    phase: '6.6',
    timestamp: new Date().toISOString(),
    distribution: {
      ...distribution,
      records: distribution.records.slice(0, 20),
    },
    pairedSuccess: paired,
    scoreShift,
    acceptance,
    campaignSmoke: campaign,
  }

  const outPath = join(REPORTS_DIR, 'phase6_6_specialization_audit.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(`Wrote ${outPath}`)
  console.log('Distribution:', distribution.assertion)
  console.log('Paired success:', paired.assertion)
  console.log('Score shift:', scoreShift.assertion)
  console.log('Acceptance:', acceptance.assertion)
  console.log('Campaign smoke:', campaign.assertion)
}

main()
