import { describe, expect, it } from 'vitest'
import { generateParty } from '../../../scripts/expedition-rank-matrix.ts'
import { PARTY_TEMPLATES } from '../tavern/partyTemplates.ts'
import type { AdventurerRank } from '../models/types.ts'

describe('Matrix party determinism', () => {
  const scenarios = ['scenario-a', 'scenario-b']
  const ranks: AdventurerRank[] = ['E', 'D', 'C', 'B', 'A', 'S']

  it('produces identical parties for the same scenario/template/rank regardless of request context', () => {
    for (const scenario of scenarios) {
      for (
        let templateIndex = 0;
        templateIndex < PARTY_TEMPLATES.length;
        templateIndex++
      ) {
        const template = PARTY_TEMPLATES[templateIndex]
        for (const rank of ranks) {
          const fromFirstRequest = generateParty(
            template.id,
            rank,
            scenario,
            templateIndex,
          )
          const fromSecondRequest = generateParty(
            template.id,
            rank,
            scenario,
            templateIndex,
          )

          expect(fromFirstRequest.id).toBe(fromSecondRequest.id)
          expect(fromFirstRequest.name).toBe(fromSecondRequest.name)
          expect(fromFirstRequest.rank).toBe(fromSecondRequest.rank)
          expect(fromFirstRequest.archetypeId).toBe(
            fromSecondRequest.archetypeId,
          )
          expect(fromFirstRequest.leaderId).toBe(fromSecondRequest.leaderId)
          expect(fromFirstRequest.members.map((m) => m.id)).toEqual(
            fromSecondRequest.members.map((m) => m.id),
          )
          expect(fromFirstRequest.members.map((m) => m.role)).toEqual(
            fromSecondRequest.members.map((m) => m.role),
          )
          expect(
            fromFirstRequest.members.map((m) => ({
              rank: m.rank,
              maxHp: m.maxHp,
              maxMp: m.maxMp,
              skills: m.skills,
            })),
          ).toEqual(
            fromSecondRequest.members.map((m) => ({
              rank: m.rank,
              maxHp: m.maxHp,
              maxMp: m.maxMp,
              skills: m.skills,
            })),
          )
        }
      }
    }
  })
})
