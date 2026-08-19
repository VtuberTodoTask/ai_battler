import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../tavern/brokerage.ts'
import { deriveTavernRank } from '../tavern/campaign/reputation.ts'
import { purchaseTavernUpgrade } from '../tavern/campaign/upgrades.ts'
import { buildUpgradePurchaseEntryId } from '../economy/index.ts'
import { serializeGameSave } from './serializer.ts'
import { SaveValidationErrorClass, validateGameSave } from './validation.ts'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function freshSave(seed: string) {
  return serializeGameSave({ campaign: createTavernCampaign(seed) })
}

/**
 * Directly hand-crafts a forged upgrade purchase, bypassing
 * purchaseTavernUpgrade entirely — this simulates an attacker (or a
 * corrupted save) rather than a legitimate purchase, which is exactly what
 * these negative tests must exercise.
 */
function forgeUpgradePurchase(
  save: ReturnType<typeof freshSave>,
  upgradeId: string,
  targetLevel: number,
  cost: number,
  day: number,
) {
  const bad = clone(save)
  bad.campaign.upgrades.levels[
    upgradeId as keyof typeof bad.campaign.upgrades.levels
  ] = targetLevel
  bad.campaign.finance.ledgerEntries.push({
    id: buildUpgradePurchaseEntryId(upgradeId, targetLevel),
    day,
    kind: 'upgrade_purchase',
    amount: -cost,
    source: { type: 'tavern_upgrade', upgradeId, targetLevel },
  })
  bad.campaign.finance.funds -= cost
  return bad
}

/**
 * Same as forgeUpgradePurchase, but for forging several purchases at once
 * (potentially all dated to the same day), so multi-purchase aggregation
 * tests can be built without going through purchaseTavernUpgrade.
 */
function forgeUpgradePurchases(
  save: ReturnType<typeof freshSave>,
  purchases: {
    upgradeId: string
    targetLevel: number
    cost: number
    day: number
  }[],
) {
  const bad = clone(save)
  for (const p of purchases) {
    bad.campaign.upgrades.levels[
      p.upgradeId as keyof typeof bad.campaign.upgrades.levels
    ] = p.targetLevel
    bad.campaign.finance.ledgerEntries.push({
      id: buildUpgradePurchaseEntryId(p.upgradeId, p.targetLevel),
      day: p.day,
      kind: 'upgrade_purchase',
      amount: -p.cost,
      source: {
        type: 'tavern_upgrade',
        upgradeId: p.upgradeId,
        targetLevel: p.targetLevel,
      },
    })
    bad.campaign.finance.funds -= p.cost
  }
  return bad
}

/**
 * Advances n days without ever accepting a request, so funds only ever
 * move by the fixed daily operating cost (-10/day) — no quest commissions,
 * no reputation events. Gives exact, deterministic control over a target
 * day's start-of-day funds (100 - 10*n after n such days).
 */
function advanceDaysWithoutQuests(
  campaign: ReturnType<typeof createTavernCampaign>,
  n: number,
): ReturnType<typeof createTavernCampaign> {
  let c = campaign
  for (let i = 0; i < n; i++) {
    c = resolveCampaignDay(c)
    c = advanceCampaignDay(c)
  }
  return c
}

function findBestCommissionPair(
  campaign: ReturnType<typeof createTavernCampaign>,
) {
  let best: {
    next: ReturnType<typeof createTavernCampaign>['currentDay']
    commission: number
  } | null = null
  for (const request of campaign.currentDay.requests) {
    for (const party of campaign.currentDay.parties) {
      if (party.availability === 'recovering') continue
      try {
        const next = offerRequestToParty(
          campaign.currentDay,
          request.id,
          party.id,
        )
        if (!next.matches.some((m) => m.requestId === request.id)) continue
        const resolved = resolveCampaignDay({ ...campaign, currentDay: next })
        const commission = resolved.currentDay.results.find(
          (r) => r.status === 'resolved',
        )?.settlement?.tavernCommission
        if (commission && (!best || commission > best.commission)) {
          best = { next, commission }
        }
      } catch {
        // continue
      }
    }
  }
  return best
}

