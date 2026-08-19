import { describe, expect, it } from 'vitest'
import { createTavernCampaign } from './campaign.ts'
import { deepClone } from '../../util.ts'
import { buildUpgradePurchaseEntryId } from '../../economy/index.ts'
import type { TavernCampaignState, TavernUpgradeId } from './types.ts'
import {
  MAX_TAVERN_UPGRADE_LEVEL,
  TAVERN_UPGRADE_IDS,
  applyRecoveryRoomModifier,
  createInitialUpgradeState,
  dailyRequestBonusForLevel,
  evaluateTavernUpgradePurchase,
  getDailyRequestBonus,
  getEffectiveSampleCount,
  getPredictionSampleMultiplierBps,
  getRecoveryDayReduction,
  getTrainingGrowthXp,
  getUpgradeLevelConfig,
  predictionSampleMultiplierBpsForLevel,
  purchaseTavernUpgrade,
  recoveryDayReductionForLevel,
  tavernUpgradeLabel,
  trainingYardXpBonusForLevel,
} from './upgrades.ts'
import { TRAINING_GROWTH_XP } from './progression.ts'

function fixtureCampaign(
  overrides: (campaign: TavernCampaignState) => void = () => {},
): TavernCampaignState {
  const campaign = deepClone(createTavernCampaign('upgrades-unit-fixture'))
  overrides(campaign)
  return campaign
}

describe('TAVERN_UPGRADE_IDS / labels / config', () => {
  it('lists exactly the five known upgrade ids', () => {
    expect(TAVERN_UPGRADE_IDS).toEqual([
      'quest_board',
      'intel_archive',
      'recovery_room',
      'guest_room',
      'training_yard',
    ])
  })

  it('never exposes raw ids as player-facing text', () => {
    for (const id of TAVERN_UPGRADE_IDS) {
      const label = tavernUpgradeLabel(id)
      expect(label).not.toBe(id)
      expect(label.length).toBeGreaterThan(0)
    }
    expect(tavernUpgradeLabel('quest_board')).toBe('依頼掲示板')
    expect(tavernUpgradeLabel('intel_archive')).toBe('調査資料棚')
    expect(tavernUpgradeLabel('recovery_room')).toBe('療養室')
    expect(tavernUpgradeLabel('guest_room')).toBe('客室')
    expect(tavernUpgradeLabel('training_yard')).toBe('訓練場')
  })

  it('exposes exact cost/rank config per spec for every level of every upgrade', () => {
    expect(getUpgradeLevelConfig('quest_board', 1)).toEqual({
      level: 1,
      cost: 60,
      requiredTavernRank: 1,
    })
    expect(getUpgradeLevelConfig('quest_board', 2)).toEqual({
      level: 2,
      cost: 180,
      requiredTavernRank: 3,
    })
    expect(getUpgradeLevelConfig('intel_archive', 1)).toEqual({
      level: 1,
      cost: 90,
      requiredTavernRank: 2,
    })
    expect(getUpgradeLevelConfig('intel_archive', 2)).toEqual({
      level: 2,
      cost: 220,
      requiredTavernRank: 4,
    })
    expect(getUpgradeLevelConfig('recovery_room', 1)).toEqual({
      level: 1,
      cost: 120,
      requiredTavernRank: 2,
    })
    expect(getUpgradeLevelConfig('recovery_room', 2)).toEqual({
      level: 2,
      cost: 280,
      requiredTavernRank: 4,
    })
    expect(getUpgradeLevelConfig('guest_room', 1)).toEqual({
      level: 1,
      cost: 150,
      requiredTavernRank: 2,
    })
    expect(getUpgradeLevelConfig('guest_room', 2)).toEqual({
      level: 2,
      cost: 360,
      requiredTavernRank: 4,
    })
    expect(getUpgradeLevelConfig('training_yard', 1)).toEqual({
      level: 1,
      cost: 200,
      requiredTavernRank: 3,
    })
    expect(getUpgradeLevelConfig('training_yard', 2)).toEqual({
      level: 2,
      cost: 450,
      requiredTavernRank: 5,
    })
  })

  it('has no config beyond level 0 or above MAX_TAVERN_UPGRADE_LEVEL', () => {
    expect(MAX_TAVERN_UPGRADE_LEVEL).toBe(2)
    for (const id of TAVERN_UPGRADE_IDS) {
      expect(getUpgradeLevelConfig(id, 0)).toBeUndefined()
      expect(getUpgradeLevelConfig(id, 3)).toBeUndefined()
    }
  })

  it('createInitialUpgradeState starts every facility at level 0', () => {
    expect(createInitialUpgradeState()).toEqual({
      levels: {
        quest_board: 0,
        intel_archive: 0,
        recovery_room: 0,
        guest_room: 0,
        training_yard: 0,
      },
    })
  })
})

