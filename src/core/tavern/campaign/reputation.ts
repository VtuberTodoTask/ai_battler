import { clamp } from '../../util.ts'
import type { ExpeditionOutcome } from '../../expedition/types.ts'
import type {
  ReputationChangeEntry,
  ReputationChangeSummary,
  TavernReputationTier,
} from './types.ts'

export const REPUTATION_DELTA: Record<ExpeditionOutcome, number> = {
  completeSuccess: 3,
  success: 2,
  partialSuccess: 0,
  failedObjective: -2,
  forcedRetreat: -1,
  lostExpedition: -5,
}

export function getReputationTier(reputation: number): TavernReputationTier {
  if (reputation < 20) return 'unknown'
  if (reputation < 40) return 'local'
  if (reputation < 60) return 'trusted'
  if (reputation < 80) return 'renowned'
  return 'legendary'
}

export function getReputationTierLabel(tier: TavernReputationTier): string {
  const labels: Record<TavernReputationTier, string> = {
    unknown: '駆け出し',
    local: '地元で知られる',
    trusted: '信頼される',
    renowned: '名高い',
    legendary: '伝説級',
  }
  return labels[tier]
}

export function getNextTierThreshold(reputation: number): number | null {
  if (reputation < 20) return 20
  if (reputation < 40) return 40
  if (reputation < 60) return 60
  if (reputation < 80) return 80
  return null
}

export function computeReputationChange(
  before: number,
  outcomes: { requestId: string; outcome: ExpeditionOutcome }[],
): ReputationChangeSummary {
  const entries: ReputationChangeEntry[] = outcomes.map((o) => ({
    requestId: o.requestId,
    outcome: o.outcome,
    rawDelta: REPUTATION_DELTA[o.outcome],
  }))

  const rawDelta = entries.reduce((sum, e) => sum + e.rawDelta, 0)
  const after = clamp(before + rawDelta, 0, 100)
  const appliedDelta = after - before

  return {
    before,
    rawDelta,
    appliedDelta,
    after,
    entries,
  }
}
