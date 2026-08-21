import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { dispatchMainQuest } from './dispatch.ts'
import { simulateMainQuestAttempt } from './simulation.ts'
import {
  MAIN_QUEST_BATTLE_ANCHOR_IDS,
  type MainQuestThreatId,
} from './types.ts'
import { MAIN_QUEST_THREAT_DEFINITION_MAP } from './threats.ts'
import type { TavernCampaignState } from '../tavern/campaign/types.ts'

function dispatchEligibleParty(
  campaign: TavernCampaignState,
  threatId: MainQuestThreatId,
  seedSuffix: string,
): { campaign: TavernCampaignState; partyId: string; attemptId: string } {
  const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[threatId]
  const campaignParty = campaign.parties[0]
  campaignParty.party.rank = definition.requiredPartyRank
  campaignParty.relationship.affinity = definition.requiredAffinity
  campaign.currentDay.parties = campaign.currentDay.parties.map((p) =>
    p.id === campaignParty.id
      ? { ...p, party: { ...p.party, rank: definition.requiredPartyRank } }
      : p,
  )
  campaign.finance.funds = definition.fee + 1000

  const result = dispatchMainQuest(campaign, threatId, campaignParty.id)
  if (!result.ok || !result.attemptId) {
    throw new Error(`test setup failed to dispatch (${seedSuffix})`)
  }
  return {
    campaign: result.campaign,
    partyId: campaignParty.id,
    attemptId: result.attemptId,
  }
}

