import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../src/core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../src/core/tavern/brokerage.ts'
import {
  getReputationTier,
  getReputationTierLabel,
} from '../src/core/tavern/campaign/reputation.ts'

function findAcceptingOffer(campaign: ReturnType<typeof createTavernCampaign>) {
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
          return next
        }
      } catch {
        // ignore
      }
    }
  }
  return null
}

function runCampaign(seed: string, days: number) {
  let campaign = createTavernCampaign(seed)
  for (let day = 1; day <= days; day++) {
    const offer = findAcceptingOffer(campaign)
    if (offer) {
      campaign = { ...campaign, currentDay: offer }
    }
    campaign = resolveCampaignDay(campaign)
    if (day < days) {
      campaign = advanceCampaignDay(campaign)
    }
  }
  return campaign
}

const CAMPAIGNS = 20
const DAYS = 20

let totalReputationDelta = 0
let totalAccepted = 0
let totalRecoveryStarts = 0
let totalDeparturesCasualty = 0

for (let i = 0; i < CAMPAIGNS; i++) {
  const seed = `campaign-obs-${String(i).padStart(3, '0')}`
  const campaign = runCampaign(seed, DAYS)
  totalReputationDelta += campaign.reputation - 10
  totalAccepted += campaign.history.reduce(
    (sum, h) =>
      sum +
      h.results.filter(
        (r) => r.status === 'resolved' && r.report?.outcome !== undefined,
      ).length,
    0,
  )
  totalRecoveryStarts += campaign.history.reduce(
    (sum, h) =>
      sum + h.partyEvents.filter((e) => e.type === 'startedRecovery').length,
    0,
  )
  totalDeparturesCasualty += campaign.history.reduce(
    (sum, h) =>
      sum + h.partyEvents.filter((e) => e.type === 'departedCasualty').length,
    0,
  )
}

console.log(`Observed ${CAMPAIGNS} campaigns for ${DAYS} days each`)
console.log(
  `Average final reputation delta: ${(totalReputationDelta / CAMPAIGNS).toFixed(2)}`,
)
console.log(
  `Average accepted expeditions per campaign: ${(totalAccepted / CAMPAIGNS).toFixed(2)}`,
)
console.log(
  `Average recovery starts per campaign: ${(totalRecoveryStarts / CAMPAIGNS).toFixed(2)}`,
)
console.log(
  `Average casualty departures per campaign: ${(totalDeparturesCasualty / CAMPAIGNS).toFixed(2)}`,
)

const sample = runCampaign('campaign-report-sample', 7)
console.log('\n=== 7-day sample: campaign-report-sample ===')
for (const record of sample.history) {
  const tier = getReputationTierLabel(getReputationTier(record.reputationAfter))
  console.log(
    `Day ${record.dayNumber}: rep ${record.reputationBefore} -> ${record.reputationAfter} (${tier})`,
  )
  for (const r of record.results) {
    const outcome =
      r.status === 'resolved' && r.report
        ? `${r.report.outcome}`
        : 'notBrokered'
    const party = r.partyName ? ` — ${r.partyName}` : ''
    console.log(`  ${r.request.title}: ${outcome}${party}`)
  }
  for (const e of record.partyEvents) {
    console.log(`  event: ${e.type} — ${e.partyName}`)
  }
}
