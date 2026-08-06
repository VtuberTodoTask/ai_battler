import { describe, expect, it } from 'vitest'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import { generateEnemy } from '../generators/enemyGenerator.ts'
import {
  generateEncounter,
  calculatePartyThreat,
} from '../generators/encounterGenerator.ts'
import {
  runBattle,
  requestPartyRetreat,
  attemptIndividualEscape,
} from './battle.ts'
import { createAdventurerUnit, createEnemyUnit } from './battleState.ts'
import { addStatus } from './actions.ts'
import { SeededRng } from '../rng/seededRng.ts'
import type { BattleState } from './battle.ts'

function balancedParty(rank: 'B' | 'C' | 'D', seed: string) {
  const roles: ('vanguard' | 'ranger' | 'mage' | 'healer')[] = [
    'vanguard',
    'ranger',
    'mage',
    'healer',
  ]
  return roles.map((role, i) =>
    generateAdventurer({ seed: `${seed}-${role}-${i}`, rank, role }),
  )
}

describe('runBattle', () => {
  it('同一シードで同一結果を返す', () => {
    const party = balancedParty('C', 'battle-adv-001')
    const enemies = generateEncounter({
      seed: 'battle-enc-001',
      partyThreat: calculatePartyThreat(party),
      difficulty: 'normal',
    })
    const a = runBattle('battle-seed-001', party, enemies)
    const b = runBattle('battle-seed-001', party, enemies)
    expect(a.outcome).toBe(b.outcome)
    expect(a.rounds).toBe(b.rounds)
    expect(a.partyDamageDealt).toBe(b.partyDamageDealt)
    expect(a.logs.length).toBe(b.logs.length)
  })

  it('1000戦が20ラウンド以内に終了する', () => {
    for (let i = 0; i < 1000; i++) {
      const party = balancedParty('C', `battle-adv-${i}`)
      const enemies = generateEncounter({
        seed: `battle-enc-${i}`,
        partyThreat: calculatePartyThreat(party),
        difficulty: 'normal',
      })
      const result = runBattle(`battle-seed-${i}`, party, enemies)
      expect(result.rounds).toBeLessThanOrEqual(20)
      expect(result.outcome).toMatch(
        /victory|costlyVictory|partialVictory|retreat|defeat|totalLoss|stalemate/,
      )
      expect(Number.isNaN(result.partyDamageDealt)).toBe(false)
      expect(Number.isNaN(result.enemyDamageDealt)).toBe(false)
    }
  })

  it('勝敗結果と生存状況が一致する', () => {
    const party = balancedParty('C', 'consistency-adv')
    const enemies = generateEncounter({
      seed: 'consistency-enc',
      partyThreat: calculatePartyThreat(party),
      difficulty: 'normal',
    })
    const result = runBattle('consistency-seed', party, enemies)
    const allPartyAlive =
      result.survivingAdventurers.length +
      result.deadAdventurers.length +
      result.incapacitatedAdventurers.length
    expect(allPartyAlive).toBe(party.length)
    if (result.outcome === 'totalLoss') {
      expect(result.deadAdventurers.length).toBe(party.length)
    }
    if (result.outcome === 'victory' || result.outcome === 'costlyVictory') {
      expect(result.survivingAdventurers.length).toBeGreaterThan(0)
    }
  })

  it('ランク勝率の単調性', () => {
    const partyBaseSeed = 'mono-battle'
    const partyC = balancedParty('C', partyBaseSeed)
    const enemies = generateEncounter({
      seed: 'enc-3',
      partyThreat: calculatePartyThreat(partyC),
      difficulty: 'normal',
    })

    function winRate(rank: 'B' | 'C' | 'D'): number {
      const party = balancedParty(rank, partyBaseSeed)
      let wins = 0
      const trials = 50
      for (let i = 0; i < trials; i++) {
        const result = runBattle(`mono-seed-${rank}-${i}`, party, enemies)
        if (result.outcome === 'victory' || result.outcome === 'costlyVictory')
          wins++
      }
      return wins / trials
    }

    const bRate = winRate('B')
    const cRate = winRate('C')
    const dRate = winRate('D')
    expect(bRate).toBeGreaterThan(cRate)
    expect(cRate).toBeGreaterThan(dRate)
  })

  it('個別撤退が individualEscape として記録される', () => {
    const party = balancedParty('C', 'manual-adv')
    party[0].currentHp = party[0].maxHp * 0.05
    const enemy = generateEnemy('manual-enemy', {
      rank: 'E',
      species: 'beast',
      archetype: 'assault',
    })
    const result = runBattle('manual-seed', party, [enemy])
    expect(result.retreatDiagnostic).toBeDefined()
    expect(result.retreatDiagnostic?.matchedReasons).toContain(
      'individualEscape',
    )
  })
})

