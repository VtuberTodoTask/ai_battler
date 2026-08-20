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
  TavernRank,
  WorldEventDefinitionId,
  WorldEventEvent,
  WorldEventState,
} from './types.ts'

/**
 * Phase 9.7 World Event config — single source of truth for every tunable.
 */
export const WORLD_EVENT_CONFIG = {
  earliestStartDay: 4,
  startChanceBps: 3000,
  durationDays: 3,
  cooldownDays: 2,
  responseTarget: 4,
  maxActiveEvents: 1,
  maxEventRequestsPerDay: 1,
} as const

export interface WorldEventDefinition {
  id: WorldEventDefinitionId
  title: string
  description: string
  objectives: readonly [ObjectiveType, ObjectiveType, ObjectiveType]
}

export const WORLD_EVENT_DEFINITIONS: readonly WorldEventDefinition[] = [
  {
    id: 'monster_migration',
    title: '魔獣群の移動',
    description:
      '周辺で魔獣の大規模な移動が確認されています。\n調査や討伐、取り残された人々の救助依頼が増えています。',
    objectives: ['investigation', 'elimination', 'rescue'],
  },
  {
    id: 'flooded_routes',
    title: '増水する街道',
    description:
      '長雨と増水によって周辺の街道が寸断されています。\n被害状況の確認や救助、移動支援が必要になっています。',
    objectives: ['survey', 'rescue', 'escort'],
  },
  {
    id: 'exposed_ruins',
    title: '崩落で現れた遺構',
    description:
      '地盤の崩落によって未知の遺構が露出しました。\n安全確認と調査、発見物の回収依頼が相次いでいます。',
    objectives: ['survey', 'investigation', 'retrieval'],
  },
  {
    id: 'missing_caravans',
    title: '途絶する隊商',
    description:
      '周辺の交易路で複数の隊商が予定どおり到着していません。\n原因調査と救助、護送の必要性が高まっています。',
    objectives: ['investigation', 'rescue', 'escort'],
  },
] as const

export function getWorldEventDefinition(
  id: WorldEventDefinitionId,
): WorldEventDefinition | undefined {
  return WORLD_EVENT_DEFINITIONS.find((d) => d.id === id)
}

export const WORLD_EVENT_RESPONSE_POINTS: Record<ExpeditionOutcome, number> = {
  completeSuccess: 2,
  success: 2,
  partialSuccess: 1,
  failedObjective: 0,
  forcedRetreat: 0,
  lostExpedition: 0,
}

export function buildWorldEventId(
  startedDay: number,
  definitionId: WorldEventDefinitionId,
): string {
  return `world-event:${startedDay}:${definitionId}`
}

export function buildWorldEventRequestId(
  eventId: string,
  dayNumber: number,
): string {
  return `world-event-request:${eventId}:${dayNumber}`
}

/** Pure rank plan for a World Event's request — one tier below the Tavern
 * Rank's max quest rank at the moment the event starts, clamped to 'E'.
 * Frozen for the whole event's lifetime (never recomputed later). */
export function planWorldEventRequestRank(
  tavernRank: TavernRank,
): AdventurerRank {
  const maxRank = getMaxQuestRank(tavernRank)
  const idx = Math.max(rankIndex(maxRank) - 1, 0)
  return RANKS[idx]
}

function worldEventStartSeed(campaignSeed: string, dayNumber: number): string {
  return `world-event-start:${campaignSeed}:${dayNumber}`
}

function rollWorldEventStart(campaignSeed: string, dayNumber: number): boolean {
  const rng = new SeededRng(worldEventStartSeed(campaignSeed, dayNumber))
  return rng.chance(WORLD_EVENT_CONFIG.startChanceBps / 100)
}

function worldEventDefinitionSeed(
  campaignSeed: string,
  dayNumber: number,
): string {
  return `world-event-definition:${campaignSeed}:${dayNumber}`
}

