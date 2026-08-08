import type { AdventurerRank } from '../../models/types.ts'

export function getPartyRankWeights(
  reputation: number,
): Record<AdventurerRank, number> {
  if (reputation < 20) {
    return { E: 45, D: 40, C: 15, B: 0, A: 0, S: 0 }
  }
  if (reputation < 40) {
    return { E: 20, D: 40, C: 30, B: 10, A: 0, S: 0 }
  }
  if (reputation < 60) {
    return { E: 5, D: 20, C: 40, B: 25, A: 10, S: 0 }
  }
  if (reputation < 80) {
    return { E: 0, D: 5, C: 20, B: 40, A: 25, S: 10 }
  }
  return { E: 0, D: 0, C: 5, B: 20, A: 40, S: 35 }
}

export function getRequestRankWeights(
  reputation: number,
): Record<AdventurerRank, number> {
  if (reputation < 20) {
    return { E: 35, D: 45, C: 20, B: 0, A: 0, S: 0 }
  }
  if (reputation < 40) {
    return { E: 15, D: 40, C: 35, B: 10, A: 0, S: 0 }
  }
  if (reputation < 60) {
    return { E: 0, D: 15, C: 40, B: 30, A: 15, S: 0 }
  }
  if (reputation < 80) {
    return { E: 0, D: 0, C: 15, B: 40, A: 30, S: 15 }
  }
  return { E: 0, D: 0, C: 0, B: 15, A: 45, S: 40 }
}
