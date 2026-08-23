import { deepClone } from '../util.ts'
import { isCampaignVictoryAchieved } from './victory.ts'
import type { TavernCampaignState } from '../tavern/campaign/types.ts'
import type { CampaignEndingNarrativeScript } from './types.ts'

/**
 * Records a freshly-generated Ending Narrative Script and moves
 * `ending.status` from `narrative_pending` to `ready` — Presentation can
 * only begin once this has happened, mirroring
 * `mainQuest/presentation.ts`'s `applyMainQuestNarrative` exactly (same
 * throw-on-violated-precondition discipline: never a silent no-op, so no
 * call path can observe a transition as having "succeeded" when it did
 * not).
 */
export function applyEndingNarrative(
  campaign: TavernCampaignState,
  script: CampaignEndingNarrativeScript,
): TavernCampaignState {
  const { ending, mainQuest } = campaign
  if (ending.status !== 'narrative_pending') {
    throw new Error('顛末の生成を受け付けられる状態ではありません')
  }
  const triggerAttempt = mainQuest.attempts.find(
    (a) => a.id === ending.triggerAttemptId,
  )
  if (!triggerAttempt) {
    throw new Error('Endingの発生条件となる試行が見つかりません')
  }
  if (triggerAttempt.threatId !== 'nosferatu') {
    throw new Error('Endingの発生条件がNosferatu討伐ではありません')
  }
  if (triggerAttempt.presentationStatus !== 'completed') {
    throw new Error('主依頼の演出が完了していないためEndingを開始できません')
  }
  if (!isCampaignVictoryAchieved(campaign)) {
    throw new Error('勝利条件を満たしていないためEndingを開始できません')
  }
  if (!ending.facts) {
    throw new Error('Ending Factsが存在しません')
  }

  const next = deepClone(campaign)
  next.ending = { ...next.ending, narrative: script, status: 'ready' }
  return next
}

/**
 * `ready` -> `viewing`: the Player has started reading the Ending
 * Presentation sequence (Aftermath -> Tavern Return -> Closing).
 */
export function startEndingPresentation(
  campaign: TavernCampaignState,
): TavernCampaignState {
  const { ending } = campaign
  if (ending.status !== 'ready') {
    throw new Error('演出を開始できる状態ではありません')
  }
  if (!ending.narrative) {
    throw new Error('顛末が記録されていないため演出を開始できません')
  }
  if (!ending.facts) {
    throw new Error('Ending Factsが存在しません')
  }
  if (!isCampaignVictoryAchieved(campaign)) {
    throw new Error('勝利条件を満たしていないため演出を開始できません')
  }

  const next = deepClone(campaign)
  next.ending = { ...next.ending, status: 'viewing' }
  return next
}

/**
 * `viewing` -> `completed`: the full Ending Presentation sequence has been
 * shown once. GAME CLEAR itself is not decided here — Victory is already a
 * fact of `mainQuest` state by the time this can ever run (item 5: watching
 * the Ending never *causes* Victory) — this only records that the epilogue
 * was watched through.
 */
export function completeEndingPresentation(
  campaign: TavernCampaignState,
): TavernCampaignState {
  const { ending } = campaign
  if (ending.status !== 'viewing') {
    throw new Error('演出を完了できる状態ではありません')
  }
  if (!ending.narrative) {
    throw new Error('顛末が記録されていないため演出を完了できません')
  }
  if (!isCampaignVictoryAchieved(campaign)) {
    throw new Error('勝利条件を満たしていないため演出を完了できません')
  }

  const next = deepClone(campaign)
  next.ending = {
    ...next.ending,
    status: 'completed',
    completedDay: campaign.dayNumber,
  }
  return next
}
