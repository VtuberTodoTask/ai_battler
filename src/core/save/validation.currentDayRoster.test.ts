import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from '../tavern/campaign/campaign.ts'
import { InMemorySaveRepository } from './inMemorySaveRepository.ts'
import { loadFromSlot, serializeGameSave } from './serializer.ts'
import { SaveValidationErrorClass, validateGameSave } from './validation.ts'
import type { GameSaveData } from './types.ts'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function advanceDaysWithoutQuests(
  campaign: ReturnType<typeof createTavernCampaign>,
  n: number,
): ReturnType<typeof createTavernCampaign> {
  let c = campaign
  for (let i = 0; i < n; i++) {
    c = resolveCampaignDay(c)
    c = advanceCampaignDay(c)
  }
  return c
}

/** A campaign advanced a few days without accepting anything, with one
 * party explicitly forced away so both the away and staying collections are
 * populated (a richer fixture than a fresh day-1 campaign). */
function fixtureSave(seed: string) {
  let campaign = createTavernCampaign(seed)
  const targetId = campaign.parties[0].id
  campaign.parties[0].plannedDepartureDay = campaign.dayNumber
  campaign.parties[0].recoveringThroughDay = undefined
  campaign.parties[0].relationship.affinity = 0
  campaign = advanceDaysWithoutQuests(campaign, 3)
  const away = campaign.awayParties.find((p) => p.id === targetId)
  expect(away).toBeDefined()
  return { save: clone(serializeGameSave({ campaign })), awayPartyId: targetId }
}

describe('save validation: currentDay roster integrity (Phase 9.4.1)', () => {
  it('Test A: a valid save (currentDay.parties IDs === campaign.parties IDs) is accepted', () => {
    const { save } = fixtureSave('roster-a')
    const currentIds = save.campaign.currentDay.parties.map((p) => p.id).sort()
    const persistentIds = save.campaign.parties.map((p) => p.id).sort()
    expect(currentIds).toEqual(persistentIds)
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('Test B: removing one active party from currentDay.parties is rejected (missing active party)', () => {
    const { save } = fixtureSave('roster-b')
    const removedId = save.campaign.currentDay.parties[0].id
    save.campaign.currentDay.parties = save.campaign.currentDay.parties.filter(
      (p) => p.id !== removedId,
    )
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('Test C: adding the away party into currentDay.parties is rejected', () => {
    const { save, awayPartyId } = fixtureSave('roster-c')
    const awayParty = save.campaign.awayParties.find(
      (p) => p.id === awayPartyId,
    )!
    // Build a day-snapshot-shaped entry for the away party (same id/members)
    // so only the "away party present in the planning snapshot" invariant
    // is being tested — not some unrelated structural defect.
    const snapshotShaped = clone(save.campaign.currentDay.parties[0])
    snapshotShaped.id = awayParty.id
    snapshotShaped.party = clone(awayParty.party)
    snapshotShaped.arrivalDay = awayParty.arrivalDay
    snapshotShaped.plannedDepartureDay = awayParty.plannedDepartureDay
    save.campaign.currentDay.parties.push(snapshotShaped)
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('Test D: adding a retired party into currentDay.parties is rejected', () => {
    // Force a casualty departure to populate retiredParties.
    let campaign = createTavernCampaign('roster-d')
    const targetId = campaign.parties[0].id
    campaign.parties[0].departingCasualty = true
    campaign = advanceDaysWithoutQuests(campaign, 1)
    const retired = campaign.retiredParties.find((p) => p.id === targetId)
    expect(retired).toBeDefined()

    const save = clone(serializeGameSave({ campaign }))
    const snapshotShaped = clone(save.campaign.currentDay.parties[0])
    snapshotShaped.id = retired!.id
    snapshotShaped.party = clone(retired!.party)
    snapshotShaped.arrivalDay = retired!.arrivalDay
    snapshotShaped.plannedDepartureDay = retired!.plannedDepartureDay
    save.campaign.currentDay.parties.push(snapshotShaped)
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('Test E: a duplicate party ID within currentDay.parties is rejected', () => {
    const { save } = fixtureSave('roster-e')
    const duplicate = clone(save.campaign.currentDay.parties[0])
    save.campaign.currentDay.parties.push(duplicate)
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('extra party in currentDay.parties not present in campaign.parties is rejected', () => {
    const { save } = fixtureSave('roster-extra')
    const extra = clone(save.campaign.currentDay.parties[0])
    extra.id = `${extra.id}-extra`
    for (const member of extra.party.members) {
      member.id = `${member.id}-extra`
    }
    save.campaign.currentDay.parties.push(extra)
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('a currentDay snapshot whose arrivalDay disagrees with the persistent party is rejected', () => {
    const { save } = fixtureSave('roster-mismatch-arrival')
    save.campaign.currentDay.parties[0].arrivalDay =
      (save.campaign.currentDay.parties[0].arrivalDay ?? 1) + 1
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('a currentDay snapshot with a different member roster than its persistent party is rejected', () => {
    const { save } = fixtureSave('roster-mismatch-members')
    save.campaign.currentDay.parties[0].party.members[0].id =
      'swapped-member-id'
    expect(() => validateGameSave(save)).toThrow(SaveValidationErrorClass)
  })

  it('Test atomic load: a malformed currentDay roster save is rejected without mutating the stored raw data', async () => {
    const { save } = fixtureSave('roster-atomic')
    const bad = clone(save)
    const removedId = bad.campaign.currentDay.parties[0].id
    bad.campaign.currentDay.parties = bad.campaign.currentDay.parties.filter(
      (p) => p.id !== removedId,
    )

    const repo = new InMemorySaveRepository()
    repo.seed('slot-corrupt-roster', bad as GameSaveData)

    await expect(loadFromSlot(repo, 'slot-corrupt-roster')).rejects.toThrow(
      SaveValidationErrorClass,
    )
    expect(repo.getRaw('slot-corrupt-roster')).toEqual(bad)
  })
})
