import { describe, expect, it } from 'vitest'
import {
  buildEndingNarrativePrompt,
  parseEndingNarrativeScript,
} from './endingPrompt.ts'
import { createTavernCampaign } from '../tavern/campaign/campaign.ts'
import type { CampaignEndingFacts } from '../ending/types.ts'

function fakeFacts(
  overrides: Partial<CampaignEndingFacts> = {},
): CampaignEndingFacts {
  return {
    clearDay: 42,
    finalAttemptId: 'mainquest-attempt:nosferatu:42:party-1',
    finalParty: {
      partyId: 'party-1',
      partyName: '暁の一団',
      memberIds: ['member-1', 'member-2'],
      memberNames: ['アリス', 'ベン'],
      affinity: 77,
    },
    finalBattle: {
      survivingMemberIds: ['member-1'],
      incapacitatedMemberIds: ['member-2'],
      deadMemberIds: [],
    },
    threats: [
      { threatId: 'alden', defeatedDay: 5, defeatedByPartyId: 'party-1' },
      { threatId: 'velga', defeatedDay: 10, defeatedByPartyId: 'party-1' },
      { threatId: 'kared', defeatedDay: 15, defeatedByPartyId: 'party-1' },
      { threatId: 'celesta', defeatedDay: 20, defeatedByPartyId: 'party-1' },
      { threatId: 'eldia', defeatedDay: 25, defeatedByPartyId: 'party-1' },
      { threatId: 'ragna', defeatedDay: 30, defeatedByPartyId: 'party-1' },
      { threatId: 'halma', defeatedDay: 35, defeatedByPartyId: 'party-1' },
      { threatId: 'nosferatu', defeatedDay: 42, defeatedByPartyId: 'party-1' },
    ],
    tavern: {
      rank: 3,
      reputationScore: 250,
      peakReputationScore: 300,
      funds: 50000,
    },
    journey: {
      daysElapsed: 42,
      resolvedRequestCount: 60,
      successfulRequestCount: 45,
      completedQuestChainCount: 4,
      containedWorldEventCount: 2,
    },
    ...overrides,
  }
}

describe('buildEndingNarrativePrompt', () => {
  it('includes Victory Facts (Nosferatu defeated, curse lifted)', () => {
    const campaign = createTavernCampaign('ending-prompt-victory-facts')
    const finalCampaignParty = campaign.parties[0]
    const { system, user } = buildEndingNarrativePrompt({
      facts: fakeFacts(),
      finalCampaignParty,
    })
    expect(system).toContain('呪いは解除された')
    expect(user).toContain('Nosferatuは敗北した')
    expect(user).toContain('主人公の呪いは解除された')
  })

  it('includes the final Party and its members', () => {
    const campaign = createTavernCampaign('ending-prompt-final-party')
    const finalCampaignParty = campaign.parties[0]
    const facts = fakeFacts({
      finalParty: {
        partyId: finalCampaignParty.id,
        partyName: finalCampaignParty.party.name,
        memberIds: finalCampaignParty.party.members.map((m) => m.id),
        memberNames: finalCampaignParty.party.members.map((m) => m.name),
        affinity: 55,
      },
    })
    const { user } = buildEndingNarrativePrompt({ facts, finalCampaignParty })
    expect(user).toContain(finalCampaignParty.party.name)
    for (const member of finalCampaignParty.party.members) {
      expect(user).toContain(member.name)
    }
  })

  it('includes casualty Facts (survivors/incapacitated/dead)', () => {
    const campaign = createTavernCampaign('ending-prompt-casualties')
    const finalCampaignParty = campaign.parties[0]
    const facts = fakeFacts({
      finalBattle: {
        survivingMemberIds: ['a'],
        incapacitatedMemberIds: ['b'],
        deadMemberIds: ['c'],
      },
    })
    const { user } = buildEndingNarrativePrompt({ facts, finalCampaignParty })
    expect(user).toContain('生存: a')
    expect(user).toContain('戦闘不能(要療養): b')
    expect(user).toContain('死亡: c')
  })

  it('states the player is never a combat participant', () => {
    const campaign = createTavernCampaign('ending-prompt-non-combatant')
    const finalCampaignParty = campaign.parties[0]
    const { system } = buildEndingNarrativePrompt({
      facts: fakeFacts(),
      finalCampaignParty,
    })
    expect(system).toContain(
      '主人公は今回の最終決戦にも直接戦闘参加者としては加わっていない',
    )
    expect(system).toContain('攻撃した、直接倒した')
  })

  it('forbids inventing deaths, injuries, romance, retirement, or a new villain', () => {
    const campaign = createTavernCampaign('ending-prompt-forbidden')
    const finalCampaignParty = campaign.parties[0]
    const { system } = buildEndingNarrativePrompt({
      facts: fakeFacts(),
      finalCampaignParty,
    })
    expect(system).toContain('死亡した冒険者を生き返らせること')
    expect(system).toContain('存在しない恋愛関係・婚約・結婚')
    expect(system).toContain('誰かの引退を確定させること')
    expect(system).toContain('新しいラスボスやNosferatuの復活')
    expect(system).toContain('呪いがまだ残っているかのような描写')
  })
})

const VALID_RESPONSE = `===AFTERMATH===
戦いの直後の物語。

===TAVERN_RETURN===
酒場へ戻ってからの物語。

===CLOSING===
締めくくりの短い場面。`

describe('parseEndingNarrativeScript', () => {
  it('parses a valid marker-delimited response', () => {
    const result = parseEndingNarrativeScript(VALID_RESPONSE)
    expect(result.aftermath).toBe('戦いの直後の物語。')
    expect(result.tavernReturn).toBe('酒場へ戻ってからの物語。')
    expect(result.closing).toBe('締めくくりの短い場面。')
  })

  it('rejects a response missing AFTERMATH', () => {
    const missing = `===TAVERN_RETURN===
酒場へ戻ってからの物語。

===CLOSING===
締めくくりの短い場面。`
    expect(() => parseEndingNarrativeScript(missing)).toThrow()
  })

  it('rejects a response missing TAVERN_RETURN', () => {
    const missing = `===AFTERMATH===
戦いの直後の物語。

===CLOSING===
締めくくりの短い場面。`
    expect(() => parseEndingNarrativeScript(missing)).toThrow()
  })

  it('rejects a response missing CLOSING', () => {
    const missing = `===AFTERMATH===
戦いの直後の物語。

===TAVERN_RETURN===
酒場へ戻ってからの物語。`
    expect(() => parseEndingNarrativeScript(missing)).toThrow()
  })

  it('rejects a response with an empty section', () => {
    const empty = `===AFTERMATH===

===TAVERN_RETURN===
酒場へ戻ってからの物語。

===CLOSING===
締めくくりの短い場面。`
    expect(() => parseEndingNarrativeScript(empty)).toThrow()
  })

  it('rejects a response with a duplicated marker', () => {
    const duplicated = `===AFTERMATH===
戦いの直後の物語。

===AFTERMATH===
もう一つの物語。

===TAVERN_RETURN===
酒場へ戻ってからの物語。

===CLOSING===
締めくくりの短い場面。`
    expect(() => parseEndingNarrativeScript(duplicated)).toThrow()
  })
})
