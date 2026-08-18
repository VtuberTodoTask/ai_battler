import { describe, expect, it } from 'vitest'
import {
  applyDailyReputationDelta,
  buildQuestReputationEvent,
  buildQuestReputationEventId,
  computeQuestReputationDelta,
  createInitialReputationState,
  deriveTavernRank,
  getMaxQuestRank,
  getNextTavernRankThreshold,
  isMaxTavernRank,
  REPUTATION_SUCCESS_BY_QUEST_RANK,
  TAVERN_RANK_CONFIG,
} from './reputation.ts'
import type { TavernReputationEvent } from './types.ts'

describe('TAVERN_RANK_CONFIG', () => {
  it('has ascending thresholds and ranks, rank 1 at 0 and final rank 5', () => {
    expect(TAVERN_RANK_CONFIG[0].rank).toBe(1)
    expect(TAVERN_RANK_CONFIG[0].requiredPeakReputation).toBe(0)
    expect(TAVERN_RANK_CONFIG[TAVERN_RANK_CONFIG.length - 1].rank).toBe(5)

    for (let i = 1; i < TAVERN_RANK_CONFIG.length; i++) {
      expect(TAVERN_RANK_CONFIG[i].rank).toBeGreaterThan(
        TAVERN_RANK_CONFIG[i - 1].rank,
      )
      expect(TAVERN_RANK_CONFIG[i].requiredPeakReputation).toBeGreaterThan(
        TAVERN_RANK_CONFIG[i - 1].requiredPeakReputation,
      )
    }
  })

  it('has monotonically non-decreasing max quest ranks', () => {
    const order = ['E', 'D', 'C', 'B', 'A', 'S']
    for (let i = 1; i < TAVERN_RANK_CONFIG.length; i++) {
      const prev = order.indexOf(TAVERN_RANK_CONFIG[i - 1].maxQuestRank)
      const curr = order.indexOf(TAVERN_RANK_CONFIG[i].maxQuestRank)
      expect(curr).toBeGreaterThan(prev)
    }
  })
})

describe('deriveTavernRank', () => {
  it('rank 1 floor for low or zero peak', () => {
    expect(deriveTavernRank(0)).toBe(1)
    expect(deriveTavernRank(19)).toBe(1)
  })

  it('rank thresholds are exact boundaries', () => {
    expect(deriveTavernRank(19)).toBe(1)
    expect(deriveTavernRank(20)).toBe(2)
    expect(deriveTavernRank(49)).toBe(2)
    expect(deriveTavernRank(50)).toBe(3)
    expect(deriveTavernRank(99)).toBe(3)
    expect(deriveTavernRank(100)).toBe(4)
    expect(deriveTavernRank(179)).toBe(4)
    expect(deriveTavernRank(180)).toBe(5)
  })

  it('never exceeds rank 5', () => {
    expect(deriveTavernRank(100000)).toBe(5)
  })

  it('handles negative peak (defensive; peak is never negative in practice)', () => {
    expect(deriveTavernRank(-50)).toBe(1)
  })
})

describe('getMaxQuestRank / isMaxTavernRank / getNextTavernRankThreshold', () => {
  it('maps tavern rank to max quest rank per config', () => {
    expect(getMaxQuestRank(1)).toBe('D')
    expect(getMaxQuestRank(2)).toBe('C')
    expect(getMaxQuestRank(3)).toBe('B')
    expect(getMaxQuestRank(4)).toBe('A')
    expect(getMaxQuestRank(5)).toBe('S')
  })

  it('rank 5 is the max and has no next threshold', () => {
    expect(isMaxTavernRank(5)).toBe(true)
    expect(getNextTavernRankThreshold(5)).toBeNull()
  })

  it('non-final ranks report the next threshold', () => {
    expect(isMaxTavernRank(1)).toBe(false)
    expect(getNextTavernRankThreshold(1)).toBe(20)
    expect(getNextTavernRankThreshold(4)).toBe(180)
  })
})