describe('training yard derived effect', () => {
  it('XP bonus is 0/1/2 for level 0/1/2', () => {
    expect(trainingYardXpBonusForLevel(0)).toBe(0)
    expect(trainingYardXpBonusForLevel(1)).toBe(1)
    expect(trainingYardXpBonusForLevel(2)).toBe(2)
  })

  it('getTrainingGrowthXp is baseline 1/2/3 for level 0/1/2, never affecting expedition XP tables', () => {
    const state = createInitialUpgradeState()
    expect(getTrainingGrowthXp(state)).toBe(TRAINING_GROWTH_XP)
    expect(getTrainingGrowthXp(state)).toBe(1)
    state.levels.training_yard = 1
    expect(getTrainingGrowthXp(state)).toBe(2)
    state.levels.training_yard = 2
    expect(getTrainingGrowthXp(state)).toBe(3)
  })
})

describe('quest board derived effect', () => {
  it('bonus daily requests equal the raw level (0/1/2)', () => {
    expect(dailyRequestBonusForLevel(0)).toBe(0)
    expect(dailyRequestBonusForLevel(1)).toBe(1)
    expect(dailyRequestBonusForLevel(2)).toBe(2)
  })

  it('getDailyRequestBonus reads the level from upgrade state', () => {
    const state = createInitialUpgradeState()
    expect(getDailyRequestBonus(state)).toBe(0)
    state.levels.quest_board = 2
    expect(getDailyRequestBonus(state)).toBe(2)
  })
})

describe('intel archive derived effect', () => {
  it('sample multiplier is 10000/15000/20000 bps for level 0/1/2', () => {
    expect(predictionSampleMultiplierBpsForLevel(0)).toBe(10000)
    expect(predictionSampleMultiplierBpsForLevel(1)).toBe(15000)
    expect(predictionSampleMultiplierBpsForLevel(2)).toBe(20000)
  })

  it('getPredictionSampleMultiplierBps reads the level from upgrade state', () => {
    const state = createInitialUpgradeState()
    expect(getPredictionSampleMultiplierBps(state)).toBe(10000)
    state.levels.intel_archive = 1
    expect(getPredictionSampleMultiplierBps(state)).toBe(15000)
  })

  it('getEffectiveSampleCount scales the base sample count by the multiplier', () => {
    const state = createInitialUpgradeState()
    expect(getEffectiveSampleCount(500, state)).toBe(500)
    state.levels.intel_archive = 1
    expect(getEffectiveSampleCount(500, state)).toBe(750)
    state.levels.intel_archive = 2
    expect(getEffectiveSampleCount(500, state)).toBe(1000)
  })

  it('getEffectiveSampleCount never drops below 1', () => {
    const state = createInitialUpgradeState()
    expect(getEffectiveSampleCount(0, state)).toBe(1)
  })
})

