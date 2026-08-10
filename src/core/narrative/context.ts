import type { CampaignParty } from '../tavern/campaign/types.ts'
import type { TavernDayRecord } from '../tavern/campaign/types.ts'
import type {
  BrokerageOfferAttempt,
  DispatchReport,
  TavernRequestOffer,
} from '../tavern/types.ts'
import { getMissionSpecializationMatch } from '../tavern/specialization.ts'
import type {
  ExpeditionNarrativeContext,
  NarrativeHistoryHighlight,
  NarrativePartySnapshot,
  NarrativeRequestInfo,
} from './types.ts'
import type {
  ExpeditionOutcome,
  ExpeditionResult,
  ObjectiveType,
} from '../expedition/types.ts'
import { rankIndex } from '../tavern/campaign/generators.ts'
import { buildExpeditionNarrativeTimeline } from './timeline.ts'

function memberIsDead(member: { currentHp: number }): boolean {
  return member.currentHp <= 0
}

export function buildNarrativePartySnapshot(
  party: CampaignParty,
): NarrativePartySnapshot {
  const leader = party.party.members.find((m) => m.id === party.party.leaderId)
  const incapacitatedIds = new Set(party.condition.incapacitatedIds)

  return {
    id: party.id,
    name: party.party.name,
    rank: party.party.rank,
    leaderId: party.party.leaderId,
    leaderName: leader?.name ?? '—',
    members: party.party.members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role,
      rank: m.rank,
      personality: m.personality,
      incapacitated: incapacitatedIds.has(m.id),
      dead: memberIsDead(m),
    })),
    missionSpecialization: party.party.missionSpecialization,
    affinity: party.relationship.affinity,
    financialPressure: party.relationship.financialPressure,
    riskTolerance: party.relationship.riskTolerance,
    growthMilestones: party.progression.growthMilestones,
    trainingDays: party.progression.trainingDays,
    stats: { ...party.stats },
    arrivalDay: party.arrivalDay,
    plannedDepartureDay: party.plannedDepartureDay,
  }
}

export function buildNarrativeRequestInfo(
  request: TavernRequestOffer,
): NarrativeRequestInfo {
  return {
    id: request.id,
    title: request.title,
    briefing: request.briefing,
    rank: request.rank,
    objectiveType: request.objectiveType,
    environment: request.environment,
    publicTags: [...request.publicTags],
  }
}

export function buildExpeditionNarrativeContext(
  party: CampaignParty,
  request: TavernRequestOffer,
  report: DispatchReport,
  acceptedOffer: BrokerageOfferAttempt | undefined,
  result?: ExpeditionResult,
): ExpeditionNarrativeContext {
  const specializationMatch = getMissionSpecializationMatch(
    party.party.missionSpecialization,
    request.objectiveType,
  )
  const state = result?.state
  const context: ExpeditionNarrativeContext = {
    kind: 'expedition',
    party: buildNarrativePartySnapshot(party),
    request: buildNarrativeRequestInfo(request),
    acceptance: acceptedOffer
      ? {
          reason: acceptedOffer.reason,
          rankGap: acceptedOffer.evaluation.rankGap,
          specializationMatch,
        }
      : {
          reason: 'appropriate',
          rankGap: rankIndex(request.rank) - rankIndex(party.party.rank),
          specializationMatch,
        },
    report,
    state,
  }
  if (state) {
    context.timeline = buildExpeditionNarrativeTimeline(context)
    context.battleMetrics = state.battles.map((battle) => ({
      sourceEvents: battle.result.logs.length,
      beats: (context.timeline ?? []).filter((b) => b.phase === 'battle')
        .length,
    }))
  }
  return context
}

const OUTCOME_PRIORITY: Record<ExpeditionOutcome, number> = {
  completeSuccess: 1,
  success: 2,
  partialSuccess: 3,
  failedObjective: 4,
  forcedRetreat: 5,
  lostExpedition: 6,
}

function isWeakObjectiveFor(
  objectiveType: ObjectiveType,
  party: CampaignParty,
): boolean {
  return party.party.missionSpecialization.weakObjective === objectiveType
}

export function buildRecentHighlights(
  party: CampaignParty,
  history: TavernDayRecord[],
  limit = 3,
): NarrativeHistoryHighlight[] {
  const highlights: NarrativeHistoryHighlight[] = []

  for (const record of history) {
    for (const resolved of record.results) {
      if (resolved.status !== 'resolved' || !resolved.report) {
        continue
      }
      if (resolved.partyId !== party.id) {
        continue
      }
      const isWeakObjective = isWeakObjectiveFor(
        resolved.report.objectiveType,
        party,
      )
      const rankGap =
        rankIndex(resolved.request.rank) - rankIndex(party.party.rank)
      highlights.push({
        dayNumber: record.dayNumber,
        requestTitle: resolved.request.title,
        objectiveType: resolved.report.objectiveType,
        outcome: resolved.report.outcome,
        isWeakObjective,
        rankGap,
      })
    }
  }

  highlights.sort((a, b) => {
    if (a.isWeakObjective !== b.isWeakObjective) {
      return a.isWeakObjective ? -1 : 1
    }
    const aChallenging = a.outcome === 'completeSuccess' && a.rankGap > 0
    const bChallenging = b.outcome === 'completeSuccess' && b.rankGap > 0
    if (aChallenging !== bChallenging) {
      return aChallenging ? -1 : 1
    }
    const pa = OUTCOME_PRIORITY[a.outcome]
    const pb = OUTCOME_PRIORITY[b.outcome]
    if (pa !== pb) return pa - pb
    return b.dayNumber - a.dayNumber
  })

  return highlights.slice(0, limit)
}