describe('computeQuestReputationDelta', () => {
  it('E rank values', () => {
    expect(computeQuestReputationDelta('E', 'completeSuccess')).toBe(2)
    expect(computeQuestReputationDelta('E', 'success')).toBe(2)
    expect(computeQuestReputationDelta('E', 'partialSuccess')).toBe(1)
    expect(computeQuestReputationDelta('E', 'failedObjective')).toBe(-1)
    expect(computeQuestReputationDelta('E', 'forcedRetreat')).toBe(-1)
    expect(computeQuestReputationDelta('E', 'lostExpedition')).toBe(-2)
  })

  it('D rank values', () => {
    expect(computeQuestReputationDelta('D', 'success')).toBe(3)
    expect(computeQuestReputationDelta('D', 'partialSuccess')).toBe(2)
    expect(computeQuestReputationDelta('D', 'failedObjective')).toBe(-2)
    expect(computeQuestReputationDelta('D', 'lostExpedition')).toBe(-3)
  })

  it('C rank values', () => {
    expect(computeQuestReputationDelta('C', 'success')).toBe(4)
    expect(computeQuestReputationDelta('C', 'partialSuccess')).toBe(2)
    expect(computeQuestReputationDelta('C', 'failedObjective')).toBe(-2)
    expect(computeQuestReputationDelta('C', 'lostExpedition')).toBe(-4)
  })

  it('B rank values', () => {
    expect(computeQuestReputationDelta('B', 'success')).toBe(6)
    expect(computeQuestReputationDelta('B', 'partialSuccess')).toBe(3)
    expect(computeQuestReputationDelta('B', 'failedObjective')).toBe(-3)
    expect(computeQuestReputationDelta('B', 'lostExpedition')).toBe(-6)
  })

  it('A rank values', () => {
    expect(computeQuestReputationDelta('A', 'success')).toBe(8)
    expect(computeQuestReputationDelta('A', 'partialSuccess')).toBe(4)
    expect(computeQuestReputationDelta('A', 'failedObjective')).toBe(-4)
    expect(computeQuestReputationDelta('A', 'lostExpedition')).toBe(-8)
  })

  it('S rank values', () => {
    expect(computeQuestReputationDelta('S', 'completeSuccess')).toBe(12)
    expect(computeQuestReputationDelta('S', 'success')).toBe(12)
    expect(computeQuestReputationDelta('S', 'partialSuccess')).toBe(6)
    expect(computeQuestReputationDelta('S', 'failedObjective')).toBe(-6)
    expect(computeQuestReputationDelta('S', 'forcedRetreat')).toBe(-6)
    expect(computeQuestReputationDelta('S', 'lostExpedition')).toBe(-12)
  })

  it('matches the configured base values by rank', () => {
    for (const rank of Object.keys(
      REPUTATION_SUCCESS_BY_QUEST_RANK,
    ) as (keyof typeof REPUTATION_SUCCESS_BY_QUEST_RANK)[]) {
      expect(computeQuestReputationDelta(rank, 'success')).toBe(
        REPUTATION_SUCCESS_BY_QUEST_RANK[rank],
      )
    }
  })
})

describe('buildQuestReputationEvent / buildQuestReputationEventId', () => {
  it('builds a stable, deterministic id', () => {
    const id = buildQuestReputationEventId(4, 'req-1', 'party-1')
    expect(id).toBe('quest-reputation:4:req-1:party-1')
  })

  it('embeds the computed delta and source', () => {
    const event = buildQuestReputationEvent(
      4,
      'req-1',
      'party-1',
      'C',
      'success',
    )
    expect(event.id).toBe('quest-reputation:4:req-1:party-1')
    expect(event.day).toBe(4)
    expect(event.kind).toBe('quest_outcome')
    expect(event.delta).toBe(4)
    expect(event.source).toEqual({
      type: 'expedition',
      requestId: 'req-1',
      partyId: 'party-1',
    })
  })
})

describe('createInitialReputationState', () => {
  it('starts at zero with no events', () => {
    const state = createInitialReputationState()
    expect(state.score).toBe(0)
    expect(state.peakScore).toBe(0)
    expect(state.events).toEqual([])
  })
})