describe('recovery room derived effect', () => {
  it('day reduction is 0/1/2 for level 0/1/2', () => {
    expect(recoveryDayReductionForLevel(0)).toBe(0)
    expect(recoveryDayReductionForLevel(1)).toBe(1)
    expect(recoveryDayReductionForLevel(2)).toBe(2)
  })

  it('getRecoveryDayReduction reads the level from upgrade state', () => {
    const state = createInitialUpgradeState()
    expect(getRecoveryDayReduction(state)).toBe(0)
    state.levels.recovery_room = 2
    expect(getRecoveryDayReduction(state)).toBe(2)
  })

  it('applyRecoveryRoomModifier leaves a zero base (no recovery needed) unchanged', () => {
    const state = createInitialUpgradeState()
    state.levels.recovery_room = 2
    expect(applyRecoveryRoomModifier(0, state)).toBe(0)
  })

  it('applyRecoveryRoomModifier reduces new recovery duration but never below 1 day', () => {
    const state = createInitialUpgradeState()
    state.levels.recovery_room = 1
    expect(applyRecoveryRoomModifier(5, state)).toBe(4)
    state.levels.recovery_room = 2
    expect(applyRecoveryRoomModifier(5, state)).toBe(3)
    // Floors at 1 day even when the reduction would push it to 0 or below.
    expect(applyRecoveryRoomModifier(1, state)).toBe(1)
    expect(applyRecoveryRoomModifier(2, state)).toBe(1)
  })
})

describe('evaluateTavernUpgradePurchase', () => {
  it('allows the first purchase once funds and rank requirements are met', () => {
    const campaign = fixtureCampaign((c) => {
      c.currentDay.status = 'planning'
      c.reputation.peakScore = 100
      c.finance.funds = 1000
    })
    const evaluation = evaluateTavernUpgradePurchase(campaign, 'quest_board')
    expect(evaluation).toEqual({
      canPurchase: true,
      targetLevel: 1,
      cost: 60,
      requiredRank: 1,
    })
  })

  it('blocks purchase outside the planning phase', () => {
    const campaign = fixtureCampaign((c) => {
      c.currentDay.status = 'resolved'
      c.reputation.peakScore = 100
      c.finance.funds = 1000
    })
    const evaluation = evaluateTavernUpgradePurchase(campaign, 'quest_board')
    expect(evaluation.canPurchase).toBe(false)
    expect(evaluation.blockedReason).toBe('not_planning')
  })

  it('blocks purchase when the tavern rank requirement is not met', () => {
    const campaign = fixtureCampaign((c) => {
      c.currentDay.status = 'planning'
      c.reputation.peakScore = 0
      c.finance.funds = 1000
    })
    const evaluation = evaluateTavernUpgradePurchase(campaign, 'intel_archive')
    expect(evaluation.canPurchase).toBe(false)
    expect(evaluation.blockedReason).toBe('rank_locked')
    expect(evaluation.requiredRank).toBe(2)
  })

  it('blocks purchase when funds are insufficient (no debt allowed)', () => {
    const campaign = fixtureCampaign((c) => {
      c.currentDay.status = 'planning'
      c.reputation.peakScore = 100
      c.finance.funds = 59
    })
    const evaluation = evaluateTavernUpgradePurchase(campaign, 'quest_board')
    expect(evaluation.canPurchase).toBe(false)
    expect(evaluation.blockedReason).toBe('insufficient_funds')
  })

  it('blocks purchase past the max level', () => {
    const campaign = fixtureCampaign((c) => {
      c.currentDay.status = 'planning'
      c.reputation.peakScore = 100
      c.finance.funds = 100000
      c.upgrades.levels.quest_board = MAX_TAVERN_UPGRADE_LEVEL
    })
    const evaluation = evaluateTavernUpgradePurchase(campaign, 'quest_board')
    expect(evaluation.canPurchase).toBe(false)
    expect(evaluation.blockedReason).toBe('max_level')
  })

  it('requires level 2 to be purchased only after level 1 (sequential progression)', () => {
    const campaign = fixtureCampaign((c) => {
      c.currentDay.status = 'planning'
      c.reputation.peakScore = 100
      c.finance.funds = 100000
    })
    // Level is still 0, so the next purchasable level is always exactly 1.
    const evaluation = evaluateTavernUpgradePurchase(campaign, 'quest_board')
    expect(evaluation.targetLevel).toBe(1)
  })
})

