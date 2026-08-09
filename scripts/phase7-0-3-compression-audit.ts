import {
  createTavernCampaign,
  resolveCampaignDay,
  advanceCampaignDay,
} from '../src/core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../src/core/tavern/brokerage.ts'
import { buildNarrativePrompt } from '../src/core/narrative/prompt.ts'
import type { TavernCampaignState } from '../src/core/tavern/campaign/types.ts'

const seeds = [
  'phase7-0-3-compression-1',
  'phase7-0-3-compression-2',
  'phase7-0-3-compression-3',
]

let totalCandidates = 0
let totalPromptChars = 0
let totalContextChars = 0
let totalEstimatedTokens = 0

function estimateTokens(text: string): number {
  // Rough Japanese/English mixed estimate: ~1.5 tokens per character for CJK.
  return Math.ceil(text.length * 1.5)
}

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
          return { next }
        }
      } catch {
        // skip unavailable parties
      }
    }
  }
  return null
}

for (const seed of seeds) {
  for (let i = 0; i < 10; i++) {
    let campaign = createTavernCampaign(`${seed}-${i}`)
    const pair = findAcceptingPair(campaign)
    if (pair) {
      campaign = { ...campaign, currentDay: pair.next }
    }
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign)

    for (const c of campaign.narrativeCandidates) {
      if (c.category !== 'expedition') continue
      totalCandidates++
      const prompt = buildNarrativePrompt(c.context)
      const promptText = `${prompt.system}\n\n${prompt.user}`
      totalPromptChars += promptText.length
      totalEstimatedTokens += estimateTokens(promptText)
      const contextJson = JSON.stringify(c.context, null, 2)
      totalContextChars += contextJson.length
    }
  }
}

console.log('Prompt compression audit')
console.log(`  Expedition candidates: ${totalCandidates}`)
console.log(
  `  Avg prompt characters: ${totalCandidates ? Math.round(totalPromptChars / totalCandidates) : 0}`,
)
console.log(
  `  Avg estimated tokens:  ${totalCandidates ? Math.round(totalEstimatedTokens / totalCandidates) : 0}`,
)
console.log(
  `  Avg raw context chars:   ${totalCandidates ? Math.round(totalContextChars / totalCandidates) : 0}`,
)
console.log(`  Total prompt chars:      ${totalPromptChars}`)
console.log(`  Total estimated tokens:  ${totalEstimatedTokens}`)
console.log(`  Total raw context chars: ${totalContextChars}`)
