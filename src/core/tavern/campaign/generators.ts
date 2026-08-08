import { SeededRng } from '../../rng/seededRng.ts'
import { deepClone } from '../../util.ts'
import type { AdventurerRank } from '../../models/types.ts'
import type { ObjectiveType } from '../../expedition/types.ts'
import { generateAdventurerParty } from '../partyGenerator.ts'
import { PARTY_TEMPLATES } from '../partyTemplates.ts'
import { TEMPLATES_BY_OBJECTIVE_TYPE } from '../requestTemplates.ts'
import type {
  CampaignPartyEvent,
  TavernDayState,
  TavernParty,
  TavernRequestOffer,
} from '../types.ts'
import { getPartyRankWeights, getRequestRankWeights } from './rankWeights.ts'
import type { CampaignParty } from './types.ts'

const PARTY_NAMES = [
  '灰狼の牙',
  '銀灯',
  '赤鴉団',
  '星読み',
  '鉄靴団',
  '蒼穹の槍',
  '白銀の盾',
  '翠葉の風',
  '黒曜の斧',
  '静寂の矢',
  '鋼の絆',
  '夜明の鈴',
  '炎獅子団',
  '流水の滴',
  '風鳴り',
  '雷鳴の足跡',
  '森影',
  '砂塵の露',
  '月灯',
  '石楠の棘',
  '虹橋',
  '鉄梟',
  '玻璃の鏡',
  '山猫の爪',
]

const ALL_OBJECTIVE_TYPES: ObjectiveType[] = [
  'investigation',
  'elimination',
  'rescue',
  'escort',
  'retrieval',
  'survey',
]

const RANKS: AdventurerRank[] = ['E', 'D', 'C', 'B', 'A', 'S']

export function pickUniquePartyName(
  seed: string,
  usedNames: Set<string>,
): string {
  const rng = new SeededRng(`${seed}:name`)
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = rng.pick(PARTY_NAMES)
    if (!usedNames.has(candidate)) {
      return candidate
    }
  }
  const fallback = `${rng.pick(PARTY_NAMES)}-${seed.slice(-4)}`
  return fallback
}

export function generateCampaignParty(
  campaignSeed: string,
  serial: number,
  reputation: number,
  arrivalDay: number,
): CampaignParty {
  const seed = `${campaignSeed}:arrival:${serial}`
  const templateRng = new SeededRng(`${seed}:template`)
  const rankWeights = getPartyRankWeights(reputation)
  const rankRng = new SeededRng(`${seed}:rank`)
  const stayRng = new SeededRng(`${seed}:stay`)

  const template = templateRng.pick(PARTY_TEMPLATES)
  const rank = rankRng.weightedPick(
    RANKS,
    RANKS.map((r) => rankWeights[r]),
  )
  const stayLength = stayRng.integer(3, 6)

  const party = generateAdventurerParty(seed, 0, '', rank, template.id)

  return {
    id: party.id,
    party,
    arrivalSerial: serial,
    arrivalDay,
    plannedDepartureDay: arrivalDay + stayLength - 1,
    condition: {
      incapacitatedIds: [],
      injuries: [],
    },
    stats: {
      totalExpeditions: 0,
      completeSuccesses: 0,
      successes: 0,
      partialSuccesses: 0,
      failures: 0,
      retreats: 0,
    },
  }
}

export function generateInitialCampaignParties(
  campaignSeed: string,
  reputation: number,
  startSerial: number,
): { parties: CampaignParty[]; nextSerial: number } {
  const parties: CampaignParty[] = []
  const usedNames = new Set<string>()
  let serial = startSerial

  for (let i = 0; i < 4; i++) {
    const party = generateCampaignParty(campaignSeed, serial, reputation, 1)
    const name = pickUniquePartyName(
      `${campaignSeed}:arrival:${serial}`,
      usedNames,
    )
    party.party.name = name
    usedNames.add(name)
    parties.push(party)
    serial++
  }

  return { parties, nextSerial: serial }
}

function generateRequestForCampaign(
  index: number,
  daySeed: string,
  objectiveType: ObjectiveType,
  reputation: number,
): TavernRequestOffer {
  const selectionRng = new SeededRng(`${daySeed}:request:${index}:selection`)
  const templates = TEMPLATES_BY_OBJECTIVE_TYPE[objectiveType]
  const template = selectionRng.pick(templates)

  const rankWeights = getRequestRankWeights(reputation)
  const rankRng = new SeededRng(`${daySeed}:request:${index}:rank`)
  const rank = rankRng.weightedPick(
    RANKS,
    RANKS.map((r) => rankWeights[r]),
  )

  const battleEnabled =
    template.battleChance >= 100 || selectionRng.chance(template.battleChance)

  const requestSeed = `${daySeed}:request:${index}:expedition`
  const requestId = `tavern-request-${index}-${daySeed}`

  return template.build({
    requestId,
    seed: requestSeed,
    rank,
    battleEnabled,
  })
}

export function generateTavernRequestsForDay(
  daySeed: string,
  reputation: number,
): TavernRequestOffer[] {
  const objectiveRng = new SeededRng(`${daySeed}:objectives`)
  const objectiveTypes = objectiveRng
    .shuffle([...ALL_OBJECTIVE_TYPES])
    .slice(0, 3)

  const requests: TavernRequestOffer[] = []
  for (let i = 0; i < 3; i++) {
    const offer = generateRequestForCampaign(
      i,
      daySeed,
      objectiveTypes[i],
      reputation,
    )
    requests.push(offer)
  }
  return requests
}

export function buildTavernDay(
  seed: string,
  requests: TavernRequestOffer[],
  campaignParties: CampaignParty[],
  dayNumber: number,
): TavernDayState {
  const parties: TavernParty[] = campaignParties.map((cp) => {
    const isRecovering =
      cp.recoveringThroughDay !== undefined &&
      dayNumber <= cp.recoveringThroughDay

    const clonedParty = deepClone(cp.party)

    return {
      id: cp.id,
      party: clonedParty,
      acceptedRequestId: undefined,
      availability: isRecovering ? 'recovering' : 'available',
      recoveryDaysRemaining: isRecovering
        ? cp.recoveringThroughDay! - dayNumber + 1
        : undefined,
      arrivalDay: cp.arrivalDay,
      plannedDepartureDay: cp.plannedDepartureDay,
      isNew: cp.arrivalDay === dayNumber,
    }
  })

  const partyEvents: CampaignPartyEvent[] = campaignParties
    .filter((cp) => cp.arrivalDay === dayNumber)
    .map((cp) => ({
      type: 'arrived',
      partyId: cp.id,
      partyName: cp.party.name,
      dayNumber,
    }))

  return {
    id: `tavern-day-${seed}`,
    seed,
    requests,
    parties,
    offers: [],
    matches: [],
    status: 'planning',
    results: [],
    partyEvents,
  }
}
