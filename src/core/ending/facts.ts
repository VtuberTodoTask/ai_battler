import { deriveTavernRank } from '../tavern/campaign/reputation.ts'
import { NATIONAL_THREAT_IDS } from '../mainQuest/threats.ts'
import type {
  TavernCampaignState,
  CampaignParty,
} from '../tavern/campaign/types.ts'
import type { MainQuestAttemptRecord } from '../mainQuest/types.ts'
import type { CampaignEndingFacts } from './types.ts'

const SUCCESSFUL_OUTCOMES = new Set([
  'completeSuccess',
  'success',
  'partialSuccess',
])

/** Searches active, away, and retired rosters — a Main Quest Party is not
 * guaranteed to still be "staying" by the time the Ending is presented. */
export function findEndingCampaignParty(
  campaign: TavernCampaignState,
  partyId: string,
): CampaignParty | undefined {
  return (
    campaign.parties.find((p) => p.id === partyId) ??
    campaign.awayParties.find((p) => p.id === partyId) ??
    campaign.retiredParties.find((p) => p.id === partyId)
  )
}

/**
 * Builds the compact, 100%-machine-derivable `CampaignEndingFacts` snapshot
 * from canonical Campaign state (Phase 9.9 items 9-11) — the only data the
 * Ending AI Prompt is ever built from. Every field is read straight off an
 * existing canonical source (`mainQuest.threats`, the winning Attempt's own
 * `result`, `reputation`/`finance`, `questChains`/`worldEvents`, resolved
 * Request history) — nothing here is inferred, scored, or interpreted.
 * Callers must only invoke this once `isCampaignVictoryAchieved(campaign)`
 * is true; it throws if a canonical field Victory itself guarantees turns
 * out to be missing (a corrupted invariant, never a normal code path).
 */
export function buildCampaignEndingFacts(
  campaign: TavernCampaignState,
  finalAttempt: MainQuestAttemptRecord,
): CampaignEndingFacts {
  if (!finalAttempt.result) {
    throw new Error(
      '最終試行に戦闘結果がないため、Ending Factsを構築できません',
    )
  }

  const finalCampaignParty = findEndingCampaignParty(
    campaign,
    finalAttempt.partyId,
  )
  if (!finalCampaignParty) {
    throw new Error(
      '最終試行のパーティが見つからないため、Ending Factsを構築できません',
    )
  }

  const allThreatIds = [...NATIONAL_THREAT_IDS, 'nosferatu'] as const
  const threats = allThreatIds.map((threatId) => {
    const state = campaign.mainQuest.threats[threatId]
    if (
      state.status !== 'defeated' ||
      state.defeatedDay === undefined ||
      state.defeatedByPartyId === undefined
    ) {
      throw new Error(
        `脅威 ${threatId} の撃破情報が不完全なため、Ending Factsを構築できません`,
      )
    }
    return {
      threatId,
      defeatedDay: state.defeatedDay,
      defeatedByPartyId: state.defeatedByPartyId,
    }
  })

  let resolvedRequestCount = 0
  let successfulRequestCount = 0
  for (const record of campaign.history) {
    for (const result of record.results) {
      if (result.status !== 'resolved') continue
      resolvedRequestCount += 1
      if (result.result && SUCCESSFUL_OUTCOMES.has(result.result.outcome)) {
        successfulRequestCount += 1
      }
    }
  }

  const completedQuestChainCount = campaign.questChains.filter(
    (c) => c.status === 'completed',
  ).length
  const containedWorldEventCount = campaign.worldEvents.filter(
    (e) => e.status === 'contained',
  ).length

  return {
    clearDay: finalAttempt.dayNumber,
    finalAttemptId: finalAttempt.id,
    finalParty: {
      partyId: finalCampaignParty.id,
      partyName: finalCampaignParty.party.name,
      memberIds: finalCampaignParty.party.members.map((m) => m.id),
      memberNames: finalCampaignParty.party.members.map((m) => m.name),
      affinity: finalCampaignParty.relationship.affinity,
    },
    finalBattle: {
      survivingMemberIds: finalAttempt.result.survivingMemberIds,
      incapacitatedMemberIds: finalAttempt.result.incapacitatedMemberIds,
      deadMemberIds: finalAttempt.result.deadMemberIds,
    },
    threats,
    tavern: {
      rank: deriveTavernRank(campaign.reputation.peakScore),
      reputationScore: campaign.reputation.score,
      peakReputationScore: campaign.reputation.peakScore,
      funds: campaign.finance.funds,
    },
    journey: {
      daysElapsed: finalAttempt.dayNumber,
      resolvedRequestCount,
      successfulRequestCount,
      completedQuestChainCount,
      containedWorldEventCount,
    },
  }
}
