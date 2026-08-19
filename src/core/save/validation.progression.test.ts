import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { offerRequestToParty } from '../tavern/brokerage.ts'
import { deriveTavernRank } from '../tavern/campaign/reputation.ts'
import { purchaseTavernUpgrade } from '../tavern/campaign/upgrades.ts'
import {
  EXPEDITION_GROWTH_XP,
  TRAINING_GROWTH_XP,
} from '../tavern/campaign/progression.ts'
import { serializeGameSave } from './serializer.ts'
import { SaveValidationErrorClass, validateGameSave } from './validation.ts'
import { ROLE_MAP } from '../../data/roles.ts'
import type { AdventurerRole, SkillName } from '../models/types.ts'
import type {
  CampaignProgressionEvent,
  TavernCampaignState,
} from '../tavern/campaign/types.ts'

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

/** Same idea as fixtureSaveWithGrowth, but keeps training idle days going
 * until some party has reached at least two growth milestones — needed for
 * the "reuse a past milestone on a later day" causal-integrity test. */
function fixtureSaveWithTwoMilestones(seed: string) {
  let campaign = createTavernCampaign(seed)
  let grownPartyId: string | undefined
  for (let i = 0; i < 60 && !grownPartyId; i++) {
    campaign = advanceDaysWithoutQuests(campaign, 1)
    grownPartyId = campaign.parties.find(
      (p) => p.progression.growthMilestones >= 2,
    )?.id
  }
  expect(grownPartyId).toBeDefined()
  return {
    save: clone(serializeGameSave({ campaign })),
    partyId: grownPartyId!,
  }
}

/** Accepts every offerable (request, party) pair for the day — used to
 * exercise real Expedition Growth/Recovery, mirroring the phase9-5 smoke
 * suite's own helper of the same name. */
function acceptAllPossible(campaign: TavernCampaignState): TavernCampaignState {
  let state = campaign.currentDay
  const matchedPartyIds = new Set<string>()
  const matchedRequestIds = new Set<string>()
  for (const request of state.requests) {
    if (matchedRequestIds.has(request.id)) continue
    for (const party of state.parties) {
      if (matchedPartyIds.has(party.id)) continue
      if (party.availability === 'recovering') continue
      try {
        const next = offerRequestToParty(state, request.id, party.id)
        if (next.matches.some((m) => m.requestId === request.id)) {
          matchedPartyIds.add(party.id)
          matchedRequestIds.add(request.id)
          state = next
          break
        }
      } catch {
        // continue
      }
    }
  }
  return { ...campaign, currentDay: state }
}

/** Advances days while accepting every possible expedition, until a party
 * with real (non-training) experienceGained growth is found. */
function fixtureSaveWithExpeditionGrowth(seed: string) {
  let campaign = createTavernCampaign(seed)
  for (let day = 0; day < 30; day++) {
    campaign = resolveCampaignDay(acceptAllPossible(campaign))
    campaign = advanceCampaignDay(campaign)
  }
  const save = clone(serializeGameSave({ campaign }))
  for (const record of save.campaign.history) {
    const event = record.progressionEvents.find(
      (
        e,
      ): e is Extract<CampaignProgressionEvent, { type: 'experienceGained' }> =>
        e.type === 'experienceGained' && e.source !== 'training',
    )
    if (event) return { save, record, event }
  }
  throw new Error(`no expedition growth event found for seed ${seed}`)
}

/** Advances days while accepting every possible expedition until a
 * startedRecovery PartyEvent occurs, then returns the day AFTER it (the
 * first day that party is causally recovering per the historical replay,
 * since recovery always spans at least one day beyond the day it starts). */
function fixtureSaveWithRecovery(seed: string) {
  let campaign = createTavernCampaign(seed)
  for (let day = 0; day < 40; day++) {
    campaign = resolveCampaignDay(acceptAllPossible(campaign))
    campaign = advanceCampaignDay(campaign)
  }
  const save = clone(serializeGameSave({ campaign }))
  for (const record of save.campaign.history) {
    const started = record.partyEvents.find((e) => e.type === 'startedRecovery')
    if (!started) continue
    const recoveringDay = record.dayNumber + 1
    const laterRecord = save.campaign.history.find(
      (h) => h.dayNumber === recoveringDay,
    )
    if (laterRecord) {
      return {
        save,
        partyId: started.partyId,
        dayNumber: recoveringDay,
        record: laterRecord,
      }
    }
  }
  return undefined
}

