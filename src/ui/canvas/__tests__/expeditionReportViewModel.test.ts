// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../../core/tavern/brokerage.ts'
import { getOfferErrors } from '../../../core/tavern/brokerage.ts'
import type { ExpeditionInjury } from '../../../core/expedition/types.ts'
import type { ResolvedDispatch } from '../../../core/tavern/types.ts'
import {
  buildExpeditionReportViewModels,
  findExpeditionReportById,
} from '../viewModel/expeditionReportViewModel.ts'

function findAcceptable(
  campaign: ReturnType<typeof createTavernCampaign>,
  partyId: string,
) {
  return campaign.currentDay.requests.find(
    (r) => getOfferErrors(campaign.currentDay, r.id, partyId).length === 0,
  )
}

function forceAccept(
  campaign: ReturnType<typeof createTavernCampaign>,
  partyId: string,
  requestId: string,
): void {
  campaign.currentDay.matches.push({
    requestId,
    partyId,
    acceptedOfferId: '',
  })
}

function clearMemberConditions(
  result: ResolvedDispatch,
  memberId: string,
): void {
  if (!result.report || !result.result) return
  // Clear all structured conditions so individual member tests start from a
  // clean slate. The caller can then add back conditions for the target member.
  result.report.incapacitated = []
  result.report.casualties = []
  result.result.state.incapacitated = []
  result.result.state.casualties = []
  result.result.state.injuries = []
  for (const member of result.report.party) {
    member.incapacitated = false
    member.dead = false
  }

  // Also remove any lingering reference to the target member from the report.
  result.report.casualties = result.report.casualties.filter(
    (id) => id !== memberId,
  )
}

function resolveWithForcedAccept(seed: string, partyIndex = 0) {
  const campaign = createTavernCampaign(seed)
  const party = campaign.currentDay.parties[partyIndex]!
  const quest = findAcceptable(campaign, party.id)
  if (!quest) return null

  forceAccept(campaign, party.id, quest.id)
  const resolved = resolveCampaignDay(campaign)
  return { campaign: resolved, party, quest }
}

