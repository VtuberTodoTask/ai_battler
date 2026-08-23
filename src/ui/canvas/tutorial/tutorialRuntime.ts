import type { ExpeditionPrediction } from '../../../core/tavern/prediction/types.ts'
import {
  completeTutorial,
  setTutorialMode,
  shouldStartTutorial,
  type TutorialId,
} from '../../../core/tavern/campaign/tutorial.ts'
import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import { BASIC_REQUEST_ASSIGNMENT_SCRIPT } from '../../../data/tutorials/basicRequestAssignment.ts'
import {
  TUTORIAL_CONSENT_DECLINE_LINES,
  TUTORIAL_CONSENT_QUESTION,
} from '../../../data/tutorials/consent.ts'
import type {
  TutorialAction,
  TutorialPresentationSnapshot,
  TutorialScript,
  TutorialStep,
  TutorialTarget,
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

export interface TutorialRuntimeCallbacks {
  /** Commits a Core Tutorial state transition (mode/completion) back onto
   * the live Campaign. The Runtime never mutates Gameplay state itself —
   * this is the only Campaign write it ever performs, and it is always
   * one of `setTutorialMode`/`completeTutorial`. */
  onCommitCampaign: (next: TavernCampaignState) => void
  /** Called whenever the presentation snapshot may have changed, so the
   * owning Scene can re-render the Overlay. */
  onChange: () => void
}

/**
 * Phase 10.1 Tutorial Runtime — Presentation-only. Holds which Tutorial
 * step is active (never persisted to Campaign/Save; Save itself is
 * blocked while this Runtime is blocking, so there is nothing to resume),
 * and only ever writes to the Campaign through `setTutorialMode` /
 * `completeTutorial`. It never selects a Quest/Party, never offers a
 * Request, and never rewrites a prediction — those all remain real
 * Gameplay actions the owning Scene performs first; this Runtime only
 * observes them via `dispatch()` afterward (Observe/Gate/Explain, never
 * Act).
 */
export class TutorialRuntime {
  private _campaign: TavernCampaignState
  private readonly _onCommitCampaign: (next: TavernCampaignState) => void
  private readonly _onChange: () => void
  private _phase: TutorialPhase = 'closed'
  private _activeTutorialId: TutorialId | null = null
  private _stepId: string | null = null
  private _lastSpeaker = ''
  private _lastText = ''
  private _lastPrediction: ExpeditionPrediction | undefined

  constructor(
    campaign: TavernCampaignState,
    callbacks: TutorialRuntimeCallbacks,
  ) {
    this._campaign = campaign
    this._onCommitCampaign = callbacks.onCommitCampaign
    this._onChange = callbacks.onChange
    this.initializePhase()
  }

  /** Updates the Campaign reference used for future commits (so a commit
   * always starts from the latest known state) WITHOUT touching phase or
   * step — a bare Campaign prop sync must never reset Consent or restart
   * the active Tutorial's step sequence. */
  syncCampaign(campaign: TavernCampaignState): void {
    this._campaign = campaign
  }

  /** Identity of the Campaign this Runtime was built from — TavernScene
   * uses this to tell "the same Campaign resynced" (Tutorial's own
   * commits, day advance, etc. — must NOT reset phase/step) apart from
   * "a genuinely different Campaign was loaded onto an already-mounted
   * Tavern Scene" (must reinitialize from scratch). `seed` is never
   * mutated by any Core transition once a Campaign is created. */
  get campaignSeed(): string {
    return this._campaign.seed
  }

  get isBlocking(): boolean {
    return this._phase === 'consent' || this._phase === 'active'
  }

  get currentTarget(): TutorialTarget {
    const step = this.currentStep()
    if (this._phase === 'active' && step?.type === 'wait_for_action') {
      return step.target
    }
    return 'none'
  }

  getSnapshot(): TutorialPresentationSnapshot {
    if (this._phase === 'closed') {
      return {
        visible: false,
        speaker: '',
        text: '',
        showNextButton: false,
        target: 'none',
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
      }
    }
    if (step.type === 'message') {
      return {
        visible: true,
        speaker: step.speaker,
        text: step.text,
        showNextButton: true,
        target: 'none',
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
      }
    }
    return {
      visible: true,
      speaker: this._lastSpeaker,
      text: this._lastText,
      showNextButton: false,
      target: step.target,
    }
  }

  /** The Player tapped [次へ] (or the equivalent whole-panel advance) on a
   * `message` step. No-op on `choice`/`wait_for_action` steps. */
  advanceMessage(): void {
    const step = this.currentStep()
    if (!step || step.type !== 'message') return
    if (!step.next) {
      if (this._phase === 'active' && this._activeTutorialId) {
        this.commit(completeTutorial(this._campaign, this._activeTutorialId))
      }
      this._phase = 'closed'
      this._stepId = null
      this._activeTutorialId = null
      this._onChange()
      return
    }
    this.goTo(step.next)
  }

  /** The Player picked a Consent choice. No-op outside the Consent
   * `question` step. */
  selectChoice(optionId: string): void {
    if (this._phase !== 'consent') return
    const step = this.currentStep()
    if (!step || step.type !== 'choice' || step.id !== 'question') return
    const option = step.options.find((o) => o.id === optionId)
    if (!option) return

    if (optionId === 'yes') {
      this.commit(setTutorialMode(this._campaign, 'enabled'))
      this._phase = 'active'
      this._activeTutorialId = 'basic_request_assignment'
      this.goTo(BASIC_REQUEST_ASSIGNMENT_SCRIPT.startStepId)
      return
    }

    this.commit(setTutorialMode(this._campaign, 'disabled'))
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
    if (step.wait !== action.type) return

    if (step.wait === 'request_offered' && action.type === 'request_offered') {
      if (!step.branches) return
      this.goTo(
        action.decision === 'accepted'
          ? step.branches.accepted
          : step.branches.declined,
      )
      return
    }

    if (step.next) this.goTo(step.next)
  }

  /** The async prediction fetch failed while waiting on it — never leave
   * the Tutorial stuck; send the Player back to Party selection instead. */
  handlePredictionError(): void {
    if (this._phase !== 'active') return
    const step = this.currentStep()
    if (step?.type === 'wait_for_action' && step.wait === 'prediction_ready') {
      this.goTo('pred_error_1')
    }
  }

  private initializePhase(): void {
    if (this._campaign.tutorial.mode === 'pending') {
      this._phase = 'consent'
      this._stepId = CONSENT_SCRIPT.startStepId
      this.updateLastMessageFromCurrentStep()
      return
    }
    if (shouldStartTutorial(this._campaign, 'basic_request_assignment')) {
      this._phase = 'active'
      this._activeTutorialId = 'basic_request_assignment'
      this._stepId = BASIC_REQUEST_ASSIGNMENT_SCRIPT.startStepId
      this.updateLastMessageFromCurrentStep()
      return
    }
    this._phase = 'closed'
    this._stepId = null
  }

  private commit(next: TavernCampaignState): void {
    this._campaign = next
    this._onCommitCampaign(next)
  }

  private currentScript(): TutorialScript | null {
    if (this._phase === 'consent') return CONSENT_SCRIPT
    if (this._phase === 'active') return BASIC_REQUEST_ASSIGNMENT_SCRIPT
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
      step.wait === 'prediction_ready' &&
      this._lastPrediction &&
      step.next
    ) {
      this._stepId = step.next
      this.updateLastMessageFromCurrentStep()
    }

    this._onChange()
  }
}
