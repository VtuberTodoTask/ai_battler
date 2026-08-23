import { describe, expect, it, vi } from 'vitest'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import {
  completeTutorial,
  setTutorialMode,
} from '../../../core/tavern/campaign/tutorial.ts'
import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import type { ExpeditionPrediction } from '../../../core/tavern/prediction/types.ts'
import { TutorialRuntime } from './tutorialRuntime.ts'

function fakePrediction(): ExpeditionPrediction {
  return {
    requestId: 'req-1',
    partyId: 'party-1',
    modelVersion: 'v1',
    sampleCount: 200,
    estimatedSuccessRate: 0.7,
    counts: {
      completeSuccess: 50,
      success: 90,
      partialSuccess: 30,
      failedObjective: 20,
      forcedRetreat: 8,
      lostExpedition: 2,
    },
    rates: {
      completeSuccess: 0.25,
      success: 0.45,
      partialSuccess: 0.15,
      failedObjective: 0.1,
      forcedRetreat: 0.04,
      lostExpedition: 0.01,
    },
  }
}

function createRuntime(campaign: TavernCampaignState) {
  const committed: TavernCampaignState[] = []
  const onChange = vi.fn()
  let current = campaign
  const runtime = new TutorialRuntime(campaign, {
    onCommitCampaign: (next) => {
      current = next
      committed.push(next)
      runtime.syncCampaign(next)
    },
    onChange,
  })
  return {
    runtime,
    committed,
    onChange,
    getCurrent: () => current,
  }
}

/** Drives the runtime through the `basic_request_assignment` script's
 * three Gameplay wait points in order, resolving via the given decision. */
function driveThroughRequestOffer(
  runtime: TutorialRuntime,
  decision: 'accepted' | 'declined',
): void {
  // intro_1..intro_7
  for (let i = 0; i < 7; i++) runtime.advanceMessage()
  runtime.dispatch({ type: 'quest_selected', questId: 'quest-1' })
  // post_quest_1..4
  for (let i = 0; i < 4; i++) runtime.advanceMessage()
  runtime.dispatch({ type: 'party_selected', partyId: 'party-1' })
  runtime.dispatch({ type: 'prediction_ready', prediction: fakePrediction() })
  // pred_intro_1..3, pred_explain_1..7
  for (let i = 0; i < 10; i++) runtime.advanceMessage()
  runtime.dispatch({ type: 'request_offered', decision })
}

