import type { ExpeditionPrediction } from '../../../core/tavern/prediction/types.ts'
import {
  shouldStartTutorial,
  type TutorialId,
} from '../../../core/tavern/campaign/tutorial.ts'
import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import {
  TUTORIAL_CONSENT_DECLINE_LINES,
  TUTORIAL_CONSENT_QUESTION,
} from '../../../data/tutorials/consent.ts'
import type {
  DayResultsTutorialOutcome,
  TutorialAction,
  TutorialPresentationSnapshot,
  TutorialScript,
  TutorialStep,
  TutorialTarget,
  TutorialTargetSpec,
  TutorialWaitKind,
  TutorialWaitSpec,
} from './types.ts'

type TutorialPhase = 'consent' | 'active' | 'closed'

function buildConsentScript(): TutorialScript {
  const declineSteps: Record<string, TutorialStep> = {}
  TUTORIAL_CONSENT_DECLINE_LINES.forEach((text, index) => {
    const id = `decline_${index + 1}`
    const nextId =
      index + 1 < TUTORIAL_CONSENT_DECLINE_LINES.length
        ? `decline_${index + 2}`
        : undefined
    declineSteps[id] = {
      type: 'message',
      id,
      speaker: TUTORIAL_CONSENT_QUESTION.speaker,
      text,
      next: nextId,
    }
  })

  return {
    startStepId: 'question',
    steps: {
      question: {
        type: 'choice',
        id: 'question',
        speaker: TUTORIAL_CONSENT_QUESTION.speaker,
        text: TUTORIAL_CONSENT_QUESTION.text,
        options: TUTORIAL_CONSENT_QUESTION.choices.map((c) => ({
          id: c.id,
          label: c.label,
          next: c.id === 'no' ? 'decline_1' : '',
        })),
      },
      ...declineSteps,
    },
  }
}

const CONSENT_SCRIPT = buildConsentScript()

/** Normalizes a `TutorialTargetSpec` to an array, dropping `'none'` —
 * `'none'`/absent is represented purely as an empty array from here on
 * (Multi-target extension, Day Results review item 11). */
export function normalizeTargetSpec(
  spec: TutorialTargetSpec | undefined,
): TutorialTarget[] {
  if (!spec) return []
  const arr = Array.isArray(spec) ? spec : [spec]
  return arr.filter((t): t is TutorialTarget => t !== 'none')
}

function normalizeWaitSpec(spec: TutorialWaitSpec): TutorialWaitKind[] {
  // `Array.isArray`'s negative-branch narrowing doesn't strip a `readonly
  // T[]` union member (its guard type is the mutable `any[]`, and a
  // readonly array isn't assignable to that) — the cast is the type-safe
  // fallback for the one case TS's control-flow analysis can't resolve
  // itself, not a workaround for a real ambiguity.
  return Array.isArray(spec) ? [...spec] : [spec as TutorialWaitKind]
}

export interface TutorialRuntimeOptions {
  /** Which Tutorial this Runtime instance manages. */
  tutorialId: TutorialId
  /** The step graph for `tutorialId`. */
  script: TutorialScript
  /** Phase 10.2 item 44: force-start on this step of `script` instead of
   * `script.startStepId` — used to resume a Tutorial that was interrupted
   * by a Scene round-trip (e.g. Day Results -> SoundNovel -> Day Results)
   * rather than restarting it. Only applied when this Runtime would
   * otherwise start `active` at all (`shouldStartTutorial` still gates
   * entry) — a stale/inapplicable value never forces a closed/consent
   * Runtime open. */
  resumeStepId?: string
}

export interface TutorialRuntimeCallbacks {
  /** Commits `setTutorialMode` through `GameUiActions.setTutorialMode` —
   * never a pre-computed Campaign object. That action reads the freshest
   * Campaign internally (via `campaignRef`, not a possibly-stale React
   * closure) before applying the Core transition, so a commit issued in
   * the same synchronous tick as another Campaign-mutating Gameplay
   * action (see `onCompleteTutorial` below) can never lose that other
   * action's write. The Runtime never mutates Gameplay state itself —
   * these two callbacks are the only Campaign writes it ever triggers. */
  onSetTutorialMode: (mode: 'enabled' | 'disabled') => void
  /** Commits `completeTutorial` through `GameUiActions.completeTutorial`
   * for the given Tutorial id — same freshness guarantee as
   * `onSetTutorialMode`. Critically used right after a real Gameplay
   * action that must not be lost by a same-tick React resync (Phase 10.1's
   * `advanceDay()`, Phase 10.2's Day Results `pop()`) — see
   * `TavernSimulator.tsx`'s `handleCompleteTutorial`. */
  onCompleteTutorial: (tutorialId: TutorialId) => void
  /** Called whenever the presentation snapshot may have changed, so the
   * owning Scene can re-render the Overlay. */
  onChange: () => void
}

