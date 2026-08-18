import type { AdventurerRank } from '../../models/types.ts'
import type { ExpeditionOutcome } from '../../expedition/types.ts'
import type {
  DayReputationSummary,
  TavernRank,
  TavernReputationEvent,
  TavernReputationState,
} from './types.ts'

const MAX_SAFE_REPUTATION = Number.MAX_SAFE_INTEGER
const MIN_SAFE_REPUTATION = Number.MIN_SAFE_INTEGER

export function validateReputationScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid reputation score: ${String(value)}`)
  }
  if (!Number.isInteger(value)) {
    throw new Error(`Reputation score must be an integer: ${value}`)
  }
  if (value < MIN_SAFE_REPUTATION || value > MAX_SAFE_REPUTATION) {
    throw new Error(`Reputation score exceeds safe integer range: ${value}`)
  }
  return value
}

export interface TavernRankConfigEntry {
  rank: TavernRank
  requiredPeakReputation: number
  maxQuestRank: AdventurerRank
}

export const TAVERN_RANK_CONFIG: readonly TavernRankConfigEntry[] = [
  { rank: 1, requiredPeakReputation: 0, maxQuestRank: 'D' },
  { rank: 2, requiredPeakReputation: 20, maxQuestRank: 'C' },
  { rank: 3, requiredPeakReputation: 50, maxQuestRank: 'B' },
  { rank: 4, requiredPeakReputation: 100, maxQuestRank: 'A' },
  { rank: 5, requiredPeakReputation: 180, maxQuestRank: 'S' },
] as const

export function getTavernRankConfigEntry(
  rank: TavernRank,
): TavernRankConfigEntry {
  const entry = TAVERN_RANK_CONFIG.find((e) => e.rank === rank)
  if (!entry) {
    throw new Error(`Unknown tavern rank: ${String(rank)}`)
  }
  return entry
}

export function deriveTavernRank(peakScore: number): TavernRank {
  let result: TavernRank = 1
  for (const entry of TAVERN_RANK_CONFIG) {
    if (peakScore >= entry.requiredPeakReputation) {
      result = entry.rank
    }
  }
  return result
}

export function getMaxQuestRank(rank: TavernRank): AdventurerRank {
  return getTavernRankConfigEntry(rank).maxQuestRank
}

export function getNextTavernRankThreshold(rank: TavernRank): number | null {
  const next = TAVERN_RANK_CONFIG.find((e) => e.rank === rank + 1)
  return next ? next.requiredPeakReputation : null
}

export function isMaxTavernRank(rank: TavernRank): boolean {
  return rank === TAVERN_RANK_CONFIG[TAVERN_RANK_CONFIG.length - 1].rank
}

export function tavernRankLabel(rank: TavernRank): string {
  return `酒場ランク ${rank}`
}

export function questRankUnlockLabel(rank: AdventurerRank): string {
  return `${rank}ランクまでの依頼`
}

export const REPUTATION_SUCCESS_BY_QUEST_RANK: Record<AdventurerRank, number> =
  {
    E: 2,
    D: 3,
    C: 4,
    B: 6,
    A: 8,
    S: 12,
  }

type ReputationOutcomeRule = (baseValue: number) => number

const REPUTATION_RULE_BY_OUTCOME = {
  completeSuccess: (v) => v,
  success: (v) => v,
  partialSuccess: (v) => Math.ceil(v / 2),
  failedObjective: (v) => -Math.ceil(v / 2),
  forcedRetreat: (v) => -Math.ceil(v / 2),
  lostExpedition: (v) => -v,
} satisfies Record<ExpeditionOutcome, ReputationOutcomeRule>

export function computeQuestReputationDelta(
  rank: AdventurerRank,
  outcome: ExpeditionOutcome,
): number {
  const baseValue = REPUTATION_SUCCESS_BY_QUEST_RANK[rank]
  return REPUTATION_RULE_BY_OUTCOME[outcome](baseValue)
}

export function buildQuestReputationEventId(
  day: number,
  requestId: string,
  partyId: string,
): string {
  return `quest-reputation:${day}:${requestId}:${partyId}`
}

export function buildQuestReputationEvent(
  day: number,
  requestId: string,
  partyId: string,
  rank: AdventurerRank,
  outcome: ExpeditionOutcome,
): TavernReputationEvent {
  return {
    id: buildQuestReputationEventId(day, requestId, partyId),
    day,
    kind: 'quest_outcome',
    delta: computeQuestReputationDelta(rank, outcome),
    source: { type: 'expedition', requestId, partyId },
  }
}

export function createInitialReputationState(): TavernReputationState {
  return {
    score: 0,
    peakScore: 0,
    events: [],
  }
}

export interface AppliedDailyReputation {
  state: TavernReputationState
  summary: DayReputationSummary
}

/**
 * Applies a full day's worth of reputation events atomically: the day's
 * delta is summed first, then score/peak/rank are derived from the total.
 * This keeps same-day rank promotion independent of event processing order.
 */
export function applyDailyReputationDelta(
  state: TavernReputationState,
  dayEvents: readonly TavernReputationEvent[],
): AppliedDailyReputation {
  const beforeScore = state.score
  const beforeRank = deriveTavernRank(state.peakScore)

  const delta = dayEvents.reduce((sum, event) => sum + event.delta, 0)
  const afterScore = validateReputationScore(beforeScore + delta)
  const afterPeak = validateReputationScore(
    Math.max(state.peakScore, afterScore),
  )
  const afterRank = deriveTavernRank(afterPeak)

  return {
    state: {
      score: afterScore,
      peakScore: afterPeak,
      events: [...state.events, ...dayEvents],
    },
    summary: {
      beforeScore,
      delta,
      afterScore,
      beforeRank,
      afterRank,
      promoted: afterRank > beforeRank,
    },
  }
}
