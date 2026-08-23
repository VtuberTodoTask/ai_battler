import type { ExpeditionPrediction } from '../../../core/tavern/prediction/types.ts'

/**
 * Regions of the Tavern UI a `wait_for_action` step can leave operable.
 * `'none'` means every Gameplay UI element is blocked (used by `message`/
 * `choice` steps). Extensible for later Tutorials — Phase 10.1 only ever
 * produces `quest_list` / `party_list` / `assign_button`.
 */
export type TutorialTarget =
  'none' | 'quest_list' | 'party_list' | 'assign_button'

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

export type TutorialWaitKind =
  'quest_selected' | 'party_selected' | 'prediction_ready' | 'request_offered'

export interface TutorialMessageStep {
  type: 'message'
  id: string
  speaker: string
  text: string
  /** Absent means this is the script's final step — reaching it completes
   * the Tutorial. */
  next?: string
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
  target: TutorialTarget
  /** Used for every wait kind except `request_offered`, which branches via
   * `branches` below instead. */
  next?: string
  /** Only meaningful when `wait === 'request_offered'` — routes to a
   * different next step depending on the offer's decision, since accepted
   * and declined each get their own single reaction line before the
   * script reconverges. */
  branches?: { accepted: string; declined: string }
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
  target: TutorialTarget
}
