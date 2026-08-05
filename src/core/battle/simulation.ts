import { SeededRng } from '../rng/seededRng.ts'
import {
  type Adventurer,
  type AdventurerRank,
  type AdventurerRole,
  type BattleContext,
  type BattleOutcome,
  type BattleResult,
  type ContactResultType,
  type Enemy,
  type RetreatTriggerReason,
} from '../models/types.ts'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import {
  calculatePartyThreat,
  generateEncounter,
} from '../generators/encounterGenerator.ts'
import { runBattle } from './battle.ts'

const ADVENTURER_ROLES: AdventurerRole[] = [
  'vanguard',
  'guardian',
  'scout',
  'ranger',
  'mage',
  'healer',
  'support',
]

const POSITIVE_OUTCOMES: BattleOutcome[] = [
  'victory',
  'costlyVictory',
  'partialVictory',
]

export type SimulationMode = 'fixed' | 'random'
export type RoleCompositionMode = 'fixed' | 'random'

export interface SimulationOptions {
  rank: AdventurerRank
  difficulty: 'easy' | 'normal' | 'hard' | 'deadly'
  count: number
  mode: SimulationMode
  roleMode: RoleCompositionMode
  partySize?: number
  fixedRoles?: AdventurerRole[]
  ensureHealer?: boolean
  allowDuplicateRoles?: boolean
  context?: BattleContext
  seed?: string
}

export interface RetreatReasonSummary {
  count: number
  percentage: number
}

export interface CategorySummary {
  count: number
  wins: number
  winRate: number
}

export interface SimulationSummary {
  count: number
  outcomes: Record<BattleOutcome, number>
  outcomePercentages: Record<BattleOutcome, number>
  avgRounds: number
  retreatReasons: Partial<Record<RetreatTriggerReason, RetreatReasonSummary>>
  avgRetreatRound: number | null
  retreatSuccessRate: number
  avgPartyHpOnRetreat: number | null
  avgMoraleOnRetreat: number | null
  healerIncapRetreatRate: number
  contactResultStats: Partial<Record<ContactResultType, CategorySummary>>
  enemyCompositionStats: Record<string, CategorySummary>
  enemyAbilityStats: Record<string, CategorySummary>
  avgEnemyCount: number
  avgEnemyThreat: number
  avgPartyThreat: number
  avgThreatRatio: number
  rawResults?: BattleResult[]
}

function ensureHealerInRoles(roles: AdventurerRole[]): AdventurerRole[] {
  if (roles.includes('healer')) return roles
  const copy = [...roles]
  copy[copy.length - 1] = 'healer'
  return copy
}

function selectRandomRoles(
  count: number,
  ensureHealer: boolean,
  allowDuplicate: boolean,
  rng: SeededRng,
): AdventurerRole[] {
  if (allowDuplicate) {
    const roles: AdventurerRole[] = []
    for (let i = 0; i < count; i++) {
      roles.push(rng.pick(ADVENTURER_ROLES))
    }
    if (ensureHealer && !roles.includes('healer')) {
      roles[0] = 'healer'
    }
    return roles
  }

  const pool = [...ADVENTURER_ROLES]
  const roles: AdventurerRole[] = []
  if (ensureHealer) {
    roles.push('healer')
    pool.splice(pool.indexOf('healer'), 1)
  }
  while (roles.length < count && pool.length > 0) {
    const idx = rng.integer(0, pool.length - 1)
    roles.push(pool.splice(idx, 1)[0])
  }
  return roles
}

