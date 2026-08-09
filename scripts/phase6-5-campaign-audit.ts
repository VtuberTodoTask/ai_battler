import { writeFileSync } from 'node:fs'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../src/core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../src/core/tavern/brokerage.ts'
import type { ExpeditionOutcome } from '../src/core/expedition/types.ts'

const SEEDS = [
  'phase6-5-campaign-001',
  'phase6-5-campaign-002',
  'phase6-5-campaign-003',
]
const DAY_COUNT = 30

interface SeedResult {
  seed: string
  finalReputation: number
  acceptedOffers: number
  declinedOffers: number
  relationshipEvents: number
  affinityChanges: number
  financialPressureChanges: number
  stayExtensions: number
  finalAffinityAverage: number
  finalPressureAverage: number
  outcomeCounts: Record<ExpeditionOutcome, number>
  stayExtensionsTotalDays: number
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

function runSeed(seed: string): SeedResult {
  let campaign = createTavernCampaign(seed)

  const result: SeedResult = {
    seed,
    finalReputation: campaign.reputation,
    acceptedOffers: 0,
    declinedOffers: 0,
    relationshipEvents: 0,
    affinityChanges: 0,
    financialPressureChanges: 0,
    stayExtensions: 0,
    finalAffinityAverage: 0,
    finalPressureAverage: 0,
    outcomeCounts: {
      completeSuccess: 0,
      success: 0,
      partialSuccess: 0,
      failedObjective: 0,
      forcedRetreat: 0,
      lostExpedition: 0,
    },
    stayExtensionsTotalDays: 0,
  }

  for (let day = 1; day <= DAY_COUNT; day++) {
    const offersBefore = campaign.currentDay.offers.length
    campaign = resolveWithOptionalOffer(campaign)
    const offersAfter = campaign.currentDay.offers.length
    if (offersAfter > offersBefore) {
      const lastOffer =
        campaign.currentDay.offers[campaign.currentDay.offers.length - 1]
      if (lastOffer.decision === 'accepted') {
        result.acceptedOffers += 1
      } else {
        result.declinedOffers += 1
      }
    }

    const dayRecord = campaign.history[campaign.history.length - 1]
    for (const event of dayRecord.relationshipEvents) {
      result.relationshipEvents += 1
      if (event.type === 'affinityChanged') {
        result.affinityChanges += 1
        result.outcomeCounts[event.outcome] += 1
      } else if (event.type === 'financialPressureChanged') {
        result.financialPressureChanges += 1
      } else if (event.type === 'stayExtended') {
        result.stayExtensions += 1
        result.stayExtensionsTotalDays += event.extensionDays
      }
    }

    if (day < DAY_COUNT) {
      campaign = advanceCampaignDay(campaign)
    }
  }

  result.finalReputation = campaign.reputation
  const parties = campaign.parties
  if (parties.length > 0) {
    result.finalAffinityAverage =
      parties.reduce((sum, p) => sum + p.relationship.affinity, 0) /
      parties.length
    result.finalPressureAverage =
      parties.reduce((sum, p) => sum + p.relationship.financialPressure, 0) /
      parties.length
  }

  return result
}

function runAudit() {
  const results = SEEDS.map((seed) => runSeed(seed))

  const combined = {
    dayCount: DAY_COUNT,
    seedCount: SEEDS.length,
    totalAccepted: 0,
    totalDeclined: 0,
    totalRelationshipEvents: 0,
    totalAffinityChanges: 0,
    totalFinancialPressureChanges: 0,
    totalStayExtensions: 0,
    totalStayExtensionDays: 0,
    outcomeCounts: {
      completeSuccess: 0,
      success: 0,
      partialSuccess: 0,
      failedObjective: 0,
      forcedRetreat: 0,
      lostExpedition: 0,
    } as Record<ExpeditionOutcome, number>,
    finalAffinityAverage: 0,
    finalPressureAverage: 0,
    seeds: results,
  }

  for (const r of results) {
    combined.totalAccepted += r.acceptedOffers
    combined.totalDeclined += r.declinedOffers
    combined.totalRelationshipEvents += r.relationshipEvents
    combined.totalAffinityChanges += r.affinityChanges
    combined.totalFinancialPressureChanges += r.financialPressureChanges
    combined.totalStayExtensions += r.stayExtensions
    combined.totalStayExtensionDays += r.stayExtensionsTotalDays
    combined.finalAffinityAverage += r.finalAffinityAverage
    combined.finalPressureAverage += r.finalPressureAverage
    for (const outcome of Object.keys(r.outcomeCounts) as ExpeditionOutcome[]) {
      combined.outcomeCounts[outcome] += r.outcomeCounts[outcome]
    }
  }

  combined.finalAffinityAverage /= SEEDS.length
  combined.finalPressureAverage /= SEEDS.length

  const json = {
    ...combined,
    acceptanceRate:
      combined.totalAccepted + combined.totalDeclined > 0
        ? combined.totalAccepted /
          (combined.totalAccepted + combined.totalDeclined)
        : 0,
  }

  writeFileSync(
    'reports/phase6_5_campaign_audit.json',
    JSON.stringify(json, null, 2),
  )

  console.log(
    `Relationship campaign audit complete: ${DAY_COUNT} days × ${SEEDS.length} seeds`,
  )
  console.log('JSON: reports/phase6_5_campaign_audit.json')
  console.log('Accepted offers:', combined.totalAccepted)
  console.log('Declined offers:', combined.totalDeclined)
  console.log('Affinity changes:', combined.totalAffinityChanges)
  console.log(
    'Financial pressure changes:',
    combined.totalFinancialPressureChanges,
  )
  console.log('Stay extensions:', combined.totalStayExtensions)
  console.log('Outcome counts:', combined.outcomeCounts)
}

runAudit()
