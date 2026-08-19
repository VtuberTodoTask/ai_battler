import { SeededRng } from '../../rng/seededRng.ts'
import type { AdventurerRank } from '../../models/types.ts'
import type {
  ExpeditionOutcome,
  ObjectiveType,
} from '../../expedition/types.ts'
import type { ResolvedDispatch, TavernRequestOffer } from '../types.ts'
import {
  RANKS,
  buildRequestOfferForObjective,
  rankIndex,
} from './generators.ts'
import { getMaxQuestRank } from './reputation.ts'
import type {
  QuestChainDefinitionId,
  QuestChainEvent,
  QuestChainState,
  QuestChainStepState,
  TavernRank,
} from './types.ts'

/**
 * Phase 9.6 Quest Chain config — single source of truth for every tunable.
 */
export const QUEST_CHAIN_CONFIG = {
  startChanceBps: 4000,
  maxActiveChains: 2,
  maxChainRequestsPerDay: 2,
  totalSteps: 3,
} as const

export interface QuestChainDefinition {
  id: QuestChainDefinitionId
  title: string
  objectives: readonly [ObjectiveType, ObjectiveType, ObjectiveType]
}

export const QUEST_CHAIN_DEFINITIONS: readonly QuestChainDefinition[] = [
  {
    id: 'chain-a',
    title: '痕跡の先へ',
    objectives: ['investigation', 'elimination', 'retrieval'],
  },
  {
    id: 'chain-b',
    title: '踏査の先へ',
    objectives: ['survey', 'investigation', 'elimination'],
  },
  {
    id: 'chain-c',
    title: '救出のその後',
    objectives: ['rescue', 'escort', 'investigation'],
  },
  {
    id: 'chain-d',
    title: '回収品の行方',
    objectives: ['retrieval', 'investigation', 'escort'],
  },
] as const

export function getQuestChainDefinition(
  id: QuestChainDefinitionId,
): QuestChainDefinition | undefined {
  return QUEST_CHAIN_DEFINITIONS.find((d) => d.id === id)
}

/**
 * Chain Start eligibility is a one-to-one map from a standalone quest's
 * objective to the chain it originates — never a random choice among
 * several matching definitions (there is exactly one per objective).
 */
export function findChainDefinitionByStep1Objective(
  objectiveType: ObjectiveType,
): QuestChainDefinition | undefined {
  return QUEST_CHAIN_DEFINITIONS.find((d) => d.objectives[0] === objectiveType)
}

const CHAIN_ADVANCING_OUTCOMES: readonly ExpeditionOutcome[] = [
  'completeSuccess',
  'success',
  'partialSuccess',
]

const CHAIN_START_OUTCOMES: readonly ExpeditionOutcome[] = [
  'completeSuccess',
  'success',
]

export function buildQuestChainId(
  originDay: number,
  originRequestId: string,
): string {
  return `quest-chain:${originDay}:${originRequestId}`
}

export function buildChainRequestId(
  chainId: string,
  stepNumber: 2 | 3,
): string {
  return `quest-chain-request:${chainId}:${stepNumber}`
}

function tierUpRank(rank: AdventurerRank): AdventurerRank {
  const idx = Math.min(rankIndex(rank) + 1, RANKS.length - 1)
  return RANKS[idx]
}

function clampToRankCeiling(
  rank: AdventurerRank,
  ceiling: AdventurerRank,
): AdventurerRank {
  return rankIndex(rank) <= rankIndex(ceiling) ? rank : ceiling
}

/** Pure rank plan for a chain step — Step 1/2 use the origin rank, Step 3
 * tiers up by one, all clamped to the chain's frozen rank ceiling. */
export function planQuestChainStepRank(
  originRank: AdventurerRank,
  stepNumber: 1 | 2 | 3,
  rankCeiling: AdventurerRank,
): AdventurerRank {
  if (stepNumber === 3) {
    return clampToRankCeiling(tierUpRank(originRank), rankCeiling)
  }
  return clampToRankCeiling(originRank, rankCeiling)
}

function questChainStartSeed(
  campaignSeed: string,
  dayNumber: number,
  requestId: string,
): string {
  return `quest-chain-start:${campaignSeed}:${dayNumber}:${requestId}`
}

