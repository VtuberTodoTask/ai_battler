import type { AdventurerRank } from '../../models/types.ts'
import { getMaxQuestRank } from './reputation.ts'
import type { TavernRank } from './types.ts'

const RANK_ORDER: AdventurerRank[] = ['E', 'D', 'C', 'B', 'A', 'S']

function rankOrderIndex(rank: AdventurerRank): number {
  return RANK_ORDER.indexOf(rank)
}

/**
 * Base weight rows, one per Tavern Rank tier. Every rank up to that tier's
 * maxQuestRank keeps a nonzero weight here: lower-rank content must stay
 * reachable even at the highest tavern rank (Phase 9.2 spec: raising the
 * rank ceiling must never crowd out E/D/C work). Weight for ranks beyond
 * the tier's ceiling is irrelevant since capRankWeights() below always
 * zeroes them out as a hard cutoff.
 */
const PARTY_RANK_WEIGHT_ROWS: Record<
  TavernRank,
  Record<AdventurerRank, number>
> = {
  1: { E: 55, D: 45, C: 0, B: 0, A: 0, S: 0 },
  2: { E: 25, D: 40, C: 35, B: 0, A: 0, S: 0 },
  3: { E: 12, D: 23, C: 35, B: 30, A: 0, S: 0 },
  4: { E: 5, D: 12, C: 23, B: 35, A: 25, S: 0 },
  5: { E: 3, D: 7, C: 15, B: 25, A: 30, S: 20 },
}

const REQUEST_RANK_WEIGHT_ROWS: Record<
  TavernRank,
  Record<AdventurerRank, number>
> = {
  1: { E: 60, D: 40, C: 0, B: 0, A: 0, S: 0 },
  2: { E: 25, D: 35, C: 40, B: 0, A: 0, S: 0 },
  3: { E: 10, D: 20, C: 30, B: 40, A: 0, S: 0 },
  4: { E: 5, D: 10, C: 20, B: 30, A: 35, S: 0 },
  5: { E: 3, D: 7, C: 15, B: 25, A: 30, S: 20 },
}

function capRankWeights(
  weights: Record<AdventurerRank, number>,
  tavernRank: TavernRank,
): Record<AdventurerRank, number> {
  const maxIndex = rankOrderIndex(getMaxQuestRank(tavernRank))
  const capped = { ...weights }
  for (const rank of RANK_ORDER) {
    if (rankOrderIndex(rank) > maxIndex) {
      capped[rank] = 0
    }
  }
  return capped
}

export function getPartyRankWeights(
  tavernRank: TavernRank,
): Record<AdventurerRank, number> {
  return capRankWeights(PARTY_RANK_WEIGHT_ROWS[tavernRank], tavernRank)
}

export function getRequestRankWeights(
  tavernRank: TavernRank,
): Record<AdventurerRank, number> {
  return capRankWeights(REQUEST_RANK_WEIGHT_ROWS[tavernRank], tavernRank)
}