function event(
  day: number,
  delta: number,
  id = `evt-${day}-${delta}`,
): TavernReputationEvent {
  return {
    id,
    day,
    kind: 'quest_outcome',
    delta,
    source: { type: 'expedition', requestId: 'r', partyId: 'p' },
  }
}

describe('applyDailyReputationDelta', () => {
  it('no events leaves score, peak and rank unchanged', () => {
    const state = createInitialReputationState()
    const { state: next, summary } = applyDailyReputationDelta(state, [])
    expect(next.score).toBe(0)
    expect(next.peakScore).toBe(0)
    expect(summary).toEqual({
      beforeScore: 0,
      delta: 0,
      afterScore: 0,
      beforeRank: 1,
      afterRank: 1,
      promoted: false,
    })
  })

  it('allows negative scores without clamping', () => {
    const state = createInitialReputationState()
    const { state: next } = applyDailyReputationDelta(state, [event(1, -7)])
    expect(next.score).toBe(-7)
    expect(next.peakScore).toBe(0)
  })

  it('peak score tracks the running maximum and never decreases', () => {
    let state = createInitialReputationState()
    ;({ state } = applyDailyReputationDelta(state, [event(1, 22)]))
    expect(state.score).toBe(22)
    expect(state.peakScore).toBe(22)

    // A later loss lowers score but must not lower peakScore.
    ;({ state } = applyDailyReputationDelta(state, [event(2, -4)]))
    expect(state.score).toBe(18)
    expect(state.peakScore).toBe(22)
  })

  it('tavern rank never falls even after reputation drops', () => {
    let state = createInitialReputationState()
    ;({ state } = applyDailyReputationDelta(state, [event(1, 22)]))
    expect(deriveTavernRank(state.peakScore)).toBe(2)

    ;({ state } = applyDailyReputationDelta(state, [event(2, -4)]))
    expect(state.score).toBe(18)
    expect(state.peakScore).toBe(22)
    expect(deriveTavernRank(state.peakScore)).toBe(2)

    ;({ state } = applyDailyReputationDelta(state, [event(3, 32)]))
    expect(state.score).toBe(50)
    expect(state.peakScore).toBe(50)
    expect(deriveTavernRank(state.peakScore)).toBe(3)
  })

  it('aggregates same-day events before deriving rank, independent of order', () => {
    const state = { score: 18, peakScore: 18, events: [] }
    const { state: next, summary } = applyDailyReputationDelta(state, [
      event(3, 8, 'a'),
      event(3, -8, 'b'),
    ])
    expect(next.score).toBe(18)
    expect(next.peakScore).toBe(18)
    expect(summary.promoted).toBe(false)
    expect(deriveTavernRank(next.peakScore)).toBe(1)

    // Order independence: reversed event order yields identical score/peak.
    const { state: nextReversed } = applyDailyReputationDelta(state, [
      event(3, -8, 'b'),
      event(3, 8, 'a'),
    ])
    expect(nextReversed.score).toBe(next.score)
    expect(nextReversed.peakScore).toBe(next.peakScore)
  })

  it('reports promoted when the day crosses a rank threshold', () => {
    const state = { score: 15, peakScore: 15, events: [] }
    const { summary } = applyDailyReputationDelta(state, [event(1, 10)])
    expect(summary.beforeRank).toBe(1)
    expect(summary.afterRank).toBe(2)
    expect(summary.promoted).toBe(true)
  })

  it('supports multi-rank jumps as a pure function of peak score', () => {
    const state = createInitialReputationState()
    const { summary } = applyDailyReputationDelta(state, [event(1, 60)])
    expect(summary.beforeRank).toBe(1)
    expect(summary.afterRank).toBe(3)
    expect(summary.promoted).toBe(true)
  })

  it('appends events to the state history', () => {
    const state = createInitialReputationState()
    const e = event(1, 5)
    const { state: next } = applyDailyReputationDelta(state, [e])
    expect(next.events).toEqual([e])
  })
})
