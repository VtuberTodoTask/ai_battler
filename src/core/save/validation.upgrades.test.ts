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
