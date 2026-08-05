import {
  BattleUnit,
  getAliveAdventurers,
  getAliveEnemies,
} from './battleState.ts'
import { TRAIT_MAP } from '../../data/traits.ts'
import { ADVENTURER_THREAT } from '../balance/constants.ts'
import { clamp } from '../util.ts'
import {
  Personality,
  RetreatDiagnostic,
  RetreatTriggerReason,
} from '../models/types.ts'

export function adjustMorale(unit: BattleUnit, delta: number): void {
  unit.morale = clamp(unit.morale + delta, 0, 100)
}

export function onAllyIncapacitated(
  unit: BattleUnit,
  fallen: BattleUnit,
  isLeader = false,
): void {
  if (fallen.isAdventurer === unit.isAdventurer) {
    const leaderPenalty = isLeader ? -20 : -10
    adjustMorale(unit, leaderPenalty)

    if (isLeader && !fallen.isAdventurer) {
      const commanderLoss = unit.weaknesses?.some(
        (w) => w.weaknessId === 'commanderLoss',
      )
      if (commanderLoss) adjustMorale(unit, -15)
    }
  }
}

export function averagePartyMorale(party: BattleUnit[]): number {
  const alive = party.filter((u) => u.isAlive && !u.escaped)
  if (alive.length === 0) return 0
  return alive.reduce((sum, u) => sum + u.morale, 0) / alive.length
}

export function averageEnemyMorale(enemies: BattleUnit[]): number {
  const alive = enemies.filter((u) => u.isAlive && !u.escaped)
  if (alive.length === 0) return 0
  return alive.reduce((sum, u) => sum + u.morale, 0) / alive.length
}

export function partyTotalHpRatio(party: BattleUnit[]): number {
  const alive = party.filter((u) => u.isAlive && !u.escaped)
  if (alive.length === 0) return 0
  return alive.reduce((sum, u) => sum + u.hp / u.maxHp, 0) / alive.length
}

export function enemyTotalHpRatio(enemies: BattleUnit[]): number {
  const alive = enemies.filter((u) => u.isAlive && !u.escaped)
  if (alive.length === 0) return 0
  return alive.reduce((sum, u) => sum + u.hp / u.maxHp, 0) / alive.length
}

export function getLeader(party: BattleUnit[]): BattleUnit | undefined {
  return party
    .filter((u) => u.isAlive && !u.escaped)
    .sort((a, b) => b.skills.leadership - a.skills.leadership)[0]
}

export function getEnemyLeader(enemies: BattleUnit[]): BattleUnit | undefined {
  return enemies
    .filter((u) => u.isAlive && !u.escaped)
    .sort((a, b) => b.skills.leadership - a.skills.leadership)[0]
}

function personalityMod(
  unit: BattleUnit | undefined,
  key: keyof Personality,
): number {
  const original = unit?.original
  if (original && 'personality' in original) {
    return (original as { personality: Personality }).personality[key] ?? 0
  }
  return 0
}

export interface PartyRetreatEvaluation {
  should: boolean
  diagnostic: RetreatDiagnostic
}

