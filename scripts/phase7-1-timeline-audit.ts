import {
  createTavernCampaign,
  resolveCampaignDay,
  advanceCampaignDay,
} from '../src/core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../src/core/tavern/brokerage.ts'
import { buildNarrativePrompt } from '../src/core/narrative/prompt.ts'
import { buildExpeditionNarrativeTimeline } from '../src/core/narrative/timeline.ts'
import type { TavernCampaignState } from '../src/core/tavern/campaign/types.ts'
import type { ExpeditionNarrativeContext } from '../src/core/narrative/types.ts'

const seeds = [
  'phase7-1-timeline-1',
  'phase7-1-timeline-2',
  'phase7-1-timeline-3',
]

let totalCandidates = 0
let totalTimelineBeats = 0
let maxTimelineBeats = 0
let totalPromptChars = 0
let maxPromptChars = 0
let totalBattleSourceEvents = 0
let totalBattleBeats = 0
let battleRecordCount = 0

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
      const context = c.context as ExpeditionNarrativeContext
      if (!context.state) continue
      totalCandidates++

      const timeline = buildExpeditionNarrativeTimeline(context)
      totalTimelineBeats += timeline.length
      maxTimelineBeats = Math.max(maxTimelineBeats, timeline.length)

      const prompt = buildNarrativePrompt(context)
      const promptText = `${prompt.system}\n\n${prompt.user}`
      totalPromptChars += promptText.length
      maxPromptChars = Math.max(maxPromptChars, promptText.length)

      for (const battle of context.state.battles) {
        battleRecordCount++
        totalBattleSourceEvents += battle.result.logs.length
        const battleBeats = timeline.filter((b) => b.phase === 'battle').length
        totalBattleBeats += battleBeats
      }
    }
  }
}

const avgTimelineBeats = totalCandidates
  ? Math.round(totalTimelineBeats / totalCandidates)
  : 0
const avgPromptChars = totalCandidates
  ? Math.round(totalPromptChars / totalCandidates)
  : 0
const avgBattleSourceEvents = battleRecordCount
  ? Math.round(totalBattleSourceEvents / battleRecordCount)
  : 0
const avgBattleBeats = battleRecordCount
  ? Math.round(totalBattleBeats / battleRecordCount)
  : 0
const compressionRatio =
  totalBattleSourceEvents > 0
    ? (totalBattleBeats / totalBattleSourceEvents).toFixed(4)
    : '0.0000'

console.log('Phase 7.1 Timeline audit')
console.log(`  Candidate count:               ${totalCandidates}`)
console.log(`  Average timeline beat count:     ${avgTimelineBeats}`)
console.log(`  Max timeline beat count:       ${maxTimelineBeats}`)
console.log(`  Average prompt chars:            ${avgPromptChars}`)
console.log(`  Max prompt chars:                ${maxPromptChars}`)
console.log(`  Average battle source events:    ${avgBattleSourceEvents}`)
console.log(`  Average battle narrative beats:  ${avgBattleBeats}`)
console.log(`  Compression ratio:               ${compressionRatio}`)
