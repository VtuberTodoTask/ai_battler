import { describe, expect, it } from 'vitest'
import { runExpedition } from '../../core/expedition/expedition.ts'
import { buildParty, EXPEDITION_PRESETS } from './presets.ts'

describe('Expedition presets', () => {
  for (const preset of EXPEDITION_PRESETS) {
    it(`${preset.id} builds a request without throwing`, () => {
      expect(() =>
        preset.buildRequest('preset-seed', preset.defaultRank, true),
      ).not.toThrow()
    })

    it(`${preset.id} produces the correct objectiveType`, () => {
      const request = preset.buildRequest(
        'preset-seed',
        preset.defaultRank,
        true,
      )
      expect(request.objectiveType).toBe(preset.objectiveType)
    })

    it(`${preset.id} can run an expedition`, () => {
      const request = preset.buildRequest(
        'preset-seed',
        preset.defaultRank,
        true,
      )
      const party = buildParty(
        preset.defaultPartyRoles,
        'preset-party',
        preset.defaultRank,
      )
      const result = runExpedition(request, party)
      expect(result).toBeDefined()
      expect(result.request.objectiveType).toBe(preset.objectiveType)
    })
  }
})
