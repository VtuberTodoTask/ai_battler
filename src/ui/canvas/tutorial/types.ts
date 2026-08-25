import type { ExpeditionPrediction } from '../../../core/tavern/prediction/types.ts'
import type { TutorialId } from '../../../core/tavern/campaign/tutorial.ts'

/**
 * Regions of the Tavern/Day Results UI a Tutorial step can point at —
 * either as the thing (or things, see `TutorialTargetSpec`) a
 * `wait_for_action` step leaves operable (`target`, aka the interaction
 * target — see `TutorialWaitForActionStep`), or as the thing(s) a step
 * wants the Player to *look at* without necessarily letting them touch it
 * (`highlightTarget` — see below). Extensible for later Tutorials — Phase
 * 10.1 produces `quest_list` / `party_list` / `prediction_rate` /
 * `assign_button` / `next_day_button`; Phase 10.2 (Day Results) adds the
 * `day_results_*` targets; Phase 10.3 (Tavern Functions Overview) adds the
 * `tavern_*_button` targets below — the Tavern Header's 8 navigation
 * buttons, each spotlit in turn purely for explanation (never granted as
 * an interaction target — item 7 of the Phase 10.3 review: the Player
 * never actually opens any of these Scenes during this Tutorial).
 */
export type TutorialTarget =
  | 'none'
  | 'quest_list'
  | 'party_list'
  | 'prediction_rate'
  | 'assign_button'
  | 'next_day_button'
  | 'day_results_important_events'
  | 'day_results_next_button'
  | 'day_results_finance'
  | 'day_results_results_area'
  | 'day_results_narrative_button'
  | 'day_results_next_day_button'
  | 'tavern_save_button'
  | 'tavern_library_button'
  | 'tavern_ledger_button'
  | 'tavern_facilities_button'
  | 'tavern_visitors_button'
  | 'tavern_request_history_button'
  | 'tavern_world_state_button'
  | 'tavern_main_quest_button'

/**
 * A step's interaction/highlight target(s) — either a single
 * `TutorialTarget`, or (Phase 10.2 Multi-target extension, item 10 of the
 * Day Results review) several at once, e.g. the Day Results closing step
 * where BOTH "物語として読む" and "翌日へ" are simultaneously valid
 * choices. `TutorialRuntime` always normalizes this to an array
 * internally (`'none'`/absent normalizes to `[]`) — existing Phase 10.1
 * script data, which only ever assigns a single `TutorialTarget` string,
 * needs no changes to keep type-checking under this wider type (item 11).
 */
export type TutorialTargetSpec = TutorialTarget | readonly TutorialTarget[]

/** Axis-aligned bounds in the same (virtual) coordinate space as the rest
 * of the Canvas UI, used to carve an input-blocker cutout around the
 * currently-allowed target. */
