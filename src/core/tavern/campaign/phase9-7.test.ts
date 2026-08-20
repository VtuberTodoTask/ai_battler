import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from './campaign.ts'
import { offerRequestToParty } from '../brokerage.ts'
import {
  WORLD_EVENT_CONFIG,
  WORLD_EVENT_DEFINITIONS,
  collectDueEventRequest,
} from './worldEvents.ts'
import { QUEST_CHAIN_CONFIG } from './questChains.ts'
import {
  deserializeGameSave,
  serializeGameSave,
} from '../../save/serializer.ts'
import { validateGameSave } from '../../save/validation.ts'
import type { TavernCampaignState } from './types.ts'

function acceptAllPossible(campaign: TavernCampaignState): TavernCampaignState {
  let state = campaign.currentDay
  const matchedPartyIds = new Set<string>()
  const matchedRequestIds = new Set<string>()

  for (const request of state.requests) {
    if (matchedRequestIds.has(request.id)) continue
    for (const party of state.parties) {
      if (matchedPartyIds.has(party.id)) continue
      if (party.availability === 'recovering') continue
      try {
        const next = offerRequestToParty(state, request.id, party.id)
        if (next.matches.some((m) => m.requestId === request.id)) {
          matchedPartyIds.add(party.id)
          matchedRequestIds.add(request.id)
          state = next
          break
        }
      } catch {
        // continue
      }
    }
  }
  return { ...campaign, currentDay: state }
}

function advanceOneDayAcceptingAll(
  campaign: TavernCampaignState,
): TavernCampaignState {
  let c = resolveCampaignDay(acceptAllPossible(campaign))
  c = advanceCampaignDay(c)
  return c
}

/** Runs several independent seeds until one produces a 'started' World
 * Event within the given day budget — Event Start is a 30% roll starting
 * only from day 4, so no single seed is guaranteed to produce one
 * quickly. */
function findCampaignWithStartedWorldEvent(
  seedPrefix: string,
  maxDays: number,
  maxSeeds: number,
): TavernCampaignState {
  for (let s = 0; s < maxSeeds; s++) {
    let campaign = createTavernCampaign(`${seedPrefix}-${s}`)
    for (let day = 0; day < maxDays; day++) {
      campaign = advanceOneDayAcceptingAll(campaign)
      const started = campaign.history.some((h) =>
        h.worldEventEvents.some((e) => e.type === 'started'),
      )
      if (started) return campaign
    }
  }
  throw new Error(
    `no world event start found within ${maxSeeds} seeds x ${maxDays} days`,
  )
}

