import { describe, expect, it } from 'vitest'
import {
  WORLD_EVENT_CONFIG,
  WORLD_EVENT_DEFINITIONS,
  WORLD_EVENT_RESPONSE_POINTS,
  buildWorldEventId,
  buildWorldEventRequestForDay,
  buildWorldEventRequestId,
  collectDueEventRequest,
  planWorldEventRequestRank,
  prepareWorldEventsForDay,
  resolveWorldEventsForDay,
} from './worldEvents.ts'
import type { ResolvedDispatch, TavernRequestOffer } from '../types.ts'
import type { WorldEventState } from './types.ts'

function fakeRequest(
  overrides: Partial<TavernRequestOffer> = {},
): TavernRequestOffer {
  return {
    id: 'fake-request',
    title: 'テスト依頼',
    briefing: '',
    objectiveType: 'investigation',
    rank: 'D',
    environment: 'ruins',
    publicTags: [],
    recommendedPartySize: 4,
    expeditionRequest: {} as never,
    rewardTerms: {} as never,
    ...overrides,
  }
}

function buildResolvedDispatch(
  overrides: Partial<Omit<ResolvedDispatch, 'request'>> & {
    requestId: string
    request?: Partial<TavernRequestOffer>
  },
): ResolvedDispatch {
  const { request: requestOverrides, ...rest } = overrides
  return {
    request: fakeRequest({ id: overrides.requestId, ...requestOverrides }),
    partyId: 'party-1',
    partyName: 'テストパーティ',
    leaderName: 'リーダー',
    memberIds: ['member-1'],
    status: 'resolved',
    result: { outcome: 'completeSuccess' } as never,
    ...rest,
  }
}

/** Finds a campaign seed (within a bounded search) whose deterministic
 * Start Roll succeeds/fails for the given day, so start-path tests are
 * fast and reliable without depending on real gameplay RNG. */
function findSeedForStartRoll(dayNumber: number, wantSuccess: boolean): string {
  for (let i = 0; i < 300; i++) {
    const seed = `world-event-unit-${i}`
    const { events } = prepareWorldEventsForDay({
      campaignSeed: seed,
      dayNumber,
      worldEvents: [],
      tavernRank: 1,
    })
    const started = events.some((e) => e.type === 'started')
    if (started === wantSuccess) return seed
  }
  throw new Error(
    `no seed found for dayNumber=${dayNumber} wantSuccess=${wantSuccess}`,
  )
}

function buildActiveEvent(
  overrides: Partial<WorldEventState> = {},
): WorldEventState {
  return {
    id: buildWorldEventId(4, 'monster_migration'),
    definitionId: 'monster_migration',
    status: 'active',
    startedDay: 4,
    plannedEndDay: 6,
    requestRank: 'D',
    responsePoints: 0,
    ...overrides,
  }
}

