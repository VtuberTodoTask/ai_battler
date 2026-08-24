import { describe, expect, it, vi } from 'vitest'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import {
  completeTutorial,
  setTutorialMode,
  type TutorialId,
} from '../../../core/tavern/campaign/tutorial.ts'
import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import { DAY_RESULTS_SCRIPT } from '../../../data/tutorials/dayResults.ts'
import { TutorialRuntime } from './tutorialRuntime.ts'
import type { DayResultsTutorialOutcome } from './types.ts'

function enabledCampaign(seed: string): TavernCampaignState {
  return setTutorialMode(createTavernCampaign(seed), 'enabled')
}

function createDayResultsRuntime(
  campaign: TavernCampaignState,
  resumeStepId?: string,
) {
  const modeCommits: Array<'enabled' | 'disabled'> = []
  const completedIds: TutorialId[] = []
  const onChange = vi.fn()
  let current = campaign
  const runtime = new TutorialRuntime(
    campaign,
    { tutorialId: 'day_results', script: DAY_RESULTS_SCRIPT, resumeStepId },
    {
      onSetTutorialMode: (mode: 'enabled' | 'disabled') => {
        modeCommits.push(mode)
        current = setTutorialMode(current, mode)
        runtime.syncCampaign(current)
      },
      onCompleteTutorial: (tutorialId) => {
        completedIds.push(tutorialId)
        current = completeTutorial(current, tutorialId)
        runtime.syncCampaign(current)
      },
      onChange,
    },
  )
  return {
    runtime,
    modeCommits,
    completedIds,
    onChange,
    getCurrent: () => current,
  }
}

/** Same "click through every advanceable message" helper as
 * `tutorialRuntime.test.ts` — operates on the Runtime generically, so it
 * works unchanged for this script too. */
function clickThroughMessages(runtime: TutorialRuntime, maxClicks = 30): void {
  let clicks = 0
  while (runtime.getSnapshot().showNextButton && clicks < maxClicks) {
    runtime.advanceMessage()
    clicks++
  }
}

/** Reads `runtime.currentStepId` through a plain function call so
 * TypeScript's control-flow narrowing of the getter's literal type from
 * an earlier equality check never leaks into an unrelated later
 * comparison within the same test — a compiler quirk around getter
 * narrowing, not a Runtime behavior concern. */
function stepId(runtime: TutorialRuntime): string | null {
  return runtime.currentStepId
}

/** Drives the Runtime from `intro_1` up to (and including dispatching)
 * `day_results_next_pressed`, after first telling it which outcome/
 * Narrative-availability the (fake) Scene has for this day — mirrors
 * `DayResultsScene.syncTutorial()`'s real call order: sync context, then
 * dispatch, exactly like `goToExpeditionResults()` does. */
function pressNext(
  runtime: TutorialRuntime,
  outcome: DayResultsTutorialOutcome,
  narrativeAvailable = false,
): void {
  clickThroughMessages(runtime) // intro_1..intro_6
  runtime.syncDayResultsContext(outcome, narrativeAvailable)
  runtime.dispatch({ type: 'day_results_next_pressed' })
}

