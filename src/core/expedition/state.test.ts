import { describe, expect, it } from 'vitest'
import {
  emptyBattleEntrySnapshot,
  makeParty,
  makeRequest,
  minimalAdventurer,
  minimalExpeditionState,
} from './test-utils.ts'
import type { BattleResult } from '../models/types.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { runExpedition } from './expedition.ts'
import { applyExpeditionDamage, initializeExpeditionState } from './state.ts'
import { expeditionTestInternals } from './test-internals.ts'

describe('applyExpeditionDamage', () => {
  it('kills target and logs casualty when allowFatal reduces HP to 0', () => {
    const state = minimalExpeditionState(5)
    const target = minimalAdventurer()
    const rng = new SeededRng('test')
    const effect = applyExpeditionDamage(
      state,
      [target],
      target,
      5,
      'test-hazard',
      true,
      rng,
    )
    expect(state.partyHp.a).toBe(0)
    expect(effect.value).toBe(5)
    expect(state.casualties).toContain('a')
    const casualtyLog = state.logs.find((l) => l.type === 'casualty')
    expect(casualtyLog).toBeDefined()
    expect(casualtyLog?.targetIds).toContain('a')
    expect(casualtyLog?.effects[0].value).toBe(5)
  })

  it('clamps HP at 1 when allowFatal is false', () => {
    const state = minimalExpeditionState(5)
    const target = minimalAdventurer()
    const rng = new SeededRng('test')
    const effect = applyExpeditionDamage(
      state,
      [target],
      target,
      10,
      'test-hazard',
      false,
      rng,
    )
    expect(state.partyHp.a).toBe(1)
    expect(effect.value).toBe(4)
    expect(state.casualties).toHaveLength(0)
    expect(state.injuries[0].type).toBe('light')
  })

  it('does not add duplicate casualty IDs', () => {
    const state = minimalExpeditionState(5)
    const target = minimalAdventurer()
    const rng = new SeededRng('test')
    applyExpeditionDamage(state, [target], target, 5, 'test', true, rng)
    applyExpeditionDamage(state, [target], target, 5, 'test', true, rng)
    applyExpeditionDamage(state, [target], target, 5, 'test', true, rng)
    expect(state.casualties).toEqual(['a'])
    const casualtyLogs = state.logs.filter((l) => l.type === 'casualty')
    expect(casualtyLogs).toHaveLength(1)
  })
})

describe('Incapacitated adventurer handling', () => {
  it('getActiveParty excludes casualties, incapacitated and HP 0 members', () => {
    const request = makeRequest('active-party')
    const party = makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'active-party',
    )
    const state = initializeExpeditionState(request, party)
    state.casualties.push(party[0].id)
    state.incapacitated.push(party[1].id)
    state.partyHp[party[2].id] = 0

    const active = expeditionTestInternals.getActiveParty(party, state)
    expect(active.map((a) => a.id)).toEqual([party[3].id])

    const nonDead = expeditionTestInternals.getNonDeadParty(party, state)
    expect(nonDead.map((a) => a.id)).toEqual([
      party[1].id,
      party[2].id,
      party[3].id,
    ])
  })

  it('resolveSkillCheck does not select incapacitated members as primary or assistants', () => {
    const request = makeRequest('incap-primary')
    const party = makeParty(
      ['scout', 'ranger', 'mage', 'healer'],
      'incap-primary',
    )
    const state = initializeExpeditionState(request, party)
    state.incapacitated.push(party[0].id)

    const rng = new SeededRng('test')
    const { primary, assistants } = expeditionTestInternals.resolveSkillCheck(
      rng,
      party,
      state,
      'exploration',
      'scouting',
      'scout',
      0,
      0,
    )

    expect(primary.id).not.toBe(party[0].id)
    expect(assistants.some((a) => a.id === party[0].id)).toBe(false)
  })

  it('incapacitated healer cannot perform firstAid check', () => {
    const request = makeRequest('incap-healer')
    const party = makeParty(
      ['healer', 'support', 'ranger', 'scout'],
      'incap-healer',
    )
    const state = initializeExpeditionState(request, party)
    state.incapacitated.push(party[0].id)

    const rng = new SeededRng('test')
    const { primary } = expeditionTestInternals.resolveSkillCheck(
      rng,
      party,
      state,
      'return',
      'firstAid',
      'healer',
      0,
      0,
    )

    expect(primary.role).not.toBe('healer')
  })

  it('incapacitated support is not counted for morale support', () => {
    const request = makeRequest('incap-support')
    const party = makeParty(
      ['support', 'ranger', 'scout', 'healer'],
      'incap-support',
    )
    const state = initializeExpeditionState(request, party)
    state.incapacitated.push(party[0].id)

    const active = expeditionTestInternals.getActiveParty(party, state)
    expect(active.some((a) => a.role === 'support')).toBe(false)
  })

  it('treatMember removes incapacitated and raises HP to at least 1', () => {
    const state = minimalExpeditionState(0)
    state.incapacitated = ['a']
    state.injuries.push({
      id: 'i1',
      adventurerId: 'a',
      type: 'light',
      cause: 'x',
      hpLoss: 5,
      status: 'active',
    })

    expeditionTestInternals.treatMember(state, 'a', false)

    expect(state.incapacitated).not.toContain('a')
    expect(state.partyHp.a).toBeGreaterThanOrEqual(1)
    expect(state.injuries[0].status).toBe('treated')
  })

  it('treatMember treats active serious injuries on non-critical success', () => {
    const state = minimalExpeditionState(0)
    state.incapacitated = ['a']
    state.injuries.push({
      id: 'i1',
      adventurerId: 'a',
      type: 'serious',
      cause: 'x',
      hpLoss: 15,
      status: 'active',
    })

    expeditionTestInternals.treatMember(state, 'a', false)

    expect(state.incapacitated).not.toContain('a')
    expect(state.partyHp.a).toBeGreaterThanOrEqual(1)
    expect(state.injuries[0].status).toBe('treated')
  })

  it('treatMember treats serious injuries on critical success', () => {
    const state = minimalExpeditionState(0)
    state.incapacitated = ['a']
    state.injuries.push({
      id: 'i1',
      adventurerId: 'a',
      type: 'serious',
      cause: 'x',
      hpLoss: 15,
      status: 'active',
    })

    expeditionTestInternals.treatMember(state, 'a', true)

    expect(state.injuries[0].status).toBe('treated')
  })

  it('lostExpedition when all living members are incapacitated', () => {
    const request = makeRequest('all-incap')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'all-incap',
    )
    const state = initializeExpeditionState(request, party)
    for (const a of party) {
      state.partyHp[a.id] = 0
      state.incapacitated.push(a.id)
    }

    expect(
      expeditionTestInternals.determineOutcome(request, state, party),
    ).toBe('lostExpedition')
  })

  it('some incapacitated members do not force lostExpedition when active members remain', () => {
    const request = makeRequest('some-incap')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'some-incap',
    )
    const state = initializeExpeditionState(request, party)
    state.incapacitated.push(party[0].id, party[1].id)
    state.objectiveProgress = 40

    expect(
      expeditionTestInternals.determineOutcome(request, state, party),
    ).not.toBe('lostExpedition')
  })

  it('applyBattleResultToExpedition keeps dead and incapacitated in separate arrays', () => {
    const request = makeRequest('separation')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'separation',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = emptyBattleEntrySnapshot()

    const result = {
      seed: 's',
      outcome: 'defeat' as const,
      rounds: 3,
      survivingAdventurers: [party[2].id, party[3].id],
      incapacitatedAdventurers: [party[1].id],
      deadAdventurers: [party[0].id],
      finalAdventurerStates: party.map((a, i) => ({
        id: a.id,
        currentHp: i === 0 ? 0 : i === 1 ? 0 : a.maxHp,
        currentMp: a.maxMp,
        morale: 50,
        statusEffects: [],
        alive: i !== 0,
        incapacitated: i === 1,
        dead: i === 0,
      })),
      survivingEnemies: [],
      defeatedEnemies: [],
      escapedEnemies: [],
      injuries: [],
      discoveredWeaknesses: [],
      partyDamageDealt: 10,
      enemyDamageDealt: 5,
      abilityUsage: {},
      contactResult: {
        type: 'failure' as const,
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
      'enc',
      'comb',
      state.battleEntrySnapshot.knownEnemyWeaknesses,
      state.battleEntrySnapshot.knownEnemyAbilities,
      [],
      [],
      [],
      [],
    )

    expect(state.casualties).toEqual([party[0].id])
    expect(state.incapacitated).toEqual([party[1].id])
  })
})