describe('purchaseTavernUpgrade', () => {
  it('applies the ledger transaction and level bump atomically on success', () => {
    const campaign = fixtureCampaign((c) => {
      c.currentDay.status = 'planning'
      c.reputation.peakScore = 100
      c.finance.funds = 1000
    })
    const fundsBefore = campaign.finance.funds
    const result = purchaseTavernUpgrade(campaign, 'quest_board')

    expect(result.ok).toBe(true)
    expect(result.campaign.upgrades.levels.quest_board).toBe(1)
    expect(result.campaign.finance.funds).toBe(fundsBefore - 60)

    const entryId = buildUpgradePurchaseEntryId('quest_board', 1)
    const entry = result.campaign.finance.ledgerEntries.find(
      (e) => e.id === entryId,
    )
    expect(entry).toBeDefined()
    expect(entry).toMatchObject({
      id: entryId,
      kind: 'upgrade_purchase',
      day: campaign.dayNumber,
      amount: -60,
      source: {
        type: 'tavern_upgrade',
        upgradeId: 'quest_board',
        targetLevel: 1,
      },
    })

    // Original campaign object must never be mutated in place.
    expect(campaign.upgrades.levels.quest_board).toBe(0)
    expect(campaign.finance.funds).toBe(fundsBefore)
  })

  it('leaves the campaign completely unchanged when blocked', () => {
    const campaign = fixtureCampaign((c) => {
      c.currentDay.status = 'planning'
      c.reputation.peakScore = 0
      c.finance.funds = 5
    })
    const result = purchaseTavernUpgrade(campaign, 'quest_board')
    expect(result.ok).toBe(false)
    expect(result.blockedReason).toBe('insufficient_funds')
    // No clone, no mutation: the exact same object is returned.
    expect(result.campaign).toBe(campaign)
  })

  it('supports purchasing level 1 then level 2 sequentially, never skipping a level', () => {
    let campaign = fixtureCampaign((c) => {
      c.currentDay.status = 'planning'
      c.reputation.peakScore = 40 // rank 2: enough for level 1, not level 2 (needs rank 3)
      c.finance.funds = 1000
    })

    const first = purchaseTavernUpgrade(campaign, 'quest_board')
    expect(first.ok).toBe(true)
    expect(first.campaign.upgrades.levels.quest_board).toBe(1)
    campaign = first.campaign

    // Rank 3 required for level 2; not yet reached, so this must be blocked.
    const blocked = purchaseTavernUpgrade(campaign, 'quest_board')
    expect(blocked.ok).toBe(false)
    expect(blocked.blockedReason).toBe('rank_locked')

    campaign = deepClone(campaign)
    campaign.reputation.peakScore = 1000

    const second = purchaseTavernUpgrade(campaign, 'quest_board')
    expect(second.ok).toBe(true)
    expect(second.campaign.upgrades.levels.quest_board).toBe(2)

    const ids = second.campaign.finance.ledgerEntries
      .filter((e) => e.kind === 'upgrade_purchase')
      .map((e) => e.id)
    expect(ids.sort()).toEqual(
      [
        buildUpgradePurchaseEntryId('quest_board', 1),
        buildUpgradePurchaseEntryId('quest_board', 2),
      ].sort(),
    )
  })

  it('works identically for every upgrade id', () => {
    for (const id of TAVERN_UPGRADE_IDS as TavernUpgradeId[]) {
      const campaign = fixtureCampaign((c) => {
        c.currentDay.status = 'planning'
        c.reputation.peakScore = 1000
        c.finance.funds = 1000
      })
      const result = purchaseTavernUpgrade(campaign, id)
      expect(result.ok).toBe(true)
      expect(result.campaign.upgrades.levels[id]).toBe(1)
    }
  })
})
