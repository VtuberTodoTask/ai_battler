import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from './campaign.ts'
import { applyReturn, selectEligibleAwayParties } from './lifecycle.ts'
import { deepClone } from '../../util.ts'

/**
 * Builds a campaign directly at dayNumber=6 with a fully-formed injury /
 * incapacitation / status-effect fixture on the target party, so the
 * recovery-before-departure ordering (Phase 9.4.1 item #1) can be verified
 * without depending on 5 days of random churn to reach the same scenario.
 */
function campaignAtDaySixWithInjuredTarget(seed: string) {
  const campaign = deepClone(createTavernCampaign(seed))
  campaign.dayNumber = 6
  const target = campaign.parties[0]
  const partyId = target.id
  const member = target.party.members[0]
  const memberId = member.id

  target.plannedDepartureDay = 6
  target.recoveringThroughDay = 6
  // Zero affinity guarantees tryExtendStay's budget is 0, so the party
  // cannot extend its stay and departure is deterministic.
  target.relationship.affinity = 0

  member.currentHp = Math.max(1, member.maxHp - 5)
  member.currentMp = Math.max(1, member.maxMp - 5)
  member.statusEffects = [
    { type: 'poisoned', duration: 2, sourceId: 'test-fixture' },
  ]

  target.condition.injuries = [
    {
      id: 'inj-9-4-1',
      adventurerId: memberId,
      type: 'light',
      cause: 'test-fixture',
      hpLoss: 5,
      status: 'active',
    },
  ]
  target.condition.incapacitatedIds = [memberId]

  return { campaign, partyId, memberId }
}

describe('Phase 9.4.1: recovery completes before same-transition departure', () => {
  it('item 8: a party whose recovery ends the same day it departs leaves fully recovered, in awayParties', () => {
    const { campaign, partyId, memberId } =
      campaignAtDaySixWithInjuredTarget('phase9-4-1-item8')

    let c = resolveCampaignDay(campaign)
    c = advanceCampaignDay(c) // DAY 6 -> DAY 7

    expect(c.parties.find((p) => p.id === partyId)).toBeUndefined()
    const departed = c.awayParties.find((p) => p.id === partyId)
    expect(departed).toBeDefined()
    expect(departed!.lifecycle.status).toBe('away')

    expect(departed!.recoveringThroughDay).toBeUndefined()
    expect(departed!.condition.injuries).toEqual([])
    expect(departed!.condition.incapacitatedIds).toEqual([])

    const member = departed!.party.members.find((m) => m.id === memberId)!
    expect(member.currentHp).toBe(member.maxHp)
    expect(member.currentMp).toBe(member.maxMp)
    expect(member.statusEffects).toEqual([])

    // Recovery completion is recorded before the departure itself.
    const events = (c.currentDay.partyEvents ?? []).filter(
      (e) => e.partyId === partyId,
    )
    expect(events.map((e) => e.type)).toEqual([
      'finishedRecovery',
      'departedScheduled',
    ])
  })

  it('item 9: a returned party carries no stale recovery/injury state from before it departed', () => {
    const { campaign, partyId, memberId } =
      campaignAtDaySixWithInjuredTarget('phase9-4-1-item9')

    let c = resolveCampaignDay(campaign)
    c = advanceCampaignDay(c) // DAY 6 -> DAY 7, target now away

    const away = deepClone(c.awayParties.find((p) => p.id === partyId)!)
    applyReturn(away, c.seed, c.dayNumber)

    expect(away.recoveringThroughDay).toBeUndefined()
    expect(away.condition.injuries).toEqual([])
    expect(away.condition.incapacitatedIds).toEqual([])
    const member = away.party.members.find((m) => m.id === memberId)!
    expect(member.statusEffects).toEqual([])
    expect(member.currentHp).toBe(member.maxHp)
    expect(member.currentMp).toBe(member.maxMp)
  })

  it('item 10: a party still recovering through the next day cannot depart — forced stay extension keeps it staying', () => {
    const campaign = deepClone(createTavernCampaign('phase9-4-1-item10'))
    campaign.dayNumber = 6
    const target = campaign.parties[0]
    const partyId = target.id
    target.plannedDepartureDay = 6
    target.recoveringThroughDay = 7 // still recovering on DAY 7
    target.relationship.affinity = 0

    let c = resolveCampaignDay(campaign)
    c = advanceCampaignDay(c) // DAY 6 -> DAY 7

    const stillStaying = c.parties.find((p) => p.id === partyId)
    expect(stillStaying).toBeDefined()
    expect(stillStaying!.lifecycle.status).toBe('staying')
    expect(c.awayParties.some((p) => p.id === partyId)).toBe(false)
    // Recovery state is untouched — still recovering through day 7.
    expect(stillStaying!.recoveringThroughDay).toBe(7)
    // The forced extension pushed the planned departure at least through
    // the still-recovering window.
    expect(stillStaying!.plannedDepartureDay).toBeGreaterThanOrEqual(7)
  })

  it('eligibility is unaffected by the reorder: a fully-recovered departure still becomes return-eligible after the cooldown', () => {
    const { campaign, partyId } = campaignAtDaySixWithInjuredTarget(
      'phase9-4-1-eligibility',
    )
    let c = resolveCampaignDay(campaign)
    c = advanceCampaignDay(c) // DAY 6 -> DAY 7, departs

    const departed = c.awayParties.find((p) => p.id === partyId)!
    expect(departed.lifecycle.returnEligibleDay).toBe(10) // 6 + 4
    expect(
      selectEligibleAwayParties(c.awayParties, 9).some((p) => p.id === partyId),
    ).toBe(false)
    expect(
      selectEligibleAwayParties(c.awayParties, 10).some(
        (p) => p.id === partyId,
      ),
    ).toBe(true)
  })
})