function pickWorldEventDefinition(
  campaignSeed: string,
  dayNumber: number,
  excludeDefinitionId: WorldEventDefinitionId | undefined,
): WorldEventDefinition {
  const candidates = excludeDefinitionId
    ? WORLD_EVENT_DEFINITIONS.filter((d) => d.id !== excludeDefinitionId)
    : WORLD_EVENT_DEFINITIONS
  const pool = candidates.length > 0 ? candidates : WORLD_EVENT_DEFINITIONS
  const rng = new SeededRng(worldEventDefinitionSeed(campaignSeed, dayNumber))
  return rng.pick(pool)
}

/** The most recently ended (contained/unresolved) World Event, if any —
 * used for both cooldown and same-definition-avoidance. */
function mostRecentlyEnded(
  worldEvents: readonly WorldEventState[],
): WorldEventState | undefined {
  const ended = worldEvents.filter((e) => e.status !== 'active')
  if (ended.length === 0) return undefined
  return ended.reduce((latest, e) =>
    (e.endedDay ?? -Infinity) > (latest.endedDay ?? -Infinity) ? e : latest,
  )
}

export interface PrepareWorldEventsForDayInput {
  campaignSeed: string
  dayNumber: number
  worldEvents: readonly WorldEventState[]
  tavernRank: TavernRank
}

export interface WorldEventsDayResult {
  worldEvents: WorldEventState[]
  events: WorldEventEvent[]
}

/**
 * Pure day-transition entry point for a NEW World Event — shared verbatim
 * by the runtime (advanceCampaignDay, at the DAY N -> DAY N+1 transition)
 * and the save validator's causal replay. Never starts a second event while
 * one is active, never starts during the post-event cooldown window, and
 * avoids immediately repeating the same Definition when another is
 * available.
 */
export function prepareWorldEventsForDay(
  input: PrepareWorldEventsForDayInput,
): WorldEventsDayResult {
  const { campaignSeed, dayNumber, worldEvents, tavernRank } = input

  if (worldEvents.some((e) => e.status === 'active')) {
    return { worldEvents: worldEvents.slice(), events: [] }
  }

  if (dayNumber < WORLD_EVENT_CONFIG.earliestStartDay) {
    return { worldEvents: worldEvents.slice(), events: [] }
  }

  const recentlyEnded = mostRecentlyEnded(worldEvents)
  if (
    recentlyEnded?.endedDay !== undefined &&
    dayNumber <= recentlyEnded.endedDay + WORLD_EVENT_CONFIG.cooldownDays
  ) {
    return { worldEvents: worldEvents.slice(), events: [] }
  }

  if (!rollWorldEventStart(campaignSeed, dayNumber)) {
    return { worldEvents: worldEvents.slice(), events: [] }
  }

  const definition = pickWorldEventDefinition(
    campaignSeed,
    dayNumber,
    recentlyEnded?.definitionId,
  )
  const requestRank = planWorldEventRequestRank(tavernRank)
  const eventId = buildWorldEventId(dayNumber, definition.id)
  const newEvent: WorldEventState = {
    id: eventId,
    definitionId: definition.id,
    status: 'active',
    startedDay: dayNumber,
    plannedEndDay: dayNumber + WORLD_EVENT_CONFIG.durationDays - 1,
    requestRank,
    responsePoints: 0,
  }

  return {
    worldEvents: [...worldEvents, newEvent],
    events: [
      {
        type: 'started',
        eventId,
        definitionId: definition.id,
        dayNumber,
      },
    ],
  }
}

/** The pure request an active World Event offers on a given day — fully
 * reproducible from (event, dayNumber) alone, so no per-day state needs to
 * be stored beyond the WorldEventState itself. */
