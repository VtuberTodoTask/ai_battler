import { describe, expect, it } from 'vitest'
import {
  battleConfig,
  cloneParty,
  emptyBattleEntrySnapshot,
  findBattleLog,
  makeParty,
  makeRequest,
} from './test-utils.ts'
import type {
  BattleOutcome,
  BattleResult,
  StatusEffect,
} from '../models/types.ts'
import { runExpedition } from './expedition.ts'
import { initializeExpeditionState } from './state.ts'
import { expeditionTestInternals } from './test-internals.ts'

describe('Battle entry snapshot', () => {
  it('creates a snapshot with absolute values after exploration', () => {
    const request = makeRequest('battle-entry')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-entry',
    )
    const result = runExpedition(request, party)
    expect(result.state.battleEntrySnapshot).toBeDefined()
    const ids = party.map((a) => a.id)
    expect(
      Object.keys(result.state.battleEntrySnapshot!.initialHp).sort(),
    ).toEqual(ids.slice().sort())
    for (const a of party) {
      expect(
        result.state.battleEntrySnapshot!.initialHp[a.id],
      ).toBeGreaterThanOrEqual(0)
      expect(
        result.state.battleEntrySnapshot!.initialHp[a.id],
      ).toBeLessThanOrEqual(a.maxHp)
      expect(
        result.state.battleEntrySnapshot!.initialMorale[a.id],
      ).toBeGreaterThanOrEqual(0)
      expect(
        result.state.battleEntrySnapshot!.initialMorale[a.id],
      ).toBeLessThanOrEqual(100)
    }
  })

  it('produces partyAdvantage when all threats are avoided and information is rich', () => {
    const request = makeRequest('party-advantage', {
      environment: 'forest',
      features: ['traps'],
      knownInformation: [
        { id: 'k1', name: '事前情報1', description: '' },
        { id: 'k2', name: '事前情報2', description: '' },
      ],
      hiddenInformation: [],
    })
    const party = makeParty(
      ['scout', 'vanguard', 'mage', 'healer'],
      'party-advantage',
    )
    const result = runExpedition(request, party)
    expect(result.state.battleEntrySnapshot!.surprise).toBe('partyAdvantage')
  })

  it('produces enemyAdvantage when an ambush threat remains unresolved', () => {
    const request = makeRequest('enemy-advantage', {
      environment: 'forest',
      features: ['ambushRisk'],
      knownInformation: [],
      hiddenInformation: [],
    })
    const party = makeParty(
      ['vanguard', 'mage', 'healer', 'support'],
      'enemy-advantage',
    )
    const result = runExpedition(request, party)
    expect(result.state.battleEntrySnapshot!.surprise).toBe('enemyAdvantage')
  })

  it('produces neutral surprise when no threats are present', () => {
    const request = makeRequest('neutral-surprise', {
      environment: 'forest',
      features: [],
      hiddenInformation: [],
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'neutral-surprise',
    )
    const result = runExpedition(request, party)
    expect(result.state.battleEntrySnapshot!.surprise).toBe('neutral')
  })

  it('does not emit a water effect for unstable terrain', () => {
    const request = makeRequest('unstable-no-water', {
      environment: 'mountain',
      features: ['unstableTerrain'],
      hiddenInformation: [],
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'unstable-no-water',
    )
    const result = runExpedition(request, party)
    const envEffects = result.state.battleEntrySnapshot!.environmentEffects
    const water = envEffects.find((e) => e.type === 'water')
    expect(water).toBeUndefined()
    const terrain = envEffects.find(
      (e) => e.type === 'terrain' && e.value === 'unstable',
    )
    expect(terrain).toBeDefined()
  })
})

describe('Expedition battle integration', () => {
  it('runs a battle when battle.enabled is true', () => {
    const request = makeRequest('battle-enabled', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-enabled',
      'S',
    )
    const result = runExpedition(request, party)
    expect(result.state.battles).toHaveLength(1)
    expect(result.state.battleEntrySnapshot).toBeDefined()
    expect(findBattleLog(result)).toBe(true)
  })

  it('skips battle when battle.enabled is false', () => {
    const request = makeRequest('battle-disabled', {
      battle: { enabled: false, seed: 'x', triggerPhase: 'afterExploration' },
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-disabled',
    )
    const result = runExpedition(request, party)
    expect(result.state.battles).toHaveLength(0)
    expect(findBattleLog(result)).toBe(false)
  })

  it('produces identical results with the same seed and party', () => {
    const request = makeRequest('battle-determinism', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-determinism',
      'S',
    )
    const a = runExpedition(request, cloneParty(party))
    const b = runExpedition(request, cloneParty(party))
    expect(a).toEqual(b)
  })

  it('produces different results with different battle seeds', () => {
    const requestA = makeRequest('battle-seed-a', {
      battle: battleConfig({ seed: 'battle-seed-a' }),
    })
    const requestB = makeRequest('battle-seed-b', {
      battle: battleConfig({ seed: 'battle-seed-b' }),
    })
    const partyA = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-seed-a',
      'S',
    )
    const partyB = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-seed-b',
      'S',
    )
    const resultA = runExpedition(requestA, partyA)
    const resultB = runExpedition(requestB, partyB)
    expect(resultA.state.battles[0].enemyIds).not.toEqual(
      resultB.state.battles[0].enemyIds,
    )
  })

  it('uses the same enemy composition for E and S parties with the same request rank', () => {
    const request = makeRequest('battle-rank-test', {
      rank: 'C',
      battle: battleConfig(),
    })
    const partyE = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'e-party',
      'E',
    )
    const partyS = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      's-party',
      'S',
    )
    const resultE = runExpedition(request, partyE)
    const resultS = runExpedition(request, partyS)
    expect(resultE.state.battles[0].enemyIds).toEqual(
      resultS.state.battles[0].enemyIds,
    )
  })

  it('does not weaken enemy composition when a party member is injured before battle', () => {
    const request = makeRequest('battle-injured-direct', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'injured-party',
      'C',
    )

    const healthyState = initializeExpeditionState(request, party)
    healthyState.battleEntrySnapshot = emptyBattleEntrySnapshot()
    expeditionTestInternals.runExpeditionBattle(request, party, healthyState)

    const injuredState = initializeExpeditionState(request, party)
    injuredState.partyHp[party[0].id] = 1
    injuredState.battleEntrySnapshot = emptyBattleEntrySnapshot()
    expeditionTestInternals.runExpeditionBattle(request, party, injuredState)

    // 同じ依頼シードなら、戦闘前の負傷状態に関わらず敵編成は同一
    expect(new Set(healthyState.battles[0].enemyIds)).toEqual(
      new Set(injuredState.battles[0].enemyIds),
    )
  })

  it('does not weaken enemy composition when a party member is dead before battle', () => {
    const request = makeRequest('battle-dead-direct', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'dead-party',
      'C',
    )

    const healthyState = initializeExpeditionState(request, party)
    healthyState.battleEntrySnapshot = emptyBattleEntrySnapshot()
    expeditionTestInternals.runExpeditionBattle(request, party, healthyState)

    const deadState = initializeExpeditionState(request, party)
    deadState.casualties.push(party[0].id)
    deadState.battleEntrySnapshot = emptyBattleEntrySnapshot()
    expeditionTestInternals.runExpeditionBattle(request, party, deadState)

    expect(deadState.casualties).toContain(party[0].id)
    expect(new Set(healthyState.battles[0].enemyIds)).toEqual(
      new Set(deadState.battles[0].enemyIds),
    )
  })

  it('returns final adventurer states from the battle', () => {
    const request = makeRequest('battle-final-states', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'battle-final-states',
      'S',
    )
    const result = runExpedition(request, party)
    const record = result.state.battles[0]
    expect(record.result.finalAdventurerStates).toHaveLength(party.length)
    for (const final of record.result.finalAdventurerStates) {
      expect(final.id).toBeDefined()
      expect(typeof final.alive).toBe('boolean')
      expect(typeof final.dead).toBe('boolean')
      expect(typeof final.incapacitated).toBe('boolean')
      expect(final.currentHp).toBeGreaterThanOrEqual(0)
      expect(final.currentMp).toBeGreaterThanOrEqual(0)
      expect(final.morale).toBeGreaterThanOrEqual(0)
      expect(final.morale).toBeLessThanOrEqual(100)
      expect(final.statusEffects).toBeDefined()
    }
  })
})

