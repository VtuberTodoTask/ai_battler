import {
  advanceCampaignDay,
  resolveCampaignDay,
} from '../../core/tavern/campaign/campaign.ts'
import type { TavernCampaignState } from '../../core/tavern/campaign/types.ts'

/**
 * The pure resolve/advance state transition `TavernSimulator.handleFinishDay`
 * drives — factored out so both the production handler and its regression
 * tests run the exact same logic, instead of the test re-implementing it
 * separately (which is exactly the kind of drift that let the "autosave
 * mid-Presentation" bug go unnoticed). Never advances past a pending Main
 * Quest Presentation (`advanceCampaignDay` itself enforces that as a Core
 * invariant); the caller can autosave the result whenever
 * `currentDay.status === 'planning'`, since that's the only status the Save
 * contract (`saveToSlot`/`validateGameSave`) ever accepts.
 */
export function resolveFinishDayTransition(
  campaign: TavernCampaignState,
): TavernCampaignState {
  let next = campaign
  if (next.currentDay.status === 'planning') {
    next = resolveCampaignDay(next)
  }
  if (
    next.currentDay.status === 'resolved' &&
    next.mainQuest.pendingPresentationAttemptId === undefined
  ) {
    next = advanceCampaignDay(next)
  }
  return next
}
