import { describe, expect, it } from 'vitest'
import { buildReplayEvents, buildReplayItems } from './replay.ts'
import { runExpedition } from '../../core/expedition/expedition.ts'
import { buildParty } from './presets.ts'
import { EXPEDITION_PRESETS } from './presets.ts'

describe('buildReplayEvents', () => {
  it('preserves the order of state.logs', () => {
    const request = EXPEDITION_PRESETS[0].buildRequest('replay-a', 'D', false)
    const party = buildParty(
      EXPEDITION_PRESETS[0].defaultPartyRoles,
      'replay-party',
      'D',
    )
    const result = runExpedition(request, party)
    const events = buildReplayEvents(result)
    expect(events.length).toBe(result.state.logs.length)
    for (let i = 0; i < events.length; i++) {
      expect(events[i].index).toBe(i)
      expect(events[i].phase).toBe(result.state.logs[i].phase)
      expect(events[i].type).toBe(result.state.logs[i].type)
      expect(events[i].facts).toEqual(result.state.logs[i].facts)
      expect(events[i].effects).toEqual(result.state.logs[i].effects)
    }
  })

  it('does not mutate the result', () => {
    const request = EXPEDITION_PRESETS[0].buildRequest('replay-b', 'D', false)
    const party = buildParty(
      EXPEDITION_PRESETS[0].defaultPartyRoles,
      'replay-party',
      'D',
    )
    const result = runExpedition(request, party)
    const logsSnapshot = JSON.stringify(result.state.logs)
    buildReplayEvents(result)
    buildReplayItems(result)
    expect(JSON.stringify(result.state.logs)).toBe(logsSnapshot)
  })

  it('produces the same number of replay items as logs plus one summary', () => {
    const request = EXPEDITION_PRESETS[0].buildRequest('replay-c', 'D', false)
    const party = buildParty(
      EXPEDITION_PRESETS[0].defaultPartyRoles,
      'replay-party',
      'D',
    )
    const result = runExpedition(request, party)
    const items = buildReplayItems(result)
    expect(items.length).toBe(result.state.logs.length + 1)
    expect(items[items.length - 1].kind).toBe('summary')
  })
})