describe('Phase 9.7 prepareWorldEventsForDay (unit)', () => {
  it('never starts an event before earliestStartDay (4)', () => {
    for (let day = 1; day <= 3; day++) {
      const seed = findSeedForStartRoll(4, true)
      const { worldEvents, events } = prepareWorldEventsForDay({
        campaignSeed: seed,
        dayNumber: day,
        worldEvents: [],
        tavernRank: 1,
      })
      expect(worldEvents).toHaveLength(0)
      expect(events).toHaveLength(0)
    }
  })

  it('starts exactly one event on a winning roll at day 4+', () => {
    const seed = findSeedForStartRoll(4, true)
    const { worldEvents, events } = prepareWorldEventsForDay({
      campaignSeed: seed,
      dayNumber: 4,
      worldEvents: [],
      tavernRank: 1,
    })
    expect(worldEvents).toHaveLength(1)
    expect(worldEvents[0].status).toBe('active')
    expect(worldEvents[0].startedDay).toBe(4)
    expect(worldEvents[0].plannedEndDay).toBe(6)
    expect(worldEvents[0].responsePoints).toBe(0)
    expect(
      WORLD_EVENT_DEFINITIONS.some((d) => d.id === worldEvents[0].definitionId),
    ).toBe(true)
    expect(events).toEqual([
      {
        type: 'started',
        eventId: worldEvents[0].id,
        definitionId: worldEvents[0].definitionId,
        dayNumber: 4,
      },
    ])
  })

  it('does not start a second event while one is active', () => {
    const active = buildActiveEvent()
    const seed = findSeedForStartRoll(10, true)
    const { worldEvents, events } = prepareWorldEventsForDay({
      campaignSeed: seed,
      dayNumber: 10,
      worldEvents: [active],
      tavernRank: 1,
    })
    expect(worldEvents).toEqual([active])
    expect(events).toHaveLength(0)
  })

  it('does not start a new event during the post-event cooldown window', () => {
    const ended: WorldEventState = {
      ...buildActiveEvent(),
      status: 'contained',
      endedDay: 6,
      responsePoints: WORLD_EVENT_CONFIG.responseTarget,
    }
    for (
      let day = ended.endedDay! + 1;
      day <= ended.endedDay! + WORLD_EVENT_CONFIG.cooldownDays;
      day++
    ) {
      const seed = findSeedForStartRoll(day, true)
      const { worldEvents, events } = prepareWorldEventsForDay({
        campaignSeed: seed,
        dayNumber: day,
        worldEvents: [ended],
        tavernRank: 1,
      })
      expect(worldEvents).toEqual([ended])
      expect(events).toHaveLength(0)
    }
  })

  it('allows a new event once the cooldown window has elapsed', () => {
    const ended: WorldEventState = {
      ...buildActiveEvent(),
      status: 'unresolved',
      endedDay: 6,
      responsePoints: 1,
    }
    const eligibleDay = ended.endedDay! + WORLD_EVENT_CONFIG.cooldownDays + 1
    const seed = findSeedForStartRoll(eligibleDay, true)
    const { worldEvents } = prepareWorldEventsForDay({
      campaignSeed: seed,
      dayNumber: eligibleDay,
      worldEvents: [ended],
      tavernRank: 1,
    })
    expect(worldEvents).toHaveLength(2)
    expect(worldEvents[1].status).toBe('active')
    expect(worldEvents[1].startedDay).toBe(eligibleDay)
  })

  it('avoids immediately repeating the same definition when another is available', () => {
    for (let trial = 0; trial < 50; trial++) {
      const ended: WorldEventState = {
        ...buildActiveEvent({ definitionId: 'monster_migration' }),
        status: 'contained',
        endedDay: 6,
        responsePoints: WORLD_EVENT_CONFIG.responseTarget,
      }
      const eligibleDay = ended.endedDay! + WORLD_EVENT_CONFIG.cooldownDays + 1
      const seed = `world-event-diversity-${trial}`
      const { worldEvents } = prepareWorldEventsForDay({
        campaignSeed: seed,
        dayNumber: eligibleDay,
        worldEvents: [ended],
        tavernRank: 1,
      })
      const started = worldEvents.find((e) => e.status === 'active')
      if (started) {
        expect(started.definitionId).not.toBe('monster_migration')
      }
    }
  })

  it('a losing roll starts nothing', () => {
    const seed = findSeedForStartRoll(4, false)
    const { worldEvents, events } = prepareWorldEventsForDay({
      campaignSeed: seed,
      dayNumber: 4,
      worldEvents: [],
      tavernRank: 1,
    })
    expect(worldEvents).toHaveLength(0)
    expect(events).toHaveLength(0)
  })
})

describe('Phase 9.7 planWorldEventRequestRank (unit)', () => {
  it('is one tier below the Tavern Rank max quest rank, clamped at E', () => {
    expect(planWorldEventRequestRank(1)).toBe('E') // max D -> one below clamps to E
    expect(planWorldEventRequestRank(2)).toBe('D') // max C -> D
    expect(planWorldEventRequestRank(3)).toBe('C') // max B -> C
    expect(planWorldEventRequestRank(4)).toBe('B') // max A -> B
    expect(planWorldEventRequestRank(5)).toBe('A') // max S -> A
  })
})

describe('Phase 9.7 buildWorldEventRequestForDay / collectDueEventRequest (unit)', () => {
  it('builds the correct objective sequence for monster_migration', () => {
    const event = buildActiveEvent({ definitionId: 'monster_migration' })
    const day1 = buildWorldEventRequestForDay(event, 4)
    const day2 = buildWorldEventRequestForDay(event, 5)
    const day3 = buildWorldEventRequestForDay(event, 6)
    expect(day1.objectiveType).toBe('investigation')
    expect(day2.objectiveType).toBe('elimination')
    expect(day3.objectiveType).toBe('rescue')
    expect(day1.worldEvent).toEqual({
      eventId: event.id,
      definitionId: 'monster_migration',
      dayIndex: 1,
      totalDays: 3,
    })
    expect(day2.worldEvent?.dayIndex).toBe(2)
    expect(day3.worldEvent?.dayIndex).toBe(3)
    expect(day1.id).toBe(buildWorldEventRequestId(event.id, 4))
    expect(day1.chain).toBeUndefined()
  })

  it('is a pure function of (event, dayNumber) — deterministic across calls', () => {
    const event = buildActiveEvent()
    const a = buildWorldEventRequestForDay(event, 5)
    const b = buildWorldEventRequestForDay(event, 5)
    expect(a).toEqual(b)
  })

  it('collectDueEventRequest returns nothing when no event is active', () => {
    expect(collectDueEventRequest([], 5)).toEqual([])
  })

  it('collectDueEventRequest returns nothing outside the impact window', () => {
    const event = buildActiveEvent()
    expect(collectDueEventRequest([event], 3)).toEqual([])
    expect(collectDueEventRequest([event], 7)).toEqual([])
  })

  it('collectDueEventRequest returns exactly one request within the window', () => {
    const event = buildActiveEvent()
    const due = collectDueEventRequest([event], 5)
    expect(due).toHaveLength(1)
    expect(due[0].worldEvent?.dayIndex).toBe(2)
  })
})

