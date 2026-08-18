import type { AdventurerRank } from '../models/types.ts'
import type { ObjectiveType } from '../expedition/types.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { generatePartyPool } from './partyGenerator.ts'
import { TEMPLATES_BY_OBJECTIVE_TYPE } from './requestTemplates.ts'
import { planRequestRanksForDay } from './campaign/generators.ts'
import type { TavernRank } from './campaign/types.ts'
import type { TavernDayState, TavernRequestOffer } from './types.ts'

const ALL_OBJECTIVE_TYPES: ObjectiveType[] = [
  'investigation',
  'elimination',
  'rescue',
  'escort',
  'retrieval',
  'survey',
]

const DEFAULT_TAVERN_RANK: TavernRank = 1

function generateRequest(
  index: number,
  seed: string,
  objectiveType: ObjectiveType,
  rank: AdventurerRank,
): TavernRequestOffer {
  const selectionRng = new SeededRng(`${seed}:request:${index}:selection`)
  const templates = TEMPLATES_BY_OBJECTIVE_TYPE[objectiveType]
  const template = selectionRng.pick(templates)
  const battleEnabled =
    template.battleChance >= 100 || selectionRng.chance(template.battleChance)

  const requestSeed = `${seed}:request:${index}:expedition`
  const requestId = `tavern-request-${index}-${seed}`

  return template.build({
    requestId,
    seed: requestSeed,
    rank,
    battleEnabled,
  })
}

export function generateTavernDay(seed: string): TavernDayState {
  const parties = generatePartyPool(seed)
  const availablePartyRanks = parties.map((p) => p.party.rank)
  const rankPlan = planRequestRanksForDay(
    seed,
    DEFAULT_TAVERN_RANK,
    availablePartyRanks,
  )

  const objectiveRng = new SeededRng(`${seed}:objectives`)
  const objectiveTypes = objectiveRng
    .shuffle([...ALL_OBJECTIVE_TYPES])
    .slice(0, 3)

  const rankList = [rankPlan.serviceableA, rankPlan.serviceableB, rankPlan.open]

  const requests: TavernRequestOffer[] = []
  for (let i = 0; i < 3; i++) {
    const offer = generateRequest(i, seed, objectiveTypes[i], rankList[i])
    requests.push(offer)
  }

  return {
    id: `tavern-day-${seed}`,
    seed,
    requests,
    parties,
    offers: [],
    matches: [],
    status: 'planning',
    results: [],
  }
}
