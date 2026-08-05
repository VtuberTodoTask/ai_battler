import {
  BattleUnit,
  getAliveAdventurers,
  getAliveEnemies,
} from './battleState.ts'
import { TRAIT_MAP } from '../../data/traits.ts'
import { ADVENTURER_THREAT } from '../balance/constants.ts'
import { clamp } from '../util.ts'

export function adjustMorale(unit: BattleUnit, delta: number): void {
  unit.morale = clamp(unit.morale + delta, 0, 100)
}

export function onAllyIncapacitated(
  unit: BattleUnit,
  fallen: BattleUnit,
  isLeader = false,
): void {
  if (fallen.isAdventurer === unit.isAdventurer) {
    adjustMorale(unit, isLeader ? -15 : -8)
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

export function shouldPartyRetreat(
  party: BattleUnit[],
  enemies: BattleUnit[],
  _round: number,
): boolean {
  const alive = getAliveAdventurers({ party } as { party: BattleUnit[] })
  const total = party.length
  const incapacitated = party.filter((u) => !u.isAlive || u.escaped).length
  const healerAlive = party.some(
    (u) => u.role === 'healer' && u.isAlive && !u.escaped,
  )
  const hasWounded = alive.some((u) => u.hp < u.maxHp * 0.5)
  const hpRatio = partyTotalHpRatio(party)
  const avgMorale = averagePartyMorale(party)
  const leader = getLeader(party)
  const thresholdModifier =
    leader?.traits?.reduce((sum, t) => {
      const effect = TRAIT_MAP[t.traitId]?.effects?.retreatThresholdModifier
      return sum + (typeof effect === 'number' ? effect : 0)
    }, 0) ?? 0
  const threshold = 30 + thresholdModifier

  if (incapacitated >= total * 0.5) return true
  if (!healerAlive && hasWounded) return true
  if (hpRatio <= 0.25) return true
  if (avgMorale <= threshold) return true

  const enemyThreat = getAliveEnemies({ enemies } as {
    enemies: BattleUnit[]
  }).reduce((sum, e) => sum + (e.threatCost ?? 1), 0)
  const partyThreat = alive.reduce((sum, u) => {
    const rank = (u.original as { rank: keyof typeof ADVENTURER_THREAT }).rank
    return sum + ADVENTURER_THREAT[rank]
  }, 0)
  if (enemyThreat >= partyThreat * 2 && partyThreat > 0) return true

  return false
}

export function shouldEnemyRetreat(
  enemies: BattleUnit[],
  _party: BattleUnit[],
): boolean {
  const alive = getAliveEnemies({ enemies } as { enemies: BattleUnit[] })
  if (alive.length === 0) return false
  const mindless = alive.some(
    (e) => e.species === 'undead' || e.species === 'construct',
  )
  if (mindless) return false

  const total = enemies.length
  const incapacitated = enemies.filter((e) => !e.isAlive || e.escaped).length
  if (incapacitated >= total * 0.5) return true

  const avg = averageEnemyMorale(enemies)
  const threshold =
    alive.reduce((sum, e) => sum + (e.behavior?.retreatThreshold ?? 25), 0) /
    alive.length
  if (avg <= threshold * 0.6) return true

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
  return clamp(5, 95, leadership + retreater.stats.wil - avgWil - enemyPursuit)
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((a, b) => a + b, 0) / values.length
}
