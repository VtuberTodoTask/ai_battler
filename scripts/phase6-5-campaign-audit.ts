import { writeFileSync } from 'node:fs'
import type { ExpeditionOutcome } from '../src/core/expedition/types.ts'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../src/core/tavern/campaign/campaign.ts'
import {
  getAffinityTier,
  getFinancialPressureTier,
} from '../src/core/tavern/campaign/relationship.ts'
import { offerRequestToParty } from '../src/core/tavern/brokerage.ts'

const SEEDS = [
  'phase6-5-campaign-001',
  'phase6-5-campaign-002',
  'phase6-5-campaign-003',
  'phase6-5-campaign-004',
  'phase6-5-campaign-005',
  'phase6-5-campaign-006',
  'phase6-5-campaign-007',
  'phase6-5-campaign-008',
  'phase6-5-campaign-009',
  'phase6-5-campaign-010',
]
const DAY_COUNT = 30

interface AcceptanceByCategory {
  total: number
  accepted: number
  rate: number
}

interface SeedResult {
  seed: string
  finalReputation: number
  acceptedOffers: number
  declinedOffers: number
  relationshipEvents: number
  affinityChanges: number
  financialPressureChanges: number
  stayExtensions: number
  scheduledDepartures: number
  newArrivals: number
  totalStayDays: number
  departedCount: number
  finalAffinityAverage: number
  finalPressureAverage: number
  outcomeCounts: Record<ExpeditionOutcome, number>
  stayExtensionsTotalDays: number
  acceptanceByRankGap: Record<string, AcceptanceByCategory>
  acceptanceByAffinityTier: Record<string, AcceptanceByCategory>
  acceptanceByFinancialTier: Record<string, AcceptanceByCategory>
  acceptanceByRiskTolerance: Record<string, AcceptanceByCategory>
}

interface OfferCounts {
  accepted: number
  declined: number
  byRankGap: Record<string, AcceptanceByCategory>
  byAffinityTier: Record<string, AcceptanceByCategory>
  byFinancialTier: Record<string, AcceptanceByCategory>
  byRiskTolerance: Record<string, AcceptanceByCategory>
}

function emptyCategory(): AcceptanceByCategory {
  return { total: 0, accepted: 0, rate: 0 }
}

function bumpCategory(
  map: Record<string, AcceptanceByCategory>,
  key: string,
  decision: 'accepted' | 'declined',
): void {
  const entry = map[key] ?? emptyCategory()
  entry.total += 1
  if (decision === 'accepted') entry.accepted += 1
  entry.rate = entry.total > 0 ? entry.accepted / entry.total : 0
  map[key] = entry
}

