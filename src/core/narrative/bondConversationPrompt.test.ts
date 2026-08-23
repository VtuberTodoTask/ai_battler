import { describe, expect, it } from 'vitest'
import { createTavernCampaign } from '../tavern/campaign/campaign.ts'
import { buildBondConversationPrompt } from './bondConversationPrompt.ts'

describe('buildBondConversationPrompt', () => {
  it('prohibits inventing the protagonist name/gender/appearance, and enforces the 店主 convention', () => {
    const campaign = createTavernCampaign('bond-prompt-001')
    const party = campaign.parties[0]
    const focalCharacterId = party.party.members[0].id

    const { system } = buildBondConversationPrompt({
      campaignParty: party,
      milestone: 'regular',
      focalCharacterId,
      dayNumber: 1,
    })

    expect(system).toContain('店主')
    expect(system).toContain('名前')
    expect(system).toContain('性別')
    expect(system).toContain('外見')
  })

  it('prohibits automatic romance escalation, even at the favorite milestone', () => {
    const campaign = createTavernCampaign('bond-prompt-002')
    const party = campaign.parties[0]
    const focalCharacterId = party.party.members[0].id

    const { system, user } = buildBondConversationPrompt({
      campaignParty: party,
      milestone: 'favorite',
      focalCharacterId,
      dayNumber: 1,
    })

    expect(system).toContain('恋愛')
    expect(system).toContain('告白')
    // The favorite theme block must itself state this is not a romance.
    expect(user).toContain('恋愛関係ではない')
  })

  it('never implies a numeric/Gameplay effect from watching the Conversation', () => {
    const campaign = createTavernCampaign('bond-prompt-003')
    const party = campaign.parties[0]
    const focalCharacterId = party.party.members[0].id

    const { system } = buildBondConversationPrompt({
      campaignParty: party,
      milestone: 'trusted',
      focalCharacterId,
      dayNumber: 1,
    })

    expect(system).toContain('数値')
  })

  it('names the FOCAL CHARACTER by id and highlights them as the scene center', () => {
    const campaign = createTavernCampaign('bond-prompt-004')
    const party = campaign.parties[0]
    const focal = party.party.members[1]

    const { user } = buildBondConversationPrompt({
      campaignParty: party,
      milestone: 'familiar',
      focalCharacterId: focal.id,
      dayNumber: 1,
    })

    expect(user).toContain('FOCAL CHARACTER')
    expect(user).toContain(`id=${focal.id}`)
    expect(user).toContain(focal.name)
  })

  it('names the correct milestone label in FACTS and stays within its theme depth for familiar', () => {
    const campaign = createTavernCampaign('bond-prompt-005')
    const party = campaign.parties[0]
    const focalCharacterId = party.party.members[0].id

    const { user } = buildBondConversationPrompt({
      campaignParty: party,
      milestone: 'familiar',
      focalCharacterId,
      dayNumber: 1,
    })

    expect(user).toContain('顔なじみ')
    expect(user).toContain('MILESTONE THEME')
    expect(user).not.toContain('贔屓')
  })

  it('includes prior Bond Conversations for light continuity when given, without duplicating them unprompted', () => {
    const campaign = createTavernCampaign('bond-prompt-006')
    const party = campaign.parties[0]
    const focalCharacterId = party.party.members[0].id

    const { user: withoutPrior } = buildBondConversationPrompt({
      campaignParty: party,
      milestone: 'trusted',
      focalCharacterId,
      dayNumber: 5,
    })
    expect(withoutPrior).not.toContain('これまでのBond Conversation')

    const { user: withPrior } = buildBondConversationPrompt({
      campaignParty: party,
      milestone: 'trusted',
      focalCharacterId,
      dayNumber: 5,
      previousBondConversations: [
        { milestone: 'familiar', text: '最初の出会いの短い場面。' },
      ],
    })
    expect(withPrior).toContain('これまでのBond Conversation')
    expect(withPrior).toContain('最初の出会いの短い場面。')
  })

  it('allows the tavern owner a short, neutral participation in the conversation, not total silence', () => {
    const campaign = createTavernCampaign('bond-prompt-008')
    const party = campaign.parties[0]
    const focalCharacterId = party.party.members[0].id

    const { system } = buildBondConversationPrompt({
      campaignParty: party,
      milestone: 'regular',
      focalCharacterId,
      dayNumber: 1,
    })

    // Permission for a few short, neutral in-character lines.
    expect(system).toContain('1〜3発言程度')
    expect(system).toContain('会話')
    // The old blanket "never write the owner's dialogue" ban is gone.
    expect(system).not.toContain('店主の台詞を新しく作ってはいけません')
  })

  it('still prohibits inventing the owner’s identity, background, or inner state from their dialogue', () => {
    const campaign = createTavernCampaign('bond-prompt-009')
    const party = campaign.parties[0]
    const focalCharacterId = party.party.members[0].id

    const { system } = buildBondConversationPrompt({
      campaignParty: party,
      milestone: 'favorite',
      focalCharacterId,
      dayNumber: 1,
    })

    expect(system).toContain('店主の発言から')
    expect(system).toContain('恋愛感情')
    expect(system).toContain('政治観')
    expect(system).toContain('宗教観')
    expect(system).toContain('重大な約束')
    expect(system).toContain('長い独白や演説')
    // Inner-state invention is still banned, only neutral external actions
    // are allowed.
    expect(system).toContain('店主は嬉しかった')
    expect(system).toContain('椅子を示す')
  })

  it('requires marker-free plain-text output (no ===MARKER=== instructions)', () => {
    const campaign = createTavernCampaign('bond-prompt-007')
    const party = campaign.parties[0]
    const focalCharacterId = party.party.members[0].id

    const { system } = buildBondConversationPrompt({
      campaignParty: party,
      milestone: 'regular',
      focalCharacterId,
      dayNumber: 1,
    })

    expect(system).not.toContain('===')
    expect(system).toContain('マーカー')
  })
})
