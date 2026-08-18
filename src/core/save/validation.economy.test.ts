import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../tavern/brokerage.ts'
import type { ResolvedDispatch } from '../tavern/types.ts'
import { buildLedgerEntryId } from '../economy/finance.ts'
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
    const entry = bad.campaign.finance.ledgerEntries[0]
    entry.amount += 10
    bad.campaign.finance.funds += 10
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('malformed ledger source is rejected', () => {
    const save = makeSave('ledger-source-malformed')
    const bad = clone(save)
    ;(bad.campaign.finance.ledgerEntries[0].source as { type: string }).type =
      'invalid'
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
    expect(campaign.finance.ledgerEntries.length).toBe(0)
    expect(campaign.finance.funds).toBe(0)

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
    bad.campaign.finance.ledgerEntries = [entry]
    bad.campaign.finance.funds = entry.amount
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('ledger id must match computed id from source fields', () => {
    const save = makeSave('ledger-id-mismatch')
    const bad = clone(save)
    bad.campaign.finance.ledgerEntries[0].id = 'custom-id'
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
    ;(
      bad.campaign.finance.ledgerEntries[0].source as { requestId: string }
    ).requestId = 'other-request'
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('wrong ledger partyId is rejected', () => {
    const save = makeSave('wrong-ledger-partyId')
    const bad = clone(save)
    ;(
      bad.campaign.finance.ledgerEntries[0].source as { partyId?: string }
    ).partyId = 'other-party'
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
    expect(campaign.finance.ledgerEntries.length).toBe(0)
    expect(campaign.finance.funds).toBe(0)

    const save = serializeGameSave({ campaign })
    expect(() => validateGameSave(save)).not.toThrow()
  })
})
