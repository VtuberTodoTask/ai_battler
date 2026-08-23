import { tavernRankLabel } from '../../../core/tavern/campaign/reputation.ts'
import { MAIN_QUEST_THREAT_DEFINITION_MAP } from '../../../core/mainQuest/threats.ts'
import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import type {
  CampaignEndingStatus,
  CampaignEndingFacts,
} from '../../../core/ending/types.ts'

export type EndingPresentationStep = 'aftermath' | 'tavernReturn' | 'closing'

export interface EndingSceneInput {
  /** Mutated in place by EndingScene itself to drive the Presentation
   * sequence across pushes/pops of SoundNovelScene — never
   * Campaign-persisted (mirrors `MainQuestSceneInput`). */
  presentationStep?: EndingPresentationStep
}

export function createEndingSceneInput(): EndingSceneInput {
  return {}
}

/**
 * GAME CLEAR display values, sourced ONLY from `CampaignEndingFacts` (Phase
 * 9.9 item 50) — never parsed or inferred from the AI-authored Narrative
 * prose.
 */
export interface EndingGameClearViewModel {
  clearDayLabel: string
  rankLabel: string
  reputationLabel: string
  threatProgressLabel: string
  finalThreatLabel: string
  curseLabel: string
  finalPartyLabel: string
}

export function buildEndingGameClearViewModel(
  facts: CampaignEndingFacts,
): EndingGameClearViewModel {
  const nosferatu = MAIN_QUEST_THREAT_DEFINITION_MAP.nosferatu
  const nationalThreatCount = facts.threats.filter(
    (t) => t.threatId !== 'nosferatu',
  ).length
  return {
    clearDayLabel: `クリア日: DAY ${facts.clearDay}`,
    rankLabel: tavernRankLabel(facts.tavern.rank),
    reputationLabel: `評判 ${facts.tavern.reputationScore}(最高到達 ${facts.tavern.peakReputationScore})`,
    threatProgressLabel: `七国の脅威: ${nationalThreatCount} / 7`,
    finalThreatLabel: `最後の脅威: ${nosferatu.name} — 撃破`,
    curseLabel: '呪い: 解除',
    finalPartyLabel: `最後に戦ったParty: ${facts.finalParty.partyName}`,
  }
}

export interface EndingViewModel {
  status: CampaignEndingStatus
  facts?: CampaignEndingFacts
  hasNarrative: boolean
}

export function buildEndingViewModel(
  campaign: TavernCampaignState,
): EndingViewModel {
  const { ending } = campaign
  return {
    status: ending.status,
    facts: ending.facts,
    hasNarrative: ending.narrative !== undefined,
  }
}
