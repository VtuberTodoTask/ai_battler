import type { NarrativeProvider } from '../../ai/narrative/types.ts'
import type { CampaignParty } from '../tavern/campaign/types.ts'
import {
  buildEndingNarrativePrompt,
  parseEndingNarrativeScript,
  ENDING_NARRATIVE_PROMPT_VERSION,
} from '../narrative/endingPrompt.ts'
import type {
  CampaignEndingFacts,
  CampaignEndingNarrativeScript,
} from './types.ts'

export interface GenerateEndingNarrativeResult {
  script: CampaignEndingNarrativeScript
}

/**
 * Forced-generation entry point for the Ending epilogue — only ever called
 * once `CampaignEndingFacts` exist (Victory already achieved, final Main
 * Quest Presentation already completed). Mirrors
 * `mainQuest/narrative.ts`'s `generateMainQuestNarrative` in shape/guard
 * style: reuses the existing `NarrativeProvider` infrastructure unchanged,
 * never a new AI Provider layer (Phase 9.9 item 12).
 */
export async function generateEndingNarrative(
  facts: CampaignEndingFacts,
  finalCampaignParty: CampaignParty,
  provider: NarrativeProvider,
): Promise<GenerateEndingNarrativeResult> {
  const prompt = buildEndingNarrativePrompt({ facts, finalCampaignParty })

  const response = await provider.generate({
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    candidateId: facts.finalAttemptId,
    promptVersion: ENDING_NARRATIVE_PROMPT_VERSION,
  })

  if (!response.text || response.text.trim().length === 0) {
    throw new Error('AI returned empty response')
  }
  if (response.text.length > 20000) {
    throw new Error('AI response is too large')
  }

  const parsed = parseEndingNarrativeScript(response.text)

  const script: CampaignEndingNarrativeScript = {
    aftermath: parsed.aftermath,
    tavernReturn: parsed.tavernReturn,
    closing: parsed.closing,
    promptVersion: ENDING_NARRATIVE_PROMPT_VERSION,
    providerId: provider.id,
    model: response.model,
    createdAt: new Date().toISOString(),
  }

  return { script }
}