describe('Battle state carryover', () => {
  it('buildBattleParty excludes casualties and uses current expedition stats', () => {
    const request = makeRequest('carryover-party')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'carryover',
    )
    const state = initializeExpeditionState(request, party)
    state.partyHp[party[0].id] = 10
    state.partyMp[party[0].id] = 5
    state.partyMorale[party[0].id] = 30
    state.partyStatusEffects[party[0].id] = [
      { type: 'poisoned', duration: 2, sourceId: 'test' },
    ]
    state.casualties.push(party[1].id)

    const battleParty = expeditionTestInternals.buildBattleParty(party, state)
    expect(battleParty.some((a) => a.id === party[1].id)).toBe(false)
    const lead = battleParty.find((a) => a.id === party[0].id)!
    expect(lead.currentHp).toBe(10)
    expect(lead.currentMp).toBe(5)
    expect(lead.morale).toBe(30)
    expect(lead.statusEffects).toEqual([
      { type: 'poisoned', duration: 2, sourceId: 'test' },
    ])
  })

  it('applyBattleResultToExpedition updates hp/mp/morale/status and casualties', () => {
    const request = makeRequest('carryover-apply')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'carryover',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = {
      surprise: 'neutral',
      initialHp: {},
      initialMp: {},
      initialMorale: {},
      initialStatusEffects: {},
      knownEnemyWeaknesses: [],
      knownEnemyAbilities: [],
      environmentEffects: [],
    }

    const status: StatusEffect = {
      type: 'weakened',
      duration: 2,
      sourceId: 'x',
    }
    const result = {
      seed: 's',
      outcome: 'victory' as BattleOutcome,
      rounds: 5,
      survivingAdventurers: [party[0].id, party[1].id],
      incapacitatedAdventurers: [],
      deadAdventurers: [party[2].id],
      finalAdventurerStates: party.map((a, i) => ({
        id: a.id,
        currentHp: i === 2 ? 0 : a.maxHp - i,
        currentMp: a.maxMp - i,
        morale: 50 - i,
        statusEffects: i === 0 ? [status] : [],
        alive: i !== 2,
        incapacitated: false,
        dead: i === 2,
      })),
      survivingEnemies: [],
      defeatedEnemies: ['e1'],
      escapedEnemies: [],
      injuries: [
        {
          adventurerId: party[2].id,
          name: 'x',
          severity: 30,
          survivalRoll: 50,
          survivalChance: 80,
          category: 'dead' as const,
        },
      ],
      discoveredWeaknesses: [],
      partyDamageDealt: 10,
      enemyDamageDealt: 5,
      abilityUsage: {},
      contactResult: {
        type: 'success' as const,
        partyScouting: 0,
        enemyStealth: 0,
        successChance: 100,
        roll: 0,
        effects: {},
      },
      logs: [],
      adventurerActionCount: 1,
      enemyActionCount: 1,
    } satisfies BattleResult

    expeditionTestInternals.applyBattleResultToExpedition(
      state,
      result,
      request,
      'b-0',
      'encounter-seed',
      'combat-seed',
      state.battleEntrySnapshot!.knownEnemyWeaknesses,
      state.battleEntrySnapshot!.knownEnemyAbilities,
      [],
      [],
      [],
      [],
    )

    expect(state.partyHp[party[0].id]).toBe(party[0].maxHp)
    expect(state.partyHp[party[2].id]).toBe(0)
    expect(state.partyMp[party[1].id]).toBe(party[1].maxMp - 1)
    expect(state.partyMorale[party[0].id]).toBe(50)
    expect(state.casualties).toContain(party[2].id)
    expect(state.partyStatusEffects[party[0].id]).toEqual([status])
    expect(state.battles).toHaveLength(1)
    expect(state.battles[0].deadAdventurerIds).toContain(party[2].id)
  })
})