/**
 * Shared Tutorial Runtime — Presentation-only. Holds which Tutorial step
 * is active (never persisted to Campaign/Save; Save itself is blocked
 * while this Runtime is blocking, so there is nothing to resume through
 * Save/Load — see `TutorialResumeState` for the separate, Presentation-
 * only mechanism that survives a same-session Scene round-trip), and only
 * ever writes to the Campaign through `setTutorialMode` / `completeTutorial`.
 * It never selects a Quest/Party, never offers a Request, never advances
 * the day, and never rewrites a prediction — those all remain real
 * Gameplay actions the owning Scene performs first; this Runtime only
 * observes them via `dispatch()` afterward (Observe/Gate/Explain, never
 * Act).
 *
 * One instance manages exactly one Tutorial (`tutorialId`/`script`, given
 * at construction — see `TutorialRuntimeOptions`); Consent is the one
 * exception, since it is asked once, ever, at the very first Tutorial a
 * Player can encounter (`basic_request_assignment`) — every later
 * Tutorial's `campaign.tutorial.mode` is already resolved by the time the
 * Player reaches it, so only a `basic_request_assignment` instance ever
 * enters the `consent` phase at all (see `initializePhase`).
 */
export class TutorialRuntime {
  private _campaign: TavernCampaignState
  private readonly _tutorialId: TutorialId
  private readonly _script: TutorialScript
  private readonly _consentScript: TutorialScript | null
  private readonly _onSetTutorialMode: (mode: 'enabled' | 'disabled') => void
  private readonly _onCompleteTutorial: (tutorialId: TutorialId) => void
  private readonly _onChange: () => void
  private _phase: TutorialPhase = 'closed'
  private _stepId: string | null = null
  private _lastSpeaker = ''
  private _lastText = ''
  private _lastPrediction: ExpeditionPrediction | undefined
  private _dayResultsOutcome: DayResultsTutorialOutcome = 'no_results'
  private _narrativeAvailable = false

  constructor(
    campaign: TavernCampaignState,
    options: TutorialRuntimeOptions,
    callbacks: TutorialRuntimeCallbacks,
  ) {
    this._campaign = campaign
    this._tutorialId = options.tutorialId
    this._script = options.script
    this._consentScript =
      options.tutorialId === 'basic_request_assignment' ? CONSENT_SCRIPT : null
    this._onSetTutorialMode = callbacks.onSetTutorialMode
    this._onCompleteTutorial = callbacks.onCompleteTutorial
    this._onChange = callbacks.onChange
    this.initializePhase(options.resumeStepId)
  }

  /** Updates the Campaign reference used for future commits (so a commit
   * always starts from the latest known state) WITHOUT touching phase or
   * step — a bare Campaign prop sync must never reset Consent or restart
   * the active Tutorial's step sequence. */
  syncCampaign(campaign: TavernCampaignState): void {
    this._campaign = campaign
  }

  /** Phase 10.2 item 24: feeds this Runtime the authoritative, already-
   * classified Day Results outcome (from the Scene's own ViewModel — see
   * `dayResultsViewModel.ts`'s `tone` projection) and whether the
   * currently-selected result has a Narrative available. The Runtime
   * never re-derives either from raw Campaign/Expedition data itself —
   * only consumes what the Scene's authoritative projection already
   * computed. Safe to call every render; only read at the two Day
   * Results-specific branch points below. */
  syncDayResultsContext(
    outcome: DayResultsTutorialOutcome,
    narrativeAvailable: boolean,
  ): void {
    this._dayResultsOutcome = outcome
    this._narrativeAvailable = narrativeAvailable
  }

