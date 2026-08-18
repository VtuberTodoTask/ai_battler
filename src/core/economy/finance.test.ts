import { describe, expect, it } from 'vitest'
import {
  applyLedgerTransaction,
  applyQuestSettlement,
  buildDailyOperatingCostTransaction,
  buildLedgerEntryId,
  buildOpeningBalanceTransaction,
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

  it('B: opening balance transaction starts the campaign with +100 funds', () => {
    let finance = createInitialFinanceState()
    finance = applyLedgerTransaction(finance, buildOpeningBalanceTransaction())
    expect(finance.funds).toBe(100)
    expect(finance.ledgerEntries.length).toBe(1)
    expect(finance.ledgerEntries[0].kind).toBe('opening_balance')
    expect(finance.ledgerEntries[0].amount).toBe(100)
    expect(finance.ledgerEntries[0].day).toBe(0)
    expect(finance.ledgerEntries[0].id).toBe('opening-balance')
  })

  it('C: daily operating cost transaction records -10 exactly once per day', () => {
    let finance = createInitialFinanceState()
    finance = applyLedgerTransaction(finance, buildOpeningBalanceTransaction())
    finance = applyLedgerTransaction(
      finance,
      buildDailyOperatingCostTransaction(1),
    )
    expect(finance.funds).toBe(90)
    expect(finance.ledgerEntries.length).toBe(2)
    expect(finance.ledgerEntries[1].kind).toBe('daily_operating_cost')
    expect(finance.ledgerEntries[1].amount).toBe(-10)
    expect(finance.ledgerEntries[1].day).toBe(1)
    expect(finance.ledgerEntries[1].id).toBe('daily-operating-cost:1')
  })

  it('D: duplicate daily operating cost application is idempotent', () => {
    let finance = createInitialFinanceState()
    finance = applyLedgerTransaction(finance, buildOpeningBalanceTransaction())
    const cost = buildDailyOperatingCostTransaction(1)
    finance = applyLedgerTransaction(finance, cost)
    const duplicate = applyLedgerTransaction(finance, cost)
    expect(duplicate).toBe(finance)
    expect(duplicate.funds).toBe(90)
    expect(duplicate.ledgerEntries.length).toBe(2)
  })

  it('E: applyQuestSettlement adds a ledger entry and updates funds', () => {
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
    const entry = finance.ledgerEntries[0]
    expect(entry.amount).toBe(26)
    expect(entry.kind).toBe('quest_commission')
    expect(entry.day).toBe(1)
    const questSource = entry.source as { requestId: string; partyId?: string }
    expect(questSource.requestId).toBe('req-1')
    expect(questSource.partyId).toBe('party-1')
    expect(financeInvariantHolds(finance)).toBe(true)
  })

  it('F: duplicate settlement returns the same finance state without adding entries', () => {
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

  it('G: ledgerTotal equals sum of all entry amounts', () => {
    let finance = createInitialFinanceState()
    finance = applyLedgerTransaction(finance, buildOpeningBalanceTransaction())
    finance = applyLedgerTransaction(
      finance,
      buildDailyOperatingCostTransaction(1),
    )
    finance = applyQuestSettlement(
      finance,
      computeQuestSettlement(computeQuestRewardTerms('E'), 'success'),
      1,
      { requestId: 'req-1', partyId: 'party-1' },
    )
    expect(ledgerTotal(finance.ledgerEntries)).toBe(finance.funds)
    expect(financeInvariantHolds(finance)).toBe(true)
  })

  it('H: finance invariant fails when ledger does not match funds', () => {
    const finance = createInitialFinanceState()
    finance.funds = 100
    expect(financeInvariantHolds(finance)).toBe(false)
  })

  it('I: buildLedgerEntryId is stable and unique by day/request/party', () => {
    const id1 = buildLedgerEntryId(1, 'req-1', 'party-1')
    const id2 = buildLedgerEntryId(1, 'req-1', undefined)
    const id3 = buildLedgerEntryId(2, 'req-1', 'party-1')
    expect(id1).not.toBe(id2)
    expect(id1).not.toBe(id3)
    expect(id1).toBe('quest-commission:1:req-1:party-1')
  })

  it('J: zero commission settlement does not create a ledger entry', () => {
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

  it('K: duplicate zero commission settlement returns unchanged finance', () => {
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

  it('L: negative funds are preserved by the finance invariant', () => {
    let finance = createInitialFinanceState()
    finance = applyLedgerTransaction(finance, buildOpeningBalanceTransaction())
    for (let day = 1; day <= 11; day++) {
      finance = applyLedgerTransaction(
        finance,
        buildDailyOperatingCostTransaction(day),
      )
    }
    expect(finance.funds).toBe(-10)
    expect(finance.ledgerEntries.length).toBe(12)
    expect(financeInvariantHolds(finance)).toBe(true)
  })

  it('M: ledgerTotal rejects safe integer overflow', () => {
    const finance = createInitialFinanceState()
    finance.ledgerEntries = [
      {
        id: 'quest-commission:1:req-1:party-1',
        day: 1,
        kind: 'quest_commission',
        amount: Number.MAX_SAFE_INTEGER,
        source: { type: 'expedition', requestId: 'req-1', partyId: 'party-1' },
      },
      {
        id: 'quest-commission:2:req-2:party-2',
        day: 2,
        kind: 'quest_commission',
        amount: Number.MAX_SAFE_INTEGER,
        source: { type: 'expedition', requestId: 'req-2', partyId: 'party-2' },
      },
    ]
    finance.funds = Number.MAX_SAFE_INTEGER * 2
    expect(() => ledgerTotal(finance.ledgerEntries)).toThrow()
    expect(() => financeInvariantHolds(finance)).toThrow()
  })
})
