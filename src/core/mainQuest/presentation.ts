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
 *
 * The Presentation state machine (`narrative_pending -> ready -> viewing ->
 * completed`) is a Core invariant, not a UI convention: any violated
 * precondition throws rather than silently no-op'ing, so no call path
 * (Core, Legacy UI, Canvas UI, or a future UI) can ever observe a
 * transition as having "succeeded" when it did not.
 */
export function applyMainQuestNarrative(
  campaign: TavernCampaignState,
  attemptId: string,
  script: MainQuestNarrativeScript,
): TavernCampaignState {
  const attempt = campaign.mainQuest.attempts.find((a) => a.id === attemptId)
  if (!attempt) {
    throw new Error('主依頼の挑戦記録が見つかりません')
  }
  if (attempt.presentationStatus !== 'narrative_pending') {
    throw new Error('顛末の生成を受け付けられる状態ではありません')
  }
  if (!attempt.result || !attempt.battleTrace) {
    throw new Error('戦闘結果が未確定のため顛末を記録できません')
  }
  if (campaign.mainQuest.pendingPresentationAttemptId !== attemptId) {
    throw new Error('この挑戦は現在の主依頼演出の対象ではありません')
  }

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
  const attempt = campaign.mainQuest.attempts.find((a) => a.id === attemptId)
  if (!attempt) {
    throw new Error('主依頼の挑戦記録が見つかりません')
  }
  if (attempt.presentationStatus !== 'ready') {
    throw new Error('演出を開始できる状態ではありません')
  }
  if (!attempt.narrative || !attempt.result || !attempt.battleTrace) {
    throw new Error('顛末の準備が整っていないため演出を開始できません')
  }
  if (campaign.mainQuest.pendingPresentationAttemptId !== attemptId) {
    throw new Error('この挑戦は現在の主依頼演出の対象ではありません')
  }

  const next = deepClone(campaign)
  next.mainQuest = {
    ...next.mainQuest,
    attempts: next.mainQuest.attempts.map((a) =>
      a.id === attemptId ? { ...a, presentationStatus: 'viewing' } : a,
    ),
  }
  return next
}

/**
 * `viewing` -> `completed`: the full Presentation sequence has been shown
 * once. Clears `pendingPresentationAttemptId` so `advanceCampaignDay`'s
 * mandatory-presentation guard stops blocking the next day.
 */
export function completeMainQuestPresentation(
  campaign: TavernCampaignState,
  attemptId: string,
): TavernCampaignState {
  const attempt = campaign.mainQuest.attempts.find((a) => a.id === attemptId)
  if (!attempt) {
    throw new Error('主依頼の挑戦記録が見つかりません')
  }
  if (attempt.presentationStatus !== 'viewing') {
    throw new Error('演出を完了できる状態ではありません')
  }
  if (!attempt.narrative) {
    throw new Error('顛末が記録されていないため演出を完了できません')
  }
  if (campaign.mainQuest.pendingPresentationAttemptId !== attemptId) {
    throw new Error('この挑戦は現在の主依頼演出の対象ではありません')
  }

  const next = deepClone(campaign)
  next.mainQuest = {
    ...next.mainQuest,
    attempts: next.mainQuest.attempts.map((a) =>
      a.id === attemptId ? { ...a, presentationStatus: 'completed' } : a,
    ),
    pendingPresentationAttemptId: undefined,
  }
  return next
}
