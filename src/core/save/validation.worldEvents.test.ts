import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../tavern/brokerage.ts'
import { WORLD_EVENT_CONFIG } from '../tavern/campaign/worldEvents.ts'
import { buildLedgerEntryId } from '../economy/finance.ts'
import { computeQuestSettlement } from '../economy/questReward.ts'
import { serializeGameSave } from './serializer.ts'
import { SaveValidationErrorClass, validateGameSave } from './validation.ts'
import type { TavernCampaignState } from '../tavern/campaign/types.ts'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

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

/** Finds a campaign with an active World Event whose request is due on
 * the current planning day, within a bounded search. */
function fixtureSaveWithActiveWorldEvent(seedPrefix: string) {
  for (let s = 0; s < 60; s++) {
    let campaign = createTavernCampaign(`${seedPrefix}-${s}`)
    for (let day = 0; day < 30; day++) {
      campaign = advanceOneDayAcceptingAll(campaign)
      const active = campaign.worldEvents.find((e) => e.status === 'active')
      if (
        active &&
        campaign.currentDay.requests.some((r) => r.worldEvent !== undefined)
      ) {
        return {
          save: clone(serializeGameSave({ campaign })),
          eventId: active.id,
        }
      }
    }
  }
  throw new Error(`no active world event found for seed prefix ${seedPrefix}`)
}

/** Finds a campaign whose history contains at least one already-RESOLVED
 * Event-linked request (a day where resolveWorldEventsForDay actually
 * produced a response), returning that day/requestId so a test can
 * tamper the frozen historical request. */
function fixtureSaveWithResolvedEventFollowUp(seedPrefix: string) {
  for (let s = 0; s < 60; s++) {
    let campaign = createTavernCampaign(`${seedPrefix}-${s}`)
    for (let day = 0; day < 30; day++) {
      campaign = advanceOneDayAcceptingAll(campaign)
      const record = campaign.history[campaign.history.length - 1]
      const eventResult = record.results.find(
        (r) =>
          r.status === 'resolved' &&
          r.request.worldEvent !== undefined &&
          r.settlement !== undefined &&
          r.settlement.tavernCommission > 0,
      )
      if (eventResult && eventResult.status === 'resolved') {
        return {
          save: clone(serializeGameSave({ campaign })),
          dayNumber: record.dayNumber,
          requestId: eventResult.requestId,
          partyId: eventResult.partyId,
          outcome: eventResult.result!.outcome,
        }
      }
    }
  }
  throw new Error(
    `no resolved event follow-up found for seed prefix ${seedPrefix}`,
  )
}

function findHistoryResult(
  save: ReturnType<typeof serializeGameSave>,
  dayNumber: number,
  requestId: string,
) {
  const record = save.campaign.history.find((h) => h.dayNumber === dayNumber)!
  const result = record.results.find((r) => r.requestId === requestId)!
  return { record, result }
}

