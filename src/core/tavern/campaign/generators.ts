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
import { createInitialRelationship } from './relationship.ts'
import { createInitialLifecycleState } from './lifecycle.ts'
import type { CampaignParty, TavernRank } from './types.ts'
import { initializePartyMemberRelationships } from '../../narrative/characterRelationships.ts'

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

export const RANKS: AdventurerRank[] = ['E', 'D', 'C', 'B', 'A', 'S']

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
  tavernRank: TavernRank,
  arrivalDay: number,
): CampaignParty {
  const seed = `${campaignSeed}:arrival:${serial}`
  const templateRng = new SeededRng(`${seed}:template`)
  const rankWeights = getPartyRankWeights(tavernRank)
  const rankRng = new SeededRng(`${seed}:rank`)
  const stayRng = new SeededRng(`${seed}:stay`)

  const template = templateRng.pick(PARTY_TEMPLATES)
  const rank = rankRng.weightedPick(
    RANKS,
    RANKS.map((r) => rankWeights[r]),
  )
  const stayLength = stayRng.integer(3, 6)

  const party = generateAdventurerParty(seed, 0, '', rank, template.id)
  const leader = party.members.find((m) => m.id === party.leaderId)

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
    progression: {
      growthXp: 0,
      totalGrowthXp: 0,
      growthMilestones: 0,
      trainingDays: 0,
    },
    relationship: createInitialRelationship(campaignSeed, serial, leader),
    memberRelationships: initializePartyMemberRelationships(party.members),
    lifecycle: createInitialLifecycleState(arrivalDay),
  }
}