describe('Phase 10.2 day_results TutorialRuntime', () => {
  it('starts directly at intro_1 without any Consent step (never depends on basic_request_assignment)', () => {
    const campaign = enabledCampaign('day-results-001')
    const { runtime } = createDayResultsRuntime(campaign)
    const snapshot = runtime.getSnapshot()
    expect(snapshot.visible).toBe(true)
    expect(snapshot.choices).toBeUndefined()
    expect(stepId(runtime)).toBe('intro_1')
    expect(snapshot.highlightTargets).toEqual([])
  })

  it('never starts when tutorial.mode is disabled', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('day-results-002'),
      'disabled',
    )
    const { runtime } = createDayResultsRuntime(campaign)
    expect(runtime.isBlocking).toBe(false)
    expect(runtime.getSnapshot().visible).toBe(false)
  })

  it('never re-triggers once day_results is already completed', () => {
    const campaign = completeTutorial(
      enabledCampaign('day-results-003'),
      'day_results',
    )
    const { runtime } = createDayResultsRuntime(campaign)
    expect(runtime.isBlocking).toBe(false)
  })

  it('intro highlights day_results_important_events, then previews day_results_next_button', () => {
    const campaign = enabledCampaign('day-results-004')
    const { runtime } = createDayResultsRuntime(campaign)

    // intro_1 is a plain greeting — nothing to highlight yet.
    expect(runtime.getSnapshot().highlightTargets).toEqual([])
    runtime.advanceMessage() // -> intro_2
    expect(runtime.getSnapshot().highlightTargets).toEqual([
      'day_results_important_events',
    ])
    for (let i = 0; i < 3; i++) runtime.advanceMessage() // intro_3..intro_5
    expect(runtime.getSnapshot().highlightTargets).toEqual([
      'day_results_important_events',
    ])
    runtime.advanceMessage() // -> intro_6
    expect(runtime.getSnapshot().highlightTargets).toEqual([
      'day_results_next_button',
    ])

    runtime.advanceMessage() // -> wait_next
    const snapshot = runtime.getSnapshot()
    expect(snapshot.targets).toEqual(['day_results_next_button'])
    expect(snapshot.highlightTargets).toEqual(['day_results_next_button'])
  })

  it('ignores day_results_next_pressed before wait_next is reached', () => {
    const campaign = enabledCampaign('day-results-005')
    const { runtime } = createDayResultsRuntime(campaign)
    runtime.syncDayResultsContext('all_success', false)
    runtime.dispatch({ type: 'day_results_next_pressed' })
    expect(stepId(runtime)).toBe('intro_1')
  })

  for (const outcome of [
    'all_success',
    'mixed',
    'all_failure',
    'no_results',
  ] as const) {
    it(`routes day_results_next_pressed to the ${outcome} branch, reading the Scene's authoritative outcome (never re-deriving it)`, () => {
      const campaign = enabledCampaign(`day-results-outcome-${outcome}`)
      const { runtime } = createDayResultsRuntime(campaign)
      pressNext(runtime, outcome)
      expect(stepId(runtime)).toBe(`outcome_${outcome}_1`)
      expect(runtime.getSnapshot().highlightTargets).toEqual([
        'day_results_results_area',
      ])
    })
  }

  it('every outcome branch reconverges onto finance_intro_1', () => {
    for (const outcome of [
      'all_success',
      'mixed',
      'all_failure',
      'no_results',
    ] as const) {
      const campaign = enabledCampaign(`day-results-converge-${outcome}`)
      const { runtime } = createDayResultsRuntime(campaign)
      pressNext(runtime, outcome)
      while (stepId(runtime) !== 'finance_intro_1') {
        runtime.advanceMessage()
      }
      expect(stepId(runtime)).toBe('finance_intro_1')
    }
  })

  it('walks the finance/reputation explanation using the real dailyOperatingCost value, then reaches results_area_1', () => {
    const campaign = enabledCampaign('day-results-006')
    const { runtime } = createDayResultsRuntime(campaign)
    pressNext(runtime, 'all_success')
    while (stepId(runtime) !== 'finance_intro_1') {
      runtime.advanceMessage() // outcome_all_success_1..2 -> finance_intro_1
    }
    expect(stepId(runtime)).toBe('finance_intro_1')
    expect(runtime.getSnapshot().highlightTargets).toEqual([
      'day_results_finance',
    ])

    let sawCostLine = false
    for (let i = 0; i < 30 && stepId(runtime) !== 'results_area_1'; i++) {
      if (runtime.getSnapshot().text.includes('10枚')) sawCostLine = true
      runtime.advanceMessage()
    }
    expect(sawCostLine).toBe(true)
    expect(stepId(runtime)).toBe('results_area_1')
  })

  it('results_area_7 branches to narrative_intro_1 when a Narrative is available', () => {
    const campaign = enabledCampaign('day-results-007')
    const { runtime } = createDayResultsRuntime(campaign)
    pressNext(runtime, 'all_success', true)
    while (stepId(runtime) !== 'results_area_7') {
      runtime.advanceMessage()
    }
    runtime.advanceMessage()
    expect(stepId(runtime)).toBe('narrative_intro_1')
  })

  it('results_area_7 branches to no_narrative_1 when no Narrative is available', () => {
    const campaign = enabledCampaign('day-results-008')
    const { runtime } = createDayResultsRuntime(campaign)
    pressNext(runtime, 'all_success', false)
    while (stepId(runtime) !== 'results_area_7') {
      runtime.advanceMessage()
    }
    runtime.advanceMessage()
    expect(stepId(runtime)).toBe('no_narrative_1')
  })

  it('the no-Narrative closing wait is single-target and completes on day_results_closed', () => {
    const campaign = enabledCampaign('day-results-009')
    const { runtime, completedIds } = createDayResultsRuntime(campaign)
    pressNext(runtime, 'all_success', false)
    while (stepId(runtime) !== 'wait_final_no_narrative') {
      runtime.advanceMessage()
    }
    const snapshot = runtime.getSnapshot()
    expect(snapshot.targets).toEqual(['day_results_next_day_button'])

    runtime.dispatch({ type: 'day_results_closed' })
    expect(completedIds).toEqual(['day_results'])
    expect(runtime.isBlocking).toBe(false)
  })

  it('wait_final_choice is a genuine Multi-target step: both buttons are simultaneously operable/highlighted', () => {
    const campaign = enabledCampaign('day-results-010')
    const { runtime } = createDayResultsRuntime(campaign)
    pressNext(runtime, 'all_success', true)
    while (stepId(runtime) !== 'wait_final_choice') {
      runtime.advanceMessage()
    }
    const snapshot = runtime.getSnapshot()
    expect(snapshot.targets).toEqual([
      'day_results_narrative_button',
      'day_results_next_day_button',
    ])
    expect(snapshot.highlightTargets).toEqual([
      'day_results_narrative_button',
      'day_results_next_day_button',
    ])
    // Backward-compat singular accessors resolve to the first entry.
    expect(snapshot.target).toBe('day_results_narrative_button')
    expect(snapshot.highlightTarget).toBe('day_results_narrative_button')
  })

  it('day_results_story_opened from wait_final_choice resumes into after_story WITHOUT completing the Tutorial', () => {
    const campaign = enabledCampaign('day-results-011')
    const { runtime, completedIds } = createDayResultsRuntime(campaign)
    pressNext(runtime, 'all_success', true)
    while (stepId(runtime) !== 'wait_final_choice') {
      runtime.advanceMessage()
    }
    runtime.dispatch({ type: 'day_results_story_opened' })
    expect(stepId(runtime)).toBe('after_story_1')
    expect(runtime.isBlocking).toBe(true)
    expect(completedIds).toEqual([])
  })

  it('day_results_closed from wait_final_choice completes the Tutorial directly (skipping the story)', () => {
    const campaign = enabledCampaign('day-results-012')
    const { runtime, completedIds } = createDayResultsRuntime(campaign)
    pressNext(runtime, 'all_success', true)
    while (stepId(runtime) !== 'wait_final_choice') {
      runtime.advanceMessage()
    }
    runtime.dispatch({ type: 'day_results_closed' })
    expect(completedIds).toEqual(['day_results'])
    expect(runtime.isBlocking).toBe(false)
  })

  it('after the story, wait_after_story_close is single-target and completes on day_results_closed — never on day_advanced', () => {
    const campaign = enabledCampaign('day-results-013')
    const { runtime, completedIds } = createDayResultsRuntime(campaign)
    pressNext(runtime, 'all_success', true)
    while (stepId(runtime) !== 'wait_final_choice') {
      runtime.advanceMessage()
    }
    runtime.dispatch({ type: 'day_results_story_opened' })
    clickThroughMessages(runtime) // after_story_1..3
    expect(stepId(runtime)).toBe('wait_after_story_close')

    // A day_advanced dispatch (basic_request_assignment's own completion
    // action) must never be conflated with day_results' own closing
    // action (item 49 of the review).
    runtime.dispatch({ type: 'day_advanced' })
    expect(completedIds).toEqual([])
    expect(runtime.isBlocking).toBe(true)

    runtime.dispatch({ type: 'day_results_closed' })
    expect(completedIds).toEqual(['day_results'])
  })

  it('resumeStepId (item 44) lands the Runtime directly on the resume step, never restarting from intro_1', () => {
    const campaign = enabledCampaign('day-results-014')
    const { runtime, completedIds } = createDayResultsRuntime(
      campaign,
      'after_story_1',
    )
    expect(stepId(runtime)).toBe('after_story_1')
    expect(runtime.getSnapshot().visible).toBe(true)

    clickThroughMessages(runtime) // after_story_1..3
    runtime.dispatch({ type: 'day_results_closed' })
    expect(completedIds).toEqual(['day_results'])
  })

  it('an unrecognized/stale resumeStepId is ignored, falling back to startStepId', () => {
    const campaign = enabledCampaign('day-results-015')
    const { runtime } = createDayResultsRuntime(campaign, 'not_a_real_step')
    expect(stepId(runtime)).toBe('intro_1')
  })

  it('resumeAt() force-jumps an already-active Runtime and no-ops for an unknown step id', () => {
    const campaign = enabledCampaign('day-results-016')
    const { runtime } = createDayResultsRuntime(campaign)
    runtime.resumeAt('after_story_1')
    expect(stepId(runtime)).toBe('after_story_1')

    runtime.resumeAt('not_a_real_step')
    expect(stepId(runtime)).toBe('after_story_1')
  })

  it('currentStepId is null once the Tutorial has closed', () => {
    const campaign = enabledCampaign('day-results-017')
    const { runtime } = createDayResultsRuntime(campaign)
    pressNext(runtime, 'all_success', false)
    while (stepId(runtime) !== 'wait_final_no_narrative') {
      runtime.advanceMessage()
    }
    runtime.dispatch({ type: 'day_results_closed' })
    expect(stepId(runtime)).toBeNull()
  })
})