function generateParty(
  options: SimulationOptions,
  seed: string,
  trial: number,
): Adventurer[] {
  const size = options.partySize ?? 4
  const ensureHealer = options.ensureHealer ?? true
  const allowDuplicate = options.allowDuplicateRoles ?? false

  let roles: AdventurerRole[]
  if (options.roleMode === 'fixed') {
    roles = options.fixedRoles?.length
      ? [...options.fixedRoles]
      : ['vanguard', 'ranger', 'mage', 'healer']
    if (roles.length > size) roles = roles.slice(0, size)
    if (roles.length < size) {
      roles = [
        ...roles,
        ...Array.from(
          { length: size - roles.length },
          () => 'vanguard' as AdventurerRole,
        ),
      ]
    }
    if (ensureHealer) roles = ensureHealerInRoles(roles)
  } else {
    const rng = new SeededRng(`${seed}-roles-${trial}`)
    roles = selectRandomRoles(size, ensureHealer, allowDuplicate, rng)
  }

  return roles.map((role, i) =>
    generateAdventurer({
      seed: `${seed}-party-${trial}-${i}`,
      rank: options.rank,
      role,
    }),
  )
}

function enemyCompositionKey(enemies: Enemy[]): string {
  const counts = new Map<string, number>()
  for (const e of enemies) {
    counts.set(e.species, (counts.get(e.species) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([species, count]) => `${species}:${count}`)
    .join('|')
}

function enemyAbilityIds(enemies: Enemy[]): string[] {
  const ids = new Set<string>()
  for (const e of enemies) {
    for (const a of e.abilities) {
      ids.add(a.abilityId)
    }
  }
  return [...ids].sort()
}

function isWin(outcome: BattleOutcome): boolean {
  return POSITIVE_OUTCOMES.includes(outcome)
}

function addCategory(
  map: Record<string, CategorySummary>,
  key: string,
  result: BattleResult,
): void {
  if (!map[key]) {
    map[key] = { count: 0, wins: 0, winRate: 0 }
  }
  map[key].count++
  if (isWin(result.outcome)) map[key].wins++
}

function finishCategory(map: Record<string, CategorySummary>): void {
  for (const summary of Object.values(map)) {
    summary.winRate = summary.count === 0 ? 0 : summary.wins / summary.count
  }
}

export function runSimulation(options: SimulationOptions): SimulationSummary {
  const seed = options.seed ?? 'sim'
  const count = options.count

  const outcomes: Record<BattleOutcome, number> = {
    victory: 0,
    costlyVictory: 0,
    partialVictory: 0,
    retreat: 0,
    defeat: 0,
    totalLoss: 0,
    stalemate: 0,
  }

  const retreatReasons: Partial<
    Record<RetreatTriggerReason, RetreatReasonSummary>
  > = {}

  const contactResultStats: Partial<
    Record<ContactResultType, CategorySummary>
  > = {}

  const enemyCompositionStats: Record<string, CategorySummary> = {}
  const enemyAbilityStats: Record<string, CategorySummary> = {}

  let totalRounds = 0
  let totalRetreats = 0
  let totalRetreatRounds = 0
  let successfulRetreats = 0
  let totalPartyHpOnRetreat = 0
  let totalMoraleOnRetreat = 0
  let healerIncapRetreats = 0
  let totalEnemyCount = 0
  let totalEnemyThreat = 0
  let totalPartyThreat = 0
  let totalThreatRatio = 0

  const rawResults: BattleResult[] = []

  let fixedParty: Adventurer[] | undefined
  let fixedEncounter: Enemy[] | undefined
  let fixedPartyThreat: number | undefined

  if (options.mode === 'fixed') {
    fixedParty = generateParty(options, seed, 0)
    fixedPartyThreat = calculatePartyThreat(fixedParty)
    fixedEncounter = generateEncounter({
      seed: `${seed}-encounter`,
      partyThreat: fixedPartyThreat,
      difficulty: options.difficulty,
    })
  }

  for (let i = 0; i < count; i++) {
    const party =
      options.mode === 'fixed' ? fixedParty! : generateParty(options, seed, i)
    const partyThreat =
      options.mode === 'fixed' ? fixedPartyThreat! : calculatePartyThreat(party)
    const enemies =
      options.mode === 'fixed'
        ? fixedEncounter!
        : generateEncounter({
            seed: `${seed}-encounter-${i}`,
            partyThreat,
            difficulty: options.difficulty,
          })

    const result = runBattle(
      `${seed}-battle-${i}`,
      party,
      enemies,
      options.context ? { context: options.context } : undefined,
    )

    rawResults.push(result)
    totalRounds += result.rounds
    outcomes[result.outcome]++

    totalEnemyCount += enemies.length
    const enemyThreat = enemies.reduce((sum, e) => sum + e.threatCost, 0)
    totalEnemyThreat += enemyThreat
    totalPartyThreat += partyThreat
    totalThreatRatio += partyThreat === 0 ? 0 : enemyThreat / partyThreat

    addCategory(contactResultStats, result.contactResult.type, result)

    const compKey = enemyCompositionKey(enemies)
    addCategory(enemyCompositionStats, compKey, result)

    for (const abilityId of enemyAbilityIds(enemies)) {
      addCategory(enemyAbilityStats, abilityId, result)
    }

    if (result.retreatDiagnostic) {
      totalRetreats++
      totalRetreatRounds += result.retreatDiagnostic.round
      if (result.retreatDiagnostic.success) successfulRetreats++
      totalPartyHpOnRetreat += result.retreatDiagnostic.partyHpRatio
      totalMoraleOnRetreat += result.retreatDiagnostic.averageMorale
      if (
        result.retreatDiagnostic.matchedReasons.includes(
          'healerLostWithWounded',
        )
      ) {
        healerIncapRetreats++
      }

      const primaryReason = result.retreatDiagnostic.reason
      if (!retreatReasons[primaryReason]) {
        retreatReasons[primaryReason] = { count: 0, percentage: 0 }
      }
      retreatReasons[primaryReason]!.count++
    }
  }

  for (const summary of Object.values(retreatReasons)) {
    if (summary) {
      summary.percentage =
        totalRetreats === 0 ? 0 : summary.count / totalRetreats
    }
  }

  finishCategory(enemyCompositionStats)
  finishCategory(enemyAbilityStats)
  for (const summary of Object.values(contactResultStats)) {
    if (summary) {
      summary.winRate = summary.count === 0 ? 0 : summary.wins / summary.count
    }
  }

  const outcomePercentages: Record<BattleOutcome, number> = {
    victory: 0,
    costlyVictory: 0,
    partialVictory: 0,
    retreat: 0,
    defeat: 0,
    totalLoss: 0,
    stalemate: 0,
  }
  for (const [key, value] of Object.entries(outcomes) as [
    BattleOutcome,
    number,
  ][]) {
    outcomePercentages[key] = count === 0 ? 0 : value / count
  }

  return {
    count,
    outcomes,
    outcomePercentages,
    avgRounds: count === 0 ? 0 : totalRounds / count,
    retreatReasons,
    avgRetreatRound:
      totalRetreats === 0 ? null : totalRetreatRounds / totalRetreats,
    retreatSuccessRate:
      totalRetreats === 0 ? 0 : successfulRetreats / totalRetreats,
    avgPartyHpOnRetreat:
      totalRetreats === 0 ? null : totalPartyHpOnRetreat / totalRetreats,
    avgMoraleOnRetreat:
      totalRetreats === 0 ? null : totalMoraleOnRetreat / totalRetreats,
    healerIncapRetreatRate:
      totalRetreats === 0 ? 0 : healerIncapRetreats / totalRetreats,
    contactResultStats,
    enemyCompositionStats,
    enemyAbilityStats,
    avgEnemyCount: count === 0 ? 0 : totalEnemyCount / count,
    avgEnemyThreat: count === 0 ? 0 : totalEnemyThreat / count,
    avgPartyThreat: count === 0 ? 0 : totalPartyThreat / count,
    avgThreatRatio: count === 0 ? 0 : totalThreatRatio / count,
    rawResults,
  }
}
