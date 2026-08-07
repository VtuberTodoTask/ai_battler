import { describe, expect, it } from 'vitest'
import {
  battleConfig,
  cloneParty,
  makeParty,
  makeRequest,
} from './test-utils.ts'
import type { ExpeditionRequest } from './types.ts'
import { runExpedition } from './expedition.ts'

describe('Expedition determinism', () => {
  it('produces identical results for identical seed and party', () => {
    const request = makeRequest('same-seed')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'same-party',
    )
    const a = runExpedition(request, cloneParty(party))
    const b = runExpedition(request, cloneParty(party))
    expect(a).toEqual(b)
  })

  it('produces different results for different seeds', () => {
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'diff-party',
    )
    const a = runExpedition(makeRequest('seed-a'), cloneParty(party))
    const b = runExpedition(makeRequest('seed-b'), cloneParty(party))
    const same =
      a.outcome === b.outcome &&
      a.state.objectiveCompleted === b.state.objectiveCompleted &&
      a.state.elapsedTime === b.state.elapsedTime &&
      a.state.injuries.length === b.state.injuries.length &&
      a.state.information.length === b.state.information.length
    expect(same).toBe(false)
  })
})

describe('Objective type rejection', () => {
  const unsupported: Array<ExpeditionRequest['objectiveType']> = [
    'rescue',
    'escort',
    'retrieval',
    'survey',
  ]

  for (const objectiveType of unsupported) {
    it(`rejects ${objectiveType}`, () => {
      const request = makeRequest(`reject-${objectiveType}`, {
        objectiveType,
      })
      const party = makeParty(
        ['vanguard', 'guardian', 'mage', 'healer'],
        `reject-${objectiveType}`,
      )
      expect(() => runExpedition(request, party)).toThrow(
        `Unsupported objectiveType in Phase 3.2: ${objectiveType}`,
      )
    })
  }

  it('accepts investigation', () => {
    const request = makeRequest('accept-investigation')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'accept-investigation',
    )
    expect(() => runExpedition(request, party)).not.toThrow()
  })

  it('accepts elimination with battle enabled', () => {
    const request = makeRequest('accept-elimination', {
      objectiveType: 'elimination',
      battle: {
        enabled: true,
        seed: 'elimination-battle',
        triggerPhase: 'afterExploration',
      },
      elimination: { mode: 'allEnemies', confirmationRequired: false },
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'accept-elimination',
    )
    expect(() => runExpedition(request, party)).not.toThrow()
  })

  it('rejects elimination without elimination config', () => {
    const request = makeRequest('reject-elimination-no-config', {
      objectiveType: 'elimination',
      battle: {
        enabled: true,
        seed: 'elimination-battle',
        triggerPhase: 'afterExploration',
      },
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'reject-elimination-no-config',
    )
    expect(() => runExpedition(request, party)).toThrow(
      'Elimination request requires elimination configuration',
    )
  })

  it('rejects elimination without battle config', () => {
    const request = makeRequest('reject-elimination-no-battle', {
      objectiveType: 'elimination',
      elimination: { mode: 'allEnemies', confirmationRequired: false },
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'reject-elimination-no-battle',
    )
    expect(() => runExpedition(request, party)).toThrow(
      'Elimination request requires battle configuration',
    )
  })

  it('rejects elimination with battle disabled', () => {
    const request = makeRequest('reject-elimination-disabled', {
      objectiveType: 'elimination',
      battle: {
        enabled: false,
        seed: 'elimination-battle',
        triggerPhase: 'afterExploration',
      },
      elimination: { mode: 'allEnemies', confirmationRequired: false },
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'reject-elimination-disabled',
    )
    expect(() => runExpedition(request, party)).toThrow(
      'Elimination request requires battle.enabled === true',
    )
  })
})

describe('Battle seed handling', () => {
  it('same battle seed produces identical enemy composition despite different request seeds', () => {
    const battle = battleConfig({ seed: 'shared-battle-seed' })
    const requestA = makeRequest('req-a', { battle })
    const requestB = makeRequest('req-b', { battle })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'seed-party',
      'C',
    )
    const resultA = runExpedition(requestA, cloneParty(party))
    const resultB = runExpedition(requestB, cloneParty(party))
    expect(resultA.state.battles[0].enemyIds).toEqual(
      resultB.state.battles[0].enemyIds,
    )
  })

  it('same battle seed produces identical combat result despite different request seeds', () => {
    const battle = battleConfig({ seed: 'shared-combat-seed' })
    const requestA = makeRequest('req-c', { battle })
    const requestB = makeRequest('req-d', { battle })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'combat-party',
      'C',
    )
    const resultA = runExpedition(requestA, cloneParty(party))
    const resultB = runExpedition(requestB, cloneParty(party))
    expect(resultA.state.battles[0].result.outcome).toBe(
      resultB.state.battles[0].result.outcome,
    )
    expect(resultA.state.battles[0].result.rounds).toBe(
      resultB.state.battles[0].result.rounds,
    )
  })

  it('records encounterSeed and combatSeed in the battle record', () => {
    const request = makeRequest('seed-record', {
      battle: battleConfig({ seed: 'record-seed' }),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'seed-record',
      'C',
    )
    const result = runExpedition(request, party)
    const record = result.state.battles[0]
    expect(record.encounterSeed).toBe('record-seed:encounter')
    expect(record.combatSeed).toBe('record-seed:combat')
  })

  it('different battle seeds produce different enemy or combat results', () => {
    const requestA = makeRequest('diff-a', {
      battle: battleConfig({ seed: 'diff-a' }),
    })
    const requestB = makeRequest('diff-b', {
      battle: battleConfig({ seed: 'diff-b' }),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'diff-party',
      'C',
    )
    const resultA = runExpedition(requestA, cloneParty(party))
    const resultB = runExpedition(requestB, cloneParty(party))
    const differentEnemies =
      resultA.state.battles[0].enemyIds.join(',') !==
      resultB.state.battles[0].enemyIds.join(',')
    const differentOutcome =
      resultA.state.battles[0].result.outcome !==
      resultB.state.battles[0].result.outcome
    expect(differentEnemies || differentOutcome).toBe(true)
  })

  it('changing expedition events before battle does not change enemy composition when battle seed is fixed', () => {
    // 戦闘シードが固定するのは乱数系列。戦闘前のHP/MP/士気/状態異常/surprise/環境条件が異なれば、
    // 同じcombatSeedでも戦闘結果は変わり得るが、敵編成は同一になる。
    const battle = battleConfig({ seed: 'fixed-battle-seed' })
    const requestA = makeRequest('pre-a', {
      battle,
      features: ['traps'],
    })
    const requestB = makeRequest('pre-b', {
      battle,
      features: ['traps', 'poorVisibility'],
    })
    const partyA = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'pre-a',
      'C',
    )
    const partyB = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'pre-b',
      'C',
    )
    const resultA = runExpedition(requestA, partyA)
    const resultB = runExpedition(requestB, partyB)
    expect(resultA.state.battles[0].enemyComposition).toBe(
      resultB.state.battles[0].enemyComposition,
    )
  })
})
