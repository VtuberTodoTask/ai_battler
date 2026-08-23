import type { NarrativeProvider } from '../../ai/narrative/types.ts'
import type { CampaignParty } from '../tavern/campaign/types.ts'
import {
  buildBondConversationPrompt,
  BOND_CONVERSATION_PROMPT_VERSION,
} from './bondConversationPrompt.ts'
import type { BondConversationMilestone } from './bondConversation.ts'
import type { NarrativeCandidate, NarrativeGenerationRecord } from './types.ts'

export interface GenerateBondConversationNarrativeResult {
  candidate: NarrativeCandidate
  record: NarrativeGenerationRecord
}

/**
 * Bond Conversation's own generation entry point — mirrors
 * `./generation.ts`'s `generateNarrative` in shape exactly (build prompt,
 * call the existing `NarrativeProvider` unchanged, wrap the plain-text
 * response into a `NarrativeGenerationRecord`), but calls the dedicated
 * `buildBondConversationPrompt` instead of the generic
 * `buildNarrativePrompt` (item 27). Bond Conversation's output is a single
 * plain-text blob with no markers (item 28), so unlike
 * `mainQuest/narrative.ts` / `endingPrompt.ts` there is no marker parsing
 * step here at all — the raw response text IS the generated text.
 */
export async function generateBondConversationNarrative(
  candidate: NarrativeCandidate,
  campaignParty: CampaignParty,
  milestone: BondConversationMilestone,
  focalCharacterId: string,
  dayNumber: number,
  previousBondConversations: {
    milestone: BondConversationMilestone
    text: string
  }[],
  provider: NarrativeProvider,
): Promise<GenerateBondConversationNarrativeResult> {
  const prompt = buildBondConversationPrompt({
    campaignParty,
    milestone,
    focalCharacterId,
    dayNumber,
    previousBondConversations,
  })

  const response = await provider.generate({
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    candidateId: candidate.id,
    promptVersion: BOND_CONVERSATION_PROMPT_VERSION,
  })

  if (!response.text || response.text.trim().length === 0) {
    throw new Error('AI returned empty response')
  }
  if (response.text.length > 4000) {
    throw new Error('AI response is too large')
  }

  const record: NarrativeGenerationRecord = {
    id: `gen:${provider.id}:${candidate.id}:${Date.now()}`,
    candidateId: candidate.id,
    generatedText: response.text,
    promptVersion: BOND_CONVERSATION_PROMPT_VERSION,
    providerId: provider.id,
    model: response.model,
    createdAt: new Date().toISOString(),
    usage: response.usage
      ? {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
        }
      : undefined,
  }

  const updatedCandidate: NarrativeCandidate = {
    ...candidate,
    state: 'generated',
    activeGenerationId: record.id,
  }

  return { candidate: updatedCandidate, record }
}