describe('Phase 9.8 Main Quest deterministic Simulation + Battle Trace', () => {
  it('simulateMainQuestAttempt is deterministic for the same seed/attempt/party', () => {
    const campaign = createTavernCampaign('mainquest-sim-001')
    const { campaign: dispatched, partyId } = dispatchEligibleParty(
      campaign,
      'alden',
      '001',
    )
    const attempt = dispatched.mainQuest.attempts[0]
    const party = dispatched.parties.find((p) => p.id === partyId)!

    const first = simulateMainQuestAttempt(
      dispatched.seed,
      attempt,
      party.party.members,
    )
    const second = simulateMainQuestAttempt(
      dispatched.seed,
      attempt,
      party.party.members,
    )

    expect(second.result).toEqual(first.result)
    expect(second.battleTrace).toEqual(first.battleTrace)
  })

  it('Battle Trace never references the player as an actor or target', () => {
    const campaign = createTavernCampaign('mainquest-sim-002')
    const { campaign: dispatched, partyId } = dispatchEligibleParty(
      campaign,
      'kared',
      '002',
    )
    const attempt = dispatched.mainQuest.attempts[0]
    const party = dispatched.parties.find((p) => p.id === partyId)!

    const { battleTrace } = simulateMainQuestAttempt(
      dispatched.seed,
      attempt,
      party.party.members,
    )

    for (const event of battleTrace.events) {
      if ('actorId' in event) {
        expect(event.actorId).not.toBe('player')
      }
      if ('targetId' in event) {
        expect(event.targetId).not.toBe('player')
      }
      if ('memberId' in event) {
        expect(event.memberId).not.toBe('player')
      }
    }
  })

  it('occurredAnchors is a subset of the fixed anchor vocabulary and only lists anchors that actually appear as events', () => {
    const campaign = createTavernCampaign('mainquest-sim-003')
    const { campaign: dispatched, partyId } = dispatchEligibleParty(
      campaign,
      'halma',
      '003',
    )
    const attempt = dispatched.mainQuest.attempts[0]
    const party = dispatched.parties.find((p) => p.id === partyId)!

    const { battleTrace } = simulateMainQuestAttempt(
      dispatched.seed,
      attempt,
      party.party.members,
    )

    const anchorEventIds = battleTrace.events
      .filter((e) => e.type === 'monsterReactionAnchor')
      .map((e) => e.anchorId)

    for (const anchor of battleTrace.occurredAnchors) {
      expect(MAIN_QUEST_BATTLE_ANCHOR_IDS).toContain(anchor)
      expect(anchorEventIds).toContain(anchor)
    }
    expect(new Set(battleTrace.occurredAnchors).size).toBe(
      battleTrace.occurredAnchors.length,
    )
    // battle_start always occurs.
    expect(battleTrace.occurredAnchors).toContain('battle_start')
  })

  it('resolveCampaignDay resolves the dispatched Attempt exactly once, in Result-before-Narrative order (no narrative field yet)', () => {
    let campaign = createTavernCampaign('mainquest-sim-004')
    const { campaign: dispatched, attemptId } = dispatchEligibleParty(
      campaign,
      'alden',
      '004',
    )
    campaign = dispatched

    const resolved = resolveCampaignDay(campaign)
    const attempt = resolved.mainQuest.attempts.find((a) => a.id === attemptId)!
    expect(attempt.result).toBeDefined()
    expect(attempt.battleTrace).toBeDefined()
    expect(attempt.narrative).toBeUndefined()
    expect(resolved.mainQuest.pendingPresentationAttemptId).toBe(attemptId)

    const resolvedEvent = resolved.history[
      resolved.history.length - 1
    ].mainQuestEvents.find((e) => e.type === 'resolved')
    expect(resolvedEvent).toBeDefined()
  })

  it('threat.status only becomes defeated when the monster was actually defeated in Simulation', () => {
    let campaign = createTavernCampaign('mainquest-sim-005')
    const { campaign: dispatched, attemptId } = dispatchEligibleParty(
      campaign,
      'alden',
      '005',
    )
    campaign = resolveCampaignDay(dispatched)
    const attempt = campaign.mainQuest.attempts.find((a) => a.id === attemptId)!
    const threatState = campaign.mainQuest.threats.alden

    if (attempt.result!.monsterDefeated) {
      expect(threatState.status).toBe('defeated')
      expect(threatState.defeatedDay).toBe(attempt.dayNumber)
    } else {
      expect(threatState.status).toBe('available')
      expect(threatState.defeatedDay).toBeUndefined()
    }
  })

  it('never resimulates an Attempt that already has a result (Save/Load resume safety)', () => {
    let campaign = createTavernCampaign('mainquest-sim-006')
    const { campaign: dispatched, attemptId } = dispatchEligibleParty(
      campaign,
      'alden',
      '006',
    )
    campaign = resolveCampaignDay(dispatched)
    const resolvedAttempt = campaign.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    const resultSnapshot = JSON.parse(JSON.stringify(resolvedAttempt.result))
    const traceSnapshot = JSON.parse(
      JSON.stringify(resolvedAttempt.battleTrace),
    )

    campaign = advanceCampaignDay(campaign)

    const stillThere = campaign.mainQuest.attempts.find(
      (a) => a.id === attemptId,
    )!
    expect(JSON.parse(JSON.stringify(stillThere.result))).toEqual(
      resultSnapshot,
    )
    expect(JSON.parse(JSON.stringify(stillThere.battleTrace))).toEqual(
      traceSnapshot,
    )
  })

  it('a Main Quest Party never appears in the normal day results, Quest Chain, or idle/training pass', () => {
    let campaign = createTavernCampaign('mainquest-sim-007')
    const { campaign: dispatched, partyId } = dispatchEligibleParty(
      campaign,
      'alden',
      '007',
    )
    campaign = dispatched
    const resolved = resolveCampaignDay(campaign)

    expect(resolved.currentDay.results.some((r) => r.partyId === partyId)).toBe(
      false,
    )
    // No idle-training progressionEvent recorded for this party today.
    const lastRecord = resolved.history[resolved.history.length - 1]
    const trainingEventForParty = lastRecord.progressionEvents.some(
      (e) =>
        'partyId' in e &&
        e.partyId === partyId &&
        'source' in e &&
        e.source === 'training',
    )
    expect(trainingEventForParty).toBe(false)
  })
})