describe('Surprise and contact', () => {
  it('partyAdvantage forces contact success', () => {
    const request = makeRequest('surprise-advantage', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'surprise-advantage',
      'S',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = emptyBattleEntrySnapshot('partyAdvantage')
    expeditionTestInternals.runExpeditionBattle(request, party, state)
    expect(state.battles[0].entrySnapshot.surprise).toBe('partyAdvantage')
    expect(state.battles[0].result.contactResult.type).toBe('success')
  })

  it('enemyAdvantage forces contact failure', () => {
    const request = makeRequest('surprise-disadvantage', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'surprise-disadvantage',
      'S',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = emptyBattleEntrySnapshot('enemyAdvantage')
    expeditionTestInternals.runExpeditionBattle(request, party, state)
    expect(state.battles[0].entrySnapshot.surprise).toBe('enemyAdvantage')
    expect(state.battles[0].result.contactResult.type).toBe('failure')
  })

  it('neutral does not force contact type option', () => {
    const request = makeRequest('surprise-neutral', {
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'surprise-neutral',
      'S',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = emptyBattleEntrySnapshot('neutral')
    expeditionTestInternals.runExpeditionBattle(request, party, state)
    expect(state.battles[0].entrySnapshot.surprise).toBe('neutral')
    // neutral では forcedContactType が undefined なので、既存の接敵判定が実行される
    expect(['greatSuccess', 'success', 'failure', 'greatFailure']).toContain(
      state.battles[0].result.contactResult.type,
    )
  })
})