function simulateToRank(
  seed: string,
  minRank: number,
): ReturnType<typeof createTavernCampaign> {
  let campaign = createTavernCampaign(seed)
  for (let day = 1; day <= 150; day++) {
    campaign = resolveCampaignDay(acceptAllPossible(campaign))
    if (deriveTavernRank(campaign.reputation.peakScore) >= minRank) break
    campaign = advanceCampaignDay(campaign)
  }
  // resolveCampaignDay leaves currentDay.status === 'resolved'; advance
  // once more so the campaign is back in 'planning'.
  return advanceCampaignDay(campaign)
}

function acceptAllPossible(
  campaign: ReturnType<typeof createTavernCampaign>,
): ReturnType<typeof createTavernCampaign> {
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

describe('save upgrade state validation', () => {
  it('a fresh campaign has every facility at level 0 and validates', () => {
    const save = freshSave('upgrades-fresh')
    expect(save.campaign.upgrades).toEqual({
      levels: { quest_board: 0, intel_archive: 0, recovery_room: 0 },
    })
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('a legitimate level-1 purchase (matching ledger + level) is accepted', () => {
    const campaign = createTavernCampaign('upgrades-valid-purchase')
    const result = purchaseTavernUpgrade(campaign, 'quest_board')
    expect(result.ok).toBe(true)
    const save = serializeGameSave({ campaign: result.campaign })
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('unknown upgrade id in levels is rejected', () => {
    const save = freshSave('upgrades-unknown-id')
    const bad = clone(save) as unknown as {
      campaign: { upgrades: { levels: Record<string, number> } }
    }
    bad.campaign.upgrades.levels.forge_room = 1
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('negative level is rejected', () => {
    const save = freshSave('upgrades-negative-level')
    const bad = clone(save)
    bad.campaign.upgrades.levels.quest_board = -1
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('level beyond MAX_TAVERN_UPGRADE_LEVEL is rejected', () => {
    const save = freshSave('upgrades-level-too-high')
    const bad = clone(save)
    bad.campaign.upgrades.levels.quest_board = 3
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('non-integer level is rejected', () => {
    const save = freshSave('upgrades-fractional-level')
    const bad = clone(save)
    bad.campaign.upgrades.levels.quest_board = 1.5
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('missing purchase ledger entry for a set level is rejected (forward integrity)', () => {
    const campaign = createTavernCampaign('upgrades-missing-ledger')
    const result = purchaseTavernUpgrade(campaign, 'quest_board')
    expect(result.ok).toBe(true)
    const save = serializeGameSave({ campaign: result.campaign })
    const bad = clone(save)
    bad.campaign.finance.ledgerEntries =
      bad.campaign.finance.ledgerEntries.filter(
        (e) => e.kind !== 'upgrade_purchase',
      )
    // funds intentionally left as-is: the missing-entry error must fire
    // before a funds/ledger-total mismatch would otherwise be reached.
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('orphan purchase ledger entry with no matching level bump is rejected (reverse integrity)', () => {
    const save = freshSave('upgrades-orphan-ledger')
    const bad = forgeUpgradePurchase(save, 'recovery_room', 1, 120, 1)
    // Undo the level bump that forgeUpgradePurchase applied, so only the
    // ledger entry is orphaned (no corresponding level change).
    bad.campaign.upgrades.levels.recovery_room = 0
    bad.campaign.finance.funds += 120
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('purchase ledger entry with tampered amount is rejected', () => {
    const campaign = createTavernCampaign('upgrades-tampered-amount')
    const result = purchaseTavernUpgrade(campaign, 'quest_board')
    const save = serializeGameSave({ campaign: result.campaign })
    const bad = clone(save)
    const entry = bad.campaign.finance.ledgerEntries.find(
      (e) => e.kind === 'upgrade_purchase',
    )!
    entry.amount = -61
    bad.campaign.finance.funds -= 1
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('purchase ledger entry with tampered id is rejected', () => {
    const campaign = createTavernCampaign('upgrades-tampered-id')
    const result = purchaseTavernUpgrade(campaign, 'quest_board')
    const save = serializeGameSave({ campaign: result.campaign })
    const bad = clone(save)
    const entry = bad.campaign.finance.ledgerEntries.find(
      (e) => e.kind === 'upgrade_purchase',
    )!
    entry.id = 'custom-upgrade-purchase-id'
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('purchase ledger entry violating the tavern rank requirement is rejected', () => {
    // A fresh campaign is rank 1 (peakScore 0). intel_archive level 1
    // requires rank 2, so a forged purchase at day 1 must be rejected even
    // though the ledger entry and level otherwise agree with each other.
    const save = freshSave('upgrades-rank-violation')
    const bad = forgeUpgradePurchase(save, 'intel_archive', 1, 90, 1)
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('purchase ledger entry dated beyond the current day is rejected', () => {
    const save = freshSave('upgrades-future-day')
    const bad = forgeUpgradePurchase(save, 'quest_board', 1, 60, 2)
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('a skipped level (level 2 set without a level 1 purchase entry) is rejected', () => {
    const save = freshSave('upgrades-skipped-level')
    const bad = clone(save)
    bad.campaign.upgrades.levels.quest_board = 2
    bad.campaign.finance.ledgerEntries.push({
      id: buildUpgradePurchaseEntryId('quest_board', 2),
      day: 1,
      kind: 'upgrade_purchase',
      amount: -180,
      source: {
        type: 'tavern_upgrade',
        upgradeId: 'quest_board',
        targetLevel: 2,
      },
    })
    bad.campaign.finance.funds -= 180
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('malformed upgrade purchase source type is rejected', () => {
    const campaign = createTavernCampaign('upgrades-bad-source-type')
    const result = purchaseTavernUpgrade(campaign, 'quest_board')
    const save = serializeGameSave({ campaign: result.campaign })
    const bad = clone(save)
    const entry = bad.campaign.finance.ledgerEntries.find(
      (e) => e.kind === 'upgrade_purchase',
    )!
    ;(entry.source as { type: string }).type = 'invalid'
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('a real playthrough that reaches rank 3 and buys quest_board level 2 produces a valid save', () => {
    let campaign = createTavernCampaign('upgrades-integration-rank3')
    for (let day = 1; day <= 80; day++) {
      const prepared = acceptAllPossible(campaign)
      campaign = resolveCampaignDay(prepared)
      const reachedRank3 = deriveTavernRank(campaign.reputation.peakScore) >= 3
      // Level 1 + level 2 quest_board purchases together cost 240; keep
      // simulating past the rank-3 threshold until funds can cover both.
      if (reachedRank3 && campaign.finance.funds >= 240) break
      campaign = advanceCampaignDay(campaign)
    }
    // resolveCampaignDay leaves currentDay.status === 'resolved'; advance
    // once more so the campaign is back in 'planning' and purchases are
    // allowed.
    campaign = advanceCampaignDay(campaign)
    expect(
      deriveTavernRank(campaign.reputation.peakScore),
    ).toBeGreaterThanOrEqual(3)

    const level1 = purchaseTavernUpgrade(campaign, 'quest_board')
    expect(level1.ok).toBe(true)
    const level2 = purchaseTavernUpgrade(level1.campaign, 'quest_board')
    expect(level2.ok).toBe(true)
    expect(level2.campaign.upgrades.levels.quest_board).toBe(2)

    const save = serializeGameSave({ campaign: level2.campaign })
    expect(() => validateGameSave(save)).not.toThrow()

    const loaded = clone(save)
    expect(loaded.campaign.upgrades.levels.quest_board).toBe(2)
    const ids = loaded.campaign.finance.ledgerEntries
      .filter((e) => e.kind === 'upgrade_purchase')
      .map((e) => e.id)
      .sort()
    expect(ids).toEqual(
      [
        buildUpgradePurchaseEntryId('quest_board', 1),
        buildUpgradePurchaseEntryId('quest_board', 2),
      ].sort(),
    )
  })
})

describe('save upgrade purchase affordability (Phase 9.3.1)', () => {
  it("Malformed Test A: a single purchase costing more than that day's start-of-day funds is rejected", () => {
    // 5 no-quest days bring day 6's start-of-day funds to exactly
    // 100 - 10*5 = 50, deterministically. A forged quest_board Lv1
    // purchase (cost 60) dated to day 6 must be rejected even though
    // funds/ledger totals are otherwise perfectly consistent.
    const campaign = advanceDaysWithoutQuests(
      createTavernCampaign('afford-a'),
      5,
    )
    expect(campaign.finance.funds).toBe(50)
    const save = serializeGameSave({ campaign })
    const bad = forgeUpgradePurchases(save, [
      { upgradeId: 'quest_board', targetLevel: 1, cost: 60, day: 6 },
    ])
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('Malformed Test B: same-day purchases that are each individually affordable but exceed the day-start total combined are rejected', () => {
    const campaign = simulateToRank('afford-b', 4)
    const dayStartFunds = campaign.finance.funds
    const day = campaign.dayNumber
    // Every individual level here costs far less than dayStartFunds
    // (typically several hundred at rank 4), but their sum (950) does not.
    const purchases = [
      { upgradeId: 'quest_board', targetLevel: 1, cost: 60, day },
      { upgradeId: 'quest_board', targetLevel: 2, cost: 180, day },
      { upgradeId: 'intel_archive', targetLevel: 1, cost: 90, day },
      { upgradeId: 'intel_archive', targetLevel: 2, cost: 220, day },
      { upgradeId: 'recovery_room', targetLevel: 1, cost: 120, day },
      { upgradeId: 'recovery_room', targetLevel: 2, cost: 280, day },
    ]
    const totalCost = purchases.reduce((sum, p) => sum + p.cost, 0)
    expect(totalCost).toBeGreaterThan(dayStartFunds)
    for (const p of purchases) {
      expect(p.cost).toBeLessThan(dayStartFunds)
    }

    const save = serializeGameSave({ campaign })
    const bad = forgeUpgradePurchases(save, purchases)
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('Valid Test: same-day purchases whose combined cost fits within the day-start funds are accepted', () => {
    const campaign = simulateToRank('afford-valid', 4)
    const dayStartFunds = campaign.finance.funds
    const day = campaign.dayNumber
    const purchases = [
      { upgradeId: 'quest_board', targetLevel: 1, cost: 60, day },
      { upgradeId: 'intel_archive', targetLevel: 1, cost: 90, day },
      { upgradeId: 'recovery_room', targetLevel: 1, cost: 120, day },
    ]
    const totalCost = purchases.reduce((sum, p) => sum + p.cost, 0)
    expect(totalCost).toBeLessThanOrEqual(dayStartFunds)

    const save = serializeGameSave({ campaign })
    const good = forgeUpgradePurchases(save, purchases)
    expect(() => validateGameSave(good)).not.toThrow()
  })

  it("Same-day income Test: a purchase unaffordable at day-start cannot be financed by that same day's later quest commission", () => {
    // 5 no-quest days -> day 6 starts with exactly 50 funds. A real quest
    // is then accepted and resolved on day 6 too, earning commission
    // income *within* that same day (added after planning, at resolve
    // time). A forged quest_board Lv1 purchase (cost 60) dated to day 6
    // must still be rejected: it exceeds the funds available at the start
    // of day 6, regardless of what day 6 itself later earns.
    let found:
      | {
          campaign: ReturnType<typeof createTavernCampaign>
          startFunds: number
        }
      | undefined
    for (let i = 1; i <= 40 && !found; i++) {
      const seed = `afford-income-${i}`
      const base = advanceDaysWithoutQuests(createTavernCampaign(seed), 5)
      const best = findBestCommissionPair(base)
      if (!best) continue
      const resolved = resolveCampaignDay({ ...base, currentDay: best.next })
      const campaign = advanceCampaignDay(resolved)
      found = { campaign, startFunds: base.finance.funds }
    }
    expect(found).toBeDefined()
    if (!found) return

    expect(found.startFunds).toBe(50)
    const save = serializeGameSave({ campaign: found.campaign })
    const bad = forgeUpgradePurchases(save, [
      { upgradeId: 'quest_board', targetLevel: 1, cost: 60, day: 6 },
    ])
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('Negative start Test: a purchase dated to a day that started with negative funds is rejected', () => {
    // 11 no-quest days bring funds to 100 - 10*11 = -10 (legal on its
    // own since negative funds are allowed post-Phase-9.1), but any
    // upgrade purchase dated to that day must still be rejected.
    const campaign = advanceDaysWithoutQuests(
      createTavernCampaign('afford-negative'),
      11,
    )
    expect(campaign.finance.funds).toBe(-10)
    const save = serializeGameSave({ campaign })
    expect(() => validateGameSave(save)).not.toThrow()

    const bad = forgeUpgradePurchases(save, [
      { upgradeId: 'quest_board', targetLevel: 1, cost: 60, day: 12 },
    ])
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })
})
