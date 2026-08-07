import { runExpedition } from '../src/core/expedition/expedition.ts'
import {
  makeParty,
  makeSurveyRequest,
} from '../src/core/expedition/regression.ts'
import type { ExpeditionOutcome } from '../src/core/expedition/types.ts'

const partyRoles = ['scout', 'ranger', 'mage', 'support'] as const

function find(
  label: string,
  rank: 'C' | 'S' | 'B' | 'A' | 'D' | 'E',
  predicate: (
    outcome: ExpeditionOutcome,
    state: {
      objectiveState?: {
        sectors: { surveyed: boolean; quality: number }[]
        averageQuality: number
        reportReturned: boolean
      } | null
      casualties: string[]
      elapsedTime: number
    },
  ) => boolean,
  areaOverrides: Parameters<typeof makeSurveyRequest>[2] = {},
  battleEnabled = true,
  maxAttempts = 500,
): { seed: string; outcome: ExpeditionOutcome } | null {
  for (let i = 0; i < maxAttempts; i++) {
    const seed = `s${i}`
    const request = makeSurveyRequest(seed, rank, areaOverrides, battleEnabled)
    const party = makeParty(
      partyRoles as unknown as (
        | 'scout'
        | 'ranger'
        | 'mage'
        | 'support'
        | 'vanguard'
        | 'guardian'
        | 'healer'
      )[],
      seed,
      rank,
    )
    const result = runExpedition(request, party)
    const obj = result.state.objectiveState as {
      sectors: { surveyed: boolean; quality: number }[]
      averageQuality: number
      reportReturned: boolean
    } | null
    if (
      predicate(result.outcome, {
        objectiveState: obj,
        casualties: result.state.casualties,
        elapsedTime: result.state.elapsedTime,
      })
    ) {
      console.log(`Found ${label}: seed=${seed} outcome=${result.outcome}`)
      if (obj) {
        const surveyed = obj.sectors.filter((s) => s.surveyed).length
        console.log(
          `  surveyed=${surveyed}/${obj.sectors.length} avg=${obj.averageQuality.toFixed(2)} reportReturned=${obj.reportReturned}`,
        )
      }
      return { seed, outcome: result.outcome }
    }
  }
  console.log(`NOT FOUND ${label}`)
  return null
}

console.log('Searching completeSuccess...')
find(
  'completeSuccess',
  'S',
  (outcome, { objectiveState: obj, casualties, elapsedTime }) =>
    outcome === 'completeSuccess' &&
    !!obj &&
    obj.sectors.filter((s) => s.surveyed).length === 3 &&
    obj.averageQuality >= 85 &&
    obj.reportReturned &&
    casualties.length === 0 &&
    elapsedTime <= 20,
)

console.log('Searching success...')
find(
  'success',
  'C',
  (outcome, { objectiveState: obj }) =>
    outcome === 'success' &&
    !!obj &&
    obj.sectors.filter((s) => s.surveyed).length === 3 &&
    obj.averageQuality >= 70 &&
    obj.reportReturned,
)

console.log('Searching partialSuccess (full survey, quality < min)...')
find(
  'partialSuccess-quality',
  'C',
  (outcome, { objectiveState: obj }) =>
    outcome === 'partialSuccess' &&
    !!obj &&
    obj.sectors.filter((s) => s.surveyed).length === 3 &&
    obj.reportReturned,
  { minimumAcceptableQuality: 95 },
)

console.log('Searching partialSuccess (2/3 surveyed)...')
find(
  'partialSuccess-2of3',
  'C',
  (outcome, { objectiveState: obj }) =>
    outcome === 'partialSuccess' &&
    !!obj &&
    obj.sectors.filter((s) => s.surveyed).length === 2 &&
    obj.reportReturned,
  {
    sectors: [
      { id: 'north', name: '北区画', focus: 'route', difficulty: 0 },
      { id: 'center', name: '中央区画', focus: 'terrain', difficulty: 0 },
      { id: 'south', name: '南区画', focus: 'arcane', difficulty: 1000 },
    ],
  },
)

console.log('Searching failedObjective...')
find('failedObjective', 'C', (outcome) => outcome === 'failedObjective', {
  sectors: [
    { id: 'north', name: '北区画', focus: 'route', difficulty: 1000 },
    { id: 'center', name: '中央区画', focus: 'terrain', difficulty: 1000 },
    { id: 'south', name: '南区画', focus: 'arcane', difficulty: 1000 },
  ],
})

console.log('Searching forcedRetreat...')
find(
  'forcedRetreat',
  'C',
  (outcome, { objectiveState: obj }) =>
    outcome === 'forcedRetreat' &&
    !!obj &&
    obj.sectors.filter((s) => s.surveyed).length >= 1,
  {
    sectors: [
      { id: 'north', name: '北区画', focus: 'route', difficulty: 0 },
      { id: 'center', name: '中央区画', focus: 'terrain', difficulty: 0 },
      { id: 'south', name: '南区画', focus: 'arcane', difficulty: 0 },
    ],
  },
  true,
  1000,
)
