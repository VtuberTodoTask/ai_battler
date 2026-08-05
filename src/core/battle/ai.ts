import {
  BattleUnit,
  getAliveAdventurers,
  getAliveEnemies,
} from './battleState.ts'
import { hasStatus } from './actions.ts'
import { ABILITY_MAP } from '../../data/enemyData.ts'
import { Personality } from '../models/types.ts'

export type ActionType =
  | 'attack'
  | 'ranged'
  | 'magic'
  | 'heal'
  | 'guard'
  | 'support'
  | 'retreat'
  | 'revive'
  | 'summon'
  | 'healBlock'
  | 'flank'

export interface DecidedAction {
  action: ActionType
  target?: BattleUnit
  spellElement?: string
  isFlank?: boolean
  abilityId?: string
}

interface AiState {
  party: BattleUnit[]
  enemies: BattleUnit[]
  round: number
  leaderTargetId?: string
}

function getPersonality(unit: BattleUnit): Personality | undefined {
  const original = unit.original
  if (original && 'personality' in original) {
    return (original as { personality: Personality }).personality
  }
  return undefined
}

function personalityValue(unit: BattleUnit, key: keyof Personality): number {
  return getPersonality(unit)?.[key] ?? 0
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

function knownWeaknessTarget(units: BattleUnit[]): BattleUnit | undefined {
  return units.find((u) => u.isAlive && u.weaknesses?.some((w) => w.known))
}

function tauntTarget(units: BattleUnit[]): BattleUnit | undefined {
  return units.find(
    (u) =>
      u.isAlive &&
      !u.escaped &&
      u.abilities?.some((a) => {
        const def = ABILITY_MAP[a.abilityId]
        return def?.effects.taunt === 1 || def?.effects.taunt === true
      }),
  )
}

function selectEnemyTargetForAdventurer(
  unit: BattleUnit,
  enemies: BattleUnit[],
  leaderTargetId?: string,
): BattleUnit | undefined {
  const alive = enemies.filter((e) => e.isAlive && !e.escaped)
  if (alive.length === 0) return undefined

  const discipline = personalityValue(unit, 'discipline')
  if (leaderTargetId && discipline > 0) {
    const leaderTarget = alive.find((e) => e.id === leaderTargetId)
    if (leaderTarget) return leaderTarget
  }

  const taunt = tauntTarget(alive)
  if (taunt) return taunt

  switch (unit.role) {
    case 'vanguard':
      return lowestHp(alive) ?? highestThreat(alive) ?? alive[0]
    case 'guardian':
      return highestThreat(alive) ?? alive[0]
    case 'scout': {
      const rearWeak = alive.find((e) =>
        e.weaknesses?.some((w) => w.weaknessId === 'rearAttack' && w.known),
      )
      if (rearWeak) return rearWeak
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
      const withKnownWeakness = knownWeaknessTarget(alive)
      return withKnownWeakness ?? highestThreat(alive) ?? alive[0]
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
  const altruism = personalityValue(healer, 'altruism')
  const greed = personalityValue(healer, 'greed')
  const threshold = 0.5 - altruism * 0.03 + greed * 0.02
  const wounded = allies.filter(
    (u) => u.isAlive && !u.escaped && u.hp < u.maxHp * threshold,
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

function selectWoundedForRescue(
  unit: BattleUnit,
  allies: BattleUnit[],
): BattleUnit | undefined {
  const altruism = personalityValue(unit, 'altruism')
  if (altruism <= 0) return undefined
  const down = allies.find((u) => !u.isAlive && !u.escaped && u.hp > -20)
  return down
}

export function decideAdventurerAction(
  unit: BattleUnit,
  state: AiState,
): DecidedAction {
  const enemies = getAliveEnemies(state)
  const allies = getAliveAdventurers(state)
  if (enemies.length === 0 || allies.length === 0) return { action: 'retreat' }

  const hpRatio = unit.hp / unit.maxHp
  const personality = getPersonality(unit)

  const bravery = personality?.bravery ?? 0
  const caution = personality?.caution ?? 0
  const cooperation = personality?.cooperation ?? 0
  const altruism = personality?.altruism ?? 0
  const greed = personality?.greed ?? 0
  const discipline = personality?.discipline ?? 0

  const retreatHpThreshold =
    0.25 - bravery * 0.015 + caution * 0.015 + greed * 0.01 - discipline * 0.01

  if (unit.role === 'healer') {
    const downed = selectWoundedForRescue(unit, state.party)
    if (downed && altruism > 0 && unit.mp >= 3) {
      return { action: 'heal', target: downed }
    }
    const target = selectAllyForHeal(unit, allies)
    if (target && unit.mp >= 3) return { action: 'heal', target }
    const poisoned = allies.find(
      (u) => hasStatus(u, 'poisoned') || hasStatus(u, 'bleeding'),
    )
    if (poisoned && unit.mp >= 3) return { action: 'heal', target: poisoned }
    const low = allies.find((u) => u.hp < u.maxHp)
    if (low && unit.mp >= 3) return { action: 'heal', target: low }
    const enemy = selectEnemyTargetForAdventurer(
      unit,
      enemies,
      state.leaderTargetId,
    )
    if (enemy) return { action: 'attack', target: enemy }
    return { action: 'retreat' }
  }

  if (unit.role === 'support') {
    const lowMorale = allies.find((u) => u.morale < 40)
    if (lowMorale) return { action: 'support', target: lowMorale }
    if (cooperation > 0 || altruism > 0 || caution > 0) {
      const wounded = selectAllyForGuard(unit, allies)
      if (wounded && unit.hp / unit.maxHp > 0.3)
        return { action: 'guard', target: wounded }
    }
    const enemy = selectEnemyTargetForAdventurer(
      unit,
      enemies,
      state.leaderTargetId,
    )
    if (enemy) return { action: 'attack', target: enemy }
    return { action: 'retreat' }
  }

  if (unit.role === 'guardian') {
    if (cooperation > 0 || caution > 0) {
      const wounded = selectAllyForGuard(unit, allies)
      if (wounded && unit.hp / unit.maxHp > 0.3)
        return { action: 'guard', target: wounded }
    }
  }

  if (unit.role === 'mage') {
    const target = selectEnemyTargetForAdventurer(
      unit,
      enemies,
      state.leaderTargetId,
    )
    if (target && unit.mp >= 5) return { action: 'magic', target }
  }

  if (unit.role === 'scout') {
    const rearWeak = enemies.find((e) =>
      e.weaknesses?.some((w) => w.weaknessId === 'rearAttack' && w.known),
    )
    if (rearWeak) return { action: 'flank', target: rearWeak, isFlank: true }
  }

  if (hpRatio < retreatHpThreshold && unit.role !== 'guardian') {
    if (unit.role === 'ranger') {
      const enemy = selectEnemyTargetForAdventurer(
        unit,
        enemies,
        state.leaderTargetId,
      )
      if (enemy) return { action: 'ranged', target: enemy }
    }
    return { action: 'retreat' }
  }

  if (unit.role === 'ranger' && unit.equipment?.weapon?.kind === 'ranged') {
    const target = selectEnemyTargetForAdventurer(
      unit,
      enemies,
      state.leaderTargetId,
    )
    if (target) return { action: 'ranged', target }
  }

  const target = selectEnemyTargetForAdventurer(
    unit,
    enemies,
    state.leaderTargetId,
  )
  if (target) {
    if (unit.role === 'scout') return { action: 'flank', target, isFlank: true }
    return { action: 'attack', target }
  }
  return { action: 'retreat' }
}

function findDeadAlly(enemies: BattleUnit[]): BattleUnit | undefined {
  return enemies.find((e) => !e.isAlive && !e.escaped)
}

function findHealerTarget(party: BattleUnit[]): BattleUnit | undefined {
  return party.find(
    (u) => u.isAlive && (u.role === 'healer' || u.role === 'support'),
  )
}

export function decideEnemyAction(
  unit: BattleUnit,
  state: AiState,
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

  const abilities = unit.abilities ?? []

  if (unit.behavior?.usesAbilitiesFirst && abilities.length > 0) {
    for (const ability of abilities) {
      const def = ABILITY_MAP[ability.abilityId]
      if (!def) continue

      if (def.effects.reviveHeal !== undefined) {
        const dead = findDeadAlly(state.enemies)
        if (dead) {
          return {
            action: 'revive',
            target: dead,
            abilityId: ability.abilityId,
          }
        }
      }

      if (def.effects.summonCount !== undefined) {
        const aliveEnemies = getAliveEnemies(state)
        if (aliveEnemies.length < 12) {
          return { action: 'summon', abilityId: ability.abilityId }
        }
      }

      if (def.effects.healBlock === 1 || def.effects.healBlock === true) {
        const healer = findHealerTarget(party)
        if (healer) {
          return {
            action: 'healBlock',
            target: healer,
            abilityId: ability.abilityId,
          }
        }
      }

      if (def.effects.fearChance !== undefined) {
        return { action: 'magic', target, abilityId: ability.abilityId }
      }
    }
  }

  return { action: 'attack', target }
}