export function evaluatePartyRetreat(
  party: BattleUnit[],
  enemies: BattleUnit[],
  round: number,
): PartyRetreatEvaluation {
  const alive = getAliveAdventurers({ party } as { party: BattleUnit[] })
  const total = party.length
  const incapacitated = party.filter((u) => !u.isAlive && !u.escaped).length
  const healerAlive = party.some(
    (u) => u.role === 'healer' && u.isAlive && !u.escaped,
  )
  const hasWounded = alive.some((u) => u.hp < u.maxHp * 0.5)
  const hpRatio = partyTotalHpRatio(party)
  const avgMorale = averagePartyMorale(party)
  const leader = getLeader(party)

  const traitModifier =
    leader?.traits?.reduce((sum, t) => {
      const effect = TRAIT_MAP[t.traitId]?.effects?.retreatThresholdModifier
      return sum + (typeof effect === 'number' ? effect : 0)
    }, 0) ?? 0

  const bravery = personalityMod(leader, 'bravery')
  const caution = personalityMod(leader, 'caution')
  const greed = personalityMod(leader, 'greed')
  const discipline = personalityMod(leader, 'discipline')

  const moraleThreshold =
    30 +
    traitModifier -
    bravery * 1.5 +
    caution * 1.0 -
    greed * 0.8 -
    discipline * 0.5

  const retreatHpThreshold =
    0.25 - bravery * 0.015 + caution * 0.015 - greed * 0.015 - discipline * 0.01

  const enemyThreat = getAliveEnemies({ enemies } as {
    enemies: BattleUnit[]
  }).reduce((sum, e) => sum + (e.threatCost ?? 1), 0)
  const partyThreat = alive.reduce((sum, u) => {
    const rank = (u.original as { rank: keyof typeof ADVENTURER_THREAT }).rank
    return sum + ADVENTURER_THREAT[rank]
  }, 0)

  const matchedReasons: RetreatTriggerReason[] = []
  if (incapacitated > total / 2) matchedReasons.push('halfIncapacitated')
  if (!healerAlive && hasWounded) matchedReasons.push('healerLostWithWounded')
  if (hpRatio <= retreatHpThreshold) matchedReasons.push('lowPartyHp')
  if (avgMorale <= moraleThreshold) matchedReasons.push('lowMorale')
  if (enemyThreat >= partyThreat * 2 && partyThreat > 0)
    matchedReasons.push('overwhelmed')

  const should = matchedReasons.length > 0

  const diagnostic: RetreatDiagnostic = {
    reason: matchedReasons[0] ?? 'memberProposal',
    round,
    success: false,
    successChance: 0,
    roll: 0,
    aliveCount: alive.length,
    incapacitatedCount: incapacitated,
    healerAlive,
    partyHpRatio: hpRatio,
    averageMorale: avgMorale,
    moraleThreshold,
    retreatHpThreshold,
    partyThreat,
    enemyThreat,
    matchedReasons,
  }

  return { should, diagnostic }
}

export function shouldPartyRetreat(
  party: BattleUnit[],
  enemies: BattleUnit[],
  round: number,
): boolean {
  return evaluatePartyRetreat(party, enemies, round).should
}

export function shouldEnemyRetreat(
  enemies: BattleUnit[],
  _party: BattleUnit[],
): boolean {
  const alive = getAliveEnemies({ enemies } as { enemies: BattleUnit[] })
  if (alive.length === 0) return false
  const allMindless = alive.every(
    (e) => e.species === 'undead' || e.species === 'construct',
  )
  if (allMindless) return false

  const total = enemies.length
  const incapacitated = enemies.filter((e) => !e.isAlive || e.escaped).length
  if (incapacitated >= total * 0.5) return true

  const avg = averageEnemyMorale(enemies)
  const threshold =
    alive.reduce((sum, e) => sum + (e.behavior?.retreatThreshold ?? 25), 0) /
    alive.length

  const allLeader = [...enemies].sort(
    (a, b) => b.skills.leadership - a.skills.leadership,
  )[0]
  const leaderDead = allLeader !== undefined && !allLeader.isAlive
  const commanderLossBonus =
    leaderDead &&
    alive.some((e) =>
      e.weaknesses?.some((w) => w.weaknessId === 'commanderLoss'),
    )
      ? 15
      : 0

  if (avg <= threshold * 0.3 + commanderLossBonus) return true

  if (avg <= threshold * 0.6 + commanderLossBonus) return true

  return false
}

export function calculateRetreatChance(
  retreater: BattleUnit,
  pursuers: BattleUnit[],
): number {
  const leadership = retreater.skills.leadership
  const avgWil = average(pursuers.map((u) => u.stats.wil))
  const avgDex = average(pursuers.map((u) => u.stats.dex))
  const enemyPursuit = Math.max(0, (avgDex - retreater.stats.dex) / 2)

  const bravery = personalityMod(retreater, 'bravery')
  const caution = personalityMod(retreater, 'caution')
  const discipline = personalityMod(retreater, 'discipline')
  const greed = personalityMod(retreater, 'greed')

  const chance =
    leadership +
    retreater.stats.wil -
    avgWil -
    enemyPursuit +
    bravery * 2 +
    discipline * 1 -
    caution * 2 -
    greed * 1

  return clamp(chance, 5, 95)
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((a, b) => a + b, 0) / values.length
}