describe('Phase 9.7.1 Event Request <-> Definition contextual alignment', () => {
  it('every Definition/day produces a request whose objective matches the Definition', () => {
    for (const definition of WORLD_EVENT_DEFINITIONS) {
      const event = buildActiveEvent({ definitionId: definition.id })
      for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
        const dayNumber = event.startedDay + dayOffset
        const request = buildWorldEventRequestForDay(event, dayNumber)
        expect(request.objectiveType).toBe(
          definition.requests[dayOffset].objective,
        )
      }
    }
  })

  it('flooded_routes never produces a cave/mine Survey (the exact bug this phase fixes)', () => {
    const event = buildActiveEvent({ definitionId: 'flooded_routes' })
    const day1 = buildWorldEventRequestForDay(event, event.startedDay)
    expect(day1.objectiveType).toBe('survey')
    expect(day1.environment).not.toBe('cave')
    expect(day1.environment).not.toBe('mountain')
    expect(day1.title).not.toContain('坑道')
    expect(day1.title).not.toContain('洞窟')
  })

  it('flooded_routes requests are contextually about flooding/roads across all 3 days', () => {
    const event = buildActiveEvent({ definitionId: 'flooded_routes' })
    for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
      const request = buildWorldEventRequestForDay(
        event,
        event.startedDay + dayOffset,
      )
      expect(request.environment).not.toBe('cave')
      expect(request.environment).not.toBe('mountain')
    }
  })

  it('exposed_ruins requests use the ruins environment across all 3 days', () => {
    const event = buildActiveEvent({ definitionId: 'exposed_ruins' })
    for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
      const request = buildWorldEventRequestForDay(
        event,
        event.startedDay + dayOffset,
      )
      expect(request.environment).toBe('ruins')
    }
  })

  it('missing_caravans requests never mention monsters/ruins in the title (stays about caravans)', () => {
    const event = buildActiveEvent({ definitionId: 'missing_caravans' })
    for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
      const request = buildWorldEventRequestForDay(
        event,
        event.startedDay + dayOffset,
      )
      expect(request.environment).not.toBe('ruins')
    }
  })

  it('template selection stays deterministic per (event, day) across every Definition', () => {
    for (const definition of WORLD_EVENT_DEFINITIONS) {
      const event = buildActiveEvent({ definitionId: definition.id })
      for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
        const dayNumber = event.startedDay + dayOffset
        const a = buildWorldEventRequestForDay(event, dayNumber)
        const b = buildWorldEventRequestForDay(event, dayNumber)
        expect(a).toEqual(b)
      }
    }
  })
})

