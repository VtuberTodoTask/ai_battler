import { runExpedition } from '../src/core/expedition/expedition.ts'
import { buildDispatchReport } from '../src/core/tavern/report.ts'
import { buildNarrativePrompt } from '../src/core/narrative/prompt.ts'
import {
  makeEliminationRequest,
  makeEscortRequest,
  makeParty,
  makeRequest,
  makeRescueRequest,
  makeRetrievalRequest,
  makeSurveyRequest,
  battleConfig,
} from '../src/core/expedition/test-utils.ts'
import type { ExpeditionNarrativeContext } from '../src/core/narrative/types.ts'
import type {
  ExpeditionRequest,
  ExpeditionResult,
} from '../src/core/expedition/types.ts'
import type { Adventurer } from '../src/core/models/types.ts'

function buildContext(result: ExpeditionResult): ExpeditionNarrativeContext {
  const report = buildDispatchReport(result.request.id, result)
  return {
    kind: 'expedition',
    party: {
      id: 'party-1',
      name: 'Test Party',
      rank: result.party[0]?.rank ?? 'E',
      leaderId: result.party[0]?.id ?? 'leader',
      leaderName: result.party[0]?.name ?? 'Leader',
      members: result.party.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        rank: a.rank,
        personality: a.personality,
      })),
      missionSpecialization: {
        strongObjective: 'investigation',
        weakObjective: 'elimination',
      },
      affinity: 0,
      financialPressure: 0,
      riskTolerance: 'balanced',
      growthMilestones: 0,
      trainingDays: 0,
      stats: {
        totalExpeditions: 0,
        completeSuccesses: 0,
        successes: 0,
        partialSuccesses: 0,
        failures: 0,
        retreats: 0,
      },
      arrivalDay: 1,
      plannedDepartureDay: 1,
    },
    request: {
      id: result.request.id,
      title: 'Smoke Request',
      briefing: 'Smoke briefing',
      rank: result.request.rank,
      objectiveType: result.request.objectiveType,
      environment: result.request.environment,
      publicTags: [],
    },
    report,
    state: result.state,
  }
}

function findSeed(
  requestBuilder: (seed: string) => ExpeditionRequest,
  predicate: (r: ExpeditionResult) => boolean,
  partyBuilder: (seed: string) => Adventurer[],
  maxTries = 50,
): { result: ExpeditionResult; seed: string } | null {
  for (let i = 0; i < maxTries; i++) {
    const seed = `smoke-${i}`
    const request = requestBuilder(seed)
    const party = partyBuilder(seed)
    const result = runExpedition(request, party)
    if (predicate(result)) {
      return { result, seed }
    }
  }
  return null
}

function printSection(user: string, startMarker: string) {
  const start = user.indexOf(startMarker)
  if (start === -1) return ''
  const end = user.indexOf('\n=== ', start + startMarker.length)
  const section = user.slice(start, end === -1 ? undefined : end)
  return section.trim()
}

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
]

function assertNoLeaks(text: string, label: string) {
  for (const word of LEAKAGE_SUBSTRINGS) {
    if (text.includes(word)) {
      console.error(`Leakage violation in ${label}: ${word}`)
      process.exit(1)
    }
  }
  if (/\d+の(ダメージ|被害|損傷|回復|消費|負傷|傷)/.test(text)) {
    console.error(`Leakage violation in ${label}: raw numeric value`)
    process.exit(1)
  }
  if (/\d+%/.test(text)) {
    console.error(`Leakage violation in ${label}: percentage`)
    process.exit(1)
  }
}

function printScenario(name: string, result: ExpeditionResult) {
  const context = buildContext(result)
  const { user } = buildNarrativePrompt(context)
  console.log(`\n## ${name} — outcome: ${result.outcome}`)
  const timeline = printSection(user, '=== EXPEDITION TIMELINE ===')
  const facts = printSection(user, '=== CONFIRMED OUTCOME FACTS ===')
  if (timeline) {
    console.log(`\n${timeline}`)
    assertNoLeaks(timeline, name)
  }
  if (facts) {
    console.log(`\n${facts}`)
    assertNoLeaks(facts, name)
  }
}

const scenarios = [
  {
    name: 'A. Investigation + Battle + Retreat',
    requestBuilder: (seed: string) => ({
      ...makeRequest(seed, {
        battle: battleConfig({ seed: `${seed}:battle:0` }),
      }),
      difficulty: 'deadly' as const,
    }),
    partyBuilder: (seed: string) =>
      makeParty(['vanguard', 'guardian', 'mage', 'healer'], seed, 'C'),
    predicate: (r: ExpeditionResult) =>
      r.state.battles.length > 0 && r.outcome === 'forcedRetreat',
  },
  {
    name: 'B. Elimination completeSuccess',
    requestBuilder: (seed: string) =>
      makeEliminationRequest(seed, 'C', false, 'standard'),
    partyBuilder: (seed: string) =>
      makeParty(['vanguard', 'guardian', 'mage', 'healer'], seed, 'C'),
    predicate: (r: ExpeditionResult) => r.outcome === 'completeSuccess',
  },
  {
    name: 'C. Survey partial failure',
    requestBuilder: (seed: string) =>
      makeSurveyRequest(seed, 'C', { minimumAcceptableQuality: 100 }),
    partyBuilder: (seed: string) =>
      makeParty(['vanguard', 'guardian', 'mage', 'healer'], seed, 'C'),
    predicate: (r: ExpeditionResult) =>
      r.outcome === 'partialSuccess' || r.outcome === 'failedObjective',
  },
  {
    name: 'D. Rescue success',
    requestBuilder: (seed: string) => makeRescueRequest(seed, 'C'),
    partyBuilder: (seed: string) =>
      makeParty(['vanguard', 'guardian', 'mage', 'healer'], seed, 'C'),
    predicate: (r: ExpeditionResult) =>
      r.outcome === 'success' || r.outcome === 'completeSuccess',
  },
  {
    name: 'E. Expedition with casualty',
    requestBuilder: (seed: string) => ({
      ...makeEliminationRequest(seed, 'C', false, 'standard'),
      difficulty: 'deadly' as const,
    }),
    partyBuilder: (seed: string) =>
      makeParty(['vanguard', 'guardian', 'mage', 'healer'], seed, 'C'),
    predicate: (r: ExpeditionResult) => r.state.casualties.length > 0,
  },
  {
    name: 'F. Escort success',
    requestBuilder: (seed: string) => makeEscortRequest(seed, 'C'),
    partyBuilder: (seed: string) =>
      makeParty(['vanguard', 'guardian', 'mage', 'healer'], seed, 'C'),
    predicate: (r: ExpeditionResult) =>
      r.outcome === 'success' || r.outcome === 'completeSuccess',
  },
  {
    name: 'G. Retrieval success',
    requestBuilder: (seed: string) => makeRetrievalRequest(seed, 'C'),
    partyBuilder: (seed: string) =>
      makeParty(['vanguard', 'guardian', 'mage', 'healer'], seed, 'C'),
    predicate: (r: ExpeditionResult) =>
      r.outcome === 'success' || r.outcome === 'completeSuccess',
  },
]

for (const s of scenarios) {
  const found = findSeed(s.requestBuilder, s.predicate, s.partyBuilder)
  if (found) {
    printScenario(s.name, found.result)
  } else {
    console.log(`\n## ${s.name} — no matching seed found`)
  }
}
