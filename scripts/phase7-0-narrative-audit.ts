import {
  createTavernCampaign,
  resolveCampaignDay,
  advanceCampaignDay,
} from '../src/core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../src/core/tavern/brokerage.ts'
import { FakeNarrativeProvider } from '../src/ai/narrative/fakeProvider.ts'
import { generateNarrative } from '../src/core/narrative/generation.ts'
import { buildNarrativePrompt } from '../src/core/narrative/prompt.ts'
import type { TavernCampaignState } from '../src/core/tavern/campaign/types.ts'

function findAcceptingPair(campaign: TavernCampaignState) {
  for (const request of campaign.currentDay.requests) {
    for (const party of campaign.currentDay.parties) {
      try {
        const next = offerRequestToParty(
          campaign.currentDay,
          request.id,
          party.id,
        )
        if (next.matches.some((m) => m.requestId === request.id)) {
          return { requestId: request.id, partyId: party.id, next }
        }
      } catch {
        // skip unavailable parties
      }
    }
  }
  return null
}

async function main() {
  const provider = new FakeNarrativeProvider()
  let campaign = createTavernCampaign('phase7-0-audit')

  for (let i = 0; i < 30; i++) {
    const pair = findAcceptingPair(campaign)
    if (pair) {
      campaign = { ...campaign, currentDay: pair.next }
    }
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign)
  }

  console.log('30-day zero-call audit')
  console.log(`  Candidates: ${campaign.narrativeCandidates.length}`)
  console.log(`  AI calls: ${provider.callCount}`)
  console.log(`  Generations: ${campaign.narrativeGenerations.length}`)

  const available = campaign.narrativeCandidates.filter(
    (c) => c.state === 'available',
  )
  const toGenerate = available.slice(0, 3)

  for (const candidate of toGenerate) {
    const { candidate: updated, record } = await generateNarrative(
      candidate,
      provider,
    )
    campaign = {
      ...campaign,
      narrativeCandidates: campaign.narrativeCandidates.map((c) =>
        c.id === updated.id ? updated : c,
      ),
      narrativeGenerations: [...campaign.narrativeGenerations, record],
    }
  }

  console.log('After manual 3-call generation')
  console.log(`  AI calls: ${provider.callCount}`)
  console.log(`  Generations: ${campaign.narrativeGenerations.length}`)

  const farewell = campaign.narrativeCandidates.find(
    (c) => c.eventType === 'farewell',
  )
  if (farewell) {
    console.log('\nFarewell prompt example:')
    console.log(`Candidate: ${farewell.title}`)
    const { system, user } = buildNarrativePrompt(farewell.context)
    console.log(system)
    console.log(user)
  } else {
    const farewellCampaign = createTavernCampaign('phase7-0-farewell-prompt')
    const farewellParty = farewellCampaign.parties[0]
    farewellParty.arrivalDay = 1
    farewellParty.plannedDepartureDay = 1
    farewellParty.relationship.affinity = 60
    farewellParty.relationship.stayExtensionDaysUsed = 100
    const advanced = advanceCampaignDay({
      ...farewellCampaign,
      currentDay: { ...farewellCampaign.currentDay, status: 'resolved' },
    })
    const manualFarewell = advanced.narrativeCandidates.find(
      (c) => c.eventType === 'farewell',
    )
    if (manualFarewell) {
      console.log('\nFarewell prompt example (manual fixture):')
      console.log(`Candidate: ${manualFarewell.title}`)
      const { system, user } = buildNarrativePrompt(manualFarewell.context)
      console.log(system)
      console.log(user)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
