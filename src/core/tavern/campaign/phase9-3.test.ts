import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from './campaign.ts'
import { offerRequestToParty } from '../brokerage.ts'
import { deriveTavernRank } from './reputation.ts'
import {
  TAVERN_UPGRADE_IDS,
  evaluateTavernUpgradePurchase,
  getEffectiveSampleCount,
  purchaseTavernUpgrade,
} from './upgrades.ts'
import { buildUpgradePurchaseEntryId } from '../../economy/index.ts'
import { deepClone } from '../../util.ts'
import {
  serializeGameSave,
  deserializeGameSave,
} from '../../save/serializer.ts'
import { validateGameSave } from '../../save/validation.ts'
import type { TavernCampaignState, TavernUpgradeId } from './types.ts'

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

describe('Phase 9.3 tavern upgrades smoke', () => {
  it('A: new campaign starts with every facility at level 0 and generates the base 3 daily requests', () => {
    const campaign = createTavernCampaign('phase9-3-a')
    expect(campaign.upgrades).toEqual({
      levels: {
        quest_board: 0,
        intel_archive: 0,
        recovery_room: 0,
        guest_room: 0,
      },
    })
    expect(campaign.currentDay.requests.length).toBe(3)
  })

  it('B: quest_board bonus requests apply from the following day, never the day of purchase', () => {
    let campaign = createTavernCampaign('phase9-3-b')
    expect(campaign.currentDay.requests.length).toBe(3)

    const purchase = purchaseTavernUpgrade(campaign, 'quest_board')
    expect(purchase.ok).toBe(true)
    campaign = purchase.campaign

    // Today's already-generated request board is untouched by the purchase.
    expect(campaign.currentDay.requests.length).toBe(3)

    campaign = resolveCampaignDay(acceptAllPossible(campaign))
    campaign = advanceCampaignDay(campaign)

    // From tomorrow onward, the board carries the +1 bonus.
    expect(campaign.currentDay.requests.length).toBe(4)
  })

  it('C: intel_archive raises the effective prediction sample count immediately upon purchase', () => {
    let campaign = createTavernCampaign('phase9-3-c')
    // Reach tavern rank 2 (required for intel_archive level 1).
    for (let day = 1; day <= 60; day++) {
      campaign = resolveCampaignDay(acceptAllPossible(campaign))
      if (deriveTavernRank(campaign.reputation.peakScore) >= 2) break
      campaign = advanceCampaignDay(campaign)
    }
    campaign = advanceCampaignDay(campaign)
    expect(
      deriveTavernRank(campaign.reputation.peakScore),
    ).toBeGreaterThanOrEqual(2)

    expect(getEffectiveSampleCount(500, campaign.upgrades)).toBe(500)

    const purchase = purchaseTavernUpgrade(campaign, 'intel_archive')
    expect(purchase.ok).toBe(true)
    campaign = purchase.campaign

    // The multiplier is a pure function of the (already-updated) upgrade
    // state, so it reflects the purchase on the same campaign snapshot.
    expect(getEffectiveSampleCount(500, campaign.upgrades)).toBe(750)
  })

  it('D1: purchasing recovery_room never mutates any party, including one currently recovering', () => {
    const campaign = createTavernCampaign('phase9-3-d1')
    const withRecovering = deepClone(campaign)
    withRecovering.upgrades.levels.recovery_room = 0
    withRecovering.reputation.peakScore = 40 // rank 2, enough to purchase level 1
    withRecovering.finance.funds = 1000
    const recoveringParty = withRecovering.parties[0]
    recoveringParty.recoveringThroughDay = withRecovering.dayNumber + 5

    const partiesBefore = deepClone(withRecovering.parties)
    const purchase = purchaseTavernUpgrade(withRecovering, 'recovery_room')
    expect(purchase.ok).toBe(true)
    expect(purchase.campaign.parties).toEqual(partiesBefore)
    expect(
      purchase.campaign.parties.find((p) => p.id === recoveringParty.id)
        ?.recoveringThroughDay,
    ).toBe(withRecovering.dayNumber + 5)
  })

  it('D2: recovery_room shortens a newly-starting recovery period without affecting outcomes', () => {
    let found:
      | {
          preResolve: TavernCampaignState
          partyId: string
          dayNumber: number
        }
      | undefined

    outer: for (let seedIdx = 0; seedIdx < 25 && !found; seedIdx++) {
      let campaign = createTavernCampaign(`phase9-3-d2-search-${seedIdx}`)
      for (let day = 1; day <= 15; day++) {
        const prepared = acceptAllPossible(campaign)
        const preResolve = deepClone(prepared)
        const resolved = resolveCampaignDay(prepared)

        for (const party of resolved.parties) {
          const before = preResolve.parties.find((p) => p.id === party.id)
          const wasRecovering = before?.recoveringThroughDay !== undefined
          if (party.recoveringThroughDay !== undefined && !wasRecovering) {
            found = {
              preResolve,
              partyId: party.id,
              dayNumber: preResolve.dayNumber,
            }
            break outer
          }
        }
        campaign = advanceCampaignDay(resolved)
      }
    }

    expect(found).toBeDefined()
    if (!found) return

    const baseline = resolveCampaignDay(deepClone(found.preResolve))
    const upgraded = deepClone(found.preResolve)
    upgraded.upgrades.levels.recovery_room = 2
    const withUpgrade = resolveCampaignDay(upgraded)

    const baselineParty = baseline.parties.find((p) => p.id === found!.partyId)!
    const upgradedParty = withUpgrade.parties.find(
      (p) => p.id === found!.partyId,
    )!

    expect(baselineParty.recoveringThroughDay).toBeDefined()
    expect(upgradedParty.recoveringThroughDay).toBeDefined()

    const baseDays = baselineParty.recoveringThroughDay! - found.dayNumber
    const reducedDays = upgradedParty.recoveringThroughDay! - found.dayNumber
    expect(reducedDays).toBe(Math.max(1, baseDays - 2))

    // The same outcome (settlement, results) is reached regardless of the
    // upgrade level: only the recovery duration differs.
    expect(withUpgrade.currentDay.results).toEqual(baseline.currentDay.results)
  })

  it('E: purchases are rejected outside the planning phase, leaving funds and level untouched', () => {
    let campaign = createTavernCampaign('phase9-3-e')
    campaign = resolveCampaignDay(campaign)
    expect(campaign.currentDay.status).toBe('resolved')

    const fundsBefore = campaign.finance.funds
    const result = purchaseTavernUpgrade(campaign, 'quest_board')
    expect(result.ok).toBe(false)
    expect(result.blockedReason).toBe('not_planning')
    expect(result.campaign.finance.funds).toBe(fundsBefore)
    expect(result.campaign.upgrades.levels.quest_board).toBe(0)
  })

  it('F: purchases are rejected when funds are insufficient, leaving funds and level untouched', () => {
    const campaign = deepClone(createTavernCampaign('phase9-3-f'))
    campaign.finance.funds = 10
    expect(campaign.finance.funds).toBeLessThan(60)
    const result = purchaseTavernUpgrade(campaign, 'quest_board')
    expect(result.ok).toBe(false)
    expect(result.blockedReason).toBe('insufficient_funds')
    expect(result.campaign.finance.funds).toBe(campaign.finance.funds)
    expect(result.campaign.upgrades.levels.quest_board).toBe(0)
  })

  it('G: purchases are rejected below the required tavern rank, even with ample funds', () => {
    const campaign = deepClone(createTavernCampaign('phase9-3-g'))
    campaign.finance.funds = 100000
    expect(deriveTavernRank(campaign.reputation.peakScore)).toBe(1)
    const result = purchaseTavernUpgrade(campaign, 'intel_archive')
    expect(result.ok).toBe(false)
    expect(result.blockedReason).toBe('rank_locked')
    expect(result.campaign.upgrades.levels.intel_archive).toBe(0)
  })

  it('H: the purchasable level is always exactly currentLevel + 1 (no skipping)', () => {
    const campaign = deepClone(createTavernCampaign('phase9-3-h'))
    campaign.finance.funds = 100000
    campaign.reputation.peakScore = 1000
    for (const id of TAVERN_UPGRADE_IDS as TavernUpgradeId[]) {
      expect(evaluateTavernUpgradePurchase(campaign, id).targetLevel).toBe(1)
    }
  })

  it('I: save/load round-trip preserves upgrade levels and ledger entries exactly', () => {
    let campaign = createTavernCampaign('phase9-3-i')
    for (let day = 1; day <= 80; day++) {
      campaign = resolveCampaignDay(acceptAllPossible(campaign))
      const rank2 = deriveTavernRank(campaign.reputation.peakScore) >= 2
      if (rank2 && campaign.finance.funds >= 300) break
      campaign = advanceCampaignDay(campaign)
    }
    campaign = advanceCampaignDay(campaign)

    const first = purchaseTavernUpgrade(campaign, 'quest_board')
    expect(first.ok).toBe(true)
    const second = purchaseTavernUpgrade(first.campaign, 'recovery_room')
    expect(second.ok).toBe(true)

    const serialized = serializeGameSave({ campaign: second.campaign })
    expect(() => validateGameSave(serialized)).not.toThrow()
    const loaded = deserializeGameSave(serialized)

    expect(loaded.campaign.upgrades).toEqual(second.campaign.upgrades)
    expect(loaded.campaign.finance.funds).toBe(second.campaign.finance.funds)
    const loadedUpgradeEntries = loaded.campaign.finance.ledgerEntries.filter(
      (e) => e.kind === 'upgrade_purchase',
    )
    expect(loadedUpgradeEntries).toEqual(
      second.campaign.finance.ledgerEntries.filter(
        (e) => e.kind === 'upgrade_purchase',
      ),
    )
  })

  it(
    'J: purchasing every facility to its max level produces exactly the expected ledger entries and funds delta',
    { timeout: 60000 },
    () => {
      let campaign = createTavernCampaign('phase9-3-j')
      for (let day = 1; day <= 200; day++) {
        campaign = resolveCampaignDay(acceptAllPossible(campaign))
        const rank4 = deriveTavernRank(campaign.reputation.peakScore) >= 4
        if (rank4 && campaign.finance.funds >= 1500) break
        campaign = advanceCampaignDay(campaign)
      }
      campaign = advanceCampaignDay(campaign)
      expect(
        deriveTavernRank(campaign.reputation.peakScore),
      ).toBeGreaterThanOrEqual(4)

      const fundsBefore = campaign.finance.funds
      let totalCost = 0
      const expectedIds: string[] = []
      for (const id of TAVERN_UPGRADE_IDS as TavernUpgradeId[]) {
        for (const level of [1, 2] as const) {
          const result = purchaseTavernUpgrade(campaign, id)
          expect(result.ok).toBe(true)
          campaign = result.campaign
          expect(campaign.upgrades.levels[id]).toBe(level)
          expectedIds.push(buildUpgradePurchaseEntryId(id, level))
        }
      }
      totalCost = 60 + 180 + 90 + 220 + 120 + 280 + 150 + 360

      expect(campaign.finance.funds).toBe(fundsBefore - totalCost)

      const purchaseEntries = campaign.finance.ledgerEntries.filter(
        (e) => e.kind === 'upgrade_purchase',
      )
      expect(purchaseEntries.map((e) => e.id).sort()).toEqual(
        [...expectedIds].sort(),
      )

      const save = serializeGameSave({ campaign })
      expect(() => validateGameSave(save)).not.toThrow()
    },
  )
})
