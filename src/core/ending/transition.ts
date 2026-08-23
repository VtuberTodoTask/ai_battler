import { completeMainQuestPresentation } from '../mainQuest/presentation.ts'
import { buildCampaignEndingFacts } from './facts.ts'
import { isCampaignVictoryAchieved } from './victory.ts'
import type { TavernCampaignState } from '../tavern/campaign/types.ts'

/**
 * Campaign-level canonical transition wrapping `completeMainQuestPresentation`
 * (Phase 9.9 item 7) — the ONLY place a completed Main Quest Presentation
 * can trigger the Ending to begin. Ordering matters: the existing Main
 * Quest transition runs FIRST (so its own precondition guards — presentation
 * must actually be `viewing`, etc. — are enforced unchanged), and only
 * once that has genuinely succeeded does this look at whether the just-
 * completed Attempt is the Nosferatu victory that satisfies
 * `isCampaignVictoryAchieved`. A normal Threat, a Nosferatu defeat/failure,
 * or an Ending that has already been triggered (`status !== 'locked'`)
 * leaves `ending` completely untouched — Presentation completing never
 * itself decides victory (Core Doctrine: Simulation decides, Presentation
 * only replays).
 */
export function completeMainQuestPresentationForCampaign(
  campaign: TavernCampaignState,
  attemptId: string,
): TavernCampaignState {
  const next = completeMainQuestPresentation(campaign, attemptId)

  const attempt = next.mainQuest.attempts.find((a) => a.id === attemptId)
  if (!attempt) return next
  if (attempt.threatId !== 'nosferatu') return next
  if (!attempt.result || !attempt.result.monsterDefeated) return next
  if (next.ending.status !== 'locked') return next
  if (!isCampaignVictoryAchieved(next)) return next

  const facts = buildCampaignEndingFacts(next, attempt)
  next.ending = {
    status: 'narrative_pending',
    triggerAttemptId: attemptId,
    triggeredDay: attempt.dayNumber,
    facts,
  }
  return next
}
