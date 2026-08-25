import { describe, expect, it, vi } from 'vitest'
import { createTavernCampaign } from '../../../core/tavern/campaign/campaign.ts'
import {
  completeTutorial,
  setTutorialMode,
  type TutorialId,
} from '../../../core/tavern/campaign/tutorial.ts'
import type { TavernCampaignState } from '../../../core/tavern/campaign/types.ts'
import type { BrokerageOfferAttempt } from '../../../core/tavern/types.ts'
import type { ExpeditionPrediction } from '../../../core/tavern/prediction/types.ts'
import { TutorialRuntime } from './tutorialRuntime.ts'
import { BASIC_REQUEST_ASSIGNMENT_SCRIPT } from '../../../data/tutorials/basicRequestAssignment.ts'

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

function fakeOffer(decision: 'accepted' | 'declined'): BrokerageOfferAttempt {
  return {
    id: `offer-${decision}-${Math.random()}`,
    requestId: 'req-1',
    partyId: 'party-1',
    decision,
    reason: 'appropriate',
    evaluation: {} as BrokerageOfferAttempt['evaluation'],
  }
}

/** Simulates the real app's async Campaign resync landing after a
 * `context.actions.offerRequest(...)` call — appends one more offer
 * record to `currentDay.offers`, exactly as `offerRequestToParty` would.
 * `hasAcceptedOfferToday()` reads this array; the Runtime never tallies
 * accepted offers itself. */
function withOneMoreOffer(
  campaign: TavernCampaignState,
  decision: 'accepted' | 'declined',
): TavernCampaignState {
  return {
    ...campaign,
    currentDay: {
      ...campaign.currentDay,
      offers: [...campaign.currentDay.offers, fakeOffer(decision)],
    },
  }
}

