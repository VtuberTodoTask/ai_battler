import { describe, expect, it } from 'vitest'
import { createTavernCampaign } from '../tavern/campaign/campaign.ts'
import { buildNarrativePartySnapshot } from './context.ts'
import { generateBondConversationNarrative } from './bondConversationGeneration.ts'
import { BOND_CONVERSATION_PROMPT_VERSION } from './bondConversationPrompt.ts'
import type { CampaignParty } from '../tavern/campaign/types.ts'
import type { NarrativeCandidate } from './types.ts'
import type { NarrativeProvider } from '../../ai/narrative/types.ts'

function fakeProvider(text: string): NarrativeProvider {
  return {
    id: 'fake-bond-conversation-generation',
    async generate() {
      return { text }
    },
  }
}

function fakeCandidate(id: string, party: CampaignParty): NarrativeCandidate {
  return {
    id,
    version: 1,
    category: 'characterEvent',
    eventType: 'becameRegular',
    dayNumber: 1,
    partyId: party.id,
    partyName: party.party.name,
    priority: 70,
    title: 'test',
    context: {
      kind: 'characterEvent',
      eventType: 'becameRegular',
      secondaryTriggers: [],
      party: buildNarrativePartySnapshot(party),
      eventFacts: { focalCharacterId: party.party.members[0].id },
      recentHighlights: [],
    },
    state: 'available',
  }
}

describe('generateBondConversationNarrative', () => {
  it('produces a NarrativeGenerationRecord directly from the raw plain-text response, with no marker parsing', async () => {
    const campaign = createTavernCampaign('bond-gen-001')
    const party = campaign.parties[0]
    const candidate = fakeCandidate('bond:1', party)
    const focalCharacterId = party.party.members[0].id
    const text = '短いBond Conversationの本文。「よく来たな」'

    const { candidate: updated, record } =
      await generateBondConversationNarrative(
        candidate,
        party,
        'regular',
        focalCharacterId,
        1,
        [],
        fakeProvider(text),
      )

    expect(record.generatedText).toBe(text)
    expect(record.promptVersion).toBe(BOND_CONVERSATION_PROMPT_VERSION)
    expect(record.candidateId).toBe(candidate.id)
    expect(updated.state).toBe('generated')
    expect(updated.activeGenerationId).toBe(record.id)
  })

  it('throws on an empty AI response', async () => {
    const campaign = createTavernCampaign('bond-gen-002')
    const party = campaign.parties[0]
    const candidate = fakeCandidate('bond:2', party)

    await expect(
      generateBondConversationNarrative(
        candidate,
        party,
        'familiar',
        party.party.members[0].id,
        1,
        [],
        fakeProvider('   '),
      ),
    ).rejects.toThrow('AI returned empty response')
  })

  it('throws when the AI response is too large', async () => {
    const campaign = createTavernCampaign('bond-gen-003')
    const party = campaign.parties[0]
    const candidate = fakeCandidate('bond:3', party)

    await expect(
      generateBondConversationNarrative(
        candidate,
        party,
        'favorite',
        party.party.members[0].id,
        1,
        [],
        fakeProvider('あ'.repeat(4001)),
      ),
    ).rejects.toThrow('AI response is too large')
  })
})
