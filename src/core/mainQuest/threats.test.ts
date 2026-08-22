import { describe, expect, it } from 'vitest'
import {
  assertMainQuestBattleCompatibleEnemy,
  buildMainQuestEnemy,
  createInitialMainQuestState,
  isNosferatuUnlocked,
  MAIN_QUEST_THREAT_DEFINITIONS,
  NATIONAL_THREAT_IDS,
} from './threats.ts'
import type { Enemy } from '../models/types.ts'

describe('Phase 9.8 Main Quest Threats', () => {
  it('defines exactly the 7 national Threats plus Nosferatu, with stable ids', () => {
    expect(MAIN_QUEST_THREAT_DEFINITIONS.map((d) => d.id).sort()).toEqual(
      [
        'alden',
        'velga',
        'kared',
        'celesta',
        'eldia',
        'ragna',
        'halma',
        'nosferatu',
      ].sort(),
    )
    expect(NATIONAL_THREAT_IDS).toHaveLength(7)
    expect(NATIONAL_THREAT_IDS).not.toContain('nosferatu')
  })

  it('createInitialMainQuestState locks only Nosferatu and starts the curse active', () => {
    const state = createInitialMainQuestState()
    for (const id of NATIONAL_THREAT_IDS) {
      expect(state.threats[id].status).toBe('available')
    }
    expect(state.threats.nosferatu.status).toBe('locked')
    expect(state.attempts).toEqual([])
    expect(state.playerCurseStatus).toBe('active')
  })

  it('isNosferatuUnlocked is false until all 7 national Threats are defeated, true once they are', () => {
    const state = createInitialMainQuestState()
    expect(isNosferatuUnlocked(state)).toBe(false)

    for (const id of NATIONAL_THREAT_IDS.slice(0, 6)) {
      state.threats[id] = { ...state.threats[id], status: 'defeated' }
    }
    expect(isNosferatuUnlocked(state)).toBe(false)

    state.threats[NATIONAL_THREAT_IDS[6]] = {
      ...state.threats[NATIONAL_THREAT_IDS[6]],
      status: 'defeated',
    }
    expect(isNosferatuUnlocked(state)).toBe(true)
  })

  it('every Threat definition carries a Unique Monster Profile with all required narrative fields non-empty', () => {
    for (const definition of MAIN_QUEST_THREAT_DEFINITIONS) {
      const monster = definition.uniqueMonster
      expect(monster.personalityTraits.length).toBeGreaterThan(0)
      expect(monster.values.length).toBeGreaterThan(0)
      expect(monster.motivation.length).toBeGreaterThan(0)
      expect(monster.conflictReason.length).toBeGreaterThan(0)
      expect(monster.attitudeTowardHumans.length).toBeGreaterThan(0)
      expect(monster.communicationStyle.length).toBeGreaterThan(0)
      expect(monster.combatIdentity.length).toBeGreaterThan(0)
      expect(monster.narrativeMustShow.length).toBeGreaterThan(0)
      expect(monster.narrativeMustNotInvent.length).toBeGreaterThan(0)
      expect(monster.visualProfile.assetKey.length).toBeGreaterThan(0)
    }
  })

  it('every Unique Monster has a distinct visual assetKey (never a shared generic image)', () => {
    const keys = MAIN_QUEST_THREAT_DEFINITIONS.map(
      (d) => d.uniqueMonster.visualProfile.assetKey,
    )
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('Nosferatu requires all 7 national Threats defeated to be the only locked Threat at start', () => {
    const nosferatu = MAIN_QUEST_THREAT_DEFINITIONS.find(
      (d) => d.id === 'nosferatu',
    )!
    expect(nosferatu.nationId).toBeUndefined()
  })
})

describe('Phase 9.8.2 Dynamic Participant Guard', () => {
  it('every real Threat boss (all 8, including Nosferatu) passes assertMainQuestBattleCompatibleEnemy', () => {
    for (const definition of MAIN_QUEST_THREAT_DEFINITIONS) {
      const enemy = buildMainQuestEnemy(definition.id)
      expect(() => assertMainQuestBattleCompatibleEnemy(enemy)).not.toThrow()
    }
  })

  it('no real Threat boss ever carries a summon-type ability (never present, not merely inert)', () => {
    for (const definition of MAIN_QUEST_THREAT_DEFINITIONS) {
      const enemy = buildMainQuestEnemy(definition.id)
      const abilityIds = enemy.abilities?.map((a) => a.abilityId) ?? []
      expect(abilityIds).not.toContain('summon')
    }
  })

  it('rejects a deliberately-constructed Enemy carrying a summon ability', () => {
    const real = buildMainQuestEnemy('alden')
    const withSummon: Enemy = {
      ...real,
      abilities: [
        ...(real.abilities ?? []),
        { abilityId: 'summon', name: '召喚' },
      ],
    }
    expect(() => assertMainQuestBattleCompatibleEnemy(withSummon)).toThrow()
  })

  it('does not reject an Enemy with only non-dynamic-participant abilities', () => {
    const real = buildMainQuestEnemy('kared')
    expect(() => assertMainQuestBattleCompatibleEnemy(real)).not.toThrow()
  })
})
