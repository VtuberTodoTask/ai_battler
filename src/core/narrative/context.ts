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
import { deriveCharacterNarrativeProfile } from './characterProfile.ts'
import { buildRelationshipSnapshot } from './characterRelationships.ts'
import { determineNarrativeDirection } from './director.ts'
import { projectCharacterContextsForNarrative } from '../identity/characterContext.ts'
import {
  projectMemoriesForNarrative,
  type ProjectedMemoryContext,
} from './memory.ts'
import { projectArcSignalsForNarrative } from './arcSignals.ts'

function memberIsDead(member: { currentHp: number }): boolean {
  return member.currentHp <= 0
}

export function buildNarrativePartySnapshot(
  party: CampaignParty,
): NarrativePartySnapshot {
  const leader = party.party.members.find((m) => m.id === party.party.leaderId)
  const incapacitatedIds = new Set(party.condition.incapacitatedIds)
  const members = party.party.members.map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    rank: m.rank,
    personality: m.personality,
    narrativeProfile: m.narrativeProfile ?? deriveCharacterNarrativeProfile(m),
    identity: m.identity,
    lifeBackground: m.lifeBackground,
    culturalInfluences: m.culturalInfluences,
    romanticProfile: m.romanticProfile,
    incapacitated: incapacitatedIds.has(m.id),
    dead: memberIsDead(m),
  }))

  return {
    id: party.id,
    name: party.party.name,
    rank: party.party.rank,
    leaderId: party.party.leaderId,
    leaderName: leader?.name ?? '—',
    members,
    missionSpecialization: party.party.missionSpecialization,
    affinity: party.relationship.affinity,
    financialPressure: party.relationship.financialPressure,
    riskTolerance: party.relationship.riskTolerance,
    growthMilestones: party.progression.growthMilestones,
    trainingDays: party.progression.trainingDays,
    stats: { ...party.stats },
    characterRelationships: buildRelationshipSnapshot(
      members,
      party.memberRelationships,
    ),
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
  dayNumber?: number,
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
    context.direction = determineNarrativeDirection(
      context.timeline,
      context.party.members,
      context.party.characterRelationships,
    )
    const sceneCharacterIds = [
      ...new Set(
        (context.direction?.mainScenes ?? [])
          .concat(context.direction?.secondaryScenes ?? [])
          .flatMap((s) => s.characterIds ?? []),
      ),
    ]
    if (sceneCharacterIds.length === 0 && context.party.members.length > 0) {
      sceneCharacterIds.push(context.party.leaderId)
    }
    context.characterContexts = projectCharacterContextsForNarrative(
      context.party.members,
      context.direction?.focus?.summary ?? '',
      context.request,
      sceneCharacterIds,
      context.party.characterRelationships ?? [],
    )
    if (dayNumber !== undefined) {
      const memoryContext = projectMemoriesForNarrative(
        party,
        context.direction?.focus?.summary ?? '',
        context.request,
        sceneCharacterIds,
        dayNumber,
      )
      context.characterMemories = memoryContext.characterMemories
      context.relationshipMemories = memoryContext.relationshipMemories
      attachMemoriesToCharacterContexts(context, memoryContext)

      context.relationshipArcs = projectArcSignalsForNarrative(
        party,
        context.direction?.focus?.summary ?? '',
        context.request,
        sceneCharacterIds,
        dayNumber,
      )
    }
  }
  return context
}

function attachMemoriesToCharacterContexts(
  context: ExpeditionNarrativeContext,
  memoryContext: ProjectedMemoryContext,
): void {
  if (!context.characterContexts) return
  for (const cc of context.characterContexts) {
    cc.memories = memoryContext.characterMemories[cc.characterId]
  }
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
