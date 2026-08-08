import { describe, expect, it } from 'vitest'
import { generateTavernDay } from './dayGenerator.ts'
import { ADVENTURER_ROLES } from '../models/types.ts'
import { TAVERN_REQUEST_TEMPLATES } from './requestTemplates.ts'

const TEST_SEED = 'tavern-demo-001'

const RANKS_ALLOWED = ['E', 'D', 'C', 'B']

const ALL_OBJECTIVE_TYPES = [
  'investigation',
  'elimination',
  'rescue',
  'escort',
  'retrieval',
  'survey',
] as const

describe('generateTavernDay', () => {
  it('is deterministic', () => {
    const day1 = generateTavernDay(TEST_SEED)
    const day2 = generateTavernDay(TEST_SEED)
    expect(day2).toEqual(day1)
  })

  it('generates 3 requests', () => {
    const day = generateTavernDay(TEST_SEED)
    expect(day.requests.length).toBe(3)
  })

  it('generates requests with distinct objective types', () => {
    const day = generateTavernDay(TEST_SEED)
    const types = day.requests.map((r) => r.objectiveType)
    expect(new Set(types).size).toBe(3)
  })

  it('uses only the six implemented objective types', () => {
    for (let i = 0; i < 50; i++) {
      const day = generateTavernDay(`loop-${i}`)
      for (const request of day.requests) {
        expect(ALL_OBJECTIVE_TYPES).toContain(request.objectiveType)
      }
    }
  })

  it('uses only E-D-C-B ranks for requests', () => {
    for (let i = 0; i < 50; i++) {
      const day = generateTavernDay(`rank-${i}`)
      for (const request of day.requests) {
        expect(RANKS_ALLOWED).toContain(request.rank)
      }
    }
  })

  it('has unique request IDs', () => {
    const day = generateTavernDay(TEST_SEED)
    const ids = day.requests.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('generates 8 adventurers', () => {
    const day = generateTavernDay(TEST_SEED)
    expect(day.adventurers.length).toBe(8)
  })

  it('covers all 7 roles at least once', () => {
    const day = generateTavernDay(TEST_SEED)
    const roles = new Set(day.adventurers.map((a) => a.adventurer.role))
    for (const role of ADVENTURER_ROLES) {
      expect(roles.has(role)).toBe(true)
    }
  })

  it('uses only E-D-C-B ranks for adventurers', () => {
    for (let i = 0; i < 50; i++) {
      const day = generateTavernDay(`adv-rank-${i}`)
      for (const a of day.adventurers) {
        expect(RANKS_ALLOWED).toContain(a.adventurer.rank)
      }
    }
  })

  it('has unique adventurer IDs', () => {
    const day = generateTavernDay(TEST_SEED)
    const ids = day.adventurers.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses 12+ request templates', () => {
    expect(TAVERN_REQUEST_TEMPLATES.length).toBeGreaterThanOrEqual(12)
  })
})
