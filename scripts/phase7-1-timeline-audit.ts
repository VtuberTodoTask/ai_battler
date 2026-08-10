import {
  createTavernCampaign,
  resolveCampaignDay,
  advanceCampaignDay,
} from '../src/core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../src/core/tavern/brokerage.ts'
import { buildNarrativePrompt } from '../src/core/narrative/prompt.ts'
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
let leakageViolations = 0

const LEAKAGE_SUBSTRINGS = [
  'criticalSuccess',
  'partialSuccess',
  'failure',
  'success',
  'HP',
  'MP',
  'Morale',
  'averageQuality',
  'coveragePercent',
  'reportReturned',
  'elapsedTime',
  'medicine',
  'tools',
  'food',
  'progress:',
  'quality:',
  'roll:',
  'difficulty:',
  'seed:',
]

const LEAKAGE_PATTERNS = [
  /\d+の(ダメージ|被害|損傷|回復|消費|負傷|傷)/,
  /\d+%/,
  /\d+(HP|MP| morale)/i,
  /roll[ =:]*\d+/i,
  /difficulty[ =:]*\d+/i,
]

function hasLeakage(text: string): boolean {
  for (const word of LEAKAGE_SUBSTRINGS) {
    if (text.includes(word)) return true
  }
  for (const pattern of LEAKAGE_PATTERNS) {
    if (pattern.test(text)) return true
  }
  return false
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
      const context = c.context as ExpeditionNarrativeContext
      if (!context.timeline) continue
      totalCandidates++

      const timeline = context.timeline
      totalTimelineBeats += timeline.length
      maxTimelineBeats = Math.max(maxTimelineBeats, timeline.length)

      const prompt = buildNarrativePrompt(context)
      const promptText = `${prompt.system}\n\n${prompt.user}`
      totalPromptChars += promptText.length
      maxPromptChars = Math.max(maxPromptChars, promptText.length)

      const timelineText = timeline.map((b) => b.text).join('\n')
      const userBody = prompt.user.split('=== WRITING INSTRUCTIONS ===')[0]
      if (hasLeakage(timelineText) || hasLeakage(userBody)) {
        leakageViolations++
        console.error(`Leakage violation in candidate ${totalCandidates}:`)
        console.error(timelineText.slice(0, 500))
        console.error('---')
        console.error(userBody.slice(0, 500))
        process.exit(1)
      }

      if (context.battleMetrics) {
        for (const metric of context.battleMetrics) {
          battleRecordCount++
          totalBattleSourceEvents += metric.sourceEvents
          totalBattleBeats += metric.beats
        }
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
console.log(`  Leakage violations:              ${leakageViolations}`)
if (leakageViolations > 0) {
  process.exit(1)
}
