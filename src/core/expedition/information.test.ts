import { describe, expect, it } from 'vitest'
import {
  battleConfig,
  emptyBattleEntrySnapshot,
  makeParty,
  makeRequest,
  minimalExpeditionState,
} from './test-utils.ts'
import type { BattleResult, Enemy } from '../models/types.ts'
import type { BattleIntel } from './types.ts'
import { runExpedition } from './expedition.ts'
import { initializeExpeditionState } from './state.ts'
import { expeditionTestInternals } from './test-internals.ts'

describe('Known enemy weaknesses', () => {
  it('sets known flag for matching weakness id or name on all enemies', () => {
    const enemies = [
      {
        id: 'e1',
        species: 'humanoid',
        name: 'Goblin',
        weaknesses: [
          { weaknessId: 'fire', name: '火弱点', known: false },
          { weaknessId: 'ice', name: '氷弱点', known: false },
        ],
      },
      {
        id: 'e2',
        species: 'humanoid',
        name: 'Goblin Archer',
        weaknesses: [{ weaknessId: 'fire', name: '火弱点', known: false }],
      },
      {
        id: 'e3',
        species: 'undead',
        name: 'Skeleton',
        weaknesses: [{ weaknessId: 'light', name: '光弱点', known: false }],
      },
    ] as unknown as Enemy[]
    const known: BattleIntel[] = [
      { kind: 'weakness', id: 'fire', name: '火弱点' },
      { kind: 'weakness', id: 'light', name: '光弱点' },
    ]
    const state = minimalExpeditionState()
    const { matched, unmatched } =
      expeditionTestInternals.applyKnownEnemyWeaknesses(
        enemies,
        known,
        state,
        'b-0',
      )
    expect(enemies[0].weaknesses[0].known).toBe(true)
    expect(enemies[0].weaknesses[1].known).toBe(false)
    expect(enemies[1].weaknesses[0].known).toBe(true)
    expect(enemies[2].weaknesses[0].known).toBe(true)
    expect(matched.length).toBe(2)
    expect(unmatched.length).toBe(0)
  })

  it('respects targetSpecies when applying known weaknesses', () => {
    const enemies = [
      {
        id: 'e1',
        species: 'beast',
        name: 'Wolf',
        weaknesses: [{ weaknessId: 'fire', name: '火弱点', known: false }],
      },
      {
        id: 'e2',
        species: 'undead',
        name: 'Skeleton',
        weaknesses: [{ weaknessId: 'fire', name: '火弱点', known: false }],
      },
    ] as unknown as Enemy[]
    const known: BattleIntel[] = [
      {
        kind: 'weakness',
        id: 'fire',
        name: '火弱点',
        targetSpecies: 'undead',
      },
    ]
    const state = minimalExpeditionState()
    expeditionTestInternals.applyKnownEnemyWeaknesses(
      enemies,
      known,
      state,
      'b-0',
    )
    expect(enemies[0].weaknesses[0].known).toBe(false)
    expect(enemies[1].weaknesses[0].known).toBe(true)
  })

  it('logs a diagnostic for unknown weakness references', () => {
    const enemies = [
      {
        id: 'e1',
        species: 'beast',
        name: 'Wolf',
        weaknesses: [],
      },
    ] as unknown as Enemy[]
    const known: BattleIntel[] = [
      { kind: 'weakness', id: 'nonexistent', name: 'nonexistent' },
    ]
    const state = minimalExpeditionState()
    expeditionTestInternals.applyKnownEnemyWeaknesses(
      enemies,
      known,
      state,
      'b-0',
    )
    const diag = state.logs.find(
      (l) => l.type === 'diagnostic' && l.phase === 'battle',
    )
    expect(diag).toBeDefined()
    expect(diag?.facts[0]).toContain('nonexistent')
  })
})

