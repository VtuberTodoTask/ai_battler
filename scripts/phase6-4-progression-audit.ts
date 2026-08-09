import { writeFileSync } from 'node:fs'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../src/core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../src/core/tavern/brokerage.ts'
import type { CampaignProgressionSource } from '../src/core/tavern/campaign/types.ts'
const SEEDS = [
  'phase6-4-audit-001',
  'phase6-4-audit-002',
  'phase6-4-audit-003',
  'phase6-4-audit-004',
  'phase6-4-audit-005',
]
const DAY_COUNT = 30

interface Aggregates {
  totalExpeditionXp: number
  totalTrainingXp: number
  totalMilestones: number
  totalSkillImprovements: number
  totalSkillIncrease: number
  maxSkillIncrease: number
  totalTrainingDays: number
  outcomeXp: Record<CampaignProgressionSource, { count: number; xp: number }>
  finalParties: number
  partiesWithZeroGrowth: number
  partiesWithMilestone: number
}

function resolveWithOptionalOffer(
  campaign: ReturnType<typeof createTavernCampaign>,
) {
  for (const request of campaign.currentDay.requests) {
    for (const party of campaign.currentDay.parties) {
      if (party.availability === 'recovering') continue
      try {
        const next = offerRequestToParty(
          campaign.currentDay,
          request.id,
          party.id,
        )
        if (next.matches.length > 0) {
          return resolveCampaignDay({ ...campaign, currentDay: next })
        }
      } catch {
        // continue
      }
    }
  }
  return resolveCampaignDay(campaign)
}

function runSeed(seed: string): Aggregates {
  let campaign = createTavernCampaign(seed)

  const agg: Aggregates = {
    totalExpeditionXp: 0,
    totalTrainingXp: 0,
    totalMilestones: 0,
    totalSkillImprovements: 0,
    totalSkillIncrease: 0,
    maxSkillIncrease: 0,
    totalTrainingDays: 0,
    outcomeXp: {
      completeSuccess: { count: 0, xp: 0 },
      success: { count: 0, xp: 0 },
      partialSuccess: { count: 0, xp: 0 },
      failedObjective: { count: 0, xp: 0 },
      forcedRetreat: { count: 0, xp: 0 },
      training: { count: 0, xp: 0 },
    },
    finalParties: 0,
    partiesWithZeroGrowth: 0,
    partiesWithMilestone: 0,
  }

  for (let day = 1; day <= DAY_COUNT; day++) {
    campaign = resolveWithOptionalOffer(campaign)

    const dayRecord = campaign.history[campaign.history.length - 1]
    for (const event of dayRecord.progressionEvents) {
      if (event.type === 'experienceGained') {
        if (event.source === 'training') {
          agg.totalTrainingXp += event.amount
        } else {
          agg.totalExpeditionXp += event.amount
        }
        const entry = agg.outcomeXp[event.source]
        if (entry) {
          entry.count += 1
          entry.xp += event.amount
        }
      } else if (event.type === 'skillImproved') {
        agg.totalSkillImprovements += 1
        const increase = event.after - event.before
        agg.totalSkillIncrease += increase
        agg.maxSkillIncrease = Math.max(agg.maxSkillIncrease, increase)
      }
    }

    if (day < DAY_COUNT) {
      campaign = advanceCampaignDay(campaign)
    }
  }

  for (const party of campaign.parties) {
    agg.finalParties += 1
    agg.totalMilestones += party.progression.growthMilestones
    agg.totalTrainingDays += party.progression.trainingDays
    if (party.progression.totalGrowthXp === 0) {
      agg.partiesWithZeroGrowth += 1
    }
    if (party.progression.growthMilestones > 0) {
      agg.partiesWithMilestone += 1
    }
  }

  return agg
}

