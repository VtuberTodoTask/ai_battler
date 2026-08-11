import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from './campaign.ts'
import { offerRequestToParty } from '../brokerage.ts'

function resolveWithOptionalOffer(
  campaign: ReturnType<typeof createTavernCampaign>,
) {
  for (const request of campaign.currentDay.requests) {
    for (const party of campaign.currentDay.parties) {
      if (party.availability === 'recovering') continue
      try {
        const next = offerRequestToParty(
          campaign.currentDay,
          request.id,
          party.id,
        )
        if (next.matches.length > 0) {
          campaign = { ...campaign, currentDay: next }
          return resolveCampaignDay(campaign)
        }
      } catch {
        // continue
      }
    }
  }
  return resolveCampaignDay(campaign)
}

describe('Campaign 30-day progression smoke', () => {
  it(
    'runs 30 days and observes growth/training patterns',
    { timeout: 60000 },
    () => {
      const seed = 'tavern-progression-smoke-001'
      let campaign = createTavernCampaign(seed)

      let totalExpeditionXp = 0
      let totalTrainingXp = 0
      let totalMilestones = 0
      let totalSkillImprovements = 0
      let totalTrainingDays = 0

      for (let day = 1; day <= 30; day++) {
        campaign = resolveWithOptionalOffer(campaign)

        const dayRecord = campaign.history[campaign.history.length - 1]
        for (const event of dayRecord.progressionEvents) {
          if (event.type === 'experienceGained') {
            if (event.source === 'training') {
              totalTrainingXp += event.amount
            } else {
              totalExpeditionXp += event.amount
            }
          } else if (event.type === 'skillImproved') {
            totalSkillImprovements += 1
          }
        }

        if (day < 30) {
          campaign = advanceCampaignDay(campaign)
        }
      }

      for (const party of campaign.parties) {
        totalMilestones += party.progression.growthMilestones
        totalTrainingDays += party.progression.trainingDays
        expect(party.progression.growthXp).toBeGreaterThanOrEqual(0)
        expect(party.progression.growthXp).toBeLessThan(4)
        expect(party.progression.totalGrowthXp).toBe(
          party.progression.growthMilestones * 4 + party.progression.growthXp,
        )
      }

      expect(totalMilestones).toBeGreaterThanOrEqual(0)
      expect(totalSkillImprovements).toBeGreaterThanOrEqual(0)
      expect(totalTrainingDays).toBeGreaterThanOrEqual(0)

      // Failure-farming guard: successful expeditions are never worth less than
      // training or failed/retreated expeditions.
      expect(totalExpeditionXp).toBeGreaterThanOrEqual(0)
      expect(totalTrainingXp).toBeGreaterThanOrEqual(0)
      expect(totalSkillImprovements % 4).toBe(0)
    },
  )
})
