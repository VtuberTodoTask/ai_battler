import { describe, expect, it } from 'vitest'
import { runExpedition } from '../../core/expedition/expedition.ts'
import { buildParty, EXPEDITION_PRESETS } from './presets.ts'
import { buildReplayItems } from './replay.ts'

describe('Expedition UI determinism', () => {
  it('produces identical ExpeditionResult and replay items for identical inputs', () => {
    const preset = EXPEDITION_PRESETS[0]
    const request = preset.buildRequest('det-seed', preset.defaultRank, false)
    const party = buildParty(
      preset.defaultPartyRoles,
      'det-party',
      preset.defaultRank,
    )

    const a = runExpedition(request, party)
    const b = runExpedition(request, party)
    expect(b.outcome).toBe(a.outcome)
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
    expect(buildReplayItems(b)).toEqual(buildReplayItems(a))
  })

  it('keeps other slots unchanged when only one party role changes', () => {
    const preset = EXPEDITION_PRESETS[0]
    const baseRoles = [...preset.defaultPartyRoles]
    const seed = 'paired-seed'
    const rank = preset.defaultRank
    const partyA = buildParty(baseRoles, seed, rank)
    const partyB = buildParty(
      [baseRoles[0], 'mage', baseRoles[2], baseRoles[3]],
      seed,
      rank,
    )

    expect(partyA[0].id).toBe(partyB[0].id)
    expect(partyA[2].id).toBe(partyB[2].id)
    expect(partyA[3].id).toBe(partyB[3].id)
    expect(partyA[1].id).not.toBe(partyB[1].id)
    expect(partyA[0].name).toBe(partyB[0].name)
  })
})
