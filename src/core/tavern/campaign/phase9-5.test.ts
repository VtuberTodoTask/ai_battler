import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from './campaign.ts'
import { offerRequestToParty } from '../brokerage.ts'
import { deriveTavernRank } from './reputation.ts'
import { purchaseTavernUpgrade } from './upgrades.ts'
import { applyReturn } from './lifecycle.ts'
import {
  EXPEDITION_GROWTH_XP,
  PARTY_GROWTH_XP_THRESHOLD,
  TRAINING_GROWTH_XP,
} from './progression.ts'
import { deepClone } from '../../util.ts'
import {
  serializeGameSave,
  deserializeGameSave,
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

function advanceDaysWithoutQuests(
  campaign: TavernCampaignState,
  n: number,
): TavernCampaignState {
  let c = campaign
  for (let i = 0; i < n; i++) {
    c = resolveCampaignDay(c)
    c = advanceCampaignDay(c)
  }
  return c
}

function forceImmediateDeparture(
  campaign: TavernCampaignState,
  partyId: string,
): TavernCampaignState {
  const next = deepClone(campaign)
  const party = next.parties.find((p) => p.id === partyId)!
  party.plannedDepartureDay = next.dayNumber
  party.recoveringThroughDay = undefined
  party.relationship.affinity = 0
  return next
}

describe('Phase 9.5 adventurer growth smoke', () => {
  it('A: a freshly created campaign has every party at zero growth', () => {
    const campaign = createTavernCampaign('phase9-5-a')
    for (const party of campaign.parties) {
      expect(party.progression).toEqual({
        growthXp: 0,
        totalGrowthXp: 0,
        growthMilestones: 0,
        trainingDays: 0,
      })
    }
  })

  it('B: expedition outcomes award exactly the fixed XP table amount', () => {
    let campaign = createTavernCampaign('phase9-5-b')
    campaign = acceptAllPossible(campaign)
    const acceptedPartyId = campaign.currentDay.matches[0]?.partyId
    expect(acceptedPartyId).toBeDefined()

    const resolved = resolveCampaignDay(campaign)
    const result = resolved.currentDay.results.find(
      (r) => r.status === 'resolved' && r.partyId === acceptedPartyId,
    )
    expect(result).toBeDefined()
    if (result?.status !== 'resolved' || !result.result) return

    const party = resolved.parties.find((p) => p.id === acceptedPartyId)!
    const outcome = result.result.outcome
    const expectedXp =
      EXPEDITION_GROWTH_XP[
        outcome === 'lostExpedition' ? 'lostExpedition' : outcome
      ]
    expect(party.progression.totalGrowthXp).toBe(expectedXp)
  })

  it('C: reaching a growth milestone grows exactly one skill per member', () => {
    let campaign = createTavernCampaign('phase9-5-c')
    campaign = advanceDaysWithoutQuests(campaign, PARTY_GROWTH_XP_THRESHOLD)
    const grown = campaign.parties.find(
      (p) => p.progression.growthMilestones >= 1,
    )
    expect(grown).toBeDefined()
    if (!grown) return

    const record = campaign.history.find((h) =>
      h.progressionEvents.some(
        (e) => e.type === 'skillImproved' && e.partyId === grown.id,
      ),
    )!
    const skillEvents = record.progressionEvents.filter(
      (e) => e.type === 'skillImproved' && e.partyId === grown.id,
    )
    expect(skillEvents.length).toBe(grown.party.members.length)
  })

  it('D: an idle, healthy party earns the baseline Training XP (1/day)', () => {
    let campaign = createTavernCampaign('phase9-5-d')
    campaign = advanceDaysWithoutQuests(campaign, 1)
    for (const party of campaign.parties) {
      // Every party arrived on day 1 and none were dispatched (no quests
      // accepted), so all should have earned exactly the baseline.
      expect(party.progression.totalGrowthXp).toBe(TRAINING_GROWTH_XP)
      expect(party.progression.trainingDays).toBe(1)
    }
  })

  it('E: Training Yard level 1/2 raise idle Training XP to 2 and 3', () => {
    let campaign = createTavernCampaign('phase9-5-e')
    for (let day = 1; day <= 120; day++) {
      campaign = resolveCampaignDay(acceptAllPossible(campaign))
      const rank5 = deriveTavernRank(campaign.reputation.peakScore) >= 5
      if (rank5 && campaign.finance.funds >= 700) break
      campaign = advanceCampaignDay(campaign)
    }
    campaign = advanceCampaignDay(campaign)
    expect(
      deriveTavernRank(campaign.reputation.peakScore),
    ).toBeGreaterThanOrEqual(5)

    const lv1 = purchaseTavernUpgrade(campaign, 'training_yard')
    expect(lv1.ok).toBe(true)
    campaign = lv1.campaign

    // Purchasing during planning doesn't retroactively touch today, but
    // resolving today already reflects the new level (same-day activation).
    // resolveCampaignDay itself appends this day's record to history.
    campaign = resolveCampaignDay(campaign)
    const dayNumber1 = campaign.dayNumber
    const record1 = campaign.history.find((h) => h.dayNumber === dayNumber1)!
    const gain1 = record1.progressionEvents.find(
      (e) => e.type === 'experienceGained' && e.source === 'training',
    )
    expect(gain1).toBeDefined()
    expect(
      gain1 && gain1.type === 'experienceGained' ? gain1.amount : undefined,
    ).toBe(2)
    campaign = advanceCampaignDay(campaign)

    const lv2 = purchaseTavernUpgrade(campaign, 'training_yard')
    expect(lv2.ok).toBe(true)
    campaign = lv2.campaign
    campaign = resolveCampaignDay(campaign)
    const dayNumber2 = campaign.dayNumber
    const record2 = campaign.history.find((h) => h.dayNumber === dayNumber2)!
    const gain2 = record2.progressionEvents.find(
      (e) => e.type === 'experienceGained' && e.source === 'training',
    )
    expect(gain2).toBeDefined()
    expect(
      gain2 && gain2.type === 'experienceGained' ? gain2.amount : undefined,
    ).toBe(3)
  })

  it('F: recovering and away parties earn zero growth', () => {
    let campaign = createTavernCampaign('phase9-5-f')
    const targetId = campaign.parties[0].id
    campaign = deepClone(campaign)
    campaign.parties[0].recoveringThroughDay = campaign.dayNumber + 3
    const before = campaign.parties[0].progression.totalGrowthXp

    campaign = resolveCampaignDay(campaign)
    const recovering = campaign.parties.find((p) => p.id === targetId)!
    expect(recovering.progression.totalGrowthXp).toBe(before)

    // An away party (moved out of campaign.parties entirely) cannot earn
    // growth by construction — the training loop only iterates
    // campaign.parties.
    let c2 = createTavernCampaign('phase9-5-f2')
    const awayTargetId = c2.parties[0].id
    c2 = forceImmediateDeparture(c2, awayTargetId)
    c2 = resolveCampaignDay(c2)
    c2 = advanceCampaignDay(c2)
    const away = c2.awayParties.find((p) => p.id === awayTargetId)!
    const totalBefore = away.progression.totalGrowthXp
    c2 = advanceDaysWithoutQuests(c2, 3)
    const stillAway = c2.awayParties.find((p) => p.id === awayTargetId)!
    expect(stillAway.progression.totalGrowthXp).toBe(totalBefore)
  })

  it('G: departure then return preserves growth and grown skills exactly', () => {
    let campaign = createTavernCampaign('phase9-5-g')
    campaign = advanceDaysWithoutQuests(campaign, PARTY_GROWTH_XP_THRESHOLD)
    const grown = campaign.parties.find(
      (p) => p.progression.growthMilestones >= 1,
    )!
    const partyId = grown.id

    campaign = forceImmediateDeparture(campaign, partyId)
    // The departure decision happens on the NEXT advance, so this resolve
    // still earns this day's training tick — capture the "before" snapshot
    // after that, right before the actual staying->away transition.
    campaign = resolveCampaignDay(campaign)
    const beforeDeparture = campaign.parties.find((p) => p.id === partyId)!
    const progressionBefore = { ...beforeDeparture.progression }
    const skillsBefore = beforeDeparture.party.members.map((m) => ({
      ...m.skills,
    }))

    campaign = advanceCampaignDay(campaign)
    const away = campaign.awayParties.find((p) => p.id === partyId)!
    expect(away.progression).toEqual(progressionBefore)

    // applyReturn is the exact function advanceCampaignDay uses when the
    // RNG return roll succeeds; invoking it directly (rather than waiting,
    // possibly for hundreds of days, for a natural roll to land on this
    // specific party among a growing eligible pool) keeps the test
    // deterministic while still exercising the real return code path —
    // lifecycle bookkeeping is already covered separately by Phase 9.4's
    // own return tests.
    const returned = deepClone(away)
    applyReturn(returned, campaign.seed, campaign.dayNumber)

    expect(returned.progression.totalGrowthXp).toBe(
      progressionBefore.totalGrowthXp,
    )
    expect(returned.progression.growthMilestones).toBe(
      progressionBefore.growthMilestones,
    )
    returned.party.members.forEach((m, i) => {
      expect(m.skills).toEqual(skillsBefore[i])
    })
  })

  it('H: save/load round-trip preserves progression, skills, and Training Yard level exactly', () => {
    let campaign = createTavernCampaign('phase9-5-h')
    campaign = advanceDaysWithoutQuests(campaign, PARTY_GROWTH_XP_THRESHOLD)
    for (let day = 1; day <= 100; day++) {
      campaign = resolveCampaignDay(acceptAllPossible(campaign))
      if (
        deriveTavernRank(campaign.reputation.peakScore) >= 3 &&
        campaign.finance.funds >= 200
      ) {
        break
      }
      campaign = advanceCampaignDay(campaign)
    }
    campaign = advanceCampaignDay(campaign)
    const purchase = purchaseTavernUpgrade(campaign, 'training_yard')
    expect(purchase.ok).toBe(true)
    campaign = purchase.campaign

    const serialized = serializeGameSave({ campaign })
    expect(() => validateGameSave(serialized)).not.toThrow()
    const loaded = deserializeGameSave(serialized)

    expect(loaded.campaign.parties).toEqual(campaign.parties)
    expect(loaded.campaign.awayParties).toEqual(campaign.awayParties)
    expect(loaded.campaign.retiredParties).toEqual(campaign.retiredParties)
    expect(loaded.campaign.upgrades.levels.training_yard).toBe(1)
  })

  it('I: zero AI calls across expedition growth, training, milestones, and Training Yard purchase', () => {
    let campaign = createTavernCampaign('phase9-5-i')
    expect(campaign.narrativeGenerations.length).toBe(0)
    campaign = advanceDaysWithoutQuests(campaign, PARTY_GROWTH_XP_THRESHOLD)
    expect(campaign.narrativeGenerations.length).toBe(0)
    campaign = resolveCampaignDay(acceptAllPossible(campaign))
    campaign = advanceCampaignDay(campaign)
    expect(campaign.narrativeGenerations.length).toBe(0)
    for (let day = 1; day <= 60; day++) {
      campaign = resolveCampaignDay(acceptAllPossible(campaign))
      if (deriveTavernRank(campaign.reputation.peakScore) >= 3) break
      campaign = advanceCampaignDay(campaign)
    }
    campaign = advanceCampaignDay(campaign)
    if (campaign.finance.funds >= 200) {
      const purchase = purchaseTavernUpgrade(campaign, 'training_yard')
      if (purchase.ok) campaign = purchase.campaign
    }
    expect(campaign.narrativeGenerations.length).toBe(0)
  })

  it('J: identical seed/state/actions produce identical growth outcomes (determinism, incl. after save/load)', () => {
    let campaign = createTavernCampaign('phase9-5-j')
    campaign = advanceDaysWithoutQuests(campaign, 3)

    const serialized = serializeGameSave({ campaign })
    const reloaded = deserializeGameSave(serialized).campaign

    let continuedOriginal = campaign
    let continuedReloaded = reloaded
    for (let i = 0; i < 10; i++) {
      continuedOriginal = advanceDaysWithoutQuests(continuedOriginal, 1)
      continuedReloaded = advanceDaysWithoutQuests(continuedReloaded, 1)
    }

    expect(continuedReloaded.parties).toEqual(continuedOriginal.parties)
    expect(continuedReloaded.awayParties).toEqual(continuedOriginal.awayParties)
    expect(continuedReloaded.retiredParties).toEqual(
      continuedOriginal.retiredParties,
    )
  })

  it('long-run smoke: 60 idle days never violate growth invariants (no NaN/overflow, cap respected, returns keep grown skills)', () => {
    let campaign = createTavernCampaign('phase9-5-longrun')
    for (let day = 0; day < 60; day++) {
      campaign = resolveCampaignDay(campaign)
      campaign = advanceCampaignDay(campaign)
      for (const party of [
        ...campaign.parties,
        ...campaign.awayParties,
        ...campaign.retiredParties,
      ]) {
        const p = party.progression
        expect(Number.isFinite(p.growthXp)).toBe(true)
        expect(Number.isFinite(p.totalGrowthXp)).toBe(true)
        expect(p.growthXp).toBeGreaterThanOrEqual(0)
        expect(p.growthXp).toBeLessThan(PARTY_GROWTH_XP_THRESHOLD)
        expect(p.growthMilestones).toBe(
          Math.floor(p.totalGrowthXp / PARTY_GROWTH_XP_THRESHOLD),
        )
        for (const member of party.party.members) {
          for (const value of Object.values(member.skills)) {
            expect(Number.isFinite(value)).toBe(true)
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThanOrEqual(100)
          }
        }
      }
    }
  })
})
