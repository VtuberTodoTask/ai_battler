import { MAX_SKILL_NORMAL, MAX_SKILL_S } from '../../balance/constants.ts'
import { ROLE_MAP } from '../../../data/roles.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import type { Adventurer, SkillName } from '../../models/types.ts'
import type { CampaignParty, CampaignProgressionEvent } from './types.ts'

export const PARTY_GROWTH_XP_THRESHOLD = 4

export const EXPEDITION_GROWTH_XP = {
  completeSuccess: 4,
  success: 3,
  partialSuccess: 2,
  failedObjective: 1,
  forcedRetreat: 1,
  lostExpedition: 0,
}

export const TRAINING_GROWTH_XP = 1

export const SKILL_GROWTH_PER_MILESTONE = 2

export type CampaignProgressionSource =
  | 'completeSuccess'
  | 'success'
  | 'partialSuccess'
  | 'failedObjective'
  | 'forcedRetreat'
  | 'training'

export interface GrowthContext {
  source: CampaignProgressionSource
  dayNumber: number
}

export function awardPartyGrowthXp(
  campaignSeed: string,
  party: CampaignParty,
  amount: number,
  context: GrowthContext,
): CampaignProgressionEvent[] {
  if (amount <= 0 || party.departingCasualty) {
    if (party.departingCasualty) {
      return [
        {
          type: 'progressionSkipped',
          partyId: party.id,
          partyName: party.party.name,
          dayNumber: context.dayNumber,
          reason: 'casualty departure',
        },
      ]
    }
    return []
  }

  party.progression.growthXp += amount
  party.progression.totalGrowthXp += amount

  const events: CampaignProgressionEvent[] = [
    {
      type: 'experienceGained',
      partyId: party.id,
      partyName: party.party.name,
      dayNumber: context.dayNumber,
      source: context.source,
      amount,
      growthXpAfter: party.progression.growthXp,
      totalGrowthXpAfter: party.progression.totalGrowthXp,
    },
  ]

  if (context.source === 'training') {
    party.progression.trainingDays += 1
  }

  const milestoneEvents = applyGrowthMilestones(
    campaignSeed,
    party,
    context.dayNumber,
  )
  events.push(...milestoneEvents)

  return events
}

export function applyGrowthMilestones(
  campaignSeed: string,
  party: CampaignParty,
  dayNumber: number,
): CampaignProgressionEvent[] {
  const events: CampaignProgressionEvent[] = []

  while (party.progression.growthXp >= PARTY_GROWTH_XP_THRESHOLD) {
    party.progression.growthXp -= PARTY_GROWTH_XP_THRESHOLD
    const milestoneIndex = party.progression.growthMilestones
    party.progression.growthMilestones += 1

    for (const member of party.party.members) {
      const improved = applySkillGrowthForMember(
        campaignSeed,
        party,
        member,
        milestoneIndex,
        dayNumber,
      )
      if (improved) {
        events.push(improved)
      }
    }
  }

  return events
}

function applySkillGrowthForMember(
  campaignSeed: string,
  party: CampaignParty,
  member: Adventurer,
  milestoneIndex: number,
  dayNumber: number,
): CampaignProgressionEvent | null {
  const role = ROLE_MAP[member.role]
  if (!role) return null

  const maxSkill = member.rank === 'S' ? MAX_SKILL_S : MAX_SKILL_NORMAL

  const candidates: { skill: SkillName; weight: number }[] = []
  for (const skill of role.expertSkills) {
    if (member.skills[skill] < maxSkill) {
      candidates.push({ skill, weight: 2 })
    }
  }
  for (const skill of role.trainedSkills) {
    if (member.skills[skill] < maxSkill) {
      candidates.push({ skill, weight: 1 })
    }
  }

  if (candidates.length === 0) {
    return null
  }

  const seed = `growth:v1:${campaignSeed}:${party.arrivalSerial}:${milestoneIndex}:${member.id}`
  const rng = new SeededRng(seed)
  const skills = candidates.map((c) => c.skill)
  const weights = candidates.map((c) => c.weight)
  const chosen = rng.weightedPick(skills, weights)

  const before = member.skills[chosen]
  const after = Math.min(maxSkill, before + SKILL_GROWTH_PER_MILESTONE)
  member.skills[chosen] = after

  return {
    type: 'skillImproved',
    partyId: party.id,
    partyName: party.party.name,
    memberId: member.id,
    memberName: member.name,
    skill: chosen,
    before,
    after,
    milestone: milestoneIndex + 1,
    dayNumber,
  }
}
