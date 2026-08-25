import { describe, expect, it } from 'vitest'
import { createTavernCampaign } from './campaign.ts'
import {
  completeTutorial,
  createInitialTutorialState,
  selectActiveTavernTutorialId,
  setTutorialMode,
  shouldStartTutorial,
  shouldSuppressAutoSelectParty,
} from './tutorial.ts'

describe('Phase 10.1 Tutorial Core state', () => {
  it('createInitialTutorialState starts pending with no completions', () => {
    const state = createInitialTutorialState()
    expect(state.mode).toBe('pending')
    expect(state.completedTutorialIds).toEqual([])
  })

  it('createTavernCampaign wires the initial Tutorial state onto the Campaign', () => {
    const campaign = createTavernCampaign('tutorial-core-001')
    expect(campaign.tutorial).toEqual({
      mode: 'pending',
      completedTutorialIds: [],
    })
  })

  describe('shouldStartTutorial', () => {
    it('is false while mode is pending', () => {
      const campaign = createTavernCampaign('tutorial-core-002')
      expect(shouldStartTutorial(campaign, 'basic_request_assignment')).toBe(
        false,
      )
    })

    it('is false while mode is disabled', () => {
      const campaign = setTutorialMode(
        createTavernCampaign('tutorial-core-003'),
        'disabled',
      )
      expect(shouldStartTutorial(campaign, 'basic_request_assignment')).toBe(
        false,
      )
    })

    it('is true once enabled and the id is not yet completed', () => {
      const campaign = setTutorialMode(
        createTavernCampaign('tutorial-core-004'),
        'enabled',
      )
      expect(shouldStartTutorial(campaign, 'basic_request_assignment')).toBe(
        true,
      )
    })

    it('is false once enabled but the id is already completed', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-005'),
        'enabled',
      )
      const completed = completeTutorial(enabled, 'basic_request_assignment')
      expect(shouldStartTutorial(completed, 'basic_request_assignment')).toBe(
        false,
      )
    })

    it('disabled suppresses a future, still-unimplemented Tutorial id too', () => {
      const campaign = setTutorialMode(
        createTavernCampaign('tutorial-core-006'),
        'disabled',
      )
      expect(shouldStartTutorial(campaign, 'day_advance')).toBe(false)
    })
  })

  describe('setTutorialMode', () => {
    it('pending -> enabled', () => {
      const campaign = createTavernCampaign('tutorial-core-007')
      const next = setTutorialMode(campaign, 'enabled')
      expect(next.tutorial.mode).toBe('enabled')
      expect(next).not.toBe(campaign)
    })

    it('pending -> disabled', () => {
      const campaign = createTavernCampaign('tutorial-core-008')
      const next = setTutorialMode(campaign, 'disabled')
      expect(next.tutorial.mode).toBe('disabled')
    })

    it('is a no-op once already enabled (no later re-toggle in 10.1)', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-009'),
        'enabled',
      )
      const again = setTutorialMode(enabled, 'disabled')
      expect(again.tutorial.mode).toBe('enabled')
      expect(again).toBe(enabled)
    })

    it('is a no-op once already disabled', () => {
      const disabled = setTutorialMode(
        createTavernCampaign('tutorial-core-010'),
        'disabled',
      )
      const again = setTutorialMode(disabled, 'enabled')
      expect(again.tutorial.mode).toBe('disabled')
      expect(again).toBe(disabled)
    })

    it('never mutates the input Campaign in place', () => {
      const campaign = createTavernCampaign('tutorial-core-011')
      const snapshot = JSON.parse(JSON.stringify(campaign.tutorial))
      setTutorialMode(campaign, 'enabled')
      expect(campaign.tutorial).toEqual(snapshot)
    })
  })

  describe('completeTutorial', () => {
    it('adds the id to completedTutorialIds', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-012'),
        'enabled',
      )
      const next = completeTutorial(enabled, 'basic_request_assignment')
      expect(next.tutorial.completedTutorialIds).toEqual([
        'basic_request_assignment',
      ])
      expect(next).not.toBe(enabled)
    })

    it('is idempotent — completing an already-completed id is a no-op', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-013'),
        'enabled',
      )
      const once = completeTutorial(enabled, 'basic_request_assignment')
      const twice = completeTutorial(once, 'basic_request_assignment')
      expect(twice.tutorial.completedTutorialIds).toEqual([
        'basic_request_assignment',
      ])
      expect(twice).toBe(once)
    })

    it('never mutates the input Campaign in place', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-014'),
        'enabled',
      )
      const snapshot = [...enabled.tutorial.completedTutorialIds]
      completeTutorial(enabled, 'basic_request_assignment')
      expect(enabled.tutorial.completedTutorialIds).toEqual(snapshot)
    })

    it('is a no-op while mode is still pending (Consent never answered)', () => {
      const pending = createTavernCampaign('tutorial-core-019')
      const next = completeTutorial(pending, 'basic_request_assignment')
      expect(next).toBe(pending)
      expect(next.tutorial.completedTutorialIds).toEqual([])
    })

    it('is a no-op once mode is disabled', () => {
      const disabled = setTutorialMode(
        createTavernCampaign('tutorial-core-020'),
        'disabled',
      )
      const next = completeTutorial(disabled, 'basic_request_assignment')
      expect(next).toBe(disabled)
      expect(next.tutorial.completedTutorialIds).toEqual([])
    })

    it('is a no-op for a TutorialId that is not yet implemented', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-021'),
        'enabled',
      )
      // 'tavern_upgrade' is a real member of the TutorialId union (a
      // future Phase) but is not in IMPLEMENTED_TUTORIAL_IDS yet — the
      // runtime must never be able to mark it complete.
      const next = completeTutorial(enabled, 'tavern_upgrade')
      expect(next).toBe(enabled)
      expect(next.tutorial.completedTutorialIds).toEqual([])
    })
  })

  describe('Phase 10.3 shouldStartTutorial(tavern_functions) day_results dependency', () => {
    it('is false once enabled, even though tavern_functions is not completed, until day_results also completes', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-022'),
        'enabled',
      )
      expect(shouldStartTutorial(enabled, 'tavern_functions')).toBe(false)
    })

    it('is true once enabled AND day_results has completed AND tavern_functions has not', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-023'),
        'enabled',
      )
      const withDayResults = completeTutorial(enabled, 'day_results')
      expect(shouldStartTutorial(withDayResults, 'tavern_functions')).toBe(true)
    })

    it('is false once tavern_functions itself has completed', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-024'),
        'enabled',
      )
      const withDayResults = completeTutorial(enabled, 'day_results')
      const withTavernFunctions = completeTutorial(
        withDayResults,
        'tavern_functions',
      )
      expect(shouldStartTutorial(withTavernFunctions, 'tavern_functions')).toBe(
        false,
      )
    })

    it('is false while mode is disabled, regardless of day_results', () => {
      const disabled = setTutorialMode(
        createTavernCampaign('tutorial-core-025'),
        'disabled',
      )
      expect(shouldStartTutorial(disabled, 'tavern_functions')).toBe(false)
    })

    it('day_results itself has no such dependency — completing basic_request_assignment is not required', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-026'),
        'enabled',
      )
      expect(shouldStartTutorial(enabled, 'day_results')).toBe(true)
    })
  })

  describe('selectActiveTavernTutorialId', () => {
    it('selects basic_request_assignment while Consent is pending', () => {
      const campaign = createTavernCampaign('tutorial-core-027')
      expect(selectActiveTavernTutorialId(campaign)).toBe(
        'basic_request_assignment',
      )
    })

    it('selects basic_request_assignment once enabled but not yet completed', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-028'),
        'enabled',
      )
      expect(selectActiveTavernTutorialId(enabled)).toBe(
        'basic_request_assignment',
      )
    })

    it('selects basic_request_assignment (inert default) when basic_request_assignment is done but day_results is not yet', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-029'),
        'enabled',
      )
      const completed = completeTutorial(enabled, 'basic_request_assignment')
      expect(selectActiveTavernTutorialId(completed)).toBe(
        'basic_request_assignment',
      )
    })

    it('selects tavern_functions once basic_request_assignment AND day_results are both completed', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-030'),
        'enabled',
      )
      const step1 = completeTutorial(enabled, 'basic_request_assignment')
      const step2 = completeTutorial(step1, 'day_results')
      expect(selectActiveTavernTutorialId(step2)).toBe('tavern_functions')
    })

    it('selects basic_request_assignment (inert default) once the whole introductory sequence is complete', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-031'),
        'enabled',
      )
      const step1 = completeTutorial(enabled, 'basic_request_assignment')
      const step2 = completeTutorial(step1, 'day_results')
      const step3 = completeTutorial(step2, 'tavern_functions')
      expect(selectActiveTavernTutorialId(step3)).toBe(
        'basic_request_assignment',
      )
    })

    it('selects basic_request_assignment (inert default) when the Tutorial is disabled entirely', () => {
      const disabled = setTutorialMode(
        createTavernCampaign('tutorial-core-032'),
        'disabled',
      )
      expect(selectActiveTavernTutorialId(disabled)).toBe(
        'basic_request_assignment',
      )
    })
  })

  describe('shouldSuppressAutoSelectParty', () => {
    it('is true while pending', () => {
      const campaign = createTavernCampaign('tutorial-core-015')
      expect(shouldSuppressAutoSelectParty(campaign)).toBe(true)
    })

    it('is true while the Basic Tutorial has not yet completed', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-016'),
        'enabled',
      )
      expect(shouldSuppressAutoSelectParty(enabled)).toBe(true)
    })

    it('is false once disabled', () => {
      const disabled = setTutorialMode(
        createTavernCampaign('tutorial-core-017'),
        'disabled',
      )
      expect(shouldSuppressAutoSelectParty(disabled)).toBe(false)
    })

    it('is false once the Basic Tutorial has completed', () => {
      const enabled = setTutorialMode(
        createTavernCampaign('tutorial-core-018'),
        'enabled',
      )
      const completed = completeTutorial(enabled, 'basic_request_assignment')
      expect(shouldSuppressAutoSelectParty(completed)).toBe(false)
    })
  })
})
