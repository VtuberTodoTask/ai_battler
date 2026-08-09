import { describe, expect, it } from 'vitest'
import { generateTavernDay } from '../dayGenerator.ts'
import type { StatusEffect } from '../../models/types.ts'
import { buildPredictionCacheKey } from './predictionCacheKey.ts'

describe('buildPredictionCacheKey', () => {
  it('produces the same key for an identical party snapshot', () => {
    const day = generateTavernDay('prediction-cache-001')
    const requestOffer = day.requests[0]
    const party = day.parties[0]

    const a = buildPredictionCacheKey(requestOffer, party, 20)
    const b = buildPredictionCacheKey(requestOffer, party, 20)

    expect(a).toBe(b)
  })

  it('changes the key when a party member skill changes', () => {
    const day = generateTavernDay('prediction-cache-002')
    const requestOffer = day.requests[0]
    const party = day.parties[0]

    const before = buildPredictionCacheKey(requestOffer, party, 20)

    const changedParty = {
      ...party,
      party: {
        ...party.party,
        members: party.party.members.map((m, i) =>
          i === 0
            ? { ...m, skills: { ...m.skills, melee: m.skills.melee + 5 } }
            : m,
        ),
      },
    }

    const after = buildPredictionCacheKey(requestOffer, changedParty, 20)

    expect(after).not.toBe(before)
  })

  it('changes the key when a party member stat changes', () => {
    const day = generateTavernDay('prediction-cache-003')
    const requestOffer = day.requests[0]
    const party = day.parties[0]

    const before = buildPredictionCacheKey(requestOffer, party, 20)

    const changedParty = {
      ...party,
      party: {
        ...party.party,
        members: party.party.members.map((m, i) =>
          i === 0
            ? {
                ...m,
                stats: { ...m.stats, str: m.stats.str + 1 },
              }
            : m,
        ),
      },
    }

    const after = buildPredictionCacheKey(requestOffer, changedParty, 20)

    expect(after).not.toBe(before)
  })

  it('does not change the key when relationship, progression, or stats snapshot change', () => {
    const day = generateTavernDay('prediction-cache-005')
    const requestOffer = day.requests[0]
    const party = day.parties[0]

    const before = buildPredictionCacheKey(requestOffer, party, 20)

    const changedParty = {
      ...party,
      relationship: {
        affinity: 99,
        financialPressure: 99,
        riskTolerance: 'bold' as const,
        stayExtensionDaysUsed: 99,
      },
      progression: {
        growthXp: 99,
        growthMilestones: 99,
        trainingDays: 99,
      },
      stats: {
        totalExpeditions: 99,
        completeSuccesses: 99,
        successes: 99,
        partialSuccesses: 99,
        failures: 99,
        retreats: 99,
      },
    }

    const after = buildPredictionCacheKey(requestOffer, changedParty, 20)

    expect(after).toBe(before)
  })

  it('changes the key when party mission specialization changes', () => {
    const day = generateTavernDay('prediction-cache-specialization')
    const requestOffer = day.requests[0]
    const party = day.parties[0]

    const before = buildPredictionCacheKey(requestOffer, party, 20)

    const changedParty = {
      ...party,
      party: {
        ...party.party,
        missionSpecialization: {
          strongObjective: party.party.missionSpecialization.weakObjective,
          weakObjective: party.party.missionSpecialization.strongObjective,
        },
      },
    }

    const after = buildPredictionCacheKey(requestOffer, changedParty, 20)

    expect(after).not.toBe(before)
  })

  it('changes the key when HP/MP/Morale/status change', () => {
    const day = generateTavernDay('prediction-cache-004')
    const requestOffer = day.requests[0]
    const party = day.parties[0]

    const before = buildPredictionCacheKey(requestOffer, party, 20)

    const changedParty = {
      ...party,
      party: {
        ...party.party,
        members: party.party.members.map((m, i) =>
          i === 0
            ? {
                ...m,
                currentHp: m.currentHp - 5,
                currentMp: m.currentMp - 3,
                morale: m.morale - 10,
                statusEffects: [
                  ...m.statusEffects,
                  {
                    type: 'stunned',
                    duration: 1,
                    sourceId: 'test',
                  } as StatusEffect,
                ],
              }
            : m,
        ),
      },
    }

    const after = buildPredictionCacheKey(requestOffer, changedParty, 20)

    expect(after).not.toBe(before)
  })
})
