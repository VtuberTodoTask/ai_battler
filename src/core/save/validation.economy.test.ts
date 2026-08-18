import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../tavern/brokerage.ts'
import type { ResolvedDispatch } from '../tavern/types.ts'
import { buildLedgerEntryId, ledgerTotal } from '../economy/finance.ts'
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

function resolveZeroCommissionPair(seedPrefix: string): {
  campaign: ReturnType<typeof createTavernCampaign>
  result: ResolvedDispatch
} | null {
  for (let i = 0; i < 20; i++) {
    const campaign = createTavernCampaign(`${seedPrefix}-${i}`)
    for (const request of campaign.currentDay.requests) {
      for (const party of campaign.currentDay.parties) {
        const next = offerRequestToParty(
          campaign.currentDay,
          request.id,
          party.id,
        )
        if (!next.matches.some((m) => m.requestId === request.id)) continue
        const resolved = resolveCampaignDay({
          ...campaign,
          currentDay: next,
        })
        const result = resolved.currentDay.results[0]
        if (
          result &&
          result.status === 'resolved' &&
          result.settlement &&
          result.settlement.tavernCommission === 0
        ) {
          return { campaign: resolved, result }
        }
      }
    }
  }
  return null
}

function makeSave(seed: string) {
  return serializeGameSave({ campaign: resolveFirstAcceptingPair(seed) })
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function findQuestCommissionEntry(save: ReturnType<typeof makeSave>) {
  return save.campaign.finance.ledgerEntries.find(
    (entry) => entry.kind === 'quest_commission',
  )
}

function findDailyOperatingCostEntry(save: ReturnType<typeof makeSave>) {
  return save.campaign.finance.ledgerEntries.find(
    (entry) => entry.kind === 'daily_operating_cost',
  )
}

function findOpeningBalanceEntry(save: ReturnType<typeof makeSave>) {
  return save.campaign.finance.ledgerEntries.find(
    (entry) => entry.kind === 'opening_balance',
  )
}

function buildNegativeFundsSave(seed: string) {
  return buildContinuousPlanningSave(seed, 12)
}

function buildContinuousPlanningSave(seed: string, dayNumber: number) {
  const save = serializeGameSave({ campaign: createTavernCampaign(seed) })
  save.campaign.dayNumber = dayNumber
  save.campaign.history = []
  for (let day = 1; day < dayNumber; day++) {
    save.campaign.history.push({
      dayNumber: day,
      results: [],
      partyEvents: [],
      relationshipEvents: [],
      progressionEvents: [],
      reputationSummary: {
        beforeScore: 0,
        delta: 0,
        afterScore: 0,
        beforeRank: 1,
        afterRank: 1,
        promoted: false,
      },
    } as never)
  }
  save.campaign.finance.ledgerEntries = [
    {
      id: 'opening-balance',
      day: 0,
      kind: 'opening_balance',
      amount: 100,
      source: { type: 'campaign_start' },
    },
    ...Array.from({ length: dayNumber - 1 }, (_, i) => ({
      id: `daily-operating-cost:${i + 1}`,
      day: i + 1,
      kind: 'daily_operating_cost' as const,
      amount: -10,
      source: { type: 'daily_operating_cost' as const },
    })),
  ]
  save.campaign.finance.funds = ledgerTotal(save.campaign.finance.ledgerEntries)
  return save
}

describe('save economy validation', () => {
  it('funds that do not match ledger total are rejected', () => {
    const save = makeSave('funds-mismatch')
    const bad = clone(save)
    bad.campaign.finance.funds += 100
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('missing rewardTerms are rejected', () => {
    const save = makeSave('missing-reward-terms')
    const bad = clone(save)
    delete (
      bad.campaign.history[0].results[0] as {
        request: { rewardTerms?: unknown }
      }
    ).request.rewardTerms
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('negative promised reward is rejected', () => {
    const save = makeSave('negative-reward')
    const bad = clone(save)
    bad.campaign.currentDay.requests[0].rewardTerms.promisedReward = -100
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('invalid tavern commission bps is rejected', () => {
    const save = makeSave('invalid-commission-bps')
    const bad = clone(save)
    bad.campaign.currentDay.requests[0].rewardTerms.tavernCommissionBps = 15000
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('resolved result without settlement is rejected', () => {
    const save = makeSave('missing-settlement')
    const bad = clone(save)
    delete (bad.campaign.history[0].results[0] as { settlement?: unknown })
      .settlement
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('settlement paidReward mismatch is rejected', () => {
    const save = makeSave('paid-mismatch')
    const bad = clone(save)
    bad.campaign.history[0].results[0].settlement!.paidReward += 1
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('settlement tavernCommission mismatch is rejected', () => {
    const save = makeSave('commission-mismatch')
    const bad = clone(save)
    bad.campaign.history[0].results[0].settlement!.tavernCommission += 1
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('settlement reason mismatch is rejected', () => {
    const save = makeSave('reason-mismatch')
    const bad = clone(save)
    bad.campaign.history[0].results[0].settlement!.settlementReason =
      'objective_failed'
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('duplicate ledger entry id is rejected', () => {
    const save = makeSave('duplicate-ledger')
    const bad = clone(save)
    const first = bad.campaign.finance.ledgerEntries[0]
    bad.campaign.finance.ledgerEntries.push({ ...first })
    bad.campaign.finance.funds += first.amount
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('ledger amount that does not match settlement is rejected', () => {
    const save = makeSave('ledger-amount-mismatch')
    const bad = clone(save)
    const entry = findQuestCommissionEntry(bad)
    if (!entry) throw new Error('no quest commission entry')
    entry.amount += 10
    bad.campaign.finance.funds += 10
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('malformed ledger source is rejected', () => {
    const save = makeSave('ledger-source-malformed')
    const bad = clone(save)
    const entry = findQuestCommissionEntry(bad)
    if (!entry) throw new Error('no quest commission entry')
    ;(entry.source as { type: string }).type = 'invalid'
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('zero commission settlement has no corresponding ledger entry', () => {
    const resolved = resolveZeroCommissionPair('zero-commission-settlement')
    expect(resolved).not.toBeNull()
    if (!resolved) return

    let campaign = resolved.campaign
    const result = resolved.result
    expect(result.settlement).toBeDefined()
    if (!result.settlement) return
    campaign = advanceCampaignDay(campaign)
    expect(campaign.finance.ledgerEntries.length).toBe(2)
    expect(campaign.finance.funds).toBe(90)

    const save = serializeGameSave({ campaign })
    expect(() => validateGameSave(save)).not.toThrow()

    const bad = clone(save)
    const entry = {
      id: buildLedgerEntryId(
        campaign.dayNumber - 1,
        result.requestId,
        result.partyId,
      ),
      day: campaign.dayNumber - 1,
      kind: 'quest_commission' as const,
      amount: result.settlement.promisedReward,
      source: {
        type: 'expedition' as const,
        requestId: result.requestId,
        partyId: result.partyId,
      },
    }
    bad.campaign.finance.ledgerEntries.push(entry)
    bad.campaign.finance.funds += entry.amount
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('ledger id must match computed id from source fields', () => {
    const save = makeSave('ledger-id-mismatch')
    const bad = clone(save)
    const entry = findQuestCommissionEntry(bad)
    if (!entry) throw new Error('no quest commission entry')
    entry.id = 'custom-id'
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('resolved status with missing result is rejected', () => {
    const save = makeSave('missing-result')
    const bad = clone(save)
    const resolved = bad.campaign.history[0].results.find(
      (r) => r.status === 'resolved',
    )!
    delete (resolved as { result?: unknown }).result
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('resolved status with missing settlement is rejected', () => {
    const save = makeSave('missing-settlement')
    const bad = clone(save)
    const resolved = bad.campaign.history[0].results.find(
      (r) => r.status === 'resolved',
    )!
    delete (resolved as { settlement?: unknown }).settlement
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('invalid dispatch status is rejected', () => {
    const save = makeSave('invalid-status')
    const bad = clone(save)
    const resolved = bad.campaign.history[0].results.find(
      (r) => r.status === 'resolved',
    )!
    ;(resolved as { status: string }).status = 'invalid-status'
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('orphan ledger entry is rejected', () => {
    const save = makeSave('orphan-ledger')
    const bad = clone(save)
    const entry = {
      id: buildLedgerEntryId(999, 'fake-request', 'fake-party'),
      day: 999,
      kind: 'quest_commission' as const,
      amount: 100,
      source: {
        type: 'expedition' as const,
        requestId: 'fake-request',
        partyId: 'fake-party',
      },
    }
    bad.campaign.finance.ledgerEntries.push(entry)
    bad.campaign.finance.funds += entry.amount
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('wrong ledger requestId is rejected', () => {
    const save = makeSave('wrong-ledger-requestId')
    const bad = clone(save)
    const entry = findQuestCommissionEntry(bad)
    if (!entry) throw new Error('no quest commission entry')
    ;(entry.source as { requestId: string }).requestId = 'other-request'
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('wrong ledger partyId is rejected', () => {
    const save = makeSave('wrong-ledger-partyId')
    const bad = clone(save)
    const entry = findQuestCommissionEntry(bad)
    if (!entry) throw new Error('no quest commission entry')
    ;(entry.source as { partyId?: string }).partyId = 'other-party'
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('valid positive settlement with matching ledger is accepted', () => {
    const save = makeSave('valid-positive')
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('valid zero commission settlement with no ledger is accepted', () => {
    const resolved = resolveZeroCommissionPair('valid-zero-commission')
    expect(resolved).not.toBeNull()
    if (!resolved) return

    let campaign = resolved.campaign
    campaign = advanceCampaignDay(campaign)
    expect(campaign.finance.ledgerEntries.length).toBe(2)
    expect(campaign.finance.funds).toBe(90)

    const save = serializeGameSave({ campaign })
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('missing opening balance is rejected', () => {
    const save = makeSave('missing-opening')
    const bad = clone(save)
    bad.campaign.finance.ledgerEntries =
      bad.campaign.finance.ledgerEntries.filter(
        (entry) => entry.kind !== 'opening_balance',
      )
    bad.campaign.finance.funds = ledgerTotal(bad.campaign.finance.ledgerEntries)
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('wrong opening balance amount is rejected', () => {
    const save = makeSave('wrong-opening-amount')
    const bad = clone(save)
    const entry = findOpeningBalanceEntry(bad)
    if (!entry) throw new Error('no opening balance entry')
    entry.amount = 50
    bad.campaign.finance.funds = 50
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('negative opening balance amount is rejected', () => {
    const save = makeSave('negative-opening-amount')
    const bad = clone(save)
    const entry = findOpeningBalanceEntry(bad)
    if (!entry) throw new Error('no opening balance entry')
    entry.amount = -100
    bad.campaign.finance.funds = ledgerTotal(bad.campaign.finance.ledgerEntries)
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('missing daily operating cost is rejected', () => {
    const save = makeSave('missing-daily-cost')
    const bad = clone(save)
    const entry = findDailyOperatingCostEntry(bad)
    if (!entry) throw new Error('no daily operating cost entry')
    bad.campaign.finance.ledgerEntries =
      bad.campaign.finance.ledgerEntries.filter((e) => e !== entry)
    bad.campaign.finance.funds = ledgerTotal(bad.campaign.finance.ledgerEntries)
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('wrong daily operating cost amount is rejected', () => {
    const save = makeSave('wrong-daily-cost-amount')
    const bad = clone(save)
    const entry = findDailyOperatingCostEntry(bad)
    if (!entry) throw new Error('no daily operating cost entry')
    entry.amount = -20
    bad.campaign.finance.funds = ledgerTotal(bad.campaign.finance.ledgerEntries)
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('negative funds are valid when ledger matches', () => {
    const save = buildNegativeFundsSave('negative-funds')
    expect(save.campaign.finance.funds).toBe(-10)
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('unknown ledger kind is rejected', () => {
    const save = makeSave('unknown-ledger-kind')
    const bad = clone(save)
    const entry = {
      id: 'custom-entry',
      day: 1,
      kind: 'unknown_kind' as const,
      amount: 10,
      source: { type: 'expedition' as const, requestId: 'x', partyId: 'y' },
    }
    bad.campaign.finance.ledgerEntries.push(entry as never)
    bad.campaign.finance.funds += entry.amount
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('planning save with continuous history is accepted', () => {
    const save = buildContinuousPlanningSave('planning-continuous', 5)
    expect(save.campaign.dayNumber).toBe(5)
    expect(save.campaign.history.length).toBe(4)
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('resolved state save is rejected', () => {
    const resolved = resolveCampaignDay(createTavernCampaign('resolved-save'))
    expect(resolved.currentDay.status).toBe('resolved')
    const save = serializeGameSave({ campaign: resolved })
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('missing history day is rejected', () => {
    const save = buildContinuousPlanningSave('missing-history-day', 5)
    // Remove DAY 3 from history and its operating cost, then recompute funds.
    save.campaign.history = save.campaign.history.filter(
      (record) => (record as { dayNumber: number }).dayNumber !== 3,
    )
    save.campaign.finance.ledgerEntries =
      save.campaign.finance.ledgerEntries.filter(
        (entry) => entry.id !== 'daily-operating-cost:3',
      )
    save.campaign.finance.funds = ledgerTotal(
      save.campaign.finance.ledgerEntries,
    )
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('extra history day beyond dayNumber is rejected', () => {
    const save = buildContinuousPlanningSave('extra-history-day', 5)
    save.campaign.history.push({
      dayNumber: 5,
      results: [],
      partyEvents: [],
      relationshipEvents: [],
      progressionEvents: [],
    } as never)
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('future history day is rejected', () => {
    const save = buildContinuousPlanningSave('future-history-day', 5)
    save.campaign.history.push({
      dayNumber: 6,
      results: [],
      partyEvents: [],
      relationshipEvents: [],
      progressionEvents: [],
    } as never)
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })
})
