import type { MainQuestThreatId } from '../mainQuest/types.ts'
import type { TavernRank } from '../tavern/campaign/types.ts'

/**
 * Phase 9.9 Ending. A single, authoritative post-victory epilogue —
 * deliberately not a branching/scored Ending system (see Phase 9.9 spec
 * items 51/52: one mechanical ending, a Narrative epilogue whose *prose*
 * varies with the Campaign's actual Facts).
 */
export type CampaignEndingStatus =
  'locked' | 'narrative_pending' | 'ready' | 'viewing' | 'completed'

/**
 * A compact, 100%-machine-derivable snapshot of the Campaign at the moment
 * Victory was achieved — the ONLY data the Ending AI Prompt is built from
 * (never the full `TavernCampaignState`). Every field here must be
 * reconstructible from canonical Campaign state alone; nothing here is an
 * interpretation ("most beloved companion", "heroic", "tragic" — see item
 * 11) or an AI-authored value.
 */
export interface CampaignEndingFacts {
  clearDay: number
  finalAttemptId: string

  finalParty: {
    partyId: string
    partyName: string
    memberIds: string[]
    memberNames: string[]
    affinity: number
  }

  finalBattle: {
    survivingMemberIds: string[]
    incapacitatedMemberIds: string[]
    deadMemberIds: string[]
  }

  threats: {
    threatId: MainQuestThreatId
    defeatedDay: number
    defeatedByPartyId: string
  }[]

  tavern: {
    rank: TavernRank
    reputationScore: number
    peakReputationScore: number
    funds: number
  }

  journey: {
    daysElapsed: number
    resolvedRequestCount: number
    successfulRequestCount: number
    completedQuestChainCount: number
    containedWorldEventCount: number
  }
}

/**
 * `aftermath`/`tavernReturn`/`closing` are flat prose text, the same shape
 * as `MainQuestNarrativeScript.preBattle`/`postBattle` — handed directly to
 * `SoundNovelSceneInput.text` and rendered through the existing
 * `parseSoundNovelText` pipeline (no new Presentation renderer, per Phase
 * 9.9 item 26).
 */
export interface CampaignEndingNarrativeScript {
  aftermath: string
  tavernReturn: string
  closing: string

  promptVersion: string
  providerId: string
  model?: string
  createdAt: string
}

export interface CampaignEndingState {
  status: CampaignEndingStatus

  triggerAttemptId?: string
  triggeredDay?: number

  facts?: CampaignEndingFacts
  narrative?: CampaignEndingNarrativeScript

  completedDay?: number
}

export function createInitialCampaignEndingState(): CampaignEndingState {
  return { status: 'locked' }
}