function rollChainStart(
  campaignSeed: string,
  dayNumber: number,
  requestId: string,
): boolean {
  const rng = new SeededRng(
    questChainStartSeed(campaignSeed, dayNumber, requestId),
  )
  return rng.chance(QUEST_CHAIN_CONFIG.startChanceBps / 100)
}

function buildChainStepRequest(
  chainId: string,
  stepNumber: 2 | 3,
  objectiveType: ObjectiveType,
  rank: AdventurerRank,
): TavernRequestOffer {
  const requestId = buildChainRequestId(chainId, stepNumber)
  const seed = `${chainId}:step:${stepNumber}`
  const offer = buildRequestOfferForObjective(
    requestId,
    seed,
    objectiveType,
    rank,
  )
  return {
    ...offer,
    chain: { chainId, stepNumber, totalSteps: QUEST_CHAIN_CONFIG.totalSteps },
  }
}

/** The step every active chain is currently waiting on (its last step). */
function latestStepOf(chain: QuestChainState): QuestChainStepState {
  return chain.steps[chain.steps.length - 1]
}

/**
 * Every follow-up request currently due to appear in a day's board slots —
 * i.e. every active chain's scheduled step whose scheduledDay matches.
 * Throws (a core invariant violation, never silently truncated) if more
 * are due than QUEST_CHAIN_CONFIG.maxChainRequestsPerDay allows, since
 * that can only happen from a corrupted/tampered chain state.
 */
export function collectDueChainRequests(
  chains: readonly QuestChainState[],
  dayNumber: number,
): TavernRequestOffer[] {
  const due: TavernRequestOffer[] = []
  for (const chain of chains) {
    if (chain.status !== 'active') continue
    const step = latestStepOf(chain)
    if (step.status === 'scheduled' && step.scheduledDay === dayNumber) {
      due.push(step.request)
    }
  }
  if (due.length > QUEST_CHAIN_CONFIG.maxChainRequestsPerDay) {
    throw new Error(
      `Quest Chain invariant violated: ${due.length} follow-up requests due on day ${dayNumber} (max ${QUEST_CHAIN_CONFIG.maxChainRequestsPerDay})`,
    )
  }
  return due
}

export interface ResolveQuestChainsForDayInput {
  campaignSeed: string
  dayNumber: number
  currentChains: readonly QuestChainState[]
  results: readonly ResolvedDispatch[]
  /** The Tavern Rank in effect AFTER today's reputation update — used only
   * to freeze the rank ceiling of a chain that starts today. */
  afterTavernRank: TavernRank
}

export interface ResolveQuestChainsForDayResult {
  chains: QuestChainState[]
  events: QuestChainEvent[]
}

/**
 * Pure day transition for every Quest Chain — shared verbatim by the
 * runtime (resolveCampaignDay) and the save validator's causal replay, so
 * there is exactly one implementation of "what should have happened."
 * Advances/completes/fails/abandons each active chain whose latest step
 * was due today, then considers starting at most one new chain from
 * today's eligible standalone successes.
 */