export function buildWorldEventRequestForDay(
  event: WorldEventState,
  dayNumber: number,
): TavernRequestOffer {
  const definition = getWorldEventDefinition(event.definitionId)
  if (!definition) {
    throw new Error(`Unknown world event definition: ${event.definitionId}`)
  }
  const dayIndex0 = dayNumber - event.startedDay
  const objectiveType = definition.objectives[dayIndex0]
  const requestId = buildWorldEventRequestId(event.id, dayNumber)
  const seed = `${event.id}:day:${dayNumber}:request`
  const offer = buildRequestOfferForObjective(
    requestId,
    seed,
    objectiveType,
    event.requestRank,
  )
  return {
    ...offer,
    worldEvent: {
      eventId: event.id,
      definitionId: event.definitionId,
      dayIndex: (dayIndex0 + 1) as 1 | 2 | 3,
      totalDays: WORLD_EVENT_CONFIG.durationDays,
    },
  }
}

/**
 * Every Event-linked request currently due — i.e. the active event's
 * request for today, if any (at most one, since maxActiveEvents is 1).
 * Returns an empty array when there is no active event or today falls
 * outside its impact window.
 */
export function collectDueEventRequest(
  worldEvents: readonly WorldEventState[],
  dayNumber: number,
): TavernRequestOffer[] {
  const active = worldEvents.find((e) => e.status === 'active')
  if (!active) return []
  if (dayNumber < active.startedDay || dayNumber > active.plannedEndDay) {
    return []
  }
  return [buildWorldEventRequestForDay(active, dayNumber)]
}

export interface ResolveWorldEventsForDayInput {
  dayNumber: number
  worldEvents: readonly WorldEventState[]
  results: readonly ResolvedDispatch[]
}

/**
 * Pure day transition for the active World Event's Player Response —
 * shared verbatim by the runtime (resolveCampaignDay) and the save
 * validator's causal replay. Derives Response Points only from the actual
 * outcome of today's Event-linked request (or 0 for notBrokered), applies
 * Early Containment once the target is reached, and marks the event
 * unresolved if its planned window ends without reaching it. Never adds
 * any special reward/reputation/growth — those flow through the existing
 * paths exactly as for any other request.
 */
export function resolveWorldEventsForDay(
  input: ResolveWorldEventsForDayInput,
): WorldEventsDayResult {
  const { dayNumber, worldEvents, results } = input
  const active = worldEvents.find((e) => e.status === 'active')
  if (!active) {
    return { worldEvents: worldEvents.slice(), events: [] }
  }
  if (dayNumber < active.startedDay || dayNumber > active.plannedEndDay) {
    return { worldEvents: worldEvents.slice(), events: [] }
  }

  const result = results.find(
    (r) => r.request.worldEvent?.eventId === active.id,
  )
  if (!result) {
    return { worldEvents: worldEvents.slice(), events: [] }
  }

  const delta =
    result.status === 'notBrokered'
      ? 0
      : WORLD_EVENT_RESPONSE_POINTS[result.result!.outcome]
  const responsePointsAfter = Math.min(
    Math.max(active.responsePoints + delta, 0),
    WORLD_EVENT_CONFIG.responseTarget,
  )

  const events: WorldEventEvent[] = [
    {
      type: 'response',
      eventId: active.id,
      requestId: result.requestId,
      dayNumber,
      delta,
      responsePointsAfter,
    },
  ]

  let updated: WorldEventState
  if (responsePointsAfter >= WORLD_EVENT_CONFIG.responseTarget) {
    updated = {
      ...active,
      status: 'contained',
      endedDay: dayNumber,
      responsePoints: responsePointsAfter,
    }
    events.push({ type: 'contained', eventId: active.id, dayNumber })
  } else if (dayNumber === active.plannedEndDay) {
    updated = {
      ...active,
      status: 'unresolved',
      endedDay: dayNumber,
      responsePoints: responsePointsAfter,
    }
    events.push({ type: 'unresolved', eventId: active.id, dayNumber })
  } else {
    updated = { ...active, responsePoints: responsePointsAfter }
  }

  return {
    worldEvents: worldEvents.map((e) => (e.id === active.id ? updated : e)),
    events,
  }
}
