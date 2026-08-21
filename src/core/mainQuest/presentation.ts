import { deepClone } from '../util.ts'
import type { TavernCampaignState } from '../tavern/campaign/types.ts'
import type { MainQuestNarrativeScript } from './types.ts'

/**
 * Records a freshly-generated Narrative Script onto its Attempt and moves
 * `presentationStatus` from `narrative_pending` to `ready` — Presentation
 * can only begin once this has happened (item 67's Simulation-then-
 * Narrative-then-Presentation ordering). Never called before the Attempt
 * has a `result`/`battleTrace` — `generateMainQuestNarrative`
 * (`./narrative.ts`) itself refuses to run before that.
 */
export function applyMainQuestNarrative(
  campaign: TavernCampaignState,
  attemptId: string,
  script: MainQuestNarrativeScript,
): TavernCampaignState {
  const next = deepClone(campaign)
  next.mainQuest = {
    ...next.mainQuest,
    attempts: next.mainQuest.attempts.map((a) =>
      a.id === attemptId
        ? { ...a, narrative: script, presentationStatus: 'ready' }
        : a,
    ),
  }
  return next
}

/**
 * `ready` -> `viewing`: the Player has started reading/watching the
 * Presentation sequence (PRE-BATTLE -> Battle Playback -> POST-BATTLE).
 */
export function startMainQuestPresentation(
  campaign: TavernCampaignState,
  attemptId: string,
): TavernCampaignState {
  const next = deepClone(campaign)
  next.mainQuest = {
    ...next.mainQuest,
    attempts: next.mainQuest.attempts.map((a) =>
      a.id === attemptId && a.presentationStatus === 'ready'
        ? { ...a, presentationStatus: 'viewing' }
        : a,
    ),
  }
  return next
}

/**
 * `viewing` -> `completed`: the full Presentation sequence has been shown
 * once. Clears `pendingPresentationAttemptId` so `advanceCampaignDay`'s
 * mandatory-presentation guard (item 72) stops blocking the next day.
 */
export function completeMainQuestPresentation(
  campaign: TavernCampaignState,
  attemptId: string,
): TavernCampaignState {
  const next = deepClone(campaign)
  next.mainQuest = {
    ...next.mainQuest,
    attempts: next.mainQuest.attempts.map((a) =>
      a.id === attemptId ? { ...a, presentationStatus: 'completed' } : a,
    ),
    pendingPresentationAttemptId:
      next.mainQuest.pendingPresentationAttemptId === attemptId
        ? undefined
        : next.mainQuest.pendingPresentationAttemptId,
  }
  return next
}
