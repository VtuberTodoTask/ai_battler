import { describe, expect, it } from 'vitest'
import { generateTavernDay } from './dayGenerator.ts'
import { resolveTavernDay, validateAssignments } from './dispatch.ts'

const TEST_SEED = 'tavern-dispatch-001'

describe('dispatch', () => {
  it('allows 4-person assignment', () => {
    const day = generateTavernDay(TEST_SEED)
    const assignment = {
      requestId: day.requests[0].id,
      adventurerIds: day.adventurers.slice(0, 4).map((a) => a.id),
    }
    const errors = validateAssignments(
      [assignment],
      day.adventurers,
      day.requests,
    )
    expect(errors).toEqual([])
  })

  it('rejects 1-person assignment', () => {
    const day = generateTavernDay(TEST_SEED)
    const assignment = {
      requestId: day.requests[0].id,
      adventurerIds: [day.adventurers[0].id],
    }
    const errors = validateAssignments(
      [assignment],
      day.adventurers,
      day.requests,
    )
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.includes('0または4'))).toBe(true)
  })

  it('rejects 2-person and 3-person assignments', () => {
    const day = generateTavernDay(TEST_SEED)
    for (const size of [2, 3]) {
      const assignment = {
        requestId: day.requests[0].id,
        adventurerIds: day.adventurers.slice(0, size).map((a) => a.id),
      }
      const errors = validateAssignments(
        [assignment],
        day.adventurers,
        day.requests,
      )
      expect(errors.length).toBeGreaterThan(0)
    }
  })

  it('allows 0-person assignment as not dispatched', () => {
    const day = generateTavernDay(TEST_SEED)
    const assignment = {
      requestId: day.requests[0].id,
      adventurerIds: [],
    }
    const errors = validateAssignments(
      [assignment],
      day.adventurers,
      day.requests,
    )
    expect(errors).toEqual([])
  })

  it('rejects duplicate adventurer across assignments', () => {
    const day = generateTavernDay(TEST_SEED)
    const sharedId = day.adventurers[0].id
    const assignments = [
      {
        requestId: day.requests[0].id,
        adventurerIds: [
          sharedId,
          ...day.adventurers.slice(1, 4).map((a) => a.id),
        ],
      },
      {
        requestId: day.requests[1].id,
        adventurerIds: [
          sharedId,
          ...day.adventurers.slice(4, 7).map((a) => a.id),
        ],
      },
    ]
    const errors = validateAssignments(
      assignments,
      day.adventurers,
      day.requests,
    )
    expect(errors.some((e) => e.includes('複数'))).toBe(true)
  })

  it('allows two 4-person assignments using all 8 adventurers', () => {
    const day = generateTavernDay(TEST_SEED)
    const assignments = [
      {
        requestId: day.requests[0].id,
        adventurerIds: day.adventurers.slice(0, 4).map((a) => a.id),
      },
      {
        requestId: day.requests[1].id,
        adventurerIds: day.adventurers.slice(4, 8).map((a) => a.id),
      },
    ]
    const errors = validateAssignments(
      assignments,
      day.adventurers,
      day.requests,
    )
    expect(errors).toEqual([])
  })

  it('rejects three 4-person assignments (more than 8 adventurers)', () => {
    const day = generateTavernDay(TEST_SEED)
    const ids = day.adventurers.map((a) => a.id)
    const assignments = [
      { requestId: day.requests[0].id, adventurerIds: ids.slice(0, 4) },
      { requestId: day.requests[1].id, adventurerIds: ids.slice(4, 8) },
      { requestId: day.requests[2].id, adventurerIds: ids.slice(0, 4) },
    ]
    const errors = validateAssignments(
      assignments,
      day.adventurers,
      day.requests,
    )
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.includes('複数'))).toBe(true)
  })

  it('resolves notDispatched for unassigned request', () => {
    const day = generateTavernDay(TEST_SEED)
    const assignments = [
      {
        requestId: day.requests[0].id,
        adventurerIds: day.adventurers.slice(0, 4).map((a) => a.id),
      },
    ]
    const results = resolveTavernDay({ ...day, assignments })
    const notDispatched = results.find(
      (r) => r.requestId === day.requests[2].id,
    )
    expect(notDispatched?.status).toBe('notDispatched')
  })

  it('resolves assigned requests and produces reports', () => {
    const day = generateTavernDay(TEST_SEED)
    const assignments = [
      {
        requestId: day.requests[0].id,
        adventurerIds: day.adventurers.slice(0, 4).map((a) => a.id),
      },
    ]
    const results = resolveTavernDay({ ...day, assignments })
    const resolved = results.find((r) => r.requestId === day.requests[0].id)
    expect(resolved?.status).toBe('resolved')
    expect(resolved?.result).toBeTruthy()
    expect(resolved?.report).toBeTruthy()
    expect(resolved?.report?.requestId).toBe(day.requests[0].id)
  })

  it('assignment array order does not affect results', () => {
    const day = generateTavernDay(TEST_SEED)
    const assignments = [
      {
        requestId: day.requests[0].id,
        adventurerIds: day.adventurers.slice(0, 4).map((a) => a.id),
      },
      {
        requestId: day.requests[1].id,
        adventurerIds: day.adventurers.slice(4, 8).map((a) => a.id),
      },
    ]

    const resultsA = resolveTavernDay({ ...day, assignments })
    const reversed = [...assignments].reverse()
    const resultsB = resolveTavernDay({ ...day, assignments: reversed })

    for (const request of day.requests) {
      const a = resultsA.find((r) => r.requestId === request.id)
      const b = resultsB.find((r) => r.requestId === request.id)
      expect(a?.status).toBe(b?.status)
      if (a?.result && b?.result) {
        expect(b?.result).toEqual(a.result)
      }
    }
  })

  it('does not mutate the original adventurer pool', () => {
    const day = generateTavernDay(TEST_SEED)
    const beforeHp = day.adventurers.map((a) => a.adventurer.currentHp)
    const assignments = [
      {
        requestId: day.requests[0].id,
        adventurerIds: day.adventurers.slice(0, 4).map((a) => a.id),
      },
    ]
    resolveTavernDay({ ...day, assignments })
    const afterHp = day.adventurers.map((a) => a.adventurer.currentHp)
    expect(afterHp).toEqual(beforeHp)
  })

  it('rejects duplicate request assignments', () => {
    const day = generateTavernDay(TEST_SEED)
    const ids = day.adventurers.map((a) => a.id)
    const assignments = [
      { requestId: day.requests[0].id, adventurerIds: ids.slice(0, 4) },
      { requestId: day.requests[0].id, adventurerIds: ids.slice(4, 8) },
    ]
    const errors = validateAssignments(
      assignments,
      day.adventurers,
      day.requests,
    )
    expect(errors.some((e) => e.includes('複数の編成'))).toBe(true)
  })

  it('rejects resolving an already resolved day', () => {
    const day = generateTavernDay(TEST_SEED)
    const assignments = [
      {
        requestId: day.requests[0].id,
        adventurerIds: day.adventurers.slice(0, 4).map((a) => a.id),
      },
    ]
    const resolved = resolveTavernDay({ ...day, assignments })
    expect(() =>
      resolveTavernDay({ ...day, status: 'resolved', results: resolved }),
    ).toThrow('解決済みの酒場日は再解決できません')
  })
})