function resolveWithOptionalOffer(
  campaign: ReturnType<typeof createTavernCampaign>,
): { campaign: ReturnType<typeof createTavernCampaign>; offers: OfferCounts } {
  let day = campaign.currentDay
  const offers: OfferCounts = {
    accepted: 0,
    declined: 0,
    byRankGap: {},
    byAffinityTier: {},
    byFinancialTier: {},
    byRiskTolerance: {},
  }

  for (const request of day.requests) {
    for (const party of day.parties) {
      if (party.availability === 'recovering') continue
      try {
        const next = offerRequestToParty(day, request.id, party.id)
        const offer = next.offers[next.offers.length - 1]
        if (!offer) continue

        if (offer.decision === 'accepted') {
          offers.accepted += 1
        } else {
          offers.declined += 1
        }

        const relationship = party.relationship!
        const rankGap = offer.evaluation.rankGap
        bumpCategory(offers.byRankGap, String(rankGap), offer.decision)
        bumpCategory(
          offers.byAffinityTier,
          getAffinityTier(relationship.affinity),
          offer.decision,
        )
        bumpCategory(
          offers.byFinancialTier,
          getFinancialPressureTier(relationship.financialPressure),
          offer.decision,
        )
        bumpCategory(
          offers.byRiskTolerance,
          relationship.riskTolerance,
          offer.decision,
        )

        day = next
        if (offer.decision === 'accepted') {
          return { campaign: { ...campaign, currentDay: day }, offers }
        }
      } catch {
        // Continue to next combination.
      }
    }
  }

  return { campaign: { ...campaign, currentDay: day }, offers }
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
    scheduledDepartures: 0,
    newArrivals: 0,
    totalStayDays: 0,
    departedCount: 0,
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
    acceptanceByRankGap: {},
    acceptanceByAffinityTier: {},
    acceptanceByFinancialTier: {},
    acceptanceByRiskTolerance: {},
  }

  const arrivalDays = new Map<string, number>()

  for (let day = 1; day <= DAY_COUNT; day++) {
    const offerResult = resolveWithOptionalOffer(campaign)
    campaign = offerResult.campaign
    result.acceptedOffers += offerResult.offers.accepted
    result.declinedOffers += offerResult.offers.declined

    // Merge acceptance category counters.
    for (const [key, value] of Object.entries(offerResult.offers.byRankGap)) {
      const existing = result.acceptanceByRankGap[key] ?? emptyCategory()
      existing.total += value.total
      existing.accepted += value.accepted
      existing.rate =
        existing.total > 0 ? existing.accepted / existing.total : 0
      result.acceptanceByRankGap[key] = existing
    }
    for (const [key, value] of Object.entries(
      offerResult.offers.byAffinityTier,
    )) {
      const existing = result.acceptanceByAffinityTier[key] ?? emptyCategory()
      existing.total += value.total
      existing.accepted += value.accepted
      existing.rate =
        existing.total > 0 ? existing.accepted / existing.total : 0
      result.acceptanceByAffinityTier[key] = existing
    }
    for (const [key, value] of Object.entries(
      offerResult.offers.byFinancialTier,
    )) {
      const existing = result.acceptanceByFinancialTier[key] ?? emptyCategory()
      existing.total += value.total
      existing.accepted += value.accepted
      existing.rate =
        existing.total > 0 ? existing.accepted / existing.total : 0
      result.acceptanceByFinancialTier[key] = existing
    }
    for (const [key, value] of Object.entries(
      offerResult.offers.byRiskTolerance,
    )) {
      const existing = result.acceptanceByRiskTolerance[key] ?? emptyCategory()
      existing.total += value.total
      existing.accepted += value.accepted
      existing.rate =
        existing.total > 0 ? existing.accepted / existing.total : 0
      result.acceptanceByRiskTolerance[key] = existing
    }

    campaign = resolveCampaignDay(campaign)

    const dayRecord = campaign.history[campaign.history.length - 1]
    for (const event of dayRecord.partyEvents) {
      if (event.type === 'arrived') {
        result.newArrivals += 1
        arrivalDays.set(event.partyId, event.dayNumber)
      } else if (event.type === 'departedScheduled') {
        result.scheduledDepartures += 1
        const arrivalDay = arrivalDays.get(event.partyId)
        if (arrivalDay !== undefined) {
          result.totalStayDays += event.dayNumber - arrivalDay
          result.departedCount += 1
        }
      }
    }

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
    totalScheduledDepartures: 0,
    totalNewArrivals: 0,
    averageStayDays: 0,
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
    acceptanceByRankGap: {} as Record<string, AcceptanceByCategory>,
    acceptanceByAffinityTier: {} as Record<string, AcceptanceByCategory>,
    acceptanceByFinancialTier: {} as Record<string, AcceptanceByCategory>,
    acceptanceByRiskTolerance: {} as Record<string, AcceptanceByCategory>,
    seeds: results,
  }

  let totalDeparted = 0
  let totalStayDays = 0

  for (const r of results) {
    combined.totalAccepted += r.acceptedOffers
    combined.totalDeclined += r.declinedOffers
    combined.totalRelationshipEvents += r.relationshipEvents
    combined.totalAffinityChanges += r.affinityChanges
    combined.totalFinancialPressureChanges += r.financialPressureChanges
    combined.totalStayExtensions += r.stayExtensions
    combined.totalStayExtensionDays += r.stayExtensionsTotalDays
    combined.totalScheduledDepartures += r.scheduledDepartures
    combined.totalNewArrivals += r.newArrivals
    combined.finalAffinityAverage += r.finalAffinityAverage
    combined.finalPressureAverage += r.finalPressureAverage
    totalDeparted += r.departedCount
    totalStayDays += r.totalStayDays

    for (const outcome of Object.keys(r.outcomeCounts) as ExpeditionOutcome[]) {
      combined.outcomeCounts[outcome] += r.outcomeCounts[outcome]
    }

    for (const [key, value] of Object.entries(r.acceptanceByRankGap)) {
      const existing = combined.acceptanceByRankGap[key] ?? emptyCategory()
      existing.total += value.total
      existing.accepted += value.accepted
      existing.rate =
        existing.total > 0 ? existing.accepted / existing.total : 0
      combined.acceptanceByRankGap[key] = existing
    }
    for (const [key, value] of Object.entries(r.acceptanceByAffinityTier)) {
      const existing = combined.acceptanceByAffinityTier[key] ?? emptyCategory()
      existing.total += value.total
      existing.accepted += value.accepted
      existing.rate =
        existing.total > 0 ? existing.accepted / existing.total : 0
      combined.acceptanceByAffinityTier[key] = existing
    }
    for (const [key, value] of Object.entries(r.acceptanceByFinancialTier)) {
      const existing =
        combined.acceptanceByFinancialTier[key] ?? emptyCategory()
      existing.total += value.total
      existing.accepted += value.accepted
      existing.rate =
        existing.total > 0 ? existing.accepted / existing.total : 0
      combined.acceptanceByFinancialTier[key] = existing
    }
    for (const [key, value] of Object.entries(r.acceptanceByRiskTolerance)) {
      const existing =
        combined.acceptanceByRiskTolerance[key] ?? emptyCategory()
      existing.total += value.total
      existing.accepted += value.accepted
      existing.rate =
        existing.total > 0 ? existing.accepted / existing.total : 0
      combined.acceptanceByRiskTolerance[key] = existing
    }
  }

  combined.finalAffinityAverage /= SEEDS.length
  combined.finalPressureAverage /= SEEDS.length
  combined.averageStayDays =
    totalDeparted > 0 ? totalStayDays / totalDeparted : 0

  const acceptanceRate =
    combined.totalAccepted + combined.totalDeclined > 0
      ? combined.totalAccepted /
        (combined.totalAccepted + combined.totalDeclined)
      : 0

  const json = {
    ...combined,
    acceptanceRate,
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
  console.log('Acceptance rate:', acceptanceRate.toFixed(3))
  console.log('Affinity changes:', combined.totalAffinityChanges)
  console.log(
    'Financial pressure changes:',
    combined.totalFinancialPressureChanges,
  )
  console.log('Stay extensions:', combined.totalStayExtensions)
  console.log('Scheduled departures:', combined.totalScheduledDepartures)
  console.log('New arrivals:', combined.totalNewArrivals)
  console.log(
    'Average stay (departed parties):',
    combined.averageStayDays.toFixed(2),
  )
  console.log('Outcome counts:', combined.outcomeCounts)
  console.log('Acceptance by rank gap:', combined.acceptanceByRankGap)
  console.log('Acceptance by affinity tier:', combined.acceptanceByAffinityTier)
  console.log(
    'Acceptance by financial tier:',
    combined.acceptanceByFinancialTier,
  )
  console.log(
    'Acceptance by risk tolerance:',
    combined.acceptanceByRiskTolerance,
  )
}

runAudit()