describe('Phase 9.7 resolveWorldEventsForDay (unit)', () => {
  it('response points: completeSuccess/success=2, partialSuccess=1, failure=0, notBrokered=0', () => {
    expect(WORLD_EVENT_RESPONSE_POINTS.completeSuccess).toBe(2)
    expect(WORLD_EVENT_RESPONSE_POINTS.success).toBe(2)
    expect(WORLD_EVENT_RESPONSE_POINTS.partialSuccess).toBe(1)
    expect(WORLD_EVENT_RESPONSE_POINTS.failedObjective).toBe(0)
    expect(WORLD_EVENT_RESPONSE_POINTS.forcedRetreat).toBe(0)
    expect(WORLD_EVENT_RESPONSE_POINTS.lostExpedition).toBe(0)
  })

  it('advances response points on a success and stays active below target', () => {
    const event = buildActiveEvent({ responsePoints: 0 })
    const requestId = buildWorldEventRequestId(event.id, 4)
    const { worldEvents, events } = resolveWorldEventsForDay({
      dayNumber: 4,
      worldEvents: [event],
      results: [
        buildResolvedDispatch({
          requestId,
          request: {
            worldEvent: buildWorldEventRequestForDay(event, 4).worldEvent,
          },
          result: { outcome: 'success' } as never,
        }),
      ],
    })
    expect(worldEvents[0].status).toBe('active')
    expect(worldEvents[0].responsePoints).toBe(2)
    expect(events).toEqual([
      {
        type: 'response',
        eventId: event.id,
        requestId,
        dayNumber: 4,
        delta: 2,
        responsePointsAfter: 2,
      },
    ])
  })

  it('notBrokered yields delta 0', () => {
    const event = buildActiveEvent({ responsePoints: 1 })
    const requestId = buildWorldEventRequestId(event.id, 4)
    const { worldEvents, events } = resolveWorldEventsForDay({
      dayNumber: 4,
      worldEvents: [event],
      results: [
        {
          requestId,
          request: buildWorldEventRequestForDay(event, 4),
          memberIds: [],
          status: 'notBrokered',
        },
      ],
    })
    expect(worldEvents[0].responsePoints).toBe(1)
    expect(events[0]).toMatchObject({ type: 'response', delta: 0 })
  })

  it('early containment: reaching the target ends the event immediately with contained status', () => {
    let event = buildActiveEvent({ responsePoints: 0 })
    const day4 = resolveWorldEventsForDay({
      dayNumber: 4,
      worldEvents: [event],
      results: [
        buildResolvedDispatch({
          requestId: buildWorldEventRequestId(event.id, 4),
          request: {
            worldEvent: buildWorldEventRequestForDay(event, 4).worldEvent,
          },
          result: { outcome: 'success' } as never,
        }),
      ],
    })
    event = day4.worldEvents[0]
    expect(event.status).toBe('active')
    expect(event.responsePoints).toBe(2)

    const day5 = resolveWorldEventsForDay({
      dayNumber: 5,
      worldEvents: [event],
      results: [
        buildResolvedDispatch({
          requestId: buildWorldEventRequestId(event.id, 5),
          request: {
            worldEvent: buildWorldEventRequestForDay(event, 5).worldEvent,
          },
          result: { outcome: 'completeSuccess' } as never,
        }),
      ],
    })
    expect(day5.worldEvents[0].status).toBe('contained')
    expect(day5.worldEvents[0].endedDay).toBe(5)
    expect(day5.worldEvents[0].responsePoints).toBe(4)
    expect(day5.events.map((e) => e.type)).toEqual(['response', 'contained'])
    // Once contained, no further request is due.
    expect(collectDueEventRequest(day5.worldEvents, 6)).toEqual([])
  })

  it('mixed partial/success/partial reaches containment exactly on day 3', () => {
    let events: WorldEventState[] = [buildActiveEvent({ responsePoints: 0 })]
    const outcomes: [number, string][] = [
      [4, 'partialSuccess'],
      [5, 'success'],
      [6, 'partialSuccess'],
    ]
    let lastEventTypes: string[] = []
    for (const [day, outcome] of outcomes) {
      const active = events.find((e) => e.status === 'active')!
      const result = resolveWorldEventsForDay({
        dayNumber: day,
        worldEvents: events,
        results: [
          buildResolvedDispatch({
            requestId: buildWorldEventRequestId(active.id, day),
            request: {
              worldEvent: buildWorldEventRequestForDay(active, day).worldEvent,
            },
            result: { outcome } as never,
          }),
        ],
      })
      events = result.worldEvents
      lastEventTypes = result.events.map((e) => e.type)
    }
    const final = events[0]
    expect(final.responsePoints).toBe(4)
    expect(final.status).toBe('contained')
    expect(final.endedDay).toBe(6)
    expect(lastEventTypes).toEqual(['response', 'contained'])
  })

  it('an uncontained event becomes unresolved at the end of its planned window', () => {
    let events: WorldEventState[] = [buildActiveEvent({ responsePoints: 0 })]
    const outcomes: [number, string][] = [
      [4, 'failedObjective'],
      [5, 'partialSuccess'],
      [6, 'failedObjective'],
    ]
    let lastEventTypes: string[] = []
    for (const [day, outcome] of outcomes) {
      const active = events.find((e) => e.status === 'active')!
      const result = resolveWorldEventsForDay({
        dayNumber: day,
        worldEvents: events,
        results: [
          buildResolvedDispatch({
            requestId: buildWorldEventRequestId(active.id, day),
            request: {
              worldEvent: buildWorldEventRequestForDay(active, day).worldEvent,
            },
            result: { outcome } as never,
          }),
        ],
      })
      events = result.worldEvents
      lastEventTypes = result.events.map((e) => e.type)
    }
    const final = events[0]
    expect(final.responsePoints).toBe(1)
    expect(final.status).toBe('unresolved')
    expect(final.endedDay).toBe(6)
    expect(lastEventTypes).toEqual(['response', 'unresolved'])
  })

  it('does nothing when there is no active event', () => {
    const { worldEvents, events } = resolveWorldEventsForDay({
      dayNumber: 5,
      worldEvents: [],
      results: [],
    })
    expect(worldEvents).toEqual([])
    expect(events).toEqual([])
  })
})