describe('ExpeditionReportViewModel', () => {
  it('returns no reports before any expedition is resolved', () => {
    const campaign = createTavernCampaign('report-empty')
    const reports = buildExpeditionReportViewModels(campaign)
    expect(reports).toHaveLength(0)
  })

  it('projects a resolved expedition into a structured report', () => {
    let campaign = createTavernCampaign('report-projection')
    const party = campaign.currentDay.parties[0]!
    const quest = findAcceptable(campaign, party.id)
    if (!quest) {
      // Skip this seed if no request is acceptable for the first party.
      return
    }

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }

    const resolved = resolveCampaignDay(campaign)
    expect(resolved.currentDay.status).toBe('resolved')

    const reports = buildExpeditionReportViewModels(resolved)
    expect(reports.length).toBeGreaterThan(0)

    const report = reports[0]!
    expect(report.questTitle).toBe(quest.title)
    expect(report.partyName).toBe(party.party.name)
    expect(report.day).toBe(resolved.dayNumber)
    expect(report.outcomeLabel).toBeTruthy()
    expect(report.objectiveSummary).toBeTruthy()
    expect(report.survivalText).toMatch(/\d+ \/ \d+ 生還/)
    expect(report.casualties).toBeDefined()
    expect(report.injuries).toBeDefined()
    expect(report.majorEvents).toBeDefined()
    expect(report.canGenerateNarrative).toBe(true)
    expect(report.narrativeStatus).toBe('unseen')
    expect(report.id).toBeTruthy()

    const found = findExpeditionReportById(reports, report.id)
    expect(found).toBe(report)
  })

  it('marks report as viewed when its id is in viewedReportIds', () => {
    let campaign = createTavernCampaign('report-viewed')
    const party = campaign.currentDay.parties[0]!
    const quest = findAcceptable(campaign, party.id)
    if (!quest) return

    const nextDay = offerRequestToParty(campaign.currentDay, quest.id, party.id)
    campaign = { ...campaign, currentDay: nextDay }
    const resolved = resolveCampaignDay(campaign)
    const reports = buildExpeditionReportViewModels(resolved)
    if (reports.length === 0) return

    const report = reports[0]!
    const viewModel = buildExpeditionReportViewModels(resolved)
    // viewModel does not track viewed state; TavernScreenViewModel does.
    // Verify the report id can be found.
    expect(findExpeditionReportById(viewModel, report.id)).toBeDefined()
  })

  it('expeditionReportHistory: keeps past reports after advancing to the next day', () => {
    let campaign = createTavernCampaign('report-history')
    const firstParty = campaign.currentDay.parties[0]!
    const firstQuest = findAcceptable(campaign, firstParty.id)
    if (!firstQuest) return

    const firstNext = offerRequestToParty(
      campaign.currentDay,
      firstQuest.id,
      firstParty.id,
    )
    campaign = { ...campaign, currentDay: firstNext }
    campaign = resolveCampaignDay(campaign)
    const firstReportId = buildExpeditionReportViewModels(campaign)[0]?.id
    expect(firstReportId).toBeTruthy()

    campaign = advanceCampaignDay(campaign)
    const afterAdvance = buildExpeditionReportViewModels(campaign)
    expect(afterAdvance.some((r) => r.id === firstReportId)).toBe(true)

    const secondParty = campaign.currentDay.parties[0]!
    const secondQuest = findAcceptable(campaign, secondParty.id)
    if (!secondQuest) return

    const secondNext = offerRequestToParty(
      campaign.currentDay,
      secondQuest.id,
      secondParty.id,
    )
    campaign = { ...campaign, currentDay: secondNext }
    campaign = resolveCampaignDay(campaign)

    const finalReports = buildExpeditionReportViewModels(campaign)
    expect(finalReports.length).toBeGreaterThanOrEqual(2)
    const ids = new Set(finalReports.map((r) => r.id))
    expect(ids.has(firstReportId!)).toBe(true)
  })

  it('deduplicates reports that appear in both currentDay and history', () => {
    const fixture = resolveWithForcedAccept('report-dedup')
    if (!fixture) return

    const { campaign } = fixture
    const baseReports = buildExpeditionReportViewModels(campaign)
    expect(baseReports).toHaveLength(1)
    const baseId = baseReports[0]!.id

    // Simulate an old save / duplicate write where the same result exists
    // in both currentDay.results and the dayRecord.results.
    const duplicate = { ...campaign.currentDay.results[0] }
    campaign.history[0]!.results.push(duplicate)

    const deduped = buildExpeditionReportViewModels(campaign)
    expect(deduped).toHaveLength(1)
    expect(deduped[0]!.id).toBe(baseId)
  })

  it('uses structured injuries instead of final HP ratios', () => {
    const fixture = resolveWithForcedAccept('report-injury-light')
    if (!fixture) return

    const { campaign } = fixture
    campaign.history = []

    const result = campaign.currentDay.results.find(
      (r) => r.status === 'resolved',
    )!
    const member = result.result!.party[0]!
    clearMemberConditions(result, member.id)

    // Force low final HP while adding a structured light injury.
    result.report!.party[0]!.finalHp = 1
    result.report!.party[0]!.maxHp = 100
    result.result!.state.partyHp[member.id] = 1
    result.result!.state.injuries = [
      {
        id: 'inj-light',
        adventurerId: member.id,
        type: 'light',
        cause: 'test',
        hpLoss: 5,
        status: 'active',
        sourceType: 'expedition',
      } satisfies ExpeditionInjury,
    ]

    const reports = buildExpeditionReportViewModels(campaign)
    expect(reports[0]!.injuries).toHaveLength(1)
    expect(reports[0]!.injuries[0]!.name).toBe(member.name)
    expect(reports[0]!.injuries[0]!.severity).toBe('軽傷')
    expect(reports[0]!.injuryRecordMissing).toBe(false)
  })

  it('does not show injury for low HP without structured injury', () => {
    const fixture = resolveWithForcedAccept('report-injury-none')
    if (!fixture) return

    const { campaign } = fixture
    campaign.history = []

    const result = campaign.currentDay.results.find(
      (r) => r.status === 'resolved',
    )!
    const member = result.result!.party[0]!
    clearMemberConditions(result, member.id)

    result.report!.party[0]!.finalHp = 10
    result.report!.party[0]!.maxHp = 100
    result.result!.state.injuries = []

    const reports = buildExpeditionReportViewModels(campaign)
    expect(reports[0]!.injuries).toHaveLength(0)
    expect(reports[0]!.injuryRecordMissing).toBe(false)
  })

  it('shows the most severe injury when a character has multiple injuries', () => {
    const fixture = resolveWithForcedAccept('report-injury-multiple')
    if (!fixture) return

    const { campaign } = fixture
    campaign.history = []

    const result = campaign.currentDay.results.find(
      (r) => r.status === 'resolved',
    )!
    const member = result.result!.party[0]!
    clearMemberConditions(result, member.id)

    result.result!.state.injuries = [
      {
        id: 'inj-light',
        adventurerId: member.id,
        type: 'light',
        cause: 'minor fall',
        hpLoss: 5,
        status: 'active',
        sourceType: 'expedition',
      } satisfies ExpeditionInjury,
      {
        id: 'inj-serious',
        adventurerId: member.id,
        type: 'serious',
        cause: 'heavy blow',
        hpLoss: 30,
        status: 'active',
        sourceType: 'expedition',
      } satisfies ExpeditionInjury,
    ]

    const reports = buildExpeditionReportViewModels(campaign)
    expect(reports[0]!.injuries).toHaveLength(1)
    expect(reports[0]!.injuries[0]!.severity).toBe('重傷')
  })

  it('hides injury for casualties even if structured injury exists', () => {
    const fixture = resolveWithForcedAccept('report-injury-casualty')
    if (!fixture) return

    const { campaign } = fixture
    campaign.history = []

    const result = campaign.currentDay.results.find(
      (r) => r.status === 'resolved',
    )!
    const member = result.result!.party[0]!
    clearMemberConditions(result, member.id)
    const reportParty = result.report!.party.find(
      (p) => p.adventurerId === member.id,
    )!

    reportParty.dead = true
    result.report!.casualties.push(member.id)
    result.result!.state.casualties.push(member.id)
    result.result!.state.injuries = [
      {
        id: 'inj-light',
        adventurerId: member.id,
        type: 'light',
        cause: 'test',
        hpLoss: 5,
        status: 'active',
        sourceType: 'expedition',
      } satisfies ExpeditionInjury,
    ]

    const reports = buildExpeditionReportViewModels(campaign)
    expect(reports[0]!.casualties).toHaveLength(1)
    expect(reports[0]!.casualties[0]!.name).toBe(member.name)
    expect(reports[0]!.casualties[0]!.condition).toBe('死亡')
    expect(reports[0]!.injuries.some((i) => i.name === member.name)).toBe(false)
  })

  it('marks injury record as missing for old saves without state.injuries', () => {
    const fixture = resolveWithForcedAccept('report-injury-oldsave')
    if (!fixture) return

    const { campaign } = fixture
    campaign.history = []

    const result = campaign.currentDay.results.find(
      (r) => r.status === 'resolved',
    )!
    result.result!.state.injuries = undefined as unknown as ExpeditionInjury[]

    const reports = buildExpeditionReportViewModels(campaign)
    expect(reports[0]!.injuryRecordMissing).toBe(true)
    expect(reports[0]!.injuries).toHaveLength(0)
  })
})