function forceImmediateDeparture(
  campaign: TavernCampaignState,
  partyId: string,
): TavernCampaignState {
  const next = clone(campaign)
  const party = next.parties.find((p) => p.id === partyId)!
  party.plannedDepartureDay = next.dayNumber
  party.recoveringThroughDay = undefined
  party.relationship.affinity = 0
  return next
}

function advanceUntilReturned(
  campaign: TavernCampaignState,
  partyId: string,
  maxDays: number,
): TavernCampaignState {
  let c = campaign
  for (let i = 0; i < maxDays; i++) {
    c = resolveCampaignDay(c)
    c = advanceCampaignDay(c)
    if (c.parties.some((p) => p.id === partyId)) return c
  }
  throw new Error(`party ${partyId} never returned within ${maxDays} days`)
}

function campaignWithTrainingYardLevel(seed: string, level: 1 | 2) {
  let campaign = createTavernCampaign(seed)
  const requiredRank = level === 1 ? 3 : 5
  const requiredFunds = level === 1 ? 200 : 650
  for (let day = 1; day <= 150; day++) {
    campaign = resolveCampaignDay(acceptAllPossible(campaign))
    if (
      deriveTavernRank(campaign.reputation.peakScore) >= requiredRank &&
      campaign.finance.funds >= requiredFunds
    ) {
      break
    }
    campaign = advanceCampaignDay(campaign)
  }
  campaign = advanceCampaignDay(campaign)
  const lv1 = purchaseTavernUpgrade(campaign, 'training_yard')
  if (!lv1.ok) throw new Error(`failed to purchase Training Yard Lv1 (${seed})`)
  campaign = lv1.campaign
  if (level === 2) {
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign)
    const lv2 = purchaseTavernUpgrade(campaign, 'training_yard')
    if (!lv2.ok) {
      throw new Error(`failed to purchase Training Yard Lv2 (${seed})`)
    }
    campaign = lv2.campaign
  }
  // Final measurement day: no quests accepted, so any non-recovering party
  // trains at the just-purchased level's boosted rate. Advance past it so
  // the returned campaign is back in a valid (planning) save state.
  campaign = resolveCampaignDay(campaign)
  return advanceCampaignDay(campaign)
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

  // --- Phase 9.5.1: Growth Causal Integrity Stabilization -----------------

  it('accepts a genuinely-generated save exercising Expedition Growth, Idle Training, Training Yard Lv1/Lv2, Milestone Skill Growth, Recovery, and Departure/Return together', () => {
    let campaign = createTavernCampaign('growth-full-integration')
    let grownId: string | undefined
    for (let i = 0; i < 20 && !grownId; i++) {
      campaign = advanceDaysWithoutQuests(campaign, 1)
      grownId = campaign.parties.find(
        (p) => p.progression.growthMilestones >= 1,
      )?.id
    }
    expect(grownId).toBeDefined()
    if (!grownId) return

    for (let day = 0; day < 80; day++) {
      campaign = resolveCampaignDay(acceptAllPossible(campaign))
      if (
        deriveTavernRank(campaign.reputation.peakScore) >= 3 &&
        campaign.finance.funds >= 200
      ) {
        break
      }
      campaign = advanceCampaignDay(campaign)
    }
    campaign = advanceCampaignDay(campaign)

    const lv1 = purchaseTavernUpgrade(campaign, 'training_yard')
    expect(lv1.ok).toBe(true)
    campaign = lv1.campaign

    campaign = forceImmediateDeparture(campaign, grownId)
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign)
    expect(campaign.awayParties.some((p) => p.id === grownId)).toBe(true)
    campaign = advanceUntilReturned(campaign, grownId, 200)
    expect(campaign.parties.some((p) => p.id === grownId)).toBe(true)

    const save = clone(serializeGameSave({ campaign }))
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('rejects a history record whose progressionEvents field is missing', () => {
    const { save } = fixtureSaveWithGrowth('growth-missing-events')
    const record = save.campaign.history[0] as unknown as Record<
      string,
      unknown
    >
    delete record.progressionEvents
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a progression event whose dayNumber disagrees with its containing record', () => {
    const { save, partyId } = fixtureSaveWithGrowth('growth-day-mismatch')
    const record = save.campaign.history.find((h) =>
      h.progressionEvents.some((e) => e.partyId === partyId),
    )!
    const event = record.progressionEvents.find((e) => e.partyId === partyId)!
    event.dayNumber = event.dayNumber + 1
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a fake expedition-outcome experienceGained on an idle day the party was not dispatched', () => {
    const campaign = advanceDaysWithoutQuests(
      createTavernCampaign('growth-fake-expedition-xp'),
      1,
    )
    const save = clone(serializeGameSave({ campaign }))
    const record = save.campaign.history[0]
    const event = record.progressionEvents.find(
      (e) => e.type === 'experienceGained' && e.source === 'training',
    ) as Extract<CampaignProgressionEvent, { type: 'experienceGained' }>
    event.source = 'success'
    event.amount = EXPEDITION_GROWTH_XP.success
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects an experienceGained event whose source does not match the actual resolved outcome', () => {
    const { save, event } = fixtureSaveWithExpeditionGrowth(
      'growth-wrong-outcome',
    )
    const originalSource = event.source
    const fakeSource =
      originalSource === 'success' ? 'completeSuccess' : 'success'
    event.source = fakeSource
    event.amount = EXPEDITION_GROWTH_XP[fakeSource]
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a duplicate experienceGained event for the same party on the same day', () => {
    const campaign = advanceDaysWithoutQuests(
      createTavernCampaign('growth-duplicate-xp'),
      1,
    )
    const save = clone(serializeGameSave({ campaign }))
    const record = save.campaign.history[0]
    const event = record.progressionEvents.find(
      (e) => e.type === 'experienceGained',
    )!
    record.progressionEvents.push(clone(event))
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a dispatched party claiming Training XP on the day it was dispatched', () => {
    const { save, event } = fixtureSaveWithExpeditionGrowth(
      'growth-dispatched-training',
    )
    event.source = 'training'
    event.amount = TRAINING_GROWTH_XP
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a Training Yard level-0 party claiming boosted Training XP (amount=2)', () => {
    const campaign = advanceDaysWithoutQuests(
      createTavernCampaign('growth-lv0-fake-boost'),
      1,
    )
    const save = clone(serializeGameSave({ campaign }))
    const record = save.campaign.history[0]
    const event = record.progressionEvents.find(
      (e) => e.type === 'experienceGained' && e.source === 'training',
    ) as Extract<CampaignProgressionEvent, { type: 'experienceGained' }>
    event.amount = 2
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('accepts a real save with Training Yard level 1 idle Training XP (amount=2)', () => {
    const campaign = campaignWithTrainingYardLevel('growth-ty-lv1-accept', 1)
    const save = clone(serializeGameSave({ campaign }))
    expect(() => validateGameSave(save)).not.toThrow()
    const record = campaign.history[campaign.history.length - 1]
    const gain = record.progressionEvents.find(
      (e) => e.type === 'experienceGained' && e.source === 'training',
    )
    expect(
      gain && gain.type === 'experienceGained' ? gain.amount : undefined,
    ).toBe(2)
  })

  it('accepts a real save with Training Yard level 2 idle Training XP (amount=3)', () => {
    const campaign = campaignWithTrainingYardLevel('growth-ty-lv2-accept', 2)
    const save = clone(serializeGameSave({ campaign }))
    expect(() => validateGameSave(save)).not.toThrow()
    const record = campaign.history[campaign.history.length - 1]
    const gain = record.progressionEvents.find(
      (e) => e.type === 'experienceGained' && e.source === 'training',
    )
    expect(
      gain && gain.type === 'experienceGained' ? gain.amount : undefined,
    ).toBe(3)
  })

  it('rejects a recovering party claiming Training XP', () => {
    const found = fixtureSaveWithRecovery('growth-recovering-fake-training')
    expect(found).toBeDefined()
    if (!found) return
    const { save, partyId, dayNumber, record } = found
    const party =
      save.campaign.parties.find((p) => p.id === partyId) ??
      save.campaign.awayParties.find((p) => p.id === partyId) ??
      save.campaign.retiredParties.find((p) => p.id === partyId)!
    record.progressionEvents.push({
      type: 'experienceGained',
      partyId,
      partyName: party.party.name,
      dayNumber,
      source: 'training',
      amount: TRAINING_GROWTH_XP,
      growthXpAfter: TRAINING_GROWTH_XP,
      totalGrowthXpAfter: TRAINING_GROWTH_XP,
    })
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects an away party claiming Training XP after departure', () => {
    let campaign = createTavernCampaign('growth-away-fake-training')
    const partyId = campaign.parties[0].id
    campaign = forceImmediateDeparture(campaign, partyId)
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign)
    expect(campaign.awayParties.some((p) => p.id === partyId)).toBe(true)
    campaign = resolveCampaignDay(campaign)

    const save = clone(serializeGameSave({ campaign }))
    const dayNumber = campaign.dayNumber
    const record = save.campaign.history.find((h) => h.dayNumber === dayNumber)!
    const away = save.campaign.awayParties.find((p) => p.id === partyId)!
    record.progressionEvents.push({
      type: 'experienceGained',
      partyId,
      partyName: away.party.name,
      dayNumber,
      source: 'training',
      amount: TRAINING_GROWTH_XP,
      growthXpAfter: TRAINING_GROWTH_XP,
      totalGrowthXpAfter: TRAINING_GROWTH_XP,
    })
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a fake skillImproved event for a party with no milestone earned that day', () => {
    const campaign = advanceDaysWithoutQuests(
      createTavernCampaign('growth-fake-skill-no-xp'),
      1,
    )
    const save = clone(serializeGameSave({ campaign }))
    const record = save.campaign.history[0]
    const party = save.campaign.parties[0]
    const member = party.party.members[0]
    const role = ROLE_MAP[member.role]
    const skill = role.expertSkills[0]
    record.progressionEvents.push({
      type: 'skillImproved',
      partyId: party.id,
      partyName: party.party.name,
      memberId: member.id,
      memberName: member.name,
      skill,
      before: member.skills[skill],
      after: member.skills[skill] + 2,
      milestone: 1,
      dayNumber: 1,
    })
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a skillImproved event claiming a milestone far beyond what was earned', () => {
    const { save, partyId } = fixtureSaveWithGrowth('growth-future-milestone')
    const record = save.campaign.history.find((h) =>
      h.progressionEvents.some(
        (e) => e.type === 'skillImproved' && e.partyId === partyId,
      ),
    )!
    const real = record.progressionEvents.find(
      (e) => e.type === 'skillImproved' && e.partyId === partyId,
    ) as Extract<CampaignProgressionEvent, { type: 'skillImproved' }>
    const fake = clone(real)
    fake.milestone = 99
    record.progressionEvents.push(fake)
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('rejects reuse of an already-consumed milestone number on a later day', () => {
    const { save, partyId } = fixtureSaveWithTwoMilestones(
      'growth-milestone-reuse',
    )
    const hits: {
      record: (typeof save.campaign.history)[number]
      event: Extract<CampaignProgressionEvent, { type: 'skillImproved' }>
    }[] = []
    for (const record of save.campaign.history) {
      for (const event of record.progressionEvents) {
        if (event.type === 'skillImproved' && event.partyId === partyId) {
          hits.push({ record, event })
        }
      }
    }
    const milestone1 = hits.find((h) => h.event.milestone === 1)!
    const milestone2 = hits.find((h) => h.event.milestone === 2)!
    expect(milestone1.record.dayNumber).not.toBe(milestone2.record.dayNumber)

    const reused = clone(milestone1.event)
    reused.dayNumber = milestone2.record.dayNumber
    milestone2.record.progressionEvents.push(reused)
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