  /** Phase 10.2 item 44: force-jump to `stepId` within the active script,
   * for resuming after a Scene round-trip. A no-op (never throws) when
   * this Runtime isn't currently `active`, or when `stepId` doesn't exist
   * in the current script — a stale/foreign resume marker is simply
   * ignored (item 45) rather than corrupting the Runtime's state. */
  resumeAt(stepId: string): void {
    if (this._phase !== 'active') return
    if (!this._script.steps[stepId]) return
    this._stepId = stepId
    this.updateLastMessageFromCurrentStep()
    this._onChange()
  }

  /** Identity of the Campaign this Runtime was built from — the owning
   * Scene uses this to tell "the same Campaign resynced" (the Tutorial's
   * own commits, a day advance, etc. — must NOT reset phase/step) apart
   * from "a genuinely different Campaign was loaded" (must reinitialize
   * from scratch). `seed` is never mutated by any Core transition once a
   * Campaign is created. */
  get campaignSeed(): string {
    return this._campaign.seed
  }

  /** Phase 10.3 item 4: which Tutorial this instance manages — read by
   * `TavernScene`, which (unlike `DayResultsScene`) can host more than one
   * Tutorial id over its lifetime (`basic_request_assignment`, then later
   * `tavern_functions`), to tell "the desired id changed, this Runtime
   * must be rebuilt" apart from "same id, just resync the Campaign". */
  get tutorialId(): TutorialId {
    return this._tutorialId
  }

  get isBlocking(): boolean {
    return this._phase === 'consent' || this._phase === 'active'
  }

  /** Phase 10.2 item 42/44: the active script step id, or `null` while
   * `closed`/between steps — the owning Scene reads this (only while
   * `isBlocking`) right after a `dispatch()` that may have moved the
   * Runtime, to build a `TutorialResumeState` marker generically, without
   * needing to know any of this script's step ids by name. */
  get currentStepId(): string | null {
    return this._stepId
  }

  /** Interaction target(s) for the current step — see
   * `TutorialWaitForActionStep.target`. Empty outside an active
   * `wait_for_action` step. */
  get currentTargets(): readonly TutorialTarget[] {
    const step = this.currentStep()
    if (this._phase !== 'active' || step?.type !== 'wait_for_action') return []
    return normalizeTargetSpec(step.target)
  }

  /** Single-target convenience accessor — the first (usually only) entry
   * of `currentTargets`, or `'none'` when empty. */
  get currentTarget(): TutorialTarget {
    return this.currentTargets[0] ?? 'none'
  }

  /** Spotlight target(s) for the current step — see
   * `TutorialMessageStep.highlightTarget` / `TutorialWaitForActionStep.
   * highlightTarget`. Independent of `currentTargets`: a step can
   * spotlight a region without granting it any interaction (the
   * Prediction explanation highlights `prediction_rate` while leaving
   * `currentTargets` empty), and a `message` step can preview the NEXT
   * operable region before its own `wait_for_action` step actually
   * unblocks it. */
  get currentHighlightTargets(): readonly TutorialTarget[] {
    const step = this.currentStep()
    if (!step) return []
    if (step.type === 'wait_for_action') {
      return step.highlightTarget !== undefined
        ? normalizeTargetSpec(step.highlightTarget)
        : this.currentTargets
    }
    if (step.type === 'message')
      return normalizeTargetSpec(step.highlightTarget)
    return []
  }

  /** Single-target convenience accessor — the first (usually only) entry
   * of `currentHighlightTargets`, or `'none'` when empty. */
  get currentHighlightTarget(): TutorialTarget {
    return this.currentHighlightTargets[0] ?? 'none'
  }

