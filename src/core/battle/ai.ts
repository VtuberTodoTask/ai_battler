import {
  BattleUnit,
  getAliveAdventurers,
  getAliveEnemies,
} from './battleState.ts'
import { hasStatus } from './actions.ts'
import { ABILITY_MAP } from '../../data/enemyData.ts'

export type ActionType =
  'attack' | 'ranged' | 'magic' | 'heal' | 'guard' | 'support' | 'retreat'

export interface DecidedAction {
  action: ActionType
  target?: BattleUnit
  spellElement?: string
}

function lowestHp(units: BattleUnit[]): BattleUnit | undefined {
  const alive = units.filter((u) => u.isAlive && !u.escaped)
  if (alive.length === 0) return undefined
  return alive.reduce((a, b) => (a.hp < b.hp ? a : b))
}

function highestThreat(units: BattleUnit[]): BattleUnit | undefined {
  const alive = units.filter((u) => u.isAlive && !u.escaped)
  if (alive.length === 0) return undefined
  return alive.reduce((a, b) => {
    const ta =
      (a.rank === 'S'
        ? 6
        : a.rank === 'A'
          ? 5
          : a.rank === 'B'
            ? 4
            : a.rank === 'C'
              ? 3
              : a.rank === 'D'
                ? 2
                : 1) *
      (a.hp / a.maxHp + 0.5)
    const tb =
      (b.rank === 'S'
        ? 6
        : b.rank === 'A'
          ? 5
          : b.rank === 'B'
            ? 4
            : b.rank === 'C'
              ? 3
              : b.rank === 'D'
                ? 2
                : 1) *
      (b.hp / b.maxHp + 0.5)
    return ta > tb ? a : b
  })
}

function roleTarget(units: BattleUnit[], role: string): BattleUnit | undefined {
  return units.find((u) => u.isAlive && !u.escaped && u.role === role)
}

function selectEnemyTargetForAdventurer(
  unit: BattleUnit,
  enemies: BattleUnit[],
): BattleUnit | undefined {
  const alive = enemies.filter((e) => e.isAlive && !e.escaped)
  if (alive.length === 0) return undefined
  switch (unit.role) {
    case 'vanguard':
      return lowestHp(alive) ?? highestThreat(alive) ?? alive[0]
    case 'guardian':
      return highestThreat(alive) ?? alive[0]
    case 'scout': {
      const controller = alive.find(
        (e) =>
          e.behavior?.targetPreference === 'healer' ||
          e.abilities?.some(
            (a) => a.abilityId === 'revive' || a.abilityId === 'summon',
          ),
      )
      return controller ?? lowestHp(alive) ?? alive[0]
    }
    case 'ranger': {
      const flying = alive.find((e) =>
        e.abilities?.some((a) => a.abilityId === 'flight'),
      )
      return flying ?? lowestHp(alive) ?? alive[0]
    }
    case 'mage': {
      const withWeakness = alive.find(
        (e) => e.weaknesses && e.weaknesses.length > 0,
      )
      return withWeakness ?? highestThreat(alive) ?? alive[0]
    }
    case 'healer':
    case 'support':
      return lowestHp(alive) ?? alive[0]
    default:
      return alive[0]
  }
}

function selectAllyForHeal(
  healer: BattleUnit,
  allies: BattleUnit[],
): BattleUnit | undefined {
  const wounded = allies.filter(
    (u) => u.isAlive && !u.escaped && u.hp < u.maxHp * 0.5,
  )
  if (wounded.length === 0) return undefined
  return wounded.reduce((a, b) => (a.hp / a.maxHp < b.hp / b.maxHp ? a : b))
}

function selectAllyForGuard(
  guard: BattleUnit,
  allies: BattleUnit[],
): BattleUnit | undefined {
  const wounded = allies.filter(
    (u) => u.isAlive && !u.escaped && u.hp < u.maxHp * 0.5 && u.id !== guard.id,
  )
  return (
    wounded[0] ??
    allies.find((u) => u.isAlive && !u.escaped && u.id !== guard.id)
  )
}