function createRuntime(campaign: TavernCampaignState) {
  const modeCommits: Array<'enabled' | 'disabled'> = []
  const completedIds: TutorialId[] = []
  const onChange = vi.fn()
  let current = campaign
  const runtime = new TutorialRuntime(
    campaign,
    {
      tutorialId: 'basic_request_assignment',
      script: BASIC_REQUEST_ASSIGNMENT_SCRIPT,
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
    /** Simulates the async Campaign resync that lands after a real
     * `offerRequest` call, for tests that need `hasAcceptedOfferToday()`
     * to see it before reaching `recover_2`. */
    syncOneMoreOffer: (decision: 'accepted' | 'declined') => {
      current = withOneMoreOffer(current, decision)
      runtime.syncCampaign(current)
    },
  }
}

/** Drives the runtime through the `basic_request_assignment` script's
 * three Gameplay wait points in order, resolving via the given decision,
 * and — like the real app — syncs the resulting offer onto the Campaign
 * right after dispatching, before any later step reads it. */
function driveThroughRequestOffer(
  ctx: ReturnType<typeof createRuntime>,
  decision: 'accepted' | 'declined',
): void {
  const { runtime } = ctx
  // intro_1..intro_7
  for (let i = 0; i < 7; i++) runtime.advanceMessage()
  runtime.dispatch({ type: 'quest_selected', questId: 'quest-1' })
  // post_quest_1..4
  for (let i = 0; i < 4; i++) runtime.advanceMessage()
  runtime.dispatch({ type: 'party_selected', partyId: 'party-1' })
  runtime.dispatch({ type: 'prediction_ready', prediction: fakePrediction() })
  // pred_1..pred_11
  for (let i = 0; i < 11; i++) runtime.advanceMessage()
  runtime.dispatch({ type: 'request_offered', decision })
  ctx.syncOneMoreOffer(decision)
}

/** Clicks [次へ] repeatedly for as long as the current step is an
 * advanceable `message` — i.e. until landing on a `choice`/
 * `wait_for_action` step (or the Tutorial closes). Avoids hand-counting
 * every step in a linear chain (including `recover_2`'s conditional
 * branch, which `advanceMessage()` itself resolves). */
function clickThroughMessages(runtime: TutorialRuntime, maxClicks = 30): void {
  let clicks = 0
  while (runtime.getSnapshot().showNextButton && clicks < maxClicks) {
    runtime.advanceMessage()
    clicks++
  }
}

/** Drives one retry attempt (quest -> party -> prediction -> offer),
 * short-form, resolving via the given decision. Assumes the Runtime is
 * currently sitting at `wait_quest_selected_retry`. */
function driveThroughRetryOffer(
  ctx: ReturnType<typeof createRuntime>,
  decision: 'accepted' | 'declined',
): void {
  const { runtime } = ctx
  runtime.dispatch({ type: 'quest_selected', questId: 'quest-2' })
  clickThroughMessages(runtime)
  runtime.dispatch({ type: 'party_selected', partyId: 'party-2' })
  runtime.dispatch({ type: 'prediction_ready', prediction: fakePrediction() })
  clickThroughMessages(runtime)
  runtime.dispatch({ type: 'request_offered', decision })
  ctx.syncOneMoreOffer(decision)
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
    const { runtime, modeCommits } = createRuntime(campaign)

    runtime.selectChoice('yes')

    expect(modeCommits).toEqual(['enabled'])
    const snapshot = runtime.getSnapshot()
    expect(snapshot.visible).toBe(true)
    expect(snapshot.text).toBe('了解です！　では私にお任せください！')
    expect(runtime.isBlocking).toBe(true)
  })

  it('"いいえ" commits mode: disabled, plays 3 closing lines, then closes', () => {
    const campaign = createTavernCampaign('runtime-003')
    const { runtime, modeCommits, completedIds } = createRuntime(campaign)

    runtime.selectChoice('no')
    expect(modeCommits).toEqual(['disabled'])

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
    expect(completedIds).toEqual([])
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

    for (let i = 0; i < 11; i++) runtime.advanceMessage()
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
    expect(runtime.getSnapshot().text).toBe('さて、どうでしょう？')
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
    const ctx = createRuntime(campaign)
    driveThroughRequestOffer(ctx, 'accepted')
    expect(ctx.runtime.getSnapshot().text).toBe(
      'やりましたね！　依頼を受諾していただけましたよ！',
    )
  })

  it('branches to the declined line on a declined offer', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-010'),
      'enabled',
    )
    const ctx = createRuntime(campaign)
    driveThroughRequestOffer(ctx, 'declined')
    expect(ctx.runtime.getSnapshot().text).toBe(
      'ありゃりゃ。断られちゃいましたね……',
    )
  })

  it('accepted first try: proceeds straight to the day-advance wait (item 19)', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-011'),
      'enabled',
    )
    const ctx = createRuntime(campaign)
    driveThroughRequestOffer(ctx, 'accepted')

    clickThroughMessages(ctx.runtime)
    expect(ctx.runtime.currentTarget).toBe('next_day_button')
    expect(ctx.runtime.getSnapshot().text).toBe(
      '冒険者さんたちがどうなったのか、結果を見に行きましょう！',
    )
    expect(ctx.completedIds).toEqual([])

    ctx.runtime.dispatch({ type: 'day_advanced' })
    expect(ctx.completedIds).toEqual(['basic_request_assignment'])
    expect(ctx.runtime.getSnapshot().visible).toBe(false)
    expect(ctx.runtime.isBlocking).toBe(false)
  })

  it('declined first try: cannot reach the day-advance wait, offers a retry instead (item 20)', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-012'),
      'enabled',
    )
    const ctx = createRuntime(campaign)
    driveThroughRequestOffer(ctx, 'declined')

    clickThroughMessages(ctx.runtime)
    expect(ctx.runtime.currentTarget).toBe('quest_list')
    expect(ctx.completedIds).toEqual([])
  })

  it('declined then accepted on retry: skips the long explanation and reaches day-advance (item 21)', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-013'),
      'enabled',
    )
    const ctx = createRuntime(campaign)
    driveThroughRequestOffer(ctx, 'declined')
    clickThroughMessages(ctx.runtime)
    expect(ctx.runtime.currentTarget).toBe('quest_list')

    driveThroughRetryOffer(ctx, 'accepted')
    // Accepted on retry skips straight to wrap_1 — no repeat of
    // common_1..4/recover_1..2.
    expect(ctx.runtime.getSnapshot().text).toBe(
      'やりましたね！　依頼を受諾していただけましたよ！',
    )
    clickThroughMessages(ctx.runtime)
    expect(ctx.runtime.currentTarget).toBe('next_day_button')

    ctx.runtime.dispatch({ type: 'day_advanced' })
    expect(ctx.completedIds).toEqual(['basic_request_assignment'])
  })

  it('declined repeatedly never stalls the Tutorial (item 22)', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-014'),
      'enabled',
    )
    const ctx = createRuntime(campaign)
    driveThroughRequestOffer(ctx, 'declined')
    clickThroughMessages(ctx.runtime)

    for (let attempt = 0; attempt < 3; attempt++) {
      expect(ctx.runtime.currentTarget).toBe('quest_list')
      driveThroughRetryOffer(ctx, 'declined')
      expect(ctx.runtime.getSnapshot().text).toBe(
        'うーん、また断られちゃいましたね……',
      )
      clickThroughMessages(ctx.runtime)
    }
    expect(ctx.runtime.currentTarget).toBe('quest_list')
    expect(ctx.completedIds).toEqual([])
    expect(ctx.runtime.isBlocking).toBe(true)
  })

  it('never unlocks next_day_button while zero offers are accepted today (item 24)', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-015'),
      'enabled',
    )
    const ctx = createRuntime(campaign)
    driveThroughRequestOffer(ctx, 'declined')
    clickThroughMessages(ctx.runtime)
    expect(ctx.runtime.currentTarget).not.toBe('next_day_button')
    expect(ctx.runtime.currentTarget).toBe('quest_list')
  })

  it('completion happens only after day_advanced dispatches, never merely from reading the last line (item 25)', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-016'),
      'enabled',
    )
    const ctx = createRuntime(campaign)
    driveThroughRequestOffer(ctx, 'accepted')
    clickThroughMessages(ctx.runtime)
    expect(ctx.runtime.currentTarget).toBe('next_day_button')

    // Reaching (and even re-reading) the final wait's snapshot does not
    // complete the Tutorial on its own.
    expect(ctx.completedIds).toEqual([])
    expect(ctx.runtime.isBlocking).toBe(true)

    ctx.runtime.dispatch({ type: 'day_advanced' })
    expect(ctx.completedIds).toEqual(['basic_request_assignment'])
  })

  it('currentHighlightTarget tracks the step regardless of interactivity (item 46)', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-018'),
      'enabled',
    )
    const ctx = createRuntime(campaign)
    const { runtime } = ctx

    for (let i = 0; i < 7; i++) runtime.advanceMessage()
    expect(runtime.currentHighlightTarget).toBe('quest_list')
    runtime.dispatch({ type: 'quest_selected', questId: 'quest-1' })

    for (let i = 0; i < 4; i++) runtime.advanceMessage()
    expect(runtime.currentHighlightTarget).toBe('party_list')
    runtime.dispatch({ type: 'party_selected', partyId: 'party-1' })
    runtime.dispatch({ type: 'prediction_ready', prediction: fakePrediction() })
    expect(runtime.currentHighlightTarget).toBe('prediction_rate')

    for (let i = 0; i < 9; i++) runtime.advanceMessage() // pred_1..pred_9
    for (let i = 0; i < 2; i++) runtime.advanceMessage() // pred_10..pred_11
    expect(runtime.currentHighlightTarget).toBe('assign_button')
    runtime.dispatch({ type: 'request_offered', decision: 'accepted' })
    ctx.syncOneMoreOffer('accepted')

    clickThroughMessages(runtime)
    expect(runtime.currentHighlightTarget).toBe('next_day_button')
  })

  it('highlightTarget vs currentTarget stay independent during the Prediction explanation (item 47)', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-019'),
      'enabled',
    )
    const { runtime } = createRuntime(campaign)

    for (let i = 0; i < 7; i++) runtime.advanceMessage()
    runtime.dispatch({ type: 'quest_selected', questId: 'quest-1' })
    for (let i = 0; i < 4; i++) runtime.advanceMessage()
    runtime.dispatch({ type: 'party_selected', partyId: 'party-1' })
    runtime.dispatch({ type: 'prediction_ready', prediction: fakePrediction() })
    runtime.advanceMessage() // pred_1 -> pred_2

    expect(runtime.getSnapshot().text).toBe(
      '推定依頼達成率、というのが出てきましたね？',
    )
    expect(runtime.currentHighlightTarget).toBe('prediction_rate')
    // Spotlighting the rate never grants interaction with it.
    expect(runtime.currentTarget).toBe('none')
  })

  it('declined retry returns Spotlight to quest_list on both target and highlightTarget (item 48)', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-020'),
      'enabled',
    )
    const ctx = createRuntime(campaign)
    driveThroughRequestOffer(ctx, 'declined')
    clickThroughMessages(ctx.runtime)

    expect(ctx.runtime.currentTarget).toBe('quest_list')
    expect(ctx.runtime.currentHighlightTarget).toBe('quest_list')
  })

  it('a Prediction failure Spotlights party_list immediately, even before the Player clicks through (item 49)', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('runtime-021'),
      'enabled',
    )
    const { runtime } = createRuntime(campaign)

    for (let i = 0; i < 7; i++) runtime.advanceMessage()
    runtime.dispatch({ type: 'quest_selected', questId: 'quest-1' })
    for (let i = 0; i < 4; i++) runtime.advanceMessage()
    runtime.dispatch({ type: 'party_selected', partyId: 'party-1' })

    runtime.handlePredictionError()
    // The interaction target only reopens once the Player clicks through
    // the error message (unchanged retry logic — see the P1 fix); the
    // Spotlight, however, can point at party_list right away so the
    // Player already knows where to look while reading the message.
    expect(runtime.currentHighlightTarget).toBe('party_list')
    expect(runtime.currentTarget).toBe('none')

    runtime.advanceMessage()
    expect(runtime.currentTarget).toBe('party_list')
    expect(runtime.currentHighlightTarget).toBe('party_list')
  })

  it('a same-seed Campaign resync does not reset Consent or the active step', () => {
    const campaign = createTavernCampaign('runtime-017')
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
      createTavernCampaign('runtime-018'),
      'enabled',
    )
    const completed = completeTutorial(enabled, 'basic_request_assignment')
    const { runtime } = createRuntime(completed)
    expect(runtime.getSnapshot().visible).toBe(false)
    expect(runtime.isBlocking).toBe(false)
  })

  it('initializes closed once disabled', () => {
    const disabled = setTutorialMode(
      createTavernCampaign('runtime-019'),
      'disabled',
    )
    const { runtime } = createRuntime(disabled)
    expect(runtime.getSnapshot().visible).toBe(false)
    expect(runtime.isBlocking).toBe(false)
  })

  it('exposes the Campaign seed it was built from', () => {
    const campaign = createTavernCampaign('runtime-020')
    const { runtime } = createRuntime(campaign)
    expect(runtime.campaignSeed).toBe('runtime-020')
  })
})
