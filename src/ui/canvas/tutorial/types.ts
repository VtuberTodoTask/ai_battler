import type { ExpeditionPrediction } from '../../../core/tavern/prediction/types.ts'

/**
 * Regions of the Tavern UI a Tutorial step can point at — either as the
 * one thing a `wait_for_action` step leaves operable (`target`, aka the
 * interaction target — see `TutorialWaitForActionStep`), or as the one
 * thing a step wants the Player to *look at* without necessarily letting
 * them touch it (`highlightTarget` — see below). `'none'` means "block/
 * spotlight nothing in particular" for each respectively. Extensible for
 * later Tutorials — Phase 10.1 only ever produces `quest_list` /
 * `party_list` / `prediction_rate` / `assign_button` / `next_day_button`.
 */
export type TutorialTarget =
  | 'none'
  | 'quest_list'
  | 'party_list'
  | 'prediction_rate'
  | 'assign_button'
  | 'next_day_button'

/** Axis-aligned bounds in the same (virtual) coordinate space as the rest
 * of the Canvas UI, used to carve an input-blocker cutout around the
 * currently-allowed target. */
export interface TutorialTargetBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Gameplay events the Tutorial Runtime can react to. The Runtime never
 * originates any of these itself — every dispatch follows a real Gameplay
 * action that already happened (Observe/Gate/Explain only, never Act). */
export type TutorialAction =
  | { type: 'quest_selected'; questId: string }
  | { type: 'party_selected'; partyId: string }
  | { type: 'prediction_ready'; prediction: ExpeditionPrediction }
  | { type: 'request_offered'; decision: 'accepted' | 'declined' }
  | { type: 'day_advanced' }

export type TutorialWaitKind =
  | 'quest_selected'
  | 'party_selected'
  | 'prediction_ready'
  | 'request_offered'
  | 'day_advanced'

export interface TutorialMessageStep {
  type: 'message'
  id: string
  speaker: string
  text: string
  /** Absent means this is the script's final step — reaching it completes
   * the Tutorial. */
  next?: string
  /** Optional Spotlight target — the one Game UI region this `message`
   * should visually pull out of the dim Overlay while it's showing, even
   * though `message` steps never grant interaction (see
   * `TutorialWaitForActionStep.target`). Lets a step "preview" the next
   * operable region (e.g. the Assign button, highlighted a line before
   * the Player is actually allowed to press it) or explain a read-only
   * value in place (e.g. the predicted success rate). Absent/`'none'`
   * means this step spotlights nothing — the screen stays fully dim. */
  highlightTarget?: TutorialTarget
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
  wait: TutorialWaitKind
  /** The interaction target: the ONE Game UI region the Player may
   * operate while this step is active — everything else stays input-
   * blocked. (Named `target` rather than `interactionTarget` for
   * backwards compatibility with the original Phase 10.1 step data; the
   * meaning is exactly "interaction target" throughout the Tutorial
   * Runtime/Overlay.) */
  target: TutorialTarget
  /** Optional Spotlight target — see `TutorialMessageStep.highlightTarget`
   * for the full explanation. Absent defaults to `target` (item 8 of the
   * Spotlight review: an operable step spotlights the same region it
   * unblocks, unless a step explicitly wants to show the Player
   * something they can't yet touch — see `TutorialRuntime`'s defaulting
   * logic). */
  highlightTarget?: TutorialTarget
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
  /** Interaction target — see `TutorialWaitForActionStep.target`. */
  target: TutorialTarget
  /** Spotlight target — see `TutorialMessageStep.highlightTarget`. Never
   * granted extra interaction on its own; a region can be spotlighted
   * without being operable (see `TutorialOverlay`). */
  highlightTarget: TutorialTarget
}
