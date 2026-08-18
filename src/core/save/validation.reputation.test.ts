import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../tavern/brokerage.ts'
import { buildQuestReputationEventId } from '../tavern/campaign/reputation.ts'
import { serializeGameSave } from './serializer.ts'
import { SaveValidationErrorClass, validateGameSave } from './validation.ts'

function findAcceptingPair(campaign: ReturnType<typeof createTavernCampaign>) {
  for (const request of campaign.currentDay.requests) {
    for (const party of campaign.currentDay.parties) {
      const next = offerRequestToParty(
        campaign.currentDay,
        request.id,
        party.id,
      )
      if (next.matches.some((m) => m.requestId === request.id)) {
        return { requestId: request.id, partyId: party.id, next }
      }
    }
  }
  return null
}

function resolveFirstAcceptingPair(seed: string) {
  let campaign = createTavernCampaign(seed)
  const pair = findAcceptingPair(campaign)
  if (!pair) throw new Error(`No accepting pair found for seed ${seed}`)
  campaign = { ...campaign, currentDay: pair.next }
  campaign = resolveCampaignDay(campaign)
  campaign = advanceCampaignDay(campaign)
  return campaign
}

function makeSave(seed: string) {
  return serializeGameSave({ campaign: resolveFirstAcceptingPair(seed) })
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function findReputationEvent(save: ReturnType<typeof makeSave>) {
  return save.campaign.reputation.events[0]
}

describe('save reputation validation', () => {
  it('valid campaign with a resolved expedition is accepted', () => {
    const save = makeSave('reputation-valid')
    expect(() => validateGameSave(save)).not.toThrow()
    expect(save.campaign.reputation.events).toHaveLength(1)
  })

  it('new campaign has zero score, zero peak and no events', () => {
    const save = serializeGameSave({
      campaign: createTavernCampaign('reputation-new'),
    })
    expect(save.campaign.reputation.score).toBe(0)
    expect(save.campaign.reputation.peakScore).toBe(0)
    expect(save.campaign.reputation.events).toEqual([])
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('score that is not a finite integer is rejected', () => {
    const save = makeSave('reputation-nan-score')
    const bad = clone(save)
    ;(bad.campaign.reputation as { score: unknown }).score = Number.NaN
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('non-integer score is rejected', () => {
    const save = makeSave('reputation-fractional-score')
    const bad = clone(save)
    bad.campaign.reputation.score += 0.5
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('negative peak score is rejected', () => {
    const save = makeSave('reputation-negative-peak')
    const bad = clone(save)
    bad.campaign.reputation.peakScore = -1
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('peak score below current score is rejected', () => {
    const save = makeSave('reputation-peak-below-score')
    const bad = clone(save)
    bad.campaign.reputation.peakScore = bad.campaign.reputation.score - 1
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('duplicate reputation event id is rejected', () => {
    const save = makeSave('reputation-duplicate-event')
    const bad = clone(save)
    const event = findReputationEvent(bad)
    bad.campaign.reputation.events.push({ ...event })
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('reputation event with wrong delta is rejected', () => {
    const save = makeSave('reputation-wrong-delta')
    const bad = clone(save)
    const event = findReputationEvent(bad)
    event.delta += 1
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('reputation event with wrong requestId is rejected', () => {
    const save = makeSave('reputation-wrong-requestId')
    const bad = clone(save)
    const event = findReputationEvent(bad)
    event.source.requestId = 'other-request'
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('reputation event with wrong partyId is rejected', () => {
    const save = makeSave('reputation-wrong-partyId')
    const bad = clone(save)
    const event = findReputationEvent(bad)
    event.source.partyId = 'other-party'
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('reputation event id must match computed id from source fields', () => {
    const save = makeSave('reputation-id-mismatch')
    const bad = clone(save)
    const event = findReputationEvent(bad)
    event.id = 'custom-reputation-id'
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('orphan reputation event with no matching expedition is rejected', () => {
    const save = makeSave('reputation-orphan')
    const bad = clone(save)
    bad.campaign.reputation.events.push({
      id: buildQuestReputationEventId(999, 'fake-request', 'fake-party'),
      day: 999,
      kind: 'quest_outcome',
      delta: 5,
      source: {
        type: 'expedition',
        requestId: 'fake-request',
        partyId: 'fake-party',
      },
    })
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('missing reputation event for a resolved expedition is rejected', () => {
    const save = makeSave('reputation-missing-event')
    const bad = clone(save)
    bad.campaign.reputation.events = []
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('extra reputation event beyond the resolved expeditions is rejected', () => {
    const save = makeSave('reputation-extra-event')
    const bad = clone(save)
    const event = findReputationEvent(bad)
    bad.campaign.reputation.events.push({
      ...event,
      id: buildQuestReputationEventId(
        event.day,
        event.source.requestId,
        'a-second-party',
      ),
      source: { ...event.source, partyId: 'a-second-party' },
    })
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('score mismatch with event total is rejected', () => {
    const save = makeSave('reputation-score-mismatch')
    const bad = clone(save)
    bad.campaign.reputation.score += 1
    bad.campaign.reputation.peakScore += 1
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('peak mismatch with day-replay result is rejected', () => {
    const save = makeSave('reputation-peak-mismatch')
    const bad = clone(save)
    bad.campaign.reputation.peakScore += 10
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('day reputationSummary that disagrees with events is rejected', () => {
    const save = makeSave('reputation-summary-mismatch')
    const bad = clone(save)
    bad.campaign.history[0].reputationSummary.delta += 1
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('a notBrokered request must not have a reputation event', () => {
    // Find a seed whose first day includes an unbrokered (unmatched) request.
    let campaign = createTavernCampaign('reputation-not-brokered')
    campaign = resolveCampaignDay(campaign)
    const notBrokered = campaign.currentDay.results.find(
      (r) => r.status === 'notBrokered',
    )
    expect(notBrokered).toBeDefined()
    if (!notBrokered) return

    campaign = advanceCampaignDay(campaign)
    const save = serializeGameSave({ campaign })
    expect(() => validateGameSave(save)).not.toThrow()

    const bad = clone(save)
    bad.campaign.reputation.events.push({
      id: buildQuestReputationEventId(1, notBrokered.requestId, 'fake-party'),
      day: 1,
      kind: 'quest_outcome',
      delta: 5,
      source: {
        type: 'expedition',
        requestId: notBrokered.requestId,
        partyId: 'fake-party',
      },
    })
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })
})