describe('Known enemy abilities', () => {
  it('matches ability intel when an enemy has the ability', () => {
    const enemies = [
      {
        species: 'beast',
        abilities: [{ abilityId: 'poisonAttack', name: '毒攻撃' }],
      },
    ] as unknown as Enemy[]
    const known: BattleIntel[] = [
      { kind: 'ability', id: 'poisonAttack', name: '毒攻撃' },
    ]
    const state = minimalExpeditionState()
    const { matched, unmatched } =
      expeditionTestInternals.matchKnownEnemyAbilities(
        enemies,
        known,
        state,
        'b-0',
      )
    expect(matched.length).toBe(1)
    expect(unmatched.length).toBe(0)
  })

  it('unmatched ability intel when no enemy has the ability', () => {
    const enemies = [{ species: 'beast', abilities: [] }] as unknown as Enemy[]
    const known: BattleIntel[] = [
      { kind: 'ability', id: 'flight', name: '飛行' },
    ]
    const state = minimalExpeditionState()
    const { matched, unmatched } =
      expeditionTestInternals.matchKnownEnemyAbilities(
        enemies,
        known,
        state,
        'b-0',
      )
    expect(matched.length).toBe(0)
    expect(unmatched.length).toBe(1)
    const diag = state.logs.find(
      (l) => l.type === 'diagnostic' && l.phase === 'battle',
    )
    expect(diag).toBeDefined()
    expect(diag?.facts[0]).toContain('飛行')
  })

  it('matches when any enemy of the target species has the ability', () => {
    const enemies = [
      { species: 'undead', abilities: [] },
      {
        species: 'undead',
        abilities: [{ abilityId: 'poisonAttack', name: '毒攻撃' }],
      },
    ] as unknown as Enemy[]
    const known: BattleIntel[] = [
      { kind: 'ability', id: 'poisonAttack', name: '毒攻撃' },
    ]
    const state = minimalExpeditionState()
    const { matched } = expeditionTestInternals.matchKnownEnemyAbilities(
      enemies,
      known,
      state,
      'b-0',
    )
    expect(matched.length).toBe(1)
  })

  it('does not match ability intel when targetSpecies differs', () => {
    const enemies = [
      {
        species: 'undead',
        abilities: [{ abilityId: 'poisonAttack', name: '毒攻撃' }],
      },
    ] as unknown as Enemy[]
    const known: BattleIntel[] = [
      {
        kind: 'ability',
        id: 'poisonAttack',
        name: '毒攻撃',
        targetSpecies: 'beast',
      },
    ]
    const state = minimalExpeditionState()
    const { matched, unmatched } =
      expeditionTestInternals.matchKnownEnemyAbilities(
        enemies,
        known,
        state,
        'b-0',
      )
    expect(matched.length).toBe(0)
    expect(unmatched.length).toBe(1)
  })

  it('stores matched and unmatched abilities in the battle record', () => {
    const request = makeRequest('ability-record')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'ability-record',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = emptyBattleEntrySnapshot()

    const result = {
      seed: 's',
      outcome: 'victory' as const,
      rounds: 3,
      survivingAdventurers: party.map((a) => a.id),
      incapacitatedAdventurers: [],
      deadAdventurers: [],
      finalAdventurerStates: party.map((a) => ({
        id: a.id,
        currentHp: a.maxHp,
        currentMp: a.maxMp,
        morale: 50,
        statusEffects: [],
        alive: true,
        incapacitated: false,
        dead: false,
      })),
      survivingEnemies: [],
      defeatedEnemies: ['e1'],
      escapedEnemies: [],
      injuries: [],
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

    const matched: BattleIntel[] = [
      { kind: 'ability', id: 'poisonAttack', name: '毒攻撃' },
    ]
    const unmatched: BattleIntel[] = [
      { kind: 'ability', id: 'flight', name: '飛行' },
    ]

    expeditionTestInternals.applyBattleResultToExpedition(
      state,
      result,
      request,
      'b-0',
      'enc',
      'comb',
      [],
      [...matched, ...unmatched],
      [],
      [],
      matched,
      unmatched,
    )

    expect(state.battles[0].matchedAbilityIntel).toEqual(matched)
    expect(state.battles[0].unmatchedAbilityIntel).toEqual(unmatched)

    const summary = state.logs.find((l) => l.type === 'battleSummary')
    expect(summary).toBeDefined()
    expect(summary?.facts.some((f) => f.includes('毒攻撃'))).toBe(true)
    expect(summary?.facts.some((f) => f.includes('飛行'))).toBe(true)
  })

  it('distinguishes matched and unmatched abilities in the battle summary', () => {
    const request = makeRequest('ability-summary')
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'ability-summary',
    )
    const state = initializeExpeditionState(request, party)
    state.battleEntrySnapshot = emptyBattleEntrySnapshot()

    const result = {
      seed: 's',
      outcome: 'victory' as const,
      rounds: 3,
      survivingAdventurers: party.map((a) => a.id),
      incapacitatedAdventurers: [],
      deadAdventurers: [],
      finalAdventurerStates: party.map((a) => ({
        id: a.id,
        currentHp: a.maxHp,
        currentMp: a.maxMp,
        morale: 50,
        statusEffects: [],
        alive: true,
        incapacitated: false,
        dead: false,
      })),
      survivingEnemies: [],
      defeatedEnemies: ['e1'],
      escapedEnemies: [],
      injuries: [],
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

    const matched: BattleIntel[] = [
      { kind: 'ability', id: 'regenerate', name: '再生' },
    ]
    const unmatched: BattleIntel[] = [
      { kind: 'ability', id: 'flight', name: '飛行' },
    ]

    expeditionTestInternals.applyBattleResultToExpedition(
      state,
      result,
      request,
      'b-0',
      'enc',
      'comb',
      [],
      [...matched, ...unmatched],
      [],
      [],
      matched,
      unmatched,
    )

    const summary = state.logs.find((l) => l.type === 'battleSummary')!
    const matchedLine = summary.facts.find((f) =>
      f.includes('一致した能力情報'),
    )
    const unmatchedLine = summary.facts.find((f) =>
      f.includes('確認できなかった能力情報'),
    )
    expect(matchedLine).toContain('再生')
    expect(unmatchedLine).toContain('飛行')
  })
})

describe('Battle intel conversion', () => {
  it('does not convert normal monsterKnowledge information into enemy weaknesses', () => {
    const request = makeRequest('no-auto-weakness', {
      environment: 'magical',
      features: [],
      hiddenInformation: [
        {
          id: 'magic',
          name: '魔力の残滓',
          description: '魔法の気配',
          difficulty: 5,
          requiredSkill: 'monsterKnowledge',
        },
      ],
    })
    const party = makeParty(['mage', 'scout', 'ranger', 'healer'], 'no-auto')
    const result = runExpedition(request, party)
    expect(result.state.battleEntrySnapshot?.knownEnemyWeaknesses.length).toBe(
      0,
    )
  })

  it('does not apply fragment battle intel as weaknesses', () => {
    const request = makeRequest('fragment-intel')
    const party = makeParty(
      ['mage', 'scout', 'ranger', 'healer'],
      'fragment-intel',
    )
    const state = initializeExpeditionState(request, party)
    state.information.push({
      id: 'frag-weak',
      name: '断片化した弱点情報',
      description: 'x',
      source: 'monsterKnowledge',
      completeness: 'fragment',
      battleIntel: { kind: 'weakness', id: 'fire', name: '火弱点' },
    })

    const snapshot = expeditionTestInternals.buildBattleEntrySnapshot(
      request,
      party,
      state,
    )
    expect(snapshot.knownEnemyWeaknesses.length).toBe(0)
  })

  it('only applies complete battle intel with battleIntel field', () => {
    const request = makeRequest('complete-intel', {
      knownInformation: [
        {
          id: 'weak',
          name: '敵の弱点',
          description: 'x',
          battleIntel: { kind: 'weakness', id: 'fire', name: '火弱点' },
        },
        {
          id: 'abi',
          name: '敵の能力',
          description: 'x',
          battleIntel: { kind: 'ability', id: 'flight', name: '飛行' },
        },
      ],
    })
    const party = makeParty(['mage', 'scout', 'ranger', 'healer'], 'complete')
    const result = runExpedition(request, party)
    expect(result.state.battleEntrySnapshot?.knownEnemyWeaknesses.length).toBe(
      1,
    )
    expect(result.state.battleEntrySnapshot?.knownEnemyWeaknesses[0].id).toBe(
      'fire',
    )
    expect(result.state.battleEntrySnapshot?.knownEnemyAbilities.length).toBe(1)
    expect(result.state.battleEntrySnapshot?.knownEnemyAbilities[0].id).toBe(
      'flight',
    )
  })

  it('stores known abilities in the battle record and summary', () => {
    const request = makeRequest('ability-record', {
      knownInformation: [
        {
          id: 'abi',
          name: '敵の能力',
          description: 'x',
          battleIntel: { kind: 'ability', id: 'poisonAttack', name: '毒攻撃' },
        },
      ],
      battle: battleConfig(),
    })
    const party = makeParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      'ability-record',
      'S',
    )
    const result = runExpedition(request, party)
    const record = result.state.battles[0]
    expect(record.knownEnemyAbilities.length).toBe(1)
    expect(record.knownEnemyAbilities[0].id).toBe('poisonAttack')
    const summary = result.state.logs.find((l) => l.type === 'battleSummary')
    expect(summary).toBeDefined()
    expect(summary?.facts.some((f) => f.includes('毒攻撃'))).toBe(true)
  })
})