function makeRetreatState(
  partyUnits: ReturnType<typeof createAdventurerUnit>[],
  enemyUnits: ReturnType<typeof createEnemyUnit>[],
): BattleState {
  return {
    seed: 'retreat-test',
    rng: new SeededRng('retreat-test'),
    party: partyUnits,
    enemies: enemyUnits,
    round: 1,
    logs: [],
    contact: {
      type: 'success',
      partyScouting: 0,
      enemyStealth: 0,
      successChance: 50,
      roll: 50,
      effects: {},
    },
    discoveredWeaknesses: new Set(),
    partyDamageDealt: 0,
    enemyDamageDealt: 0,
    ended: false,
    partyInitBonus: 0,
    enemyInitBonus: 0,
    deadAdventurers: new Set(),
    injuries: [],
    abilityUsage: {},
    retreatAttempts: [],
    lastRetreatRound: -2,
    context: {
      lighting: 'normal',
      noise: 0,
      water: false,
      smoke: false,
    },
    minionActionsRemaining: 99,
    adventurerActionCount: 0,
    enemyActionCount: 0,
  }
}

describe('撤退意思決定', () => {
  it('requestPartyRetreat が memberProposal として記録される', () => {
    const base = generateAdventurer({
      seed: 'req-base',
      rank: 'S',
      role: 'vanguard',
    })
    base.personality = {
      bravery: 0,
      caution: 4,
      cooperation: 0,
      altruism: 0,
      greed: 0,
      discipline: 0,
    }
    base.morale = 30
    base.currentHp = Math.floor(base.maxHp * 0.15)

    const wounded = generateAdventurer({
      seed: 'req-wounded',
      rank: 'S',
      role: 'mage',
    })
    wounded.currentHp = Math.floor(wounded.maxHp * 0.4)

    const down = generateAdventurer({
      seed: 'req-down',
      rank: 'S',
      role: 'ranger',
    })
    down.currentHp = 0

    const healer = generateAdventurer({
      seed: 'req-healer',
      rank: 'S',
      role: 'healer',
    })

    const party = [base, wounded, down, healer].map(createAdventurerUnit)
    party[0].skills.leadership = 20
    party[1].skills.leadership = 0
    party[2].skills.leadership = 0
    party[3].skills.leadership = 0

    const enemy = createEnemyUnit(
      generateEnemy('req-enemy', {
        rank: 'E',
        species: 'beast',
        archetype: 'assault',
      }),
    )

    const state = makeRetreatState(party, [enemy])
    requestPartyRetreat(state, party[0])

    const diagnostic = state.retreatAttempts[0]
    expect(diagnostic).toBeDefined()
    expect(diagnostic.reason).toBe('memberProposal')
    expect(diagnostic.matchedReasons).toContain('memberProposal')
    expect(diagnostic.proposerId).toBe(party[0].id)
    expect(diagnostic.proposerRole).toBe('vanguard')
    expect(diagnostic.approved).toBe(true)
    expect(diagnostic.attempted).toBe(true)
  })

  it('requestPartyRetreat が criticalMember として記録される', () => {
    const base = generateAdventurer({
      seed: 'crit-base',
      rank: 'S',
      role: 'vanguard',
    })
    base.personality = {
      bravery: 0,
      caution: 4,
      cooperation: 0,
      altruism: 0,
      greed: 0,
      discipline: 0,
    }
    base.morale = 30
    base.currentHp = Math.floor(base.maxHp * 0.1)

    const party = [
      base,
      generateAdventurer({ seed: 'crit-1', rank: 'S', role: 'ranger' }),
      generateAdventurer({ seed: 'crit-2', rank: 'S', role: 'mage' }),
      generateAdventurer({ seed: 'crit-3', rank: 'S', role: 'healer' }),
    ].map(createAdventurerUnit)
    party[0].skills.leadership = 20
    party[1].skills.leadership = 0
    party[2].skills.leadership = 0
    party[3].skills.leadership = 0

    const enemy = createEnemyUnit(
      generateEnemy('crit-enemy', {
        rank: 'E',
        species: 'beast',
        archetype: 'assault',
      }),
    )

    const state = makeRetreatState(party, [enemy])
    requestPartyRetreat(state, party[0])

    expect(state.retreatAttempts[0].reason).toBe('criticalMember')
    expect(state.retreatAttempts[0].matchedReasons).toContain('criticalMember')
  })

  it('attemptIndividualEscape が fearPanic として記録される', () => {
    const adv = createAdventurerUnit(
      generateAdventurer({
        seed: 'fear-adv',
        rank: 'S',
        role: 'vanguard',
      }),
    )
    const enemy = createEnemyUnit(
      generateEnemy('fear-enemy', {
        rank: 'E',
        species: 'beast',
        archetype: 'assault',
      }),
    )

    const state = makeRetreatState([adv], [enemy])
    addStatus(adv, 'frightened', 2, 5, 'test')
    attemptIndividualEscape(state, adv)

    expect(state.retreatAttempts[0].reason).toBe('fearPanic')
    expect(state.retreatAttempts[0].matchedReasons).toContain('fearPanic')
  })
})