  getSnapshot(): TutorialPresentationSnapshot {
    if (this._phase === 'closed') {
      return {
        visible: false,
        speaker: '',
        text: '',
        showNextButton: false,
        target: 'none',
        targets: [],
        highlightTarget: 'none',
        highlightTargets: [],
      }
    }
    const step = this.currentStep()
    if (!step) {
      return {
        visible: false,
        speaker: '',
        text: '',
        showNextButton: false,
        target: 'none',
        targets: [],
        highlightTarget: 'none',
        highlightTargets: [],
      }
    }
    if (step.type === 'message') {
      return {
        visible: true,
        speaker: step.speaker,
        text: step.text,
        showNextButton: true,
        target: 'none',
        targets: [],
        highlightTarget: this.currentHighlightTarget,
        highlightTargets: this.currentHighlightTargets,
      }
    }
    if (step.type === 'choice') {
      return {
        visible: true,
        speaker: step.speaker,
        text: step.text,
        choices: step.options.map((o) => ({ id: o.id, label: o.label })),
        showNextButton: false,
        target: 'none',
        targets: [],
        highlightTarget: 'none',
        highlightTargets: [],
      }
    }
    return {
      visible: true,
      speaker: this._lastSpeaker,
      text: this._lastText,
      showNextButton: false,
      target: this.currentTarget,
      targets: this.currentTargets,
      highlightTarget: this.currentHighlightTarget,
      highlightTargets: this.currentHighlightTargets,
    }
  }

  /** The Player tapped [次へ] (or the equivalent whole-panel advance) on a
   * `message` step. No-op on `choice`/`wait_for_action` steps. */
  advanceMessage(): void {
    const step = this.currentStep()
    if (!step || step.type !== 'message') return

    // `recover_2` (basic_request_assignment) and the last Party-results
    // explanation line (day_results — see `results_area_narrative_check`
    // in `dayResults.ts`) are the two branch points that depend on live
    // Gameplay/Presentation truth rather than a fixed `next`. Both step
    // ids are unique to their own script, so no `tutorialId` guard is
    // needed here.
    if (step.id === 'recover_2') {
      this.goTo(this.hasAcceptedOfferToday() ? 'wrap_1' : 'retry_intro_1')
      return
    }
    if (step.id === 'results_area_narrative_check') {
      this.goTo(
        this._narrativeAvailable ? 'narrative_intro_1' : 'no_narrative_1',
      )
      return
    }

    if (!step.next) {
      this.completeActiveTutorial()
      return
    }
    this.goTo(step.next)
  }

  /** The Player picked a Consent choice. No-op outside the Consent
   * `question` step (only ever reachable for a `basic_request_assignment`
   * instance — see the class doc comment). */
  selectChoice(optionId: string): void {
    if (this._phase !== 'consent') return
    const step = this.currentStep()
    if (!step || step.type !== 'choice' || step.id !== 'question') return
    const option = step.options.find((o) => o.id === optionId)
    if (!option) return

    if (optionId === 'yes') {
      this._onSetTutorialMode('enabled')
      this._phase = 'active'
      this.goTo(this._script.startStepId)
      return
    }

    this._onSetTutorialMode('disabled')
    this.goTo(option.next)
  }

  /** A real Gameplay action just happened — advance past a matching
   * `wait_for_action` step, if that is what we are currently waiting on.
   * Ignored entirely outside the `active` phase or when the action does
   * not match the current wait. */
  dispatch(action: TutorialAction): void {
    if (action.type === 'prediction_ready') {
      // Cached unconditionally: the async prediction can resolve before
      // the Runtime has advanced as far as `wait_prediction_ready` (the
      // Player can move through the preceding message steps faster than
      // the fetch completes), so this must survive until that step is
      // actually reached — see `goTo`'s auto-skip below.
      this._lastPrediction = action.prediction
    }
    if (this._phase !== 'active') return
    const step = this.currentStep()
    if (!step || step.type !== 'wait_for_action') return
    const waitKinds = normalizeWaitSpec(step.wait)
    if (!waitKinds.includes(action.type)) return

    if (action.type === 'request_offered') {
      if (!step.branches) return
      this.goTo(
        action.decision === 'accepted'
          ? step.branches.accepted
          : step.branches.declined,
      )
      return
    }

    if (action.type === 'day_results_next_pressed') {
      // The one Gameplay-truth branch point on the day_results script's
      // wait side (item 19-23 of the Day Results review) — read from the
      // Scene's own authoritative outcome projection, never a Tutorial-
      // side classification of raw Expedition results.
      this.goTo(DAY_RESULTS_OUTCOME_START_STEP_ID[this._dayResultsOutcome])
      return
    }

    if (
      step.id === 'wait_final_choice' &&
      action.type === 'day_results_story_opened'
    ) {
      // Multi-target closing step (item 10): reading the Narrative is one
      // of the two simultaneously-valid choices, and does NOT complete
      // the Tutorial on its own — it resumes into the after-story closing
      // chain instead (`day_results_closed`, handled by the generic
      // no-`next` completion fallback below, is the only action that
      // does).
      this.goTo('after_story_1')
      return
    }

    if (!step.next) {
      this.completeActiveTutorial()
      return
    }
    this.goTo(step.next)
  }

