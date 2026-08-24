import { describe, expect, it } from 'vitest'
import { createTavernCampaign } from '../tavern/campaign/campaign.ts'
import {
  completeTutorial,
  setTutorialMode,
} from '../tavern/campaign/tutorial.ts'
import { serializeGameSave } from './serializer.ts'
import { SaveValidationErrorClass, validateGameSave } from './validation.ts'

function buildSave(campaign: ReturnType<typeof createTavernCampaign>) {
  return serializeGameSave({ campaign })
}

describe('Phase 10.1 Tutorial save validation', () => {
  it('accepts a fresh Campaign (mode: pending, no completions)', () => {
    const campaign = createTavernCampaign('tutorial-save-001')
    const save = buildSave(campaign)
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('accepts mode: disabled with no completions', () => {
    const campaign = setTutorialMode(
      createTavernCampaign('tutorial-save-002'),
      'disabled',
    )
    const save = buildSave(campaign)
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('accepts mode: enabled with the Basic Tutorial completed', () => {
    const enabled = setTutorialMode(
      createTavernCampaign('tutorial-save-003'),
      'enabled',
    )
    const completed = completeTutorial(enabled, 'basic_request_assignment')
    const save = buildSave(completed)
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('accepts mode: enabled with no completions yet', () => {
    const enabled = setTutorialMode(
      createTavernCampaign('tutorial-save-004'),
      'enabled',
    )
    const save = buildSave(enabled)
    expect(() => validateGameSave(save)).not.toThrow()
  })

  it('rejects a missing tutorial field', () => {
    const save = buildSave(createTavernCampaign('tutorial-save-005'))
    const bad = {
      ...save,
      campaign: { ...save.campaign, tutorial: undefined },
    }
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('rejects an invalid mode value', () => {
    const save = buildSave(createTavernCampaign('tutorial-save-006'))
    const bad = {
      ...save,
      campaign: {
        ...save.campaign,
        tutorial: { mode: 'sometimes', completedTutorialIds: [] },
      },
    }
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a non-array completedTutorialIds', () => {
    const save = buildSave(createTavernCampaign('tutorial-save-007'))
    const bad = {
      ...save,
      campaign: {
        ...save.campaign,
        tutorial: { mode: 'enabled', completedTutorialIds: 'not-an-array' },
      },
    }
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('rejects an unknown TutorialId', () => {
    const enabled = setTutorialMode(
      createTavernCampaign('tutorial-save-008'),
      'enabled',
    )
    const save = buildSave(enabled)
    const bad = {
      ...save,
      campaign: {
        ...save.campaign,
        tutorial: { mode: 'enabled', completedTutorialIds: ['not_a_real_id'] },
      },
    }
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a duplicate TutorialId', () => {
    const enabled = setTutorialMode(
      createTavernCampaign('tutorial-save-009'),
      'enabled',
    )
    const save = buildSave(enabled)
    const bad = {
      ...save,
      campaign: {
        ...save.campaign,
        tutorial: {
          mode: 'enabled',
          completedTutorialIds: [
            'basic_request_assignment',
            'basic_request_assignment',
          ],
        },
      },
    }
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('rejects mode: pending combined with a non-empty completedTutorialIds', () => {
    const save = buildSave(createTavernCampaign('tutorial-save-010'))
    const bad = {
      ...save,
      campaign: {
        ...save.campaign,
        tutorial: {
          mode: 'pending',
          completedTutorialIds: ['basic_request_assignment'],
        },
      },
    }
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('rejects mode: disabled combined with a non-empty completedTutorialIds', () => {
    const save = buildSave(createTavernCampaign('tutorial-save-012'))
    const bad = {
      ...save,
      campaign: {
        ...save.campaign,
        tutorial: {
          mode: 'disabled',
          completedTutorialIds: ['basic_request_assignment'],
        },
      },
    }
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('rejects a TutorialId that is a real union member but not yet implemented', () => {
    const enabled = setTutorialMode(
      createTavernCampaign('tutorial-save-013'),
      'enabled',
    )
    const save = buildSave(enabled)
    const bad = {
      ...save,
      campaign: {
        ...save.campaign,
        // 'tavern_upgrade' is declared on the TutorialId union for a
        // future Phase but is not in IMPLEMENTED_TUTORIAL_IDS — a save
        // claiming it completed could never have been produced by this
        // build and must be rejected the same as a wholly unknown id.
        tutorial: { mode: 'enabled', completedTutorialIds: ['tavern_upgrade'] },
      },
    }
    expect(() => validateGameSave(bad)).toThrow(SaveValidationErrorClass)
  })

  it('save/load roundtrip preserves Tutorial state exactly', () => {
    const enabled = setTutorialMode(
      createTavernCampaign('tutorial-save-011'),
      'enabled',
    )
    const completed = completeTutorial(enabled, 'basic_request_assignment')
    const save = buildSave(completed)
    validateGameSave(save)
    expect(save.campaign.tutorial).toEqual({
      mode: 'enabled',
      completedTutorialIds: ['basic_request_assignment'],
    })
  })
})
