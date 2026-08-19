import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { serializeGameSave } from './serializer.ts'
import { SaveValidationErrorClass, validateGameSave } from './validation.ts'
import { ROLE_MAP } from '../../data/roles.ts'
import type { AdventurerRole, SkillName } from '../models/types.ts'
import type { TavernCampaignState } from '../tavern/campaign/types.ts'

const ALL_SKILLS: SkillName[] = [
  'melee',
  'ranged',
  'defense',
  'tactics',
  'attackMagic',
  'defenseMagic',
  'healing',
  'scouting',
  'stealth',
  'trapDetection',
  'trapDisarm',
  'survival',
  'monsterKnowledge',
  'firstAid',
  'leadership',
]

function nonCandidateSkillFor(role: AdventurerRole): SkillName {
  const def = ROLE_MAP[role]
  const candidates = new Set([...def.expertSkills, ...def.trainedSkills])
  const found = ALL_SKILLS.find((s) => !candidates.has(s))
  if (!found) throw new Error(`no non-candidate skill found for role ${role}`)
  return found
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function advanceDaysWithoutQuests(
  campaign: TavernCampaignState,
  n: number,
): TavernCampaignState {
  let c = campaign
  for (let i = 0; i < n; i++) {
    c = resolveCampaignDay(c)
    c = advanceCampaignDay(c)
  }
  return c
}

/** Advances idle days (no quests accepted, so every healthy party trains
 * daily — deterministic, no RNG-dependent dispatch outcomes) one at a
 * time, stopping as soon as some currently-staying party has reached at
 * least one growth milestone. Checking immediately after each day (rather
 * than searching after a fixed number of days) guarantees the returned
 * party is still in campaign.parties / currentDay.parties, which the
 * other tests in this file rely on being able to look it up in both. */
function fixtureSaveWithGrowth(seed: string) {
  let campaign = createTavernCampaign(seed)
  let grownPartyId: string | undefined
  for (let i = 0; i < 20 && !grownPartyId; i++) {
    campaign = advanceDaysWithoutQuests(campaign, 1)
    grownPartyId = campaign.parties.find(
      (p) => p.progression.growthMilestones >= 1,
    )?.id
  }
  expect(grownPartyId).toBeDefined()
  return {
    save: clone(serializeGameSave({ campaign })),
    partyId: grownPartyId!,
  }
}

describe('save validation: growth progression & skills (Phase 9.5)', () => {
  it('accepts a fresh campaign (all growth fields zero)', () => {
    const save = clone(
      serializeGameSave({ campaign: createTavernCampaign('growth-fresh') }),
    )
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('accepts a save after real idle training growth (milestone + skill growth occurred)', () => {
    const { save } = fixtureSaveWithGrowth('growth-real')
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('rejects when the currentDay snapshot totalGrowthXp disagrees with the persistent party', () => {
    const { save, partyId } = fixtureSaveWithGrowth('growth-snapshot-total')
    const snapshot = save.campaign.currentDay.parties.find(
      (p) => p.id === partyId,
    )!
    snapshot.progression!.totalGrowthXp = 14
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects when a currentDay snapshot skill value disagrees with the persistent member', () => {
    const { save, partyId } = fixtureSaveWithGrowth('growth-snapshot-skill')
    const persistentParty = save.campaign.parties.find((p) => p.id === partyId)!
    const memberId = persistentParty.party.members[0].id
    const snapshotParty = save.campaign.currentDay.parties.find(
      (p) => p.id === partyId,
    )!
    const snapshotMember = snapshotParty.party.members.find(
      (m) => m.id === memberId,
    )!
    snapshotMember.skills.scouting = (snapshotMember.skills.scouting ?? 0) - 2
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects growth arithmetic where growthMilestones/growthXp do not match totalGrowthXp (14 -> must be 3/2, not 2/6)', () => {
    const { save, partyId } = fixtureSaveWithGrowth('growth-arithmetic')
    for (const party of [
      save.campaign.parties.find((p) => p.id === partyId)!,
      save.campaign.currentDay.parties.find((p) => p.id === partyId)!,
    ]) {
      party.progression!.totalGrowthXp = 14
      party.progression!.growthMilestones = 2
      party.progression!.growthXp = 6
    }
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects internally-consistent but unearned growth (arithmetic valid, but no matching history events)', () => {
    const { save, partyId } = fixtureSaveWithGrowth('growth-unearned')
    for (const party of [
      save.campaign.parties.find((p) => p.id === partyId)!,
      save.campaign.currentDay.parties.find((p) => p.id === partyId)!,
    ]) {
      party.progression!.totalGrowthXp = 40
      party.progression!.growthMilestones = 10
      party.progression!.growthXp = 0
    }
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a skillImproved event whose delta exceeds the milestone growth amount (>2)', () => {
    const { save, partyId } = fixtureSaveWithGrowth('growth-delta')
    const record = save.campaign.history.find((h) =>
      h.progressionEvents.some(
        (e) => e.type === 'skillImproved' && e.partyId === partyId,
      ),
    )!
    const event = record.progressionEvents.find(
      (e) => e.type === 'skillImproved' && e.partyId === partyId,
    ) as Extract<
      (typeof record.progressionEvents)[number],
      { type: 'skillImproved' }
    >
    event.after = event.before + 5
    // Keep the persistent/current-day skill values consistent with the
    // (now-tampered) event so this test isolates the delta-bound check.
    for (const party of [
      save.campaign.parties.find((p) => p.id === partyId),
      save.campaign.currentDay.parties.find((p) => p.id === partyId),
    ]) {
      const member = party?.party.members.find((m) => m.id === event.memberId)
      if (member) {
        member.skills[event.skill as SkillName] = event.after
      }
    }
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it("rejects a skillImproved event for a skill outside the member role's expert/trained candidates", () => {
    const { save, partyId } = fixtureSaveWithGrowth('growth-role-mismatch')
    const record = save.campaign.history.find((h) =>
      h.progressionEvents.some(
        (e) => e.type === 'skillImproved' && e.partyId === partyId,
      ),
    )!
    const event = record.progressionEvents.find(
      (e) => e.type === 'skillImproved' && e.partyId === partyId,
    ) as Extract<
      (typeof record.progressionEvents)[number],
      { type: 'skillImproved' }
    >
    const persistentParty = save.campaign.parties.find((p) => p.id === partyId)!
    const member = persistentParty.party.members.find(
      (m) => m.id === event.memberId,
    )!
    event.skill = nonCandidateSkillFor(member.role)
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects two skillImproved events for the same party+member+milestone', () => {
    const { save, partyId } = fixtureSaveWithGrowth(
      'growth-duplicate-milestone',
    )
    const record = save.campaign.history.find((h) =>
      h.progressionEvents.some(
        (e) => e.type === 'skillImproved' && e.partyId === partyId,
      ),
    )!
    const event = record.progressionEvents.find(
      (e) => e.type === 'skillImproved' && e.partyId === partyId,
    ) as Extract<
      (typeof record.progressionEvents)[number],
      { type: 'skillImproved' }
    >
    record.progressionEvents.push(clone(event))
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a broken skill growth chain (next.before does not equal previous.after)', () => {
    const { save, partyId } = fixtureSaveWithGrowth('growth-chain')
    const record = save.campaign.history.find((h) =>
      h.progressionEvents.some(
        (e) => e.type === 'skillImproved' && e.partyId === partyId,
      ),
    )!
    const event = record.progressionEvents.find(
      (e) => e.type === 'skillImproved' && e.partyId === partyId,
    ) as Extract<
      (typeof record.progressionEvents)[number],
      { type: 'skillImproved' }
    >
    // Synthesize a second growth of the same member+skill whose `before`
    // does not match the first event's `after` — a genuine chain break.
    // (The real fixture only reaches one milestone, so there is no
    // naturally-occurring second link to tamper with.)
    const second = clone(event)
    second.milestone = event.milestone + 1
    second.before = event.before // should have been event.after
    second.after = event.before + 1
    record.progressionEvents.push(second)
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('atomic load: a malformed growth save is rejected without mutating stored raw data', async () => {
    const { save, partyId } = fixtureSaveWithGrowth('growth-atomic')
    const bad = clone(save)
    const snapshot = bad.campaign.currentDay.parties.find(
      (p) => p.id === partyId,
    )!
    snapshot.progression!.trainingDays = 999

    const { InMemorySaveRepository } =
      await import('./inMemorySaveRepository.ts')
    const { loadFromSlot } = await import('./serializer.ts')
    const repo = new InMemorySaveRepository()
    repo.seed('slot-corrupt-growth', bad as never)

    await expect(loadFromSlot(repo, 'slot-corrupt-growth')).rejects.toThrow(
      SaveValidationErrorClass,
    )
    expect(repo.getRaw('slot-corrupt-growth')).toEqual(bad)
  })
})
