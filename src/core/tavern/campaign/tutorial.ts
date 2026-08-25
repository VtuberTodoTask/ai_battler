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
 * Every Tutorial the game will ever offer. `basic_request_assignment`
 * (Phase 10.1), `day_results` (Phase 10.2), and `tavern_functions` (Phase
 * 10.3 — the closing "what does each header button do" overview, ending
 * the first-time introductory Tutorial sequence) are implemented so far —
 * the rest are declared here so later phases extend this union (and
 * `completedTutorialIds`) without touching every call site that already
 * narrows on `TutorialId`.
 */
export type TutorialId =
  | 'basic_request_assignment'
  | 'day_advance'
  | 'day_results'
  | 'tavern_functions'
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
  'day_results',
  'tavern_functions',
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
 *
 * `tavern_functions` (Phase 10.3) additionally requires `day_results` to
 * already be completed — it walks through the Tavern's header buttons,
 * so it must never start on the very first post-Opening Tavern render,
 * before the Player has even seen a Day Results screen (item 4 of the
 * Phase 10.3 review). This is the one Tutorial-to-Tutorial ordering
 * dependency the game has; encoded here, in the same single source of
 * truth every other trigger check already goes through, rather than as a
 * Scene-side special case.
 */
export function shouldStartTutorial(
  campaign: Pick<TavernCampaignState, 'tutorial'>,
  tutorialId: TutorialId,
): boolean {
  const { tutorial } = campaign
  if (tutorial.mode !== 'enabled') return false
  if (tutorial.completedTutorialIds.includes(tutorialId)) return false
  if (tutorialId === 'tavern_functions') {
    return tutorial.completedTutorialIds.includes('day_results')
  }
  return true
}

/**
 * Phase 10.3 item 3-4: which Tutorial, if any, `TavernScene` should be
 * running its Runtime for right now. Consent is asked once, ever, at the
 * very first Tutorial the Player can reach — always
 * `basic_request_assignment` — so `pending` mode (or that Tutorial not
 * yet completed) always wins; only once it's done does the Tavern move on
 * to `tavern_functions`. Returns `basic_request_assignment` as the inert
 * default when neither should currently show anything (Tutorial fully
 * disabled, or the whole introductory sequence is already complete) —
 * that Runtime simply sits `closed` in that case, same as it always has,
 * so this never changes existing single-Tutorial behavior.
 */
export function selectActiveTavernTutorialId(
  campaign: Pick<TavernCampaignState, 'tutorial'>,
): TutorialId {
  if (
    campaign.tutorial.mode === 'pending' ||
    shouldStartTutorial(campaign, 'basic_request_assignment')
  ) {
    return 'basic_request_assignment'
  }
  if (shouldStartTutorial(campaign, 'tavern_functions')) {
    return 'tavern_functions'
  }
  return 'basic_request_assignment'
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

/**
 * Idempotent: completing an already-completed Tutorial id is a no-op.
 * Also a no-op — never throws — when `mode !== 'enabled'` (a Tutorial can
 * only complete while it is the one actually running; mirrors
 * `setTutorialMode`'s own silent-no-op-on-invalid-transition convention)
 * or when `tutorialId` is not in `IMPLEMENTED_TUTORIAL_IDS` (the single
 * source of truth also used by save validation — nothing should ever
 * mark a not-yet-built Tutorial complete). These two guards are what
 * make the causal invariant `completedTutorialIds` is non-empty only
 * while `mode === 'enabled'` hold for every commit this function ever
 * produces, not just for well-behaved callers.
 */
export function completeTutorial(
  campaign: TavernCampaignState,
  tutorialId: TutorialId,
): TavernCampaignState {
  if (campaign.tutorial.mode !== 'enabled') return campaign
  if (!IMPLEMENTED_TUTORIAL_IDS.includes(tutorialId)) return campaign
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