  /** The async prediction fetch failed while waiting on it — never leave
   * the Tutorial stuck; send the Player back to Party selection instead,
   * via whichever error step this specific wait declares (`onError`) —
   * the first attempt and every retry attempt each return to their own
   * Party-selection wait. Also drops any cached `_lastPrediction`:
   * without this, re-selecting the SAME Party (the most natural retry)
   * would land back on the prediction wait and `goTo`'s auto-skip would
   * immediately fire using the stale, already-failed-fetch-adjacent
   * prediction data instead of genuinely waiting for the retried fetch's
   * own `prediction_ready` dispatch. */
  handlePredictionError(): void {
    if (this._phase !== 'active') return
    const step = this.currentStep()
    if (
      step?.type === 'wait_for_action' &&
      normalizeWaitSpec(step.wait).includes('prediction_ready') &&
      step.onError
    ) {
      this._lastPrediction = undefined
      this.goTo(step.onError)
    }
  }

  private initializePhase(resumeStepId?: string): void {
    if (this._consentScript && this._campaign.tutorial.mode === 'pending') {
      this._phase = 'consent'
      this._stepId = this._consentScript.startStepId
      this.updateLastMessageFromCurrentStep()
      return
    }
    if (shouldStartTutorial(this._campaign, this._tutorialId)) {
      this._phase = 'active'
      this._stepId =
        resumeStepId && this._script.steps[resumeStepId]
          ? resumeStepId
          : this._script.startStepId
      this.updateLastMessageFromCurrentStep()
      return
    }
    this._phase = 'closed'
    this._stepId = null
  }

  /** True once at least one Request has actually been accepted today —
   * read straight from the authoritative Campaign day state, never
   * tallied independently by the Tutorial itself. (basic_request_assignment
   * only — see `advanceMessage`'s `recover_2` special case.) */
  private hasAcceptedOfferToday(): boolean {
    return this._campaign.currentDay.offers.some(
      (offer) => offer.decision === 'accepted',
    )
  }

  private completeActiveTutorial(): void {
    if (this._phase === 'active') {
      this._onCompleteTutorial(this._tutorialId)
    }
    this._phase = 'closed'
    this._stepId = null
    this._onChange()
  }

  private currentScript(): TutorialScript | null {
    if (this._phase === 'consent') return this._consentScript
    if (this._phase === 'active') return this._script
    return null
  }

  private currentStep(): TutorialStep | null {
    const script = this.currentScript()
    if (!script || !this._stepId) return null
    return script.steps[this._stepId] ?? null
  }

  private updateLastMessageFromCurrentStep(): void {
    const step = this.currentStep()
    if (step && (step.type === 'message' || step.type === 'choice')) {
      this._lastSpeaker = step.speaker
      this._lastText = step.text
    }
  }

  private goTo(stepId: string): void {
    this._stepId = stepId
    this.updateLastMessageFromCurrentStep()

    // A prediction that already arrived while we were still playing
    // through earlier message steps should not force the Player to wait
    // on nothing — skip straight past `wait_prediction_ready` once it is
    // reached.
    const step = this.currentStep()
    if (
      this._phase === 'active' &&
      step?.type === 'wait_for_action' &&
      normalizeWaitSpec(step.wait).includes('prediction_ready') &&
      this._lastPrediction &&
      step.next
    ) {
      this._stepId = step.next
      this.updateLastMessageFromCurrentStep()
    }

    this._onChange()
  }
}

/** Day Results outcome -> the first step of that branch's reaction lines
 * (items 19-23 of the Day Results review). Kept here rather than in the
 * data file since it's paired 1:1 with the Runtime's own branch dispatch
 * above; `dayResults.ts` defines the steps these ids name. */
const DAY_RESULTS_OUTCOME_START_STEP_ID: Record<
  DayResultsTutorialOutcome,
  string
> = {
  all_success: 'outcome_all_success_1',
  mixed: 'outcome_mixed_1',
  all_failure: 'outcome_all_failure_1',
  no_results: 'outcome_no_results_1',
}