describe('save validation: world events (Phase 9.7)', () => {
  it('accepts a fresh campaign (no world events)', () => {
    const save = clone(
      serializeGameSave({ campaign: createTavernCampaign('event-fresh') }),
    )
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('accepts a genuinely-generated save with an active world event', () => {
    const { save } = fixtureSaveWithActiveWorldEvent('event-valid')
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('rejects an unknown world event definition id', () => {
    const { save, eventId } =
      fixtureSaveWithActiveWorldEvent('event-unknown-def')
    const event = save.campaign.worldEvents.find((e) => e.id === eventId)!
    // @ts-expect-error intentionally corrupting for the test
    event.definitionId = 'does-not-exist'
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a duplicate world event entry', () => {
    const { save, eventId } = fixtureSaveWithActiveWorldEvent('event-dup-id')
    const event = save.campaign.worldEvents.find((e) => e.id === eventId)!
    save.campaign.worldEvents.push(clone(event))
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a fake containment (target not actually reached)', () => {
    const { save, eventId } =
      fixtureSaveWithActiveWorldEvent('event-fake-contain')
    const event = save.campaign.worldEvents.find((e) => e.id === eventId)!
    event.status = 'contained'
    event.endedDay = save.campaign.dayNumber
    event.responsePoints = WORLD_EVENT_CONFIG.responseTarget
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a fake unresolved status before plannedEndDay', () => {
    const { save, eventId } = fixtureSaveWithActiveWorldEvent(
      'event-fake-unresolved',
    )
    const event = save.campaign.worldEvents.find((e) => e.id === eventId)!
    event.status = 'unresolved'
    event.endedDay = save.campaign.dayNumber
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a wrong plannedEndDay', () => {
    const { save, eventId } = fixtureSaveWithActiveWorldEvent('event-wrong-end')
    const event = save.campaign.worldEvents.find((e) => e.id === eventId)!
    event.plannedEndDay += 1
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a wrong frozen requestRank on the active event', () => {
    const { save, eventId } =
      fixtureSaveWithActiveWorldEvent('event-wrong-rank')
    const event = save.campaign.worldEvents.find((e) => e.id === eventId)!
    event.requestRank = event.requestRank === 'S' ? 'E' : 'S'
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects an active event whose request is missing from currentDay.requests', () => {
    const { save } = fixtureSaveWithActiveWorldEvent('event-missing-current')
    save.campaign.currentDay.requests =
      save.campaign.currentDay.requests.filter(
        (r) => r.worldEvent === undefined,
      )
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects an orphan world-event-tagged request with no matching active event', () => {
    const { save } = fixtureSaveWithActiveWorldEvent('event-orphan-current')
    const boardRequest = save.campaign.currentDay.requests.find(
      (r) => r.worldEvent !== undefined,
    )!
    const fake = clone(boardRequest)
    fake.id = `${fake.id}-orphan`
    fake.worldEvent = {
      eventId: 'world-event:9999:missing_caravans',
      definitionId: 'missing_caravans',
      dayIndex: 1,
      totalDays: 3,
    }
    save.campaign.currentDay.requests.push(fake)
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects wrong world event metadata (dayIndex) on the currentDay request', () => {
    const { save } = fixtureSaveWithActiveWorldEvent('event-wrong-meta')
    const boardRequest = save.campaign.currentDay.requests.find(
      (r) => r.worldEvent !== undefined,
    )!
    boardRequest.worldEvent = {
      ...boardRequest.worldEvent!,
      dayIndex: boardRequest.worldEvent!.dayIndex === 1 ? 2 : 1,
    }
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  describe('historical follow-up <-> frozen request integrity (Phase 9.7)', () => {
    it('accepts a genuinely-resolved historical event follow-up unmodified', () => {
      const { save } = fixtureSaveWithResolvedEventFollowUp('event-hist-ok')
      expect(() => validateGameSave(save)).not.toThrow()
    })

    it('rejects a tampered historical follow-up reward, even kept internally consistent', () => {
      const { save, dayNumber, requestId, partyId, outcome } =
        fixtureSaveWithResolvedEventFollowUp('event-hist-reward')
      const { result } = findHistoryResult(save, dayNumber, requestId)

      result.request.rewardTerms = {
        ...result.request.rewardTerms,
        promisedReward: result.request.rewardTerms.promisedReward + 500,
      }
      const newSettlement = computeQuestSettlement(
        result.request.rewardTerms,
        outcome,
      )
      result.settlement = newSettlement
      if (result.report?.settlement) {
        result.report.settlement = newSettlement
      }
      const ledgerId = buildLedgerEntryId(dayNumber, requestId, partyId!)
      const ledgerEntry = save.campaign.finance.ledgerEntries.find(
        (e) => e.id === ledgerId,
      )
      if (ledgerEntry) {
        const delta = newSettlement.tavernCommission - ledgerEntry.amount
        ledgerEntry.amount = newSettlement.tavernCommission
        save.campaign.finance.funds += delta
      }

      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects a tampered historical follow-up objective', () => {
      const { save, dayNumber, requestId } =
        fixtureSaveWithResolvedEventFollowUp('event-hist-objective')
      const { result } = findHistoryResult(save, dayNumber, requestId)
      result.request.objectiveType =
        result.request.objectiveType === 'elimination'
          ? 'escort'
          : 'elimination'
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects a tampered historical follow-up rank', () => {
      const { save, dayNumber, requestId } =
        fixtureSaveWithResolvedEventFollowUp('event-hist-rank')
      const { result } = findHistoryResult(save, dayNumber, requestId)
      result.request.rank = result.request.rank === 'S' ? 'E' : 'S'
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects tampered historical world event metadata (dayIndex)', () => {
      const { save, dayNumber, requestId } =
        fixtureSaveWithResolvedEventFollowUp('event-hist-metadata')
      const { result } = findHistoryResult(save, dayNumber, requestId)
      result.request.worldEvent = {
        ...result.request.worldEvent!,
        dayIndex: result.request.worldEvent!.dayIndex === 1 ? 2 : 1,
      }
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects an inner request.id that disagrees with the outer requestId', () => {
      const { save, dayNumber, requestId } =
        fixtureSaveWithResolvedEventFollowUp('event-hist-innerid')
      const { result } = findHistoryResult(save, dayNumber, requestId)
      result.request.id = `${requestId}-tampered`
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects a genuine follow-up result with its world event metadata stripped', () => {
      const { save, dayNumber, requestId } =
        fixtureSaveWithResolvedEventFollowUp('event-hist-strip')
      const { result } = findHistoryResult(save, dayNumber, requestId)
      delete (result.request as { worldEvent?: unknown }).worldEvent
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects a fabricated response event (points inflated beyond the true outcome)', () => {
      const { save, dayNumber, eventId } = (() => {
        const fixture = fixtureSaveWithResolvedEventFollowUp(
          'event-hist-fake-response',
        )
        const record = fixture.save.campaign.history.find(
          (h) => h.dayNumber === fixture.dayNumber,
        )!
        const responseEvent = record.worldEventEvents.find(
          (e) => e.type === 'response',
        )!
        return {
          save: fixture.save,
          dayNumber: fixture.dayNumber,
          eventId: responseEvent.eventId,
        }
      })()
      const record = save.campaign.history.find(
        (h) => h.dayNumber === dayNumber,
      )!
      const responseEvent = record.worldEventEvents.find(
        (e) => e.type === 'response' && e.eventId === eventId,
      )!
      if (responseEvent.type === 'response') {
        responseEvent.responsePointsAfter = WORLD_EVENT_CONFIG.responseTarget
        responseEvent.delta = WORLD_EVENT_CONFIG.responseTarget
      }
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })

    it('rejects a missing response WorldEventEvent for an active day', () => {
      const { save, dayNumber } = fixtureSaveWithResolvedEventFollowUp(
        'event-hist-missing-event',
      )
      const record = save.campaign.history.find(
        (h) => h.dayNumber === dayNumber,
      )!
      record.worldEventEvents = record.worldEventEvents.filter(
        (e) => e.type !== 'response',
      )
      expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
    })
  })

  it('atomic load: a malformed world event save is rejected without mutating stored raw data', async () => {
    const { save, eventId } = fixtureSaveWithActiveWorldEvent('event-atomic')
    const bad = clone(save)
    const event = bad.campaign.worldEvents.find((e) => e.id === eventId)!
    event.responsePoints = WORLD_EVENT_CONFIG.responseTarget

    const { InMemorySaveRepository } =
      await import('./inMemorySaveRepository.ts')
    const { loadFromSlot } = await import('./serializer.ts')
    const repo = new InMemorySaveRepository()
    repo.seed('slot-corrupt-event', bad as never)

    await expect(loadFromSlot(repo, 'slot-corrupt-event')).rejects.toThrow(
      SaveValidationErrorClass,
    )
    expect(repo.getRaw('slot-corrupt-event')).toEqual(bad)
  })
})
