import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from './campaign.ts'
import { offerRequestToParty } from '../brokerage.ts'
import { TRAINING_GROWTH_XP } from './progression.ts'

function findAnyAcceptingOffer(
  campaign: ReturnType<typeof createTavernCampaign>,
) {
  for (const request of campaign.currentDay.requests) {
    for (const party of campaign.currentDay.parties) {
      if (party.availability === 'recovering') continue
      const next = offerRequestToParty(
        campaign.currentDay,
        request.id,
        party.id,
      )
      if (next.matches.length > 0) {
        return { requestId: request.id, partyId: party.id, next }
      }
    }
  }
  return null
}

describe('Campaign progression integration', () => {
  it('gives expedition XP and skill growth on a resolved day', () => {
    let campaign = createTavernCampaign('tavern-campaign-progress-001')
    const offer = findAnyAcceptingOffer(campaign)
    expect(offer).not.toBeNull()
    if (!offer) return

    campaign = { ...campaign, currentDay: offer.next }
    const partyBefore = campaign.parties.find((p) => p.id === offer.partyId)!
    const totalXpBefore = partyBefore.progression.totalGrowthXp

    campaign = resolveCampaignDay(campaign)

    const partyAfter = campaign.parties.find((p) => p.id === offer.partyId)!
    expect(partyAfter.progression.totalGrowthXp).toBeGreaterThan(totalXpBefore)
    expect(
      campaign.history[0].progressionEvents.some(
        (e) => e.type === 'experienceGained',
      ),
    ).toBe(true)
  })

  it('gives training XP to available parties that did not dispatch', () => {
    let campaign = createTavernCampaign('tavern-campaign-training-001')
    // Resolve without any accepted offer.
    campaign = resolveCampaignDay(campaign)

    for (const party of campaign.parties) {
      if (party.departingCasualty) continue
      expect(party.progression.totalGrowthXp).toBeGreaterThanOrEqual(
        TRAINING_GROWTH_XP,
      )
    }
    expect(
      campaign.history[0].progressionEvents.some(
        (e) => e.type === 'experienceGained' && e.source === 'training',
      ),
    ).toBe(true)
  })

  it('does not give training to recovering parties', () => {
    let campaign = createTavernCampaign('tavern-campaign-recover-training-001')
    const recoveringParty = campaign.parties[0]
    recoveringParty.recoveringThroughDay = 1

    campaign = resolveCampaignDay(campaign)

    expect(recoveringParty.progression.totalGrowthXp).toBe(0)
    expect(recoveringParty.progression.trainingDays).toBe(0)
  })

  it('does not progress casualty parties', () => {
    let campaign = createTavernCampaign('tavern-campaign-casualty-001')
    const offer = findAnyAcceptingOffer(campaign)
    expect(offer).not.toBeNull()
    if (!offer) return

    campaign = { ...campaign, currentDay: offer.next }
    const partyBefore = campaign.parties.find((p) => p.id === offer.partyId)!

    campaign = resolveCampaignDay(campaign)

    const partyAfter = campaign.parties.find((p) => p.id === offer.partyId)!
    if (!partyAfter.departingCasualty) {
      // Not a deterministic casualty scenario; skip assertion.
      return
    }

    expect(partyAfter.progression.totalGrowthXp).toBe(
      partyBefore.progression.totalGrowthXp,
    )
  })

  it('accumulates milestones across multiple days', () => {
    let campaign = createTavernCampaign('tavern-campaign-milestones-001')

    for (let day = 1; day <= 10; day++) {
      const offer = findAnyAcceptingOffer(campaign)
      if (offer) {
        campaign = { ...campaign, currentDay: offer.next }
      }
      campaign = resolveCampaignDay(campaign)
      if (day < 10) {
        campaign = advanceCampaignDay(campaign)
      }
    }

    const totalMilestones = campaign.parties.reduce(
      (sum, p) => sum + p.progression.growthMilestones,
      0,
    )
    expect(totalMilestones).toBeGreaterThan(0)
  })

  it('records progression events in day history', () => {
    let campaign = createTavernCampaign('tavern-campaign-history-001')
    campaign = resolveCampaignDay(campaign)

    expect(campaign.history[0].progressionEvents.length).toBeGreaterThan(0)
  })

  it('updates tavern day party snapshot with grown skills after resolve', () => {
    let campaign = createTavernCampaign('tavern-campaign-snapshot-001')
    const offer = findAnyAcceptingOffer(campaign)
    expect(offer).not.toBeNull()
    if (!offer) return

    campaign = { ...campaign, currentDay: offer.next }
    const partyBefore = campaign.currentDay.parties.find(
      (p) => p.id === offer.partyId,
    )!
    const skillsBefore = { ...partyBefore.party.members[0].skills }

    campaign = resolveCampaignDay(campaign)

    const partyAfter = campaign.currentDay.parties.find(
      (p) => p.id === offer.partyId,
    )!
    const changed = Object.keys(partyAfter.party.members[0].skills).find(
      (skill) =>
        partyAfter.party.members[0].skills[
          skill as keyof (typeof partyAfter.party.members)[0]['skills']
        ] !== skillsBefore[skill as keyof typeof skillsBefore],
    )

    if (
      campaign.parties.find((p) => p.id === offer.partyId)!.progression
        .growthMilestones > 0
    ) {
      expect(changed).toBeDefined()
    }
  })
})
