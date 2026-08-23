import type { TavernCampaignState } from './types.ts'

/**
 * Phase 10.1 Tutorial Runtime — persistent Campaign-level state only.
 * `pending` is the initial state for every new Campaign and is the ONLY
 * state that shows the one-time Consent screen; `enabled`/`disabled` are
 * terminal (no later re-toggle exists in 10.1). `disabled` globally
 * suppresses every Tutorial trigger, present and future, via
 * `shouldStartTutorial` below — it does not remove the fairy from any
 * other Presentation (Opening/Story/Main Quest/Bond Conversation/Ending).
 */
export type TutorialMode = 'pending' | 'enabled' | 'disabled'

/**
 * Every Tutorial the game will ever offer. Only `basic_request_assignment`
 * is implemented in Phase 10.1 — the rest are declared here so later
 * phases extend this union (and `completedTutorialIds`) without touching
 * every call site that already narrows on `TutorialId`.
 */
export type TutorialId =
  | 'basic_request_assignment'
  | 'day_advance'
  | 'day_results'
  | 'party_detail'
  | 'recovery'
  | 'affinity'
  | 'bond_conversation'
  | 'tavern_upgrade'
  | 'quest_chain'
  | 'world_event'
  | 'main_quest'

export const IMPLEMENTED_TUTORIAL_IDS: readonly TutorialId[] = [
  'basic_request_assignment',
]

export interface CampaignTutorialState {
  mode: TutorialMode
  completedTutorialIds: TutorialId[]
}

export function createInitialTutorialState(): CampaignTutorialState {
  return { mode: 'pending', completedTutorialIds: [] }
}

/**
 * The single gate every Tutorial trigger (present and future) must go
 * through before starting: `disabled` always says no, `pending` always
 * says no (Consent, not a Tutorial, owns that state — see the Consent
 * flow in `src/ui/canvas/tutorial/tutorialRuntime.ts`), and `enabled` says
 * yes only for a Tutorial that has not already been completed.
 */
export function shouldStartTutorial(
  campaign: Pick<TavernCampaignState, 'tutorial'>,
  tutorialId: TutorialId,
): boolean {
  const { tutorial } = campaign
  if (tutorial.mode !== 'enabled') return false
  return !tutorial.completedTutorialIds.includes(tutorialId)
}

/**
 * Only `pending -> enabled` and `pending -> disabled` are valid in Phase
 * 10.1 — there is no Settings-based re-toggle yet, so any other starting
 * mode is left untouched (a no-op) rather than silently overwritten.
 */
export function setTutorialMode(
  campaign: TavernCampaignState,
  mode: 'enabled' | 'disabled',
): TavernCampaignState {
  if (campaign.tutorial.mode !== 'pending') return campaign
  return {
    ...campaign,
    tutorial: { ...campaign.tutorial, mode },
  }
}

/** True while the Tutorial system should suppress the Tavern's usual
 * automatic Party selection on first render — during Consent, and for
 * the entire duration of the Basic Tutorial, so its own Party-selection
 * step is always the Player's own deliberate first pick rather than one
 * made for them. */
export function shouldSuppressAutoSelectParty(
  campaign: Pick<TavernCampaignState, 'tutorial'>,
): boolean {
  return (
    campaign.tutorial.mode === 'pending' ||
    shouldStartTutorial(campaign, 'basic_request_assignment')
  )
}

/** Idempotent: completing an already-completed Tutorial id is a no-op. */
export function completeTutorial(
  campaign: TavernCampaignState,
  tutorialId: TutorialId,
): TavernCampaignState {
  if (campaign.tutorial.completedTutorialIds.includes(tutorialId)) {
    return campaign
  }
  return {
    ...campaign,
    tutorial: {
      ...campaign.tutorial,
      completedTutorialIds: [
        ...campaign.tutorial.completedTutorialIds,
        tutorialId,
      ],
    },
  }
}