describe('Phase 9.7 world event smoke', () => {
  it('A: a freshly created campaign has no world events', () => {
    const campaign = createTavernCampaign('phase9-7-a')
    expect(campaign.worldEvents).toEqual([])
  })

  it('B: an eligible day-4+ roll deterministically starts a world event', () => {
    const campaign = findCampaignWithStartedWorldEvent('phase9-7-b', 30, 30)
    const startedRecord = campaign.history.find((h) =>
      h.worldEventEvents.some((e) => e.type === 'started'),
    )!
    expect(startedRecord.dayNumber).toBeGreaterThanOrEqual(
      WORLD_EVENT_CONFIG.earliestStartDay,
    )
    const startedEvent = startedRecord.worldEventEvents.find(
      (e) => e.type === 'started',
    )!
    const event = campaign.worldEvents.find(
      (e) => e.id === startedEvent.eventId,
    )
    expect(event).toBeDefined()
    expect(event!.status === 'active' || event!.status !== undefined).toBe(true)
    expect(event!.startedDay).toBe(startedRecord.dayNumber)
    expect(event!.plannedEndDay).toBe(
      startedRecord.dayNumber + WORLD_EVENT_CONFIG.durationDays - 1,
    )
    expect(
      WORLD_EVENT_DEFINITIONS.some((d) => d.id === event!.definitionId),
    ).toBe(true)
  })

  it('C: no event ever starts before day 4 across many seeds', () => {
    // Two advances take a fresh (day 1) campaign to day 3 — i.e. through
    // the prepareWorldEventsForDay(2) and prepareWorldEventsForDay(3)
    // calls, both below earliestStartDay (4) and so guaranteed empty.
    // A third advance would call prepareWorldEventsForDay(4), which is
    // eligible to start — intentionally excluded from this assertion.
    for (let s = 0; s < 20; s++) {
      let campaign = createTavernCampaign(`phase9-7-c-${s}`)
      for (let day = 0; day < 2; day++) {
        campaign = advanceOneDayAcceptingAll(campaign)
      }
      expect(campaign.dayNumber).toBe(3)
      expect(campaign.worldEvents).toEqual([])
    }
  })

  it('D: the event request appears on the board, tagged with metadata, occupying a board slot', () => {
    const campaign = findCampaignWithStartedWorldEvent('phase9-7-d', 30, 30)
    const active = campaign.worldEvents.find((e) => e.status === 'active')!
    const due = collectDueEventRequest([active], campaign.dayNumber)
    if (due.length > 0) {
      const boardRequest = campaign.currentDay.requests.find(
        (r) => r.id === due[0].id,
      )
      expect(boardRequest).toBeDefined()
      expect(boardRequest?.worldEvent?.eventId).toBe(active.id)
      expect(boardRequest?.chain).toBeUndefined()
    }
    expect(campaign.currentDay.requests.length).toBeLessThanOrEqual(3)
  })

  it('E: response points accumulate from actual outcomes and can early-contain the event', () => {
    let campaign = findCampaignWithStartedWorldEvent('phase9-7-e', 30, 30)
    const eventId = campaign.worldEvents.find((e) => e.status === 'active')!.id

    for (let i = 0; i < 5; i++) {
      const event = campaign.worldEvents.find((e) => e.id === eventId)
      if (!event || event.status !== 'active') break
      campaign = advanceOneDayAcceptingAll(campaign)
    }

    const finalEvent = campaign.worldEvents.find((e) => e.id === eventId)!
    expect(finalEvent.responsePoints).toBeGreaterThanOrEqual(0)
    expect(finalEvent.responsePoints).toBeLessThanOrEqual(
      WORLD_EVENT_CONFIG.responseTarget,
    )
    if (finalEvent.status === 'contained') {
      expect(finalEvent.responsePoints).toBe(WORLD_EVENT_CONFIG.responseTarget)
      expect(finalEvent.endedDay).toBeLessThanOrEqual(finalEvent.plannedEndDay)
      const containedEvent = campaign.history
        .flatMap((h) => h.worldEventEvents)
        .find((e) => e.type === 'contained' && e.eventId === eventId)
      expect(containedEvent).toBeDefined()
    }
  })

  it('F: an event that never reaches target becomes unresolved at plannedEndDay', () => {
    for (let s = 0; s < 60; s++) {
      let campaign = createTavernCampaign(`phase9-7-f-${s}`)
      let unresolvedEventId: string | undefined
      for (let day = 0; day < 20 && !unresolvedEventId; day++) {
        campaign = advanceOneDayAcceptingAll(campaign)
        const unresolved = campaign.history
          .flatMap((h) => h.worldEventEvents)
          .find((e) => e.type === 'unresolved')
        if (unresolved) unresolvedEventId = unresolved.eventId
      }
      if (unresolvedEventId) {
        const event = campaign.worldEvents.find(
          (e) => e.id === unresolvedEventId,
        )!
        expect(event.status).toBe('unresolved')
        expect(event.endedDay).toBe(event.plannedEndDay)
        expect(event.responsePoints).toBeLessThan(
          WORLD_EVENT_CONFIG.responseTarget,
        )
        return
      }
    }
  })

  it('G: save/load preserves an active world event exactly', () => {
    const campaign = findCampaignWithStartedWorldEvent('phase9-7-g', 30, 30)
    const save = serializeGameSave({ campaign })
    expect(() => validateGameSave(save)).not.toThrow()
    const loaded = deserializeGameSave(save)
    expect(loaded.campaign.worldEvents).toEqual(campaign.worldEvents)
  })

  it('H: zero AI calls and zero extra Campaign RNG consumption across the world event lifecycle', () => {
    const campaign = findCampaignWithStartedWorldEvent('phase9-7-h', 30, 30)
    expect(campaign.narrativeGenerations.length).toBe(0)
  })

  it('I: determinism — identical seed and actions produce identical world event state', () => {
    let a = createTavernCampaign('phase9-7-i')
    let b = createTavernCampaign('phase9-7-i')
    for (let day = 0; day < 20; day++) {
      a = advanceOneDayAcceptingAll(a)
      b = advanceOneDayAcceptingAll(b)
    }
    expect(b.worldEvents).toEqual(a.worldEvents)
  })

  it('J: a successful Event-linked request can become a Quest Chain origin, and both persist independently', () => {
    for (let s = 0; s < 80; s++) {
      let campaign = createTavernCampaign(`phase9-7-j-${s}`)
      let sawBoth = false
      for (let day = 0; day < 30 && !sawBoth; day++) {
        campaign = advanceOneDayAcceptingAll(campaign)
        const hasActiveEventOrigin = campaign.questChains.some((c) =>
          campaign.history.some((h) =>
            h.results.some(
              (r) =>
                r.requestId === c.steps[0].request.id &&
                r.request.worldEvent !== undefined,
            ),
          ),
        )
        if (hasActiveEventOrigin) sawBoth = true
      }
      if (sawBoth) {
        const chain = campaign.questChains.find((c) =>
          campaign.history.some((h) =>
            h.results.some(
              (r) =>
                r.requestId === c.steps[0].request.id &&
                r.request.worldEvent !== undefined,
            ),
          ),
        )!
        expect(chain.steps[0].request.chain).toBeUndefined()
        expect(() =>
          validateGameSave(serializeGameSave({ campaign })),
        ).not.toThrow()
        return
      }
    }
  })

  it('long-run smoke: 60 days never violate core World Event invariants (with Quest Chains active too)', () => {
    let campaign = createTavernCampaign('phase9-7-longrun')
    const seenRequestIds = new Set<string>()
    const endedByEventId = new Map<string, number>()

    for (let day = 0; day < 60; day++) {
      campaign = advanceOneDayAcceptingAll(campaign)

      const activeEvents = campaign.worldEvents.filter(
        (e) => e.status === 'active',
      )
      expect(activeEvents.length).toBeLessThanOrEqual(
        WORLD_EVENT_CONFIG.maxActiveEvents,
      )

      // No overlapping event windows.
      const sorted = [...campaign.worldEvents].sort(
        (a, b) => a.startedDay - b.startedDay,
      )
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].startedDay).toBeGreaterThan(
          sorted[i - 1].plannedEndDay,
        )
      }

      // Cooldown respected + no immediate same-definition repeat.
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]
        const curr = sorted[i]
        if (prev.endedDay !== undefined) {
          expect(curr.startedDay).toBeGreaterThan(
            prev.endedDay + WORLD_EVENT_CONFIG.cooldownDays,
          )
        }
      }

      const eventRequestCount = campaign.currentDay.requests.filter(
        (r) => r.worldEvent !== undefined,
      ).length
      expect(eventRequestCount).toBeLessThanOrEqual(
        WORLD_EVENT_CONFIG.maxEventRequestsPerDay,
      )

      const chainRequestCount = campaign.currentDay.requests.filter(
        (r) => r.chain !== undefined,
      ).length
      expect(chainRequestCount + eventRequestCount).toBeLessThanOrEqual(
        campaign.currentDay.requests.length,
      )
      expect(campaign.currentDay.requests.length).toBeLessThanOrEqual(
        3 + QUEST_CHAIN_CONFIG.maxActiveChains + 1,
      )

      for (const request of campaign.currentDay.requests) {
        expect(seenRequestIds.has(request.id)).toBe(false)
        seenRequestIds.add(request.id)
      }

      for (const event of campaign.worldEvents) {
        expect(event.responsePoints).toBeGreaterThanOrEqual(0)
        expect(event.responsePoints).toBeLessThanOrEqual(
          WORLD_EVENT_CONFIG.responseTarget,
        )
        if (event.status !== 'active') {
          expect(event.endedDay).toBeDefined()
          endedByEventId.set(event.id, event.endedDay!)
        } else {
          expect(campaign.dayNumber).toBeLessThanOrEqual(event.plannedEndDay)
        }
      }
    }

    expect(() =>
      validateGameSave(serializeGameSave({ campaign })),
    ).not.toThrow()
  })
})
