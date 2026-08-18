import { describe, expect, it } from 'vitest'
import {
  applyQuestSettlement,
  buildLedgerEntryId,
  createInitialFinanceState,
  financeInvariantHolds,
  ledgerTotal,
} from './finance.ts'
import {
  computeQuestSettlement,
  computeQuestRewardTerms,
} from './questReward.ts'

describe('finance', () => {
  it('A: initial finance state has zero funds and empty ledger', () => {
    const finance = createInitialFinanceState()
    expect(finance.funds).toBe(0)
    expect(finance.ledgerEntries).toEqual([])
    expect(financeInvariantHolds(finance)).toBe(true)
  })

  it('B: applyQuestSettlement adds a ledger entry and updates funds', () => {
    let finance = createInitialFinanceState()
    const settlement = computeQuestSettlement(
      computeQuestRewardTerms('C'),
      'success',
    )
    finance = applyQuestSettlement(finance, settlement, 1, {
      requestId: 'req-1',
      partyId: 'party-1',
    })
    expect(finance.funds).toBe(26)
    expect(finance.ledgerEntries.length).toBe(1)
    expect(finance.ledgerEntries[0].amount).toBe(26)
    expect(finance.ledgerEntries[0].kind).toBe('quest_commission')
    expect(finance.ledgerEntries[0].day).toBe(1)
    expect(finance.ledgerEntries[0].source.requestId).toBe('req-1')
    expect(finance.ledgerEntries[0].source.partyId).toBe('party-1')
    expect(financeInvariantHolds(finance)).toBe(true)
  })

  it('C: duplicate settlement returns the same finance state without adding entries', () => {
    let finance = createInitialFinanceState()
    const settlement = computeQuestSettlement(
      computeQuestRewardTerms('C'),
      'success',
    )
    const source = { requestId: 'req-1', partyId: 'party-1' }
    finance = applyQuestSettlement(finance, settlement, 1, source)
    const duplicate = applyQuestSettlement(finance, settlement, 1, source)
    expect(duplicate.funds).toBe(finance.funds)
    expect(duplicate.ledgerEntries.length).toBe(1)
    expect(duplicate).toBe(finance)
  })

  it('D: ledgerTotal equals sum of all entry amounts', () => {
    let finance = createInitialFinanceState()
    finance = applyQuestSettlement(
      finance,
      computeQuestSettlement(computeQuestRewardTerms('E'), 'success'),
      1,
      {
        requestId: 'req-1',
      },
    )
    finance = applyQuestSettlement(
      finance,
      computeQuestSettlement(computeQuestRewardTerms('D'), 'success'),
      1,
      {
        requestId: 'req-2',
      },
    )
    expect(ledgerTotal(finance.ledgerEntries)).toBe(26)
    expect(financeInvariantHolds(finance)).toBe(true)
  })

  it('E: finance invariant fails when ledger does not match funds', () => {
    const finance = createInitialFinanceState()
    finance.funds = 100
    expect(financeInvariantHolds(finance)).toBe(false)
  })

  it('F: buildLedgerEntryId is stable and unique by day/request/party', () => {
    const id1 = buildLedgerEntryId(1, 'req-1', 'party-1')
    const id2 = buildLedgerEntryId(1, 'req-1', undefined)
    const id3 = buildLedgerEntryId(2, 'req-1', 'party-1')
    expect(id1).not.toBe(id2)
    expect(id1).not.toBe(id3)
    expect(id1).toBe('quest-commission:1:req-1:party-1')
  })

  it('G: zero commission settlement does not create a ledger entry', () => {
    let finance = createInitialFinanceState()
    const settlement = computeQuestSettlement(
      computeQuestRewardTerms('C'),
      'failedObjective',
    )
    expect(settlement.tavernCommission).toBe(0)
    finance = applyQuestSettlement(finance, settlement, 1, {
      requestId: 'req-1',
      partyId: 'party-1',
    })
    expect(finance.funds).toBe(0)
    expect(finance.ledgerEntries).toEqual([])
  })

  it('H: duplicate zero commission settlement returns unchanged finance', () => {
    let finance = createInitialFinanceState()
    const settlement = computeQuestSettlement(
      computeQuestRewardTerms('C'),
      'lostExpedition',
    )
    const source = { requestId: 'req-1', partyId: 'party-1' }
    finance = applyQuestSettlement(finance, settlement, 1, source)
    const duplicate = applyQuestSettlement(finance, settlement, 1, source)
    expect(duplicate).toBe(finance)
  })
})