export function generateInitialCampaignParties(
  campaignSeed: string,
  tavernRank: TavernRank,
  startSerial: number,
): { parties: CampaignParty[]; nextSerial: number } {
  const parties: CampaignParty[] = []
  const usedNames = new Set<string>()
  let serial = startSerial

  for (let i = 0; i < 4; i++) {
    const party = generateCampaignParty(campaignSeed, serial, tavernRank, 1)
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

export interface RequestRankPlan {
  serviceableA: AdventurerRank
  serviceableB: AdventurerRank
  open: AdventurerRank
  /** Extra "open"-style aspirational slots beyond the base 3, one per quest_board level. */
  extra: AdventurerRank[]
}

export function rankIndex(rank: AdventurerRank): number {
  return RANKS.indexOf(rank)
}

function pickRequestRank(
  rankRng: SeededRng,
  allowedMaxIndex: number,
  tavernRank: TavernRank,
  fallbackRank: AdventurerRank,
): AdventurerRank {
  const weights = getRequestRankWeights(tavernRank)
  const allowedRanks = RANKS.slice(0, allowedMaxIndex + 1)
  const allowedWeights = allowedRanks.map((r) => weights[r])
  const total = allowedWeights.reduce((a, b) => a + b, 0)
  if (total === 0) {
    return fallbackRank
  }
  return rankRng.weightedPick(allowedRanks, allowedWeights)
}

export function planRequestRanksForDay(
  daySeed: string,
  tavernRank: TavernRank,
  availablePartyRanks: AdventurerRank[],
  extraCount = 0,
): RequestRankPlan {
  const rankRng = new SeededRng(`${daySeed}:request-ranks`)

  if (availablePartyRanks.length === 0) {
    const weights = getRequestRankWeights(tavernRank)
    const rankList = RANKS.map((r) => weights[r])
    const total = rankList.reduce((a, b) => a + b, 0)
    const pick = (): AdventurerRank => {
      if (total === 0) return 'E'
      return rankRng.weightedPick(RANKS, rankList)
    }
    return {
      serviceableA: pick(),
      serviceableB: pick(),
      open: pick(),
      extra: Array.from({ length: extraCount }, pick),
    }
  }

  const sortedRanks = [...availablePartyRanks].sort(
    (a, b) => rankIndex(a) - rankIndex(b),
  )
  const shuffled = rankRng.shuffle(sortedRanks)
  const anchorA = shuffled[0]
  const anchorB = shuffled[1] ?? anchorA
  const highestIndex = Math.max(...sortedRanks.map(rankIndex))
  const highestAvailableRank = RANKS[highestIndex] ?? 'S'

  const openMaxIndex = Math.min(highestIndex + 1, RANKS.length - 1)
  const pickOpenLike = (): AdventurerRank =>
    pickRequestRank(rankRng, openMaxIndex, tavernRank, highestAvailableRank)

  return {
    serviceableA: pickRequestRank(
      rankRng,
      rankIndex(anchorA),
      tavernRank,
      anchorA,
    ),
    serviceableB: pickRequestRank(
      rankRng,
      rankIndex(anchorB),
      tavernRank,
      anchorB,
    ),
    open: pickOpenLike(),
    extra: Array.from({ length: extraCount }, pickOpenLike),
  }
}

function generateRequestForCampaign(
  index: number,
  daySeed: string,
  objectiveType: ObjectiveType,
  rank: AdventurerRank,
): TavernRequestOffer {
  const selectionRng = new SeededRng(`${daySeed}:request:${index}:selection`)
  const templates = TEMPLATES_BY_OBJECTIVE_TYPE[objectiveType]
  const template = selectionRng.pick(templates)

  const battleEnabled =
    template.battleChance >= 100 || selectionRng.chance(template.battleChance)

  const requestSeed = `${daySeed}:request:${index}:expedition`
  const requestId = `tavern-request-${index}-${daySeed}`

  const offer = template.build({
    requestId,
    seed: requestSeed,
    rank,
    battleEnabled,
  })
  return offer
}

const BASE_REQUEST_COUNT = 3

export function generateTavernRequestsForDay(
  daySeed: string,
  tavernRank: TavernRank,
  availablePartyRanks: AdventurerRank[],
  requestCount: number = BASE_REQUEST_COUNT,
): TavernRequestOffer[] {
  const extraCount = Math.max(0, requestCount - BASE_REQUEST_COUNT)
  const plan = planRequestRanksForDay(
    daySeed,
    tavernRank,
    availablePartyRanks,
    extraCount,
  )
  const objectiveRng = new SeededRng(`${daySeed}:objectives`)
  const objectiveTypes = objectiveRng
    .shuffle([...ALL_OBJECTIVE_TYPES])
    .slice(0, requestCount)

  const rankPlan = [
    plan.serviceableA,
    plan.serviceableB,
    plan.open,
    ...plan.extra,
  ]

  const requests: TavernRequestOffer[] = []
  for (let i = 0; i < requestCount; i++) {
    const offer = generateRequestForCampaign(
      i,
      daySeed,
      objectiveTypes[i],
      rankPlan[i],
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
      arrivalBadge:
        cp.arrivalDay === dayNumber
          ? cp.lifecycle.visitCount === 1
            ? '新規'
            : '再訪'
          : undefined,
      progression: {
        growthXp: cp.progression.growthXp,
        totalGrowthXp: cp.progression.totalGrowthXp,
        growthMilestones: cp.progression.growthMilestones,
        trainingDays: cp.progression.trainingDays,
      },
      stats: { ...cp.stats },
      relationship: {
        affinity: cp.relationship.affinity,
        financialPressure: cp.relationship.financialPressure,
        riskTolerance: cp.relationship.riskTolerance,
        stayExtensionDaysUsed: cp.relationship.stayExtensionDaysUsed,
      },
      characterMemories: cp.characterMemories
        ? deepClone(cp.characterMemories)
        : undefined,
      memberRelationships: cp.memberRelationships
        ? deepClone(cp.memberRelationships)
        : undefined,
      arcSignals: cp.arcSignals ? deepClone(cp.arcSignals) : undefined,
      relationshipMilestones: cp.relationshipMilestones
        ? deepClone(cp.relationshipMilestones)
        : undefined,
      downtimeEvents: cp.downtimeEvents
        ? deepClone(cp.downtimeEvents).filter((e) => e.day === dayNumber)
        : undefined,
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