describe('Log consistency', () => {
  it('hp damage and heal totals match final HP for each adventurer', () => {
    const request = makeRequest('hp-consistency')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'hp-consistency',
    )
    const result = runExpedition(request, party)
    for (const a of party) {
      const damage = result.state.logs
        .flatMap((l) => l.effects)
        .filter((e) => e.type === 'hpDamage' && e.targetId === a.id)
        .reduce((sum, e) => sum + (e.value ?? 0), 0)
      const heal = result.state.logs
        .flatMap((l) => l.effects)
        .filter((e) => e.type === 'hpHeal' && e.targetId === a.id)
        .reduce((sum, e) => sum + (e.value ?? 0), 0)
      const expected = result.state.casualties.includes(a.id)
        ? 0
        : a.maxHp - damage + heal
      expect(result.state.partyHp[a.id]).toBe(expected)
    }
  })

  it('medicine consumption logs match remaining medicine', () => {
    const request = makeRequest('medicine-consistency')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'medicine-consistency',
    )
    const initial = initializeExpeditionState(request, party)
    const result = runExpedition(request, party)
    const consumed = result.state.logs
      .flatMap((l) => l.effects)
      .filter((e) => e.type === 'supplyConsume' && e.targetId === 'medicine')
      .reduce((sum, e) => sum + (e.value ?? 0), 0)
    expect(result.state.supplies.medicine).toBe(
      initial.supplies.medicine - consumed,
    )
  })

  it('discovered and avoided threats are explained by logs', () => {
    const request = makeRequest('threat-logs', {
      environment: 'forest',
      features: ['traps', 'ambushRisk'],
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'threat-logs',
    )
    const result = runExpedition(request, party)
    const allFacts = result.state.logs.flatMap((l) => l.facts).join(' ')
    const labels: Record<string, string> = {
      traps: '罠',
      ambushRisk: '待ち伏せ',
      unstableTerrain: '不安定な地形',
      poisonRisk: '毒',
      poorVisibility: '視界不良',
      navigationDifficulty: '難航',
      flyingEnemies: '飛行敵',
      limitedSupplies: '物資制限',
      longDuration: '長期間',
      retreatDifficulty: '撤退困難',
    }
    for (const threat of result.state.discoveredThreats) {
      expect(allFacts).toContain(labels[threat] ?? threat)
    }
  })

  it('battle entry snapshot captures exploration-end state', () => {
    const request = makeRequest('snapshot-state')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'snapshot-state',
    )
    const result = runExpedition(request, party)
    const snap = result.state.battleEntrySnapshot!
    for (const a of party) {
      expect(snap.initialHp[a.id]).toBeDefined()
      expect(snap.initialMp[a.id]).toBeDefined()
      expect(snap.initialMorale[a.id]).toBeDefined()
      expect(snap.initialStatusEffects[a.id]).toBeDefined()
    }
  })
})
