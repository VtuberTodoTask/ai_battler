import { describe, expect, it } from 'vitest'
import { generateTavernDay } from './dayGenerator.ts'
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

  it('generates 4 parties', () => {
    const day = generateTavernDay(TEST_SEED)
    expect(day.parties.length).toBe(4)
  })

  it('each party has 4 members and a leader inside the party', () => {
    const day = generateTavernDay(TEST_SEED)
    for (const tavernParty of day.parties) {
      const party = tavernParty.party
      expect(party.members.length).toBe(4)
      const leader = party.members.find((m) => m.id === party.leaderId)
      expect(leader).toBeTruthy()
    }
  })

  it('uses only E-D-C-B ranks for parties', () => {
    for (let i = 0; i < 50; i++) {
      const day = generateTavernDay(`party-rank-${i}`)
      for (const tavernParty of day.parties) {
        expect(RANKS_ALLOWED).toContain(tavernParty.party.rank)
      }
    }
  })

  it('has unique adventurer IDs across all parties', () => {
    const day = generateTavernDay(TEST_SEED)
    const ids: string[] = []
    for (const tavernParty of day.parties) {
      for (const member of tavernParty.party.members) {
        ids.push(member.id)
      }
    }
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique party names', () => {
    const day = generateTavernDay(TEST_SEED)
    const names = day.parties.map((p) => p.party.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('uses 12+ request templates', () => {
    expect(TAVERN_REQUEST_TEMPLATES.length).toBeGreaterThanOrEqual(12)
  })
})
