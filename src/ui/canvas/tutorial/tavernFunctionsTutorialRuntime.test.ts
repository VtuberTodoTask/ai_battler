import { describe, expect, it, vi } from 'vitest'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import {
  completeTutorial,
  setTutorialMode,
  type TutorialId,
} from '../../../core/tavern/campaign/tutorial.ts'
import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import { TAVERN_FUNCTIONS_SCRIPT } from '../../../data/tutorials/tavernFunctions.ts'
import { TutorialRuntime } from './tutorialRuntime.ts'
import type { TutorialTarget } from './types.ts'

function enabledAfterDayResults(seed: string): TavernCampaignState {
  const enabled = setTutorialMode(createTavernCampaign(seed), 'enabled')
  const withBasic = completeTutorial(enabled, 'basic_request_assignment')
  return completeTutorial(withBasic, 'day_results')
}

function createTavernFunctionsRuntime(
  campaign: TavernCampaignState,
  resumeStepId?: string,
) {
  const modeCommits: Array<'enabled' | 'disabled'> = []
  const completedIds: TutorialId[] = []
  const onChange = vi.fn()
  let current = campaign
  const runtime = new TutorialRuntime(
    campaign,
    {
      tutorialId: 'tavern_functions',
      script: TAVERN_FUNCTIONS_SCRIPT,
      resumeStepId,
    },
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

/** Reads `runtime.currentStepId` through a plain function call so
 * TypeScript's control-flow narrowing of the getter's literal type from
 * an earlier equality check never leaks into an unrelated later
 * comparison within the same test — see the identical helper's doc
 * comment in `dayResultsTutorialRuntime.test.ts`. */
function stepId(runtime: TutorialRuntime): string | null {
  return runtime.currentStepId
}

describe('Phase 10.3 tavern_functions TutorialRuntime', () => {
  it('starts at intro_1, with no Consent step, once basic_request_assignment and day_results are both completed', () => {
    const campaign = enabledAfterDayResults('tf-001')
    const { runtime } = createTavernFunctionsRuntime(campaign)
    const snapshot = runtime.getSnapshot()
    expect(snapshot.visible).toBe(true)
    expect(snapshot.choices).toBeUndefined()
    expect(stepId(runtime)).toBe('intro_1')
    expect(runtime.tutorialId).toBe('tavern_functions')
  })

  it('never starts when day_results has not completed yet, even with basic_request_assignment done', () => {
    const enabled = setTutorialMode(createTavernCampaign('tf-002'), 'enabled')
    const withBasic = completeTutorial(enabled, 'basic_request_assignment')
    const { runtime } = createTavernFunctionsRuntime(withBasic)
    expect(runtime.isBlocking).toBe(false)
    expect(runtime.getSnapshot().visible).toBe(false)
  })

  it('never starts when tutorial.mode is disabled', () => {
    const campaign = setTutorialMode(createTavernCampaign('tf-003'), 'disabled')
    const { runtime } = createTavernFunctionsRuntime(campaign)
    expect(runtime.isBlocking).toBe(false)
  })

  it('never re-triggers once tavern_functions is already completed', () => {
    const campaign = completeTutorial(
      enabledAfterDayResults('tf-004'),
      'tavern_functions',
    )
    const { runtime } = createTavernFunctionsRuntime(campaign)
    expect(runtime.isBlocking).toBe(false)
  })

  it('never grants an interaction target on any step — every step is explanation-only (item 46)', () => {
    const campaign = enabledAfterDayResults('tf-005')
    const { runtime } = createTavernFunctionsRuntime(campaign)
    for (let i = 0; i < 40; i++) {
      const snapshot = runtime.getSnapshot()
      expect(snapshot.targets).toEqual([])
      expect(snapshot.target).toBe('none')
      if (!snapshot.showNextButton) break
      runtime.advanceMessage()
    }
  })

  const expectedHighlights: [string, TutorialTarget][] = [
    ['save_1', 'tavern_save_button'],
    ['library_1', 'tavern_library_button'],
    ['ledger_1', 'tavern_ledger_button'],
    ['facilities_1', 'tavern_facilities_button'],
    ['visitors_1', 'tavern_visitors_button'],
    ['request_history_1', 'tavern_request_history_button'],
    ['world_state_1', 'tavern_world_state_button'],
    ['main_quest_1', 'tavern_main_quest_button'],
  ]

  it('spotlights exactly one Header button at a time, in order, matching each section', () => {
    const campaign = enabledAfterDayResults('tf-006')
    const { runtime } = createTavernFunctionsRuntime(campaign)

    for (const [expectedStepId, expectedTarget] of expectedHighlights) {
      while (stepId(runtime) !== expectedStepId) {
        runtime.advanceMessage()
      }
      const snapshot = runtime.getSnapshot()
      expect(snapshot.highlightTargets).toEqual([expectedTarget])
    }
  })

  it('intro has no highlight target (item 14)', () => {
    const campaign = enabledAfterDayResults('tf-007')
    const { runtime } = createTavernFunctionsRuntime(campaign)
    expect(stepId(runtime)).toBe('intro_1')
    expect(runtime.getSnapshot().highlightTargets).toEqual([])
  })

  it('clears the Spotlight for the closing lines (item 30)', () => {
    const campaign = enabledAfterDayResults('tf-008')
    const { runtime } = createTavernFunctionsRuntime(campaign)
    while (stepId(runtime) !== 'ending_1') {
      runtime.advanceMessage()
    }
    expect(runtime.getSnapshot().highlightTargets).toEqual([])
  })

  it('walks the entire script in one straight line (no branches) and completes on the final line', () => {
    const campaign = enabledAfterDayResults('tf-009')
    const { runtime, completedIds } = createTavernFunctionsRuntime(campaign)

    while (stepId(runtime) !== 'ending_5') {
      runtime.advanceMessage()
    }
    expect(runtime.getSnapshot().text).toBe('打倒ノスフェラトゥ！！')
    expect(completedIds).toEqual([])

    runtime.advanceMessage()
    expect(completedIds).toEqual(['tavern_functions'])
    expect(runtime.isBlocking).toBe(false)
    expect(runtime.getSnapshot().visible).toBe(false)
  })

  it('completion is idempotent — advancing again after closing is a no-op', () => {
    const campaign = enabledAfterDayResults('tf-010')
    const { runtime, completedIds } = createTavernFunctionsRuntime(campaign)
    while (stepId(runtime) !== 'ending_5') {
      runtime.advanceMessage()
    }
    runtime.advanceMessage()
    expect(completedIds).toEqual(['tavern_functions'])

    runtime.advanceMessage()
    expect(completedIds).toEqual(['tavern_functions'])
  })

  it('resumeStepId lands directly on the named step (Runtime-level mechanism reused, even though the Scene never needs it here)', () => {
    const campaign = enabledAfterDayResults('tf-011')
    const { runtime } = createTavernFunctionsRuntime(campaign, 'main_quest_1')
    expect(stepId(runtime)).toBe('main_quest_1')
  })
})
