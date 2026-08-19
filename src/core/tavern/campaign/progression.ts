import { MAX_SKILL_NORMAL, MAX_SKILL_S } from '../../balance/constants.ts'
import { ROLE_MAP } from '../../../data/roles.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import type {
  AdventurerRank,
  AdventurerRole,
  SkillName,
  SkillSet,
} from '../../models/types.ts'
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

  if (context.source === 'training') {
    party.progression.trainingDays += 1
  }

  // Resolve any milestones (and their skill growth) triggered by this XP
  // BEFORE snapshotting growthXpAfter, so the experienceGained event
  // reports the final, already-reduced growthXp (always in
  // [0, PARTY_GROWTH_XP_THRESHOLD)) rather than a transient pre-reduction
  // carry value. totalGrowthXp is monotonic and unaffected by milestones,
  // so its snapshot timing doesn't matter.
  const milestoneEvents = applyGrowthMilestones(
    campaignSeed,
    party,
    context.dayNumber,
  )

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
    ...milestoneEvents,
  ]

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
      const plan = planSkillGrowthForMember(
        campaignSeed,
        party.arrivalSerial,
        member,
        milestoneIndex,
      )
      if (!plan) continue

      member.skills[plan.skill] = plan.after
      events.push({
        type: 'skillImproved',
        partyId: party.id,
        partyName: party.party.name,
        memberId: member.id,
        memberName: member.name,
        skill: plan.skill,
        before: plan.before,
        after: plan.after,
        milestone: milestoneIndex + 1,
        dayNumber,
      })
    }
  }

  return events
}

/** Minimal shape planSkillGrowthForMember needs from a party member — a
 * full Adventurer satisfies this structurally, and so does the save
 * validator's reconstructed (working, not-necessarily-current) skill
 * state, letting both runtime and validator share this exact selection
 * logic without the validator needing a full Adventurer object. */
export interface SkillGrowthMemberInput {
  id: string
  role: AdventurerRole
  rank: AdventurerRank
  skills: SkillSet
}

export interface SkillGrowthPlan {
  skill: SkillName
  before: number
  after: number
}

/**
 * Pure planner for a single member's skill growth at one milestone: given
 * the member's CURRENT skills (candidate eligibility and `before` are both
 * read from this snapshot — callers doing a historical replay must pass a
 * skills snapshot matching that point in time, not necessarily the
 * member's live/final skills), returns the deterministic
 * weighted-random-candidate choice and resulting before/after values, or
 * null if every role-candidate skill is already at cap. Has no side
 * effects — callers apply the mutation themselves. The seed format
 * (`growth:v1:${campaignSeed}:${arrivalSerial}:${milestoneIndex}:${memberId}`)
 * and RNG algorithm must never change: it is replayed independently by the
 * save validator and must reproduce byte-identical results.
 */
export function planSkillGrowthForMember(
  campaignSeed: string,
  arrivalSerial: number,
  member: SkillGrowthMemberInput,
  milestoneIndex: number,
): SkillGrowthPlan | null {
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

  const seed = `growth:v1:${campaignSeed}:${arrivalSerial}:${milestoneIndex}:${member.id}`
  const rng = new SeededRng(seed)
  const skills = candidates.map((c) => c.skill)
  const weights = candidates.map((c) => c.weight)
  const chosen = rng.weightedPick(skills, weights)

  const before = member.skills[chosen]
  const after = Math.min(maxSkill, before + SKILL_GROWTH_PER_MILESTONE)

  return { skill: chosen, before, after }
}