describe('Phase 10.1 TutorialRuntime', () => {
  it('shows the Consent question while mode is pending', () => {
    const campaign = createTavernCampaign('runtime-001')
    const { runtime } = createRuntime(campaign)
    const snapshot = runtime.getSnapshot()
    expect(snapshot.visible).toBe(true)
    expect(snapshot.choices?.map((c) => c.id)).toEqual(['yes', 'no'])
    expect(runtime.isBlocking).toBe(true)
  })

  it('"はい" commits mode: enabled and starts the Basic Tutorial immediately', () => {
    const campaign = createTavernCampaign('runtime-002')
    const { runtime, committed } = createRuntime(campaign)

    runtime.selectChoice('yes')

    expect(committed).toHaveLength(1)
    expect(committed[0]!.tutorial.mode).toBe('enabled')
    const snapshot = runtime.getSnapshot()
    expect(snapshot.visible).toBe(true)
    expect(snapshot.text).toBe('了解です！　では私にお任せください！')
    expect(runtime.isBlocking).toBe(true)
  })

  it('"いいえ" commits mode: disabled, plays 3 closing lines, then closes', () => {
    const campaign = createTavernCampaign('runtime-003')
    const { runtime, committed } = createRuntime(campaign)

    runtime.selectChoice('no')
    expect(committed).toHaveLength(1)
    expect(committed[0]!.tutorial.mode).toBe('disabled')
    expect(committed[0]!.tutorial.completedTutorialIds).toEqual([])

    expect(runtime.getSnapshot().text).toBe('おお、自信ありですね！')
    runtime.advanceMessage()
    expect(runtime.getSnapshot().text).toBe(
      'では私は邪魔しないようにしておきます！',
    )
    runtime.advanceMessage()
    expect(runtime.getSnapshot().text).toBe(
      '何をどうするかは店主さんにお任せしますね。頑張ってください！',
    )
    expect(runtime.isBlocking).toBe(true)

    runtime.advanceMessage()
    expect(runtime.getSnapshot().visible).toBe(false)
    expect(runtime.isBlocking).toBe(false)
    // Declining never completes a Tutorial id.
    expect(committed).toHaveLength(1)
  })

  it('ignores an action that does not match the current wait step', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-004'),
      'enabled',
    )
    const { runtime } = createRuntime(campaign)
    for (let i = 0; i < 7; i++) runtime.advanceMessage()
    expect(runtime.currentTarget).toBe('quest_list')

    // party_selected does not match the quest_selected wait — no-op.
    runtime.dispatch({ type: 'party_selected', partyId: 'party-1' })
    expect(runtime.currentTarget).toBe('quest_list')

    runtime.dispatch({ type: 'quest_selected', questId: 'quest-1' })
    expect(runtime.currentTarget).toBe('none')
  })

  it('gates each wait_for_action step to its own target in order', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-005'),
      'enabled',
    )
    const { runtime } = createRuntime(campaign)

    for (let i = 0; i < 7; i++) runtime.advanceMessage()
    expect(runtime.currentTarget).toBe('quest_list')
    runtime.dispatch({ type: 'quest_selected', questId: 'quest-1' })

    for (let i = 0; i < 4; i++) runtime.advanceMessage()
    expect(runtime.currentTarget).toBe('party_list')
    runtime.dispatch({ type: 'party_selected', partyId: 'party-1' })

    expect(runtime.currentTarget).toBe('none')
    runtime.dispatch({ type: 'prediction_ready', prediction: fakePrediction() })

    for (let i = 0; i < 10; i++) runtime.advanceMessage()
    expect(runtime.currentTarget).toBe('assign_button')
  })

  it('caches an early prediction_ready and auto-skips the wait once reached', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-006'),
      'enabled',
    )
    const { runtime } = createRuntime(campaign)

    for (let i = 0; i < 7; i++) runtime.advanceMessage()
    runtime.dispatch({ type: 'quest_selected', questId: 'quest-1' })
    for (let i = 0; i < 4; i++) runtime.advanceMessage()

    // Prediction resolves before Party selection even happens (a
    // deliberately adversarial ordering — the real DecisionPanel would
    // never do this, but the Runtime must not crash or hang on it).
    runtime.dispatch({ type: 'prediction_ready', prediction: fakePrediction() })
    runtime.dispatch({ type: 'party_selected', partyId: 'party-1' })

    // The wait_prediction_ready step should already have been skipped —
    // we should land directly on the prediction-explanation message.
    expect(runtime.getSnapshot().text).toBe('おお、もう予測が出ていますね')
  })

  it('recovers from a prediction fetch failure without hanging', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-007'),
      'enabled',
    )
    const { runtime } = createRuntime(campaign)

    for (let i = 0; i < 7; i++) runtime.advanceMessage()
    runtime.dispatch({ type: 'quest_selected', questId: 'quest-1' })
    for (let i = 0; i < 4; i++) runtime.advanceMessage()
    runtime.dispatch({ type: 'party_selected', partyId: 'party-1' })
    expect(runtime.currentTarget).toBe('none')

    runtime.handlePredictionError()
    expect(runtime.getSnapshot().text).toContain(
      'もう一度パーティーを選び直して',
    )

    runtime.advanceMessage()
    expect(runtime.currentTarget).toBe('party_list')
  })

  it('handlePredictionError is a no-op outside the prediction wait step', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-008'),
      'enabled',
    )
    const { runtime } = createRuntime(campaign)
    const before = runtime.getSnapshot()
    runtime.handlePredictionError()
    expect(runtime.getSnapshot()).toEqual(before)
  })

  it('branches to the accepted line on an accepted offer', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-009'),
      'enabled',
    )
    const { runtime } = createRuntime(campaign)
    driveThroughRequestOffer(runtime, 'accepted')
    expect(runtime.getSnapshot().text).toBe('やりましたね！')
  })

  it('branches to the declined line on a declined offer', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-010'),
      'enabled',
    )
    const { runtime } = createRuntime(campaign)
    driveThroughRequestOffer(runtime, 'declined')
    expect(runtime.getSnapshot().text).toBe('あちゃー、断られてしまいましたね')
  })

  it('reconverges both branches onto the same closing script and completes the Tutorial', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-011'),
      'enabled',
    )
    const { runtime, committed, getCurrent } = createRuntime(campaign)
    driveThroughRequestOffer(runtime, 'accepted')

    // accepted_1 -> common_1..4 -> recover_1..2 -> wrap_1..5 (11 messages).
    for (let i = 0; i < 11; i++) {
      runtime.advanceMessage()
      expect(runtime.getSnapshot().visible).toBe(true)
    }
    expect(runtime.getSnapshot().text).toBe(
      '無理そうなら見送るのも、立派な店主さんのお仕事です！',
    )
    expect(runtime.isBlocking).toBe(true)

    runtime.advanceMessage()
    expect(runtime.getSnapshot().visible).toBe(false)
    expect(runtime.isBlocking).toBe(false)
    expect(committed).toHaveLength(1)
    expect(getCurrent().tutorial.completedTutorialIds).toEqual([
      'basic_request_assignment',
    ])
  })

  it('a same-seed Campaign resync does not reset Consent or the active step', () => {
    const campaign = createTavernCampaign('runtime-012')
    const { runtime } = createRuntime(campaign)
    runtime.selectChoice('yes')
    runtime.advanceMessage() // -> intro_2

    const midStepText = runtime.getSnapshot().text
    // A bare, same-seed resync (e.g. an unrelated Campaign field changed
    // elsewhere) must not restart the step sequence.
    runtime.syncCampaign({ ...campaign, dayNumber: campaign.dayNumber })
    expect(runtime.getSnapshot().text).toBe(midStepText)
  })

  it('initializes closed (no Overlay) once already enabled and completed', () => {
    const enabled = setTutorialMode(
      createTavernCampaign('runtime-013'),
      'enabled',
    )
    const completed = completeTutorial(enabled, 'basic_request_assignment')
    const { runtime } = createRuntime(completed)
    expect(runtime.getSnapshot().visible).toBe(false)
    expect(runtime.isBlocking).toBe(false)
  })

  it('initializes closed once disabled', () => {
    const disabled = setTutorialMode(
      createTavernCampaign('runtime-014'),
      'disabled',
    )
    const { runtime } = createRuntime(disabled)
    expect(runtime.getSnapshot().visible).toBe(false)
    expect(runtime.isBlocking).toBe(false)
  })

  it('exposes the Campaign seed it was built from', () => {
    const campaign = createTavernCampaign('runtime-015')
    const { runtime } = createRuntime(campaign)
    expect(runtime.campaignSeed).toBe('runtime-015')
  })
})