function runAudit() {
  const results = SEEDS.map((seed) => ({ seed, aggregates: runSeed(seed) }))

  const combined: Aggregates = {
    totalExpeditionXp: 0,
    totalTrainingXp: 0,
    totalMilestones: 0,
    totalSkillImprovements: 0,
    totalSkillIncrease: 0,
    maxSkillIncrease: 0,
    totalTrainingDays: 0,
    outcomeXp: {
      completeSuccess: { count: 0, xp: 0 },
      success: { count: 0, xp: 0 },
      partialSuccess: { count: 0, xp: 0 },
      failedObjective: { count: 0, xp: 0 },
      forcedRetreat: { count: 0, xp: 0 },
      training: { count: 0, xp: 0 },
    },
    finalParties: 0,
    partiesWithZeroGrowth: 0,
    partiesWithMilestone: 0,
  }

  for (const r of results) {
    combined.totalExpeditionXp += r.aggregates.totalExpeditionXp
    combined.totalTrainingXp += r.aggregates.totalTrainingXp
    combined.totalMilestones += r.aggregates.totalMilestones
    combined.totalSkillImprovements += r.aggregates.totalSkillImprovements
    combined.totalSkillIncrease += r.aggregates.totalSkillIncrease
    combined.maxSkillIncrease = Math.max(
      combined.maxSkillIncrease,
      r.aggregates.maxSkillIncrease,
    )
    combined.totalTrainingDays += r.aggregates.totalTrainingDays
    combined.finalParties += r.aggregates.finalParties
    combined.partiesWithZeroGrowth += r.aggregates.partiesWithZeroGrowth
    combined.partiesWithMilestone += r.aggregates.partiesWithMilestone
    for (const source of Object.keys(
      combined.outcomeXp,
    ) as CampaignProgressionSource[]) {
      combined.outcomeXp[source].count += r.aggregates.outcomeXp[source].count
      combined.outcomeXp[source].xp += r.aggregates.outcomeXp[source].xp
    }
  }

  const xpPerOutcome: Record<string, number> = {}
  for (const source of Object.keys(combined.outcomeXp)) {
    const { count, xp } =
      combined.outcomeXp[source as CampaignProgressionSource]
    xpPerOutcome[source] = count > 0 ? xp / count : 0
  }

  const skillIncreasePerImprovement =
    combined.totalSkillImprovements > 0
      ? combined.totalSkillIncrease / combined.totalSkillImprovements
      : 0

  const estimatedTotalMilestones = Math.floor(
    combined.totalSkillImprovements / 4,
  )
  const estimatedTrainingDays = combined.outcomeXp.training.count

  const json = {
    dayCount: DAY_COUNT,
    seedCount: SEEDS.length,
    combined,
    xpPerOutcome,
    averages: {
      expeditionXpPerSeed: combined.totalExpeditionXp / SEEDS.length,
      trainingXpPerSeed: combined.totalTrainingXp / SEEDS.length,
      milestonesPerSeed: estimatedTotalMilestones / SEEDS.length,
      skillImprovementsPerSeed: combined.totalSkillImprovements / SEEDS.length,
      trainingDaysPerSeed: estimatedTrainingDays / SEEDS.length,
      finalPartiesWithMilestoneRate:
        combined.finalParties > 0
          ? combined.partiesWithMilestone / combined.finalParties
          : 0,
      finalPartiesWithZeroGrowthRate:
        combined.finalParties > 0
          ? combined.partiesWithZeroGrowth / combined.finalParties
          : 0,
      skillIncreasePerImprovement,
      maxSkillIncrease: combined.maxSkillIncrease,
    },
    seeds: results.map((r) => ({
      seed: r.seed,
      totalGrowth:
        r.aggregates.totalExpeditionXp + r.aggregates.totalTrainingXp,
      milestones: r.aggregates.totalMilestones,
      skillImprovements: r.aggregates.totalSkillImprovements,
      trainingDays: r.aggregates.totalTrainingDays,
    })),
  }

  writeFileSync(
    'reports/phase6_4_progression_audit.json',
    JSON.stringify(json, null, 2),
  )

  console.log(
    `Progression audit complete: ${DAY_COUNT} days × ${SEEDS.length} seeds`,
  )
  console.log('JSON: reports/phase6_4_progression_audit.json')
  console.log(`Total expedition XP: ${combined.totalExpeditionXp}`)
  console.log(`Total training XP: ${combined.totalTrainingXp}`)
  console.log(`Total milestones: ${combined.totalMilestones}`)
  console.log(`Total skill improvements: ${combined.totalSkillImprovements}`)
  console.log(`Max skill increase: ${combined.maxSkillIncrease}`)
  console.log('XP per outcome:', xpPerOutcome)
}

runAudit()
