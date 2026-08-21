import { describe, expect, it } from 'vitest'
import { createTavernCampaign } from '../tavern/campaign/campaign.ts'
import { dispatchMainQuest, evaluateMainQuestDispatch } from './dispatch.ts'
import { MAIN_QUEST_THREAT_DEFINITION_MAP } from './threats.ts'
import type { TavernCampaignState } from '../tavern/campaign/types.ts'

function eligiblePartyId(campaign: TavernCampaignState): string {
  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP.alden
  const campaignParty = campaign.parties[0]
  campaignParty.party.rank = definition.requiredPartyRank
  campaignParty.relationship.affinity = definition.requiredAffinity
  campaign.currentDay.parties = campaign.currentDay.parties.map((p) =>
    p.id === campaignParty.id
      ? { ...p, party: { ...p.party, rank: definition.requiredPartyRank } }
      : p,
  )
  return campaignParty.id
}

describe('Phase 9.8 Main Quest eligibility + dispatch', () => {
  it('is eligible once every condition is satisfied', () => {
    const campaign = createTavernCampaign('mainquest-dispatch-001')
    const partyId = eligiblePartyId(campaign)
    campaign.finance.funds = MAIN_QUEST_THREAT_DEFINITION_MAP.alden.fee

    const evaluation = evaluateMainQuestDispatch(campaign, 'alden', partyId)
    expect(evaluation.eligible).toBe(true)
    expect(evaluation.rankSufficient).toBe(true)
    expect(evaluation.affinitySufficient).toBe(true)
    expect(evaluation.fundsSufficient).toBe(true)
  })

  it('rejects with zero mutation when funds are insufficient', () => {
    const campaign = createTavernCampaign('mainquest-dispatch-002')
    const partyId = eligiblePartyId(campaign)
    campaign.finance.funds = 0
    const before = JSON.parse(JSON.stringify(campaign))

    const evaluation = evaluateMainQuestDispatch(campaign, 'alden', partyId)
    expect(evaluation.eligible).toBe(false)
    expect(evaluation.fundsSufficient).toBe(false)

    const result = dispatchMainQuest(campaign, 'alden', partyId)
    expect(result.ok).toBe(false)
    expect(result.campaign).toEqual(before)
    expect(JSON.parse(JSON.stringify(campaign))).toEqual(before)
  })

  it('rejects with zero mutation when Party Rank is insufficient', () => {
    const campaign = createTavernCampaign('mainquest-dispatch-003')
    const partyId = eligiblePartyId(campaign)
    campaign.finance.funds = MAIN_QUEST_THREAT_DEFINITION_MAP.alden.fee
    const campaignParty = campaign.parties.find((p) => p.id === partyId)!
    campaignParty.party.rank = 'E'
    const before = JSON.parse(JSON.stringify(campaign))

    const evaluation = evaluateMainQuestDispatch(campaign, 'alden', partyId)
    expect(evaluation.eligible).toBe(false)
    expect(evaluation.rankSufficient).toBe(false)

    const result = dispatchMainQuest(campaign, 'alden', partyId)
    expect(result.ok).toBe(false)
    expect(JSON.parse(JSON.stringify(campaign))).toEqual(before)
  })

  it('rejects with zero mutation when Affinity is insufficient', () => {
    const campaign = createTavernCampaign('mainquest-dispatch-004')
    const partyId = eligiblePartyId(campaign)
    campaign.finance.funds = MAIN_QUEST_THREAT_DEFINITION_MAP.alden.fee
    const campaignParty = campaign.parties.find((p) => p.id === partyId)!
    campaignParty.relationship.affinity = 0
    const before = JSON.parse(JSON.stringify(campaign))

    const evaluation = evaluateMainQuestDispatch(campaign, 'alden', partyId)
    expect(evaluation.eligible).toBe(false)
    expect(evaluation.affinitySufficient).toBe(false)

    const result = dispatchMainQuest(campaign, 'alden', partyId)
    expect(result.ok).toBe(false)
    expect(JSON.parse(JSON.stringify(campaign))).toEqual(before)
  })

  it('rejects with zero mutation when the Party is recovering', () => {
    const campaign = createTavernCampaign('mainquest-dispatch-005')
    const partyId = eligiblePartyId(campaign)
    campaign.finance.funds = MAIN_QUEST_THREAT_DEFINITION_MAP.alden.fee
    campaign.currentDay.parties = campaign.currentDay.parties.map((p) =>
      p.id === partyId ? { ...p, availability: 'recovering' } : p,
    )
    const before = JSON.parse(JSON.stringify(campaign))

    const evaluation = evaluateMainQuestDispatch(campaign, 'alden', partyId)
    expect(evaluation.eligible).toBe(false)
    expect(evaluation.notRecovering).toBe(false)

    const result = dispatchMainQuest(campaign, 'alden', partyId)
    expect(result.ok).toBe(false)
    expect(JSON.parse(JSON.stringify(campaign))).toEqual(before)
  })

  it('rejects with zero mutation when the Party already accepted a normal request', () => {
    const campaign = createTavernCampaign('mainquest-dispatch-006')
    const partyId = eligiblePartyId(campaign)
    campaign.finance.funds = MAIN_QUEST_THREAT_DEFINITION_MAP.alden.fee
    campaign.currentDay.parties = campaign.currentDay.parties.map((p) =>
      p.id === partyId ? { ...p, acceptedRequestId: 'some-request' } : p,
    )
    const before = JSON.parse(JSON.stringify(campaign))

    const evaluation = evaluateMainQuestDispatch(campaign, 'alden', partyId)
    expect(evaluation.eligible).toBe(false)
    expect(evaluation.notAcceptedNormalRequest).toBe(false)

    const result = dispatchMainQuest(campaign, 'alden', partyId)
    expect(result.ok).toBe(false)
    expect(JSON.parse(JSON.stringify(campaign))).toEqual(before)
  })

  it('rejects with zero mutation when the Threat is not available (locked/defeated)', () => {
    const campaign = createTavernCampaign('mainquest-dispatch-007')
    const partyId = eligiblePartyId(campaign)
    campaign.finance.funds = MAIN_QUEST_THREAT_DEFINITION_MAP.alden.fee
    campaign.mainQuest.threats.alden = {
      ...campaign.mainQuest.threats.alden,
      status: 'defeated',
    }
    const before = JSON.parse(JSON.stringify(campaign))

    const evaluation = evaluateMainQuestDispatch(campaign, 'alden', partyId)
    expect(evaluation.eligible).toBe(false)
    expect(evaluation.threatAvailable).toBe(false)

    const result = dispatchMainQuest(campaign, 'alden', partyId)
    expect(result.ok).toBe(false)
    expect(JSON.parse(JSON.stringify(campaign))).toEqual(before)
  })

  it('successful dispatch decreases funds by exactly the fee, records exactly one Ledger entry, reserves the Party, and creates one Attempt', () => {
    const campaign = createTavernCampaign('mainquest-dispatch-008')
    const partyId = eligiblePartyId(campaign)
    const fee = MAIN_QUEST_THREAT_DEFINITION_MAP.alden.fee
    campaign.finance.funds = fee + 500
    const fundsBefore = campaign.finance.funds
    const ledgerCountBefore = campaign.finance.ledgerEntries.length

    const result = dispatchMainQuest(campaign, 'alden', partyId)
    expect(result.ok).toBe(true)
    const next = result.campaign

    expect(next.finance.funds).toBe(fundsBefore - fee)
    expect(next.finance.ledgerEntries.length).toBe(ledgerCountBefore + 1)
    const entry =
      next.finance.ledgerEntries[next.finance.ledgerEntries.length - 1]
    expect(entry.kind).toBe('main_quest_payment')
    expect(entry.id).toBe(`main-quest-payment:alden:${result.attemptId}`)

    const tavernParty = next.currentDay.parties.find((p) => p.id === partyId)!
    expect(tavernParty.mainQuestAttemptId).toBe(result.attemptId)

    expect(next.mainQuest.attempts.length).toBe(1)
    const attempt = next.mainQuest.attempts[0]
    expect(attempt.threatId).toBe('alden')
    expect(attempt.partyId).toBe(partyId)
    expect(attempt.fee).toBe(fee)
    expect(attempt.presentationStatus).toBe('narrative_pending')
    expect(attempt.result).toBeUndefined()
    expect(attempt.battleTrace).toBeUndefined()
  })

  it('rejects a second Main Quest dispatch on the same day with zero mutation (one per day)', () => {
    const campaign = createTavernCampaign('mainquest-dispatch-009')
    const partyId = eligiblePartyId(campaign)
    campaign.finance.funds = 100000

    const first = dispatchMainQuest(campaign, 'alden', partyId)
    expect(first.ok).toBe(true)
    const afterFirst = first.campaign

    // A second, otherwise-eligible Party for a different Threat.
    const secondDefinition = MAIN_QUEST_THREAT_DEFINITION_MAP.velga
    const secondParty = afterFirst.parties[1]
    secondParty.party.rank = secondDefinition.requiredPartyRank
    secondParty.relationship.affinity = secondDefinition.requiredAffinity

    const evaluation = evaluateMainQuestDispatch(
      afterFirst,
      'velga',
      secondParty.id,
    )
    expect(evaluation.eligible).toBe(false)
    expect(evaluation.noMainQuestDispatchedToday).toBe(false)

    const before = JSON.parse(JSON.stringify(afterFirst))
    const second = dispatchMainQuest(afterFirst, 'velga', secondParty.id)
    expect(second.ok).toBe(false)
    expect(JSON.parse(JSON.stringify(afterFirst))).toEqual(before)
  })
})