export function decideAdventurerAction(
  unit: BattleUnit,
  state: { party: BattleUnit[]; enemies: BattleUnit[]; round: number },
): DecidedAction {
  const enemies = getAliveEnemies(state)
  const allies = getAliveAdventurers(state)
  if (enemies.length === 0 || allies.length === 0) return { action: 'retreat' }

  const hpRatio = unit.hp / unit.maxHp

  if (unit.role === 'healer') {
    const target = selectAllyForHeal(unit, allies)
    if (target && unit.mp >= 3) return { action: 'heal', target }
    const poisoned = allies.find(
      (u) => hasStatus(u, 'poisoned') || hasStatus(u, 'bleeding'),
    )
    if (poisoned && unit.mp >= 3) return { action: 'heal', target: poisoned }
    if (unit.role === 'healer' && unit.mp >= 3 && allies.length > 0) {
      const low = allies.find((u) => u.hp < u.maxHp)
      if (low) return { action: 'heal', target: low }
    }
    const enemy = selectEnemyTargetForAdventurer(unit, enemies)
    if (enemy) return { action: 'attack', target: enemy }
    return { action: 'retreat' }
  }

  if (unit.role === 'support') {
    const lowMorale = allies.find((u) => u.morale < 40)
    if (lowMorale) return { action: 'support', target: lowMorale }
    const wounded = selectAllyForGuard(unit, allies)
    if (wounded) return { action: 'guard', target: wounded }
    const enemy = selectEnemyTargetForAdventurer(unit, enemies)
    if (enemy) return { action: 'attack', target: enemy }
    return { action: 'retreat' }
  }

  if (unit.role === 'guardian') {
    const wounded = selectAllyForGuard(unit, allies)
    if (wounded && unit.hp / unit.maxHp > 0.3)
      return { action: 'guard', target: wounded }
  }

  if (unit.role === 'mage') {
    if (unit.mp >= 5 && enemies.length >= 2) {
      return { action: 'magic', target: enemies[0] }
    }
    const target = selectEnemyTargetForAdventurer(unit, enemies)
    if (target && unit.mp >= 5) return { action: 'magic', target }
  }

  if (hpRatio < 0.25 && unit.role !== 'guardian') {
    if (unit.role === 'ranger') {
      const enemy = selectEnemyTargetForAdventurer(unit, enemies)
      if (enemy) return { action: 'ranged', target: enemy }
    }
    return { action: 'retreat' }
  }

  if (unit.role === 'ranger' && unit.equipment?.weapon?.kind === 'ranged') {
    const target = selectEnemyTargetForAdventurer(unit, enemies)
    if (target) return { action: 'ranged', target }
  }

  const target = selectEnemyTargetForAdventurer(unit, enemies)
  if (target) return { action: 'attack', target }
  return { action: 'retreat' }
}

export function decideEnemyAction(
  unit: BattleUnit,
  state: { party: BattleUnit[]; enemies: BattleUnit[]; round: number },
): DecidedAction {
  const party = getAliveAdventurers(state)
  if (party.length === 0) return { action: 'retreat' }

  const pref = unit.behavior?.targetPreference ?? 'random'
  let target: BattleUnit | undefined
  switch (pref) {
    case 'lowestHp':
      target = lowestHp(party) ?? party[0]
      break
    case 'highestThreat':
      target = highestThreat(party) ?? party[0]
      break
    case 'healer':
      target = roleTarget(party, 'healer') ?? lowestHp(party) ?? party[0]
      break
    case 'mage':
      target = roleTarget(party, 'mage') ?? lowestHp(party) ?? party[0]
      break
    case 'frontline': {
      const front = party.find(
        (u) => u.role === 'vanguard' || u.role === 'guardian',
      )
      target = front ?? party[0]
      break
    }
    default:
      target = party[0]
  }

  if (
    unit.behavior?.usesAbilitiesFirst &&
    unit.abilities &&
    unit.abilities.length > 0
  ) {
    const ability = unit.abilities[0]
    const def = ABILITY_MAP[ability.abilityId]
    if (def?.effects.healBlock || def?.effects.fearChance) {
      return { action: 'magic', target }
    }
  }

  return { action: 'attack', target }
}