export interface TutorialTargetBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * PR #63 review item 3: where `TutorialOverlay` docks its bottom-of-screen
 * Dialogue Panel for the current frame. `'bottom'` is the default; the
 * Overlay switches to `'top'` by itself, generically, whenever ANY current
 * interaction/highlight target would otherwise sit under the Dialogue
 * (see `chooseTutorialDialoguePlacement` in `TutorialOverlay.ts`) — never
 * a per-Scene or per-step hardcoded value (item 4's explicit prohibition).
 */
export type TutorialDialoguePlacement = 'bottom' | 'top'

/** Gameplay events the Tutorial Runtime can react to. The Runtime never
 * originates any of these itself — every dispatch follows a real Gameplay
 * action that already happened (Observe/Gate/Explain only, never Act). */
export type TutorialAction =
  | { type: 'quest_selected'; questId: string }
  | { type: 'party_selected'; partyId: string }
  | { type: 'prediction_ready'; prediction: ExpeditionPrediction }
  | { type: 'request_offered'; decision: 'accepted' | 'declined' }
  | { type: 'day_advanced' }
  /** Phase 10.2: the Player pressed Day Results' own `次へ` (important
   * events -> expedition results) — dispatched only after the Scene's
   * step state has actually changed (item 18 of the Day Results review),
   * never on the raw button press. Deliberately its own action rather
   * than reusing `day_advanced` — this never advances the Campaign day,
   * it only switches which Day Results step is showing (item 49). */
  | { type: 'day_results_next_pressed' }
  /** Phase 10.2: a "物語として読む" Narrative was actually opened — the
   * Scene dispatches this right before pushing the SoundNovel Scene
   * (never on a generation failure — item 40). */
  | { type: 'day_results_story_opened' }
  /** Phase 10.2: the Player pressed "翌日へ", actually closing Day
   * Results (Scene about to `pop()`) — this is what completes the
   * `day_results` Tutorial (item 51), not a Campaign day advance. */
  | { type: 'day_results_closed' }

export type TutorialWaitKind =
  | 'quest_selected'
  | 'party_selected'
  | 'prediction_ready'
  | 'request_offered'
  | 'day_advanced'
  | 'day_results_next_pressed'
  | 'day_results_story_opened'
  | 'day_results_closed'

/** A step's wait kind(s) — plural only for the Day Results Multi-target
 * closing step, which accepts either `day_results_story_opened` or
 * `day_results_closed` as the Player's next real action. */
export type TutorialWaitSpec = TutorialWaitKind | readonly TutorialWaitKind[]

export interface TutorialMessageStep {
  type: 'message'
  id: string
  speaker: string
  text: string
  /** Absent means this is the script's final step — reaching it completes
   * the Tutorial. */
  next?: string
  /** Optional Spotlight target(s) — the Game UI region(s) this `message`
   * should visually pull out of the dim Overlay while it's showing, even
   * though `message` steps never grant interaction (see
   * `TutorialWaitForActionStep.target`). Lets a step "preview" the next
   * operable region (e.g. the Assign button, highlighted a line before
   * the Player is actually allowed to press it) or explain a read-only
   * value in place (e.g. the predicted success rate). Absent/`'none'`
   * means this step spotlights nothing — the screen stays fully dim. */
  highlightTarget?: TutorialTargetSpec
}

export interface TutorialChoiceOption {
  id: string
  label: string
  next: string
}

export interface TutorialChoiceStep {
  type: 'choice'
  id: string
  speaker: string
  text: string
  options: TutorialChoiceOption[]
}

export interface TutorialWaitForActionStep {
  type: 'wait_for_action'
  id: string
  /** Plural only for the Day Results closing step, which accepts either
   * of two real next actions (item 10 of the Day Results review). */
  wait: TutorialWaitSpec
  /** The interaction target(s): the Game UI region(s) the Player may
   * operate while this step is active — everything else stays input-
   * blocked. Almost always one target; the Day Results closing step
   * (Narrative + Next Day both valid at once) is the one Multi-target
   * case. (Named `target` rather than `interactionTarget` for backwards
   * compatibility with the original Phase 10.1 step data; the meaning is
   * exactly "interaction target(s)" throughout the Tutorial Runtime/
   * Overlay.) */
  target: TutorialTargetSpec
  /** Optional Spotlight target(s) — see `TutorialMessageStep.highlightTarget`
   * for the full explanation. Absent defaults to `target` (item 8 of the
   * Spotlight review: an operable step spotlights the same region it
   * unblocks, unless a step explicitly wants to show the Player
   * something they can't yet touch — see `TutorialRuntime`'s defaulting
   * logic). */
  highlightTarget?: TutorialTargetSpec
  /** Used for every wait kind except `request_offered`, which branches via
   * `branches` below instead. */
  next?: string
  /** Only meaningful when `wait === 'request_offered'` — routes to a
   * different next step depending on the offer's decision, since accepted
   * and declined each get their own single reaction line before the
   * script reconverges. */
  branches?: { accepted: string; declined: string }
  /** Only meaningful when `wait === 'prediction_ready'` — where to go if
   * the async fetch fails while waiting here (its own short message step,
   * whose own `next` returns to the matching Party-selection wait). Each
   * prediction wait (first attempt vs. retry) points at its own error
   * step, since they return to different Party-selection steps. */
  onError?: string
}

export type TutorialStep =
  TutorialMessageStep | TutorialChoiceStep | TutorialWaitForActionStep

/** A Tutorial script is a graph of steps addressed by id, rather than a
 * flat sequence, so branches (e.g. accepted vs. declined) can reconverge
 * onto shared closing steps. */
export interface TutorialScript {
  startStepId: string
  steps: Record<string, TutorialStep>
}

/** What the Tutorial Overlay needs to render on any given frame — the
 * Runtime derives this from its internal step/phase state; the Overlay
 * itself holds no Tutorial logic. */
export interface TutorialPresentationSnapshot {
  visible: boolean
  speaker: string
  text: string
  choices?: { id: string; label: string }[]
  showNextButton: boolean
  /** Interaction target — see `TutorialWaitForActionStep.target`. The
   * first entry of `targets`, or `'none'` when empty — kept for callers
   * that only ever care about the single-target case. */
  target: TutorialTarget
  /** Interaction target(s), normalized — never contains `'none'`; an
   * empty array means "block everything" (Multi-target extension, Phase
   * 10.2 item 10-11). */
  targets: readonly TutorialTarget[]
  /** Spotlight target — see `TutorialMessageStep.highlightTarget`. Never
   * granted extra interaction on its own; a region can be spotlighted
   * without being operable (see `TutorialOverlay`). First entry of
   * `highlightTargets`, or `'none'` when empty. */
  highlightTarget: TutorialTarget
  /** Spotlight target(s), normalized — never contains `'none'`. */
  highlightTargets: readonly TutorialTarget[]
}

/**
 * Phase 10.2 item 42: a Presentation-only resume marker for a Tutorial
 * that was interrupted by a Scene round-trip (Day Results -> SoundNovel ->
 * Day Results). Lives on `GameUiState` (never the Campaign/Save schema —
 * active Tutorial step progress is never persisted, see
 * `TutorialRuntime`'s own class doc) so the Scene that owns the Runtime
 * can force it back onto the exact step it left off on, rather than
 * restarting the Tutorial from its `startStepId`. `tutorialId` doubles as
 * a safety check — a marker for a different (or no longer running)
 * Tutorial is simply ignored (item 45's "stale markerが残らない" —
 * every consumer treats an unrecognized/inapplicable marker as absent
 * rather than acting on it).
 */
export interface TutorialResumeState {
  tutorialId: TutorialId
  stepId: string
}

/**
 * Phase 10.2 Day Results outcome classification, derived by
 * `DayResultsScene` from the EXISTING authoritative
 * `dayResultsViewModel.ts` per-result `tone` projection (never re-derived
 * by the Tutorial itself — item 24 of the Day Results review): every
 * result `good` -> `all_success`; every result `bad` -> `all_failure`; no
 * results at all -> `no_results`; anything else (any mix, including a
 * `mixed`/`other` tone present) -> `mixed`. Drives which outcome-branch
 * step the script jumps to after `day_results_next_pressed`.
 */
export type DayResultsTutorialOutcome =
  'all_success' | 'mixed' | 'all_failure' | 'no_results'
