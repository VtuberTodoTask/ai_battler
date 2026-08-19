import { describe, expect, it } from 'vitest'
import {
  advanceCampaignDay,
  createTavernCampaign,
  resolveCampaignDay,
} from './campaign.ts'
import { deepClone } from '../../util.ts'
import { pickUniquePartyName } from './generators.ts'
import type { TavernCampaignState } from './types.ts'

function forceImmediateDeparture(
  campaign: TavernCampaignState,
  partyId: string,
): TavernCampaignState {
  const next = deepClone(campaign)
  const party = next.parties.find((p) => p.id === partyId)!
  party.plannedDepartureDay = next.dayNumber
  party.recoveringThroughDay = undefined
  party.relationship.affinity = 0
  return next
}

function forceImmediateCasualty(
  campaign: TavernCampaignState,
  partyId: string,
): TavernCampaignState {
  const next = deepClone(campaign)
  const party = next.parties.find((p) => p.id === partyId)!
  party.departingCasualty = true
  return next
}

function allKnownNames(campaign: TavernCampaignState): string[] {
  return [
    ...campaign.parties.map((p) => p.party.name),
    ...campaign.awayParties.map((p) => p.party.name),
    ...campaign.retiredParties.map((p) => p.party.name),
  ]
}

describe('Phase 9.4.1: persistent party name deduplication', () => {
  it('pickUniquePartyName avoids a name already known to be taken', () => {
    const used = new Set(['灰狼の牙'])
    const name = pickUniquePartyName('phase9-4-1-name-unit', used)
    expect(name).not.toBe('灰狼の牙')
  })

  it('item 31: a new party filling a vacancy never reuses an away party name', () => {
    let campaign = createTavernCampaign('phase9-4-1-names-away')
    const targetId = campaign.parties[0].id
    const targetName = campaign.parties[0].party.name

    campaign = forceImmediateDeparture(campaign, targetId)
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign) // target now away; vacancy filled today

    const away = campaign.awayParties.find((p) => p.id === targetId)!
    expect(away.party.name).toBe(targetName)

    const newcomer = campaign.parties.find((p) => p.id !== targetId)
    expect(newcomer).toBeDefined()
    for (const p of campaign.parties) {
      if (p.id === targetId) continue
      expect(p.party.name).not.toBe(targetName)
    }
  })

  it('item 32: a new party filling a vacancy never reuses a retired (casualty) party name', () => {
    let campaign = createTavernCampaign('phase9-4-1-names-retired')
    const targetId = campaign.parties[0].id
    const targetName = campaign.parties[0].party.name

    campaign = forceImmediateCasualty(campaign, targetId)
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign)

    const retired = campaign.retiredParties.find((p) => p.id === targetId)!
    expect(retired.party.name).toBe(targetName)

    for (const p of campaign.parties) {
      expect(p.party.name).not.toBe(targetName)
    }
  })

  it('item 33/31-33 combined: across many days of churn, no two known persistent parties (staying/away/retired) ever share a name', () => {
    let campaign = createTavernCampaign('phase9-4-1-names-longrun')
    // Force early churn so several parties accumulate in awayParties before
    // natural attrition alone would produce enough of them.
    campaign = forceImmediateDeparture(campaign, campaign.parties[0].id)
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign)

    for (let day = 0; day < 60; day++) {
      campaign = resolveCampaignDay(campaign)
      campaign = advanceCampaignDay(campaign)

      const names = allKnownNames(campaign)
      const unique = new Set(names)
      expect(
        unique.size,
        `day ${campaign.dayNumber}: duplicate party name detected among [${names.join(', ')}]`,
      ).toBe(names.length)
    }
  })

  it('item 33: a returning party does not collide with a new party that was named while it was away', () => {
    let campaign = createTavernCampaign('phase9-4-1-names-return')
    const targetId = campaign.parties[0].id
    const targetName = campaign.parties[0].party.name

    campaign = forceImmediateDeparture(campaign, targetId)
    campaign = resolveCampaignDay(campaign)
    campaign = advanceCampaignDay(campaign) // day 2, away, vacancy filled by a new party

    let c = campaign
    let returned = false
    for (let i = 0; i < 200 && !returned; i++) {
      c = resolveCampaignDay(c)
      c = advanceCampaignDay(c)
      returned = c.parties.some((p) => p.id === targetId)
    }
    expect(returned).toBe(true)

    const names = c.parties.map((p) => p.party.name)
    const occurrences = names.filter((n) => n === targetName).length
    expect(occurrences).toBe(1)
    expect(new Set(names).size).toBe(names.length)
  })
})
