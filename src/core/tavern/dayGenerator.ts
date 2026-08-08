import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import type { AdventurerRank, AdventurerRole } from '../models/types.ts'
import { SeededRng } from '../rng/seededRng.ts'
import type { ObjectiveType } from '../expedition/types.ts'
import type {
  TavernAdventurer,
  TavernDayState,
  TavernRequestOffer,
} from './types.ts'
import { TEMPLATES_BY_OBJECTIVE_TYPE } from './requestTemplates.ts'

const ALL_OBJECTIVE_TYPES: ObjectiveType[] = [
  'investigation',
  'elimination',
  'rescue',
  'escort',
  'retrieval',
  'survey',
]

const ALL_ROLES: AdventurerRole[] = [
  'vanguard',
  'guardian',
  'scout',
  'ranger',
  'mage',
  'healer',
  'support',
]

const RANKS: AdventurerRank[] = ['E', 'D', 'C', 'B']
const RANK_WEIGHTS = [20, 35, 35, 10]

function generateRequest(
  index: number,
  seed: string,
  objectiveType: ObjectiveType,
): TavernRequestOffer {
  const selectionRng = new SeededRng(`${seed}:request:${index}:selection`)
  const templates = TEMPLATES_BY_OBJECTIVE_TYPE[objectiveType]
  const template = selectionRng.pick(templates)
  const rank = selectionRng.weightedPick(RANKS, RANK_WEIGHTS)
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

function generateAdventurerPool(seed: string): TavernAdventurer[] {
  const roleRng = new SeededRng(`${seed}:adventurer-roles`)
  const rankRng = new SeededRng(`${seed}:adventurer-ranks`)

  const baseRoles = roleRng.shuffle([...ALL_ROLES])
  const roles: AdventurerRole[] = [...baseRoles, roleRng.pick(ALL_ROLES)]

  return Array.from({ length: 8 }, (_, slot) => {
    const rank = rankRng.weightedPick(RANKS, RANK_WEIGHTS)
    const role = roles[slot]
    const adventurerSeed = `${seed}:adventurer:${slot}`
    const adventurer = generateAdventurer({ seed: adventurerSeed, rank, role })
    return {
      id: adventurer.id,
      adventurer,
    }
  })
}

export function generateTavernDay(seed: string): TavernDayState {
  const objectiveRng = new SeededRng(`${seed}:objectives`)
  const objectiveTypes = objectiveRng
    .shuffle([...ALL_OBJECTIVE_TYPES])
    .slice(0, 3)

  const requests: TavernRequestOffer[] = []
  for (let i = 0; i < 3; i++) {
    const offer = generateRequest(i, seed, objectiveTypes[i])
    requests.push(offer)
  }

  const adventurers = generateAdventurerPool(seed)

  return {
    id: `tavern-day-${seed}`,
    seed,
    requests,
    adventurers,
    assignments: [],
    status: 'planning',
    results: [],
  }
}