export function resolveQuestChainsForDay(
  input: ResolveQuestChainsForDayInput,
): ResolveQuestChainsForDayResult {
  const { campaignSeed, dayNumber, currentChains, results, afterTavernRank } =
    input
  const events: QuestChainEvent[] = []
  const resultsByRequestId = new Map(results.map((r) => [r.requestId, r]))

  // --- Advance every active chain whose latest step was due today ---
  const advancedChains: QuestChainState[] = currentChains.map((chain) => {
    if (chain.status !== 'active') return chain
    const step = latestStepOf(chain)
    if (step.status !== 'scheduled' || step.scheduledDay !== dayNumber) {
      return chain
    }
    const result = resultsByRequestId.get(step.request.id)
    if (!result) return chain

    if (result.status === 'notBrokered') {
      const resolvedStep: QuestChainStepState = {
        ...step,
        status: 'notBrokered',
      }
      events.push({ type: 'abandoned', chainId: chain.id, dayNumber })
      return {
        ...chain,
        status: 'abandoned',
        steps: [...chain.steps.slice(0, -1), resolvedStep],
      }
    }

    const outcome = result.result!.outcome
    const resolvedStep: QuestChainStepState = {
      ...step,
      status: 'resolved',
      partyId: result.partyId,
      outcome,
    }

    if (!CHAIN_ADVANCING_OUTCOMES.includes(outcome)) {
      events.push({ type: 'failed', chainId: chain.id, dayNumber, outcome })
      return {
        ...chain,
        status: 'failed',
        steps: [...chain.steps.slice(0, -1), resolvedStep],
      }
    }

    if (step.stepNumber === QUEST_CHAIN_CONFIG.totalSteps) {
      events.push({ type: 'completed', chainId: chain.id, dayNumber })
      return {
        ...chain,
        status: 'completed',
        steps: [...chain.steps.slice(0, -1), resolvedStep],
      }
    }

    const nextStepNumber = (step.stepNumber + 1) as 2 | 3
    const definition = getQuestChainDefinition(chain.definitionId)
    if (!definition) {
      throw new Error(`Unknown quest chain definition: ${chain.definitionId}`)
    }
    const originRank = chain.steps[0].request.rank
    const nextRank = planQuestChainStepRank(
      originRank,
      nextStepNumber,
      chain.rankCeiling,
    )
    const nextRequest = buildChainStepRequest(
      chain.id,
      nextStepNumber,
      definition.objectives[nextStepNumber - 1],
      nextRank,
    )
    const nextStep: QuestChainStepState = {
      stepNumber: nextStepNumber,
      scheduledDay: dayNumber + 1,
      request: nextRequest,
      status: 'scheduled',
    }
    events.push({
      type: 'advanced',
      chainId: chain.id,
      dayNumber,
      completedStep: step.stepNumber,
      nextStep: nextStepNumber,
    })
    return {
      ...chain,
      steps: [...chain.steps.slice(0, -1), resolvedStep, nextStep],
    }
  })

  // --- Start at most one new chain from today's eligible successes ---
  let finalChains = advancedChains
  const activeCount = advancedChains.filter((c) => c.status === 'active').length
  if (activeCount < QUEST_CHAIN_CONFIG.maxActiveChains) {
    const candidates = results
      .filter(
        (r) =>
          r.status === 'resolved' &&
          r.result &&
          r.request.chain === undefined &&
          CHAIN_START_OUTCOMES.includes(r.result.outcome) &&
          findChainDefinitionByStep1Objective(r.request.objectiveType) !==
            undefined,
      )
      .slice()
      .sort((a, b) =>
        a.requestId < b.requestId ? -1 : a.requestId > b.requestId ? 1 : 0,
      )

    for (const candidate of candidates) {
      if (!rollChainStart(campaignSeed, dayNumber, candidate.requestId)) {
        continue
      }
      const definition = findChainDefinitionByStep1Objective(
        candidate.request.objectiveType,
      )!
      const chainId = buildQuestChainId(dayNumber, candidate.requestId)
      const rankCeiling = getMaxQuestRank(afterTavernRank)
      const originRank = candidate.request.rank
      const step2Rank = planQuestChainStepRank(originRank, 2, rankCeiling)
      const step2Request = buildChainStepRequest(
        chainId,
        2,
        definition.objectives[1],
        step2Rank,
      )
      const step1: QuestChainStepState = {
        stepNumber: 1,
        scheduledDay: dayNumber,
        request: candidate.request,
        status: 'resolved',
        partyId: candidate.partyId,
        outcome: candidate.result!.outcome,
      }
      const step2: QuestChainStepState = {
        stepNumber: 2,
        scheduledDay: dayNumber + 1,
        request: step2Request,
        status: 'scheduled',
      }
      const newChain: QuestChainState = {
        id: chainId,
        definitionId: definition.id,
        status: 'active',
        startedDay: dayNumber,
        rankCeiling,
        steps: [step1, step2],
      }
      finalChains = [...advancedChains, newChain]
      events.push({ type: 'started', chainId, dayNumber })
      break
    }
  }

  return { chains: finalChains, events }
}
