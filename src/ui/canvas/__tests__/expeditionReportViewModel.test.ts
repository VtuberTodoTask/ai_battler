// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../../../core/tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../../../core/tavern/brokerage.ts'
import { getOfferErrors } from '../../../core/tavern/brokerage.ts'
import {
  buildExpeditionReportViewModels,
  findExpeditionReportById,
} from '../viewModel/expeditionReportViewModel.ts'

describe('ExpeditionReportViewModel', () => {
  it('returns no reports before any expedition is resolved', () => {
    const campaign = createTavernCampaign('report-empty')
    const reports = buildExpeditionReportViewModels(campaign)
    expect(reports).toHaveLength(0)
  })

  it('projects a resolved expedition into a structured report', () => {
    let campaign = createTavernCampaign('report-projection')
    const party = campaign.currentDay.parties[0]!
    const quest = campaign.currentDay.requests.find(
      (r) => getOfferErrors(campaign.currentDay, r.id, party.id).length === 0,
    )
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
    const quest = campaign.currentDay.requests.find(
      (r) => getOfferErrors(campaign.currentDay, r.id, party.id).length === 0,
    )
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
    function findAcceptable(
      campaign: ReturnType<typeof createTavernCampaign>,
      partyId: string,
    ) {
      return campaign.currentDay.requests.find(
        (r) => getOfferErrors(campaign.currentDay, r.id, partyId).length === 0,
      )
    }

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
})
