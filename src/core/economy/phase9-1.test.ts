import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../tavern/brokerage.ts'
import { serializeGameSave, deserializeGameSave } from '../save/serializer.ts'
import { validateGameSave } from '../save/validation.ts'
import { formatLedgerAmount, formatSignedCurrencyAmount } from './index.ts'
import { financeInvariantHolds } from './finance.ts'
import { buildTavernLedgerViewModel } from '../../ui/canvas/viewModel/tavernLedgerViewModel.ts'
import { buildTavernScreenViewModel } from '../../ui/canvas/viewModel/tavernScreenViewModel.ts'
import { buildDayResultsSceneViewModel } from '../../ui/canvas/scenes/dayResults/dayResultsViewModel.ts'

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

function resolveSampleDay(campaign: ReturnType<typeof createTavernCampaign>) {
  const pair = findAcceptingPair(campaign)
  if (!pair) throw new Error('no accepting pair')
  let c = { ...campaign, currentDay: pair.next }
  c = resolveCampaignDay(c)
  c = advanceCampaignDay(c)
  return c
}

describe('Phase 9.1 tavern economy smoke', () => {
  it('A: new campaign starts with 100 funds and an opening balance ledger', () => {
    const campaign = createTavernCampaign('phase9-1-a')
    expect(campaign.finance.funds).toBe(100)
    expect(campaign.finance.ledgerEntries).toHaveLength(1)
    expect(campaign.finance.ledgerEntries[0]).toMatchObject({
      id: 'opening-balance',
      day: 0,
      kind: 'opening_balance',
      amount: 100,
      source: { type: 'campaign_start' },
    })
    expect(financeInvariantHolds(campaign.finance)).toBe(true)
  })

  it('B: each resolved day records a single -10 operating cost entry', () => {
    const campaign = resolveSampleDay(createTavernCampaign('phase9-1-b'))
    const operatingEntries = campaign.finance.ledgerEntries.filter(
      (entry) => entry.kind === 'daily_operating_cost',
    )
    expect(operatingEntries).toHaveLength(1)
    expect(operatingEntries[0].amount).toBe(-10)
    expect(operatingEntries[0].id).toBe('daily-operating-cost:1')

    const second = resolveSampleDay(campaign)
    const operatingEntries2 = second.finance.ledgerEntries.filter(
      (entry) => entry.kind === 'daily_operating_cost',
    )
    expect(operatingEntries2).toHaveLength(2)
    expect(operatingEntries2[1].id).toBe('daily-operating-cost:2')
    expect(financeInvariantHolds(second.finance)).toBe(true)

    // Resolving the same day again must not duplicate the cost.
    const resolvedOnce = resolveCampaignDay(
      createTavernCampaign('phase9-1-b-dup'),
    )
    const fundsAfterResolve = resolvedOnce.finance.funds
    expect(
      resolvedOnce.finance.ledgerEntries.filter(
        (entry) => entry.kind === 'daily_operating_cost',
      ),
    ).toHaveLength(1)
    expect(() => resolveCampaignDay(resolvedOnce)).toThrow()
    expect(resolvedOnce.finance.funds).toBe(fundsAfterResolve)
    expect(
      resolvedOnce.finance.ledgerEntries.filter(
        (entry) => entry.kind === 'daily_operating_cost',
      ),
    ).toHaveLength(1)
  })

  it('C: successful quest adds positive commission and daily operating cost', () => {
    const campaign = resolveSampleDay(createTavernCampaign('phase9-1-c'))
    const commissions = campaign.finance.ledgerEntries.filter(
      (entry) => entry.kind === 'quest_commission',
    )
    expect(commissions.length).toBeGreaterThan(0)
    for (const entry of commissions) {
      expect(entry.amount).toBeGreaterThan(0)
    }

    const dailyCosts = campaign.finance.ledgerEntries.filter(
      (entry) => entry.kind === 'daily_operating_cost',
    )
    expect(dailyCosts).toHaveLength(1)
    expect(dailyCosts[0].amount).toBe(-10)
    expect(financeInvariantHolds(campaign.finance)).toBe(true)
  })

  it('D: failed quest records daily operating cost with no commission', () => {
    const campaign = createTavernCampaign('phase9-1-d')
    const resolved = resolveCampaignDay(campaign)
    const commissions = resolved.finance.ledgerEntries.filter(
      (entry) => entry.kind === 'quest_commission',
    )
    expect(commissions).toHaveLength(0)
    const dailyCosts = resolved.finance.ledgerEntries.filter(
      (entry) => entry.kind === 'daily_operating_cost',
    )
    expect(dailyCosts).toHaveLength(1)
    expect(dailyCosts[0].amount).toBe(-10)
    expect(financeInvariantHolds(resolved.finance)).toBe(true)
  })

  it('E: negative funds are valid and do not block the game', () => {
    let campaign = createTavernCampaign('phase9-1-e')
    // Resolve 11 days without accepting any offers to drain starting funds.
    for (let i = 0; i < 11; i++) {
      campaign = resolveCampaignDay(campaign)
      campaign = advanceCampaignDay(campaign)
    }
    expect(campaign.finance.funds).toBe(-10)
    expect(financeInvariantHolds(campaign.finance)).toBe(true)
    // The game must still be able to continue to the next day.
    expect(campaign.currentDay.status).toBe('planning')
    expect(campaign.currentDay.requests.length).toBeGreaterThan(0)
  })

  it('F: signed ledger and funds formatters show explicit +/- signs', () => {
    expect(formatLedgerAmount(100)).toBe('+100')
    expect(formatLedgerAmount(-10)).toBe('-10')
    expect(formatLedgerAmount(0)).toBe('0')
    expect(formatSignedCurrencyAmount(100)).toBe('100')
    expect(formatSignedCurrencyAmount(-10)).toBe('-10')
  })

  it('G: save and load preserve negative funds and ledger', () => {
    let campaign = createTavernCampaign('phase9-1-g')
    for (let i = 0; i < 11; i++) {
      campaign = resolveCampaignDay(campaign)
      campaign = advanceCampaignDay(campaign)
    }
    expect(campaign.finance.funds).toBe(-10)
    const serialized = serializeGameSave({ campaign })
    const loaded = deserializeGameSave(serialized)
    expect(loaded.campaign.finance.funds).toBe(-10)
    expect(loaded.campaign.finance.ledgerEntries).toEqual(
      campaign.finance.ledgerEntries,
    )
    expect(() => validateGameSave(serialized)).not.toThrow()
  })

  it('H: duplicate daily operating cost entry is not applied twice', () => {
    let campaign = createTavernCampaign('phase9-1-h')
    campaign = resolveCampaignDay(campaign)
    const fundsAfterFirst = campaign.finance.funds
    // Attempt to resolve an already-resolved day; the cost must not be duplicated.
    expect(() => resolveCampaignDay(campaign)).toThrow()
    expect(campaign.finance.funds).toBe(fundsAfterFirst)
  })

  it('I: economy helpers and resolve do not create narrative generations', () => {
    const campaign = createTavernCampaign('phase9-1-i')
    const generationsBefore = campaign.narrativeGenerations.length
    resolveSampleDay(campaign)

    const vmCampaign = resolveSampleDay(createTavernCampaign('phase9-1-i-vm'))
    buildTavernScreenViewModel(vmCampaign, {
      selectedPartyId: null,
      selectedQuestId: null,
      openCharacterId: null,
      modalOpen: false,
      viewedReportIds: [],
      viewedActivityIds: [],
    })
    buildTavernLedgerViewModel(vmCampaign, { sceneId: 'tavern' })
    buildDayResultsSceneViewModel({
      campaign: vmCampaign,
      resolvedDay: vmCampaign.dayNumber - 1,
      nextDay: vmCampaign.dayNumber,
    })

    expect(vmCampaign.narrativeGenerations.length).toBe(generationsBefore)
  })

  it('J: same seed produces the same starting funds and operating cost records', () => {
    const a = resolveSampleDay(createTavernCampaign('phase9-1-j'))
    const b = resolveSampleDay(createTavernCampaign('phase9-1-j'))
    expect(a.finance.funds).toBe(b.finance.funds)
    expect(a.finance.ledgerEntries).toEqual(b.finance.ledgerEntries)
  })
})
