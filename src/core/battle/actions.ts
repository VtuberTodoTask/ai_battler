import { SeededRng } from '../rng/seededRng.ts'
import { clamp } from '../util.ts'
import { BattleUnit } from './battleState.ts'
import { WEAKNESS_MAP } from '../../data/enemyData.ts'
import { MAX_HIT_CHANCE, MIN_HIT_CHANCE } from '../balance/constants.ts'

export interface ActionResult {
  hit: boolean
  critical: boolean
  fumble: boolean
  roll: number
  damage: number
  damageDealt: number
  statusApplied?: string[]
  message: string
}

export function hasStatus(unit: BattleUnit, type: string): boolean {
  return unit.statusEffects.some((e) => e.type === type)
}

export function removeStatus(unit: BattleUnit, type: string): void {
  unit.statusEffects = unit.statusEffects.filter((e) => e.type !== type)
}

export function addStatus(
  unit: BattleUnit,
  type: string,
  duration: number,
  value?: number,
  sourceId?: string,
): void {
  const existing = unit.statusEffects.find((e) => e.type === type)
  if (existing) {
    existing.duration = Math.max(existing.duration, duration)
    if (value !== undefined) existing.value = value
    return
  }
  unit.statusEffects.push({
    type: type as
      | 'poisoned'
      | 'bleeding'
      | 'stunned'
      | 'weakened'
      | 'guarded'
      | 'frightened',
    duration,
    value,
    sourceId: sourceId ?? 'system',
  })
}

export function getSkill(
  unit: BattleUnit,
  skill: keyof BattleUnit['skills'],
): number {
  let value = unit.skills[skill]
  if (hasStatus(unit, 'weakened'))
    value -= unit.statusEffects.find((e) => e.type === 'weakened')?.value ?? 5
  if (hasStatus(unit, 'frightened')) value -= 5
  if (hasStatus(unit, 'guarded'))
    value += unit.statusEffects.find((e) => e.type === 'guarded')?.value ?? 5
  return clamp(value, 1, 200)
}

export function calculateHitChance(
  attacker: BattleUnit,
  defender: BattleUnit,
  attackerSkill: keyof BattleUnit['skills'],
  defenderSkill: keyof BattleUnit['skills'],
  modifier = 0,
): number {
  const atk = getSkill(attacker, attackerSkill)
  const def = getSkill(defender, defenderSkill)
  return clamp(50 + atk - def + modifier, MIN_HIT_CHANCE, MAX_HIT_CHANCE)
}

export function rollAttack(
  rng: SeededRng,
  attacker: BattleUnit,
  defender: BattleUnit,
  attackerSkill: keyof BattleUnit['skills'],
  defenderSkill: keyof BattleUnit['skills'],
  damageBase: number,
  element: string,
  modifier = 0,
  critMultiplier = 1.5,
): ActionResult {
  const chance = calculateHitChance(
    attacker,
    defender,
    attackerSkill,
    defenderSkill,
    modifier,
  )
  const roll = rng.d100()
  const criticalThreshold = Math.max(1, Math.floor(chance / 5))
  const critical = roll <= criticalThreshold
  const hit = roll <= chance
  const fumble = !hit && roll >= 96

  if (!hit) {
    return {
      hit,
      critical,
      fumble,
      roll,
      damage: 0,
      damageDealt: 0,
      message: `${attacker.name} missed`,
    }
  }

  let raw = damageBase + rng.integer(-2, 2)
  raw = Math.max(1, raw)

  let reduction = defender.equipment?.armor?.reduction ?? 0
  if (hasStatus(defender, 'guarded')) {
    reduction +=
      defender.statusEffects.find((e) => e.type === 'guarded')?.value ?? 3
  }
  if (
    defender.abilities?.some((a) => a.abilityId === 'physicalResist') &&
    element === 'physical'
  ) {
    reduction += 4
  }
  if (
    defender.abilities?.some((a) => a.abilityId === 'magicResist') &&
    element !== 'physical'
  ) {
    reduction += 5
  }

  let multiplier = 1
  const weakness = defender.weaknesses?.find((w) => {
    const def = WEAKNESS_MAP[w.weaknessId]
    return def?.element === element || (def?.id === 'rearAttack' && false)
  })
  if (weakness) {
    const def = WEAKNESS_MAP[weakness.weaknessId]
    multiplier = def?.multiplier ?? 1.5
  }

  let final = Math.max(1, raw - reduction) * multiplier
  if (critical) final *= critMultiplier
  final = Math.max(1, Math.round(final))

  defender.hp -= final
  const statuses: string[] = []
  if (attacker.abilities?.some((a) => a.abilityId === 'poisonAttack')) {
    if (rng.chance(30)) {
      addStatus(defender, 'poisoned', 3, 3, attacker.id)
      statuses.push('poisoned')
    }
  }
  if (attacker.abilities?.some((a) => a.abilityId === 'bleedAttack')) {
    if (rng.chance(30)) {
      addStatus(defender, 'bleeding', 3, 3, attacker.id)
      statuses.push('bleeding')
    }
  }
  if (attacker.abilities?.some((a) => a.abilityId === 'fear')) {
    if (rng.chance(25)) {
      addStatus(defender, 'frightened', 3, 5, attacker.id)
      statuses.push('frightened')
    }
  }

  return {
    hit,
    critical,
    fumble,
    roll,
    damage: raw,
    damageDealt: final,
    statusApplied: statuses,
    message: `${attacker.name} hit ${defender.name} for ${final} damage`,
  }
}

export function calculateWeaponDamage(unit: BattleUnit): {
  base: number
  skill: keyof BattleUnit['skills']
  element: string
} {
  const wpn = unit.equipment?.weapon
  if (unit.isAdventurer) {
    if (wpn?.kind === 'ranged') {
      return {
        base: wpn.damage + Math.floor(unit.stats.dex / 15),
        skill: 'ranged',
        element: wpn.element ?? 'physical',
      }
    }
    if (wpn?.kind === 'magic') {
      return {
        base: wpn.damage + Math.floor(unit.stats.int / 12),
        skill: 'attackMagic',
        element: wpn.element ?? 'dark',
      }
    }
    return {
      base: (wpn?.damage ?? 4) + Math.floor(unit.stats.str / 10),
      skill: 'melee',
      element: wpn?.element ?? 'physical',
    }
  }

  const melee = unit.skills.melee
  const ranged = unit.skills.ranged
  const magic = unit.skills.attackMagic
  if (ranged > melee && ranged > magic) {
    return {
      base: 3 + Math.floor(unit.stats.dex / 15),
      skill: 'ranged',
      element: 'physical',
    }
  }
  if (magic > melee) {
    return {
      base: 5 + Math.floor(unit.stats.int / 12),
      skill: 'attackMagic',
      element: 'dark',
    }
  }
  return {
    base: 4 + Math.floor(unit.stats.str / 10),
    skill: 'melee',
    element: 'physical',
  }
}

export function healUnit(
  healer: BattleUnit,
  target: BattleUnit,
  power: number,
): number {
  const amount = Math.min(
    target.maxHp - target.hp,
    Math.max(1, Math.round(power)),
  )
  target.hp += amount
  if (hasStatus(target, 'poisoned') || hasStatus(target, 'bleeding')) {
    removeStatus(target, 'poisoned')
    removeStatus(target, 'bleeding')
  }
  return amount
}
