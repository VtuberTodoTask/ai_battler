import { SeededRng } from '../rng/seededRng.ts'
import { clamp } from '../util.ts'
import { BattleUnit } from './battleState.ts'
import { ABILITY_MAP, WEAKNESS_MAP } from '../../data/enemyData.ts'
import { MAX_HIT_CHANCE, MIN_HIT_CHANCE } from '../balance/constants.ts'
import {
  BattleContext,
  StatusEffectType,
  WeaknessInstance,
} from '../models/types.ts'

export interface ActionResult {
  hit: boolean
  critical: boolean
  fumble: boolean
  roll: number
  successChance: number
  damage: number
  damageDealt: number
  statusApplied?: string[]
  message: string
}

export interface AttackOptions {
  modifier?: number
  critMultiplier?: number
  context?: BattleContext
  attackType?: 'melee' | 'ranged' | 'magic'
  isFlank?: boolean
  firstRoundHitBonus?: number
  swarmAllyCount?: number
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
    type: type as StatusEffectType,
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
  if (
    (skill === 'defense' || skill === 'defenseMagic') &&
    hasStatus(unit, 'defenseDown')
  ) {
    value -=
      unit.statusEffects.find((e) => e.type === 'defenseDown')?.value ?? 5
  }
  return clamp(value, 1, 200)
}

export function hasAbility(unit: BattleUnit, abilityId: string): boolean {
  return unit.abilities?.some((a) => a.abilityId === abilityId) ?? false
}

function collectAbilityNumericValues(unit: BattleUnit, key: string): number[] {
  const values: number[] = []
  unit.abilities?.forEach((a) => {
    const def = ABILITY_MAP[a.abilityId]
    const v = def?.effects[key]
    if (typeof v === 'number') values.push(v)
    else if (typeof v === 'string' && !Number.isNaN(Number(v)))
      values.push(Number(v))
  })
  return values
}

export function sumAbilityNumeric(unit: BattleUnit, key: string): number {
  const values = collectAbilityNumericValues(unit, key)
  return values.reduce((a, b) => a + b, 0)
}

export function getAbilityNumeric(
  unit: BattleUnit,
  key: string,
  fallback = 0,
): number {
  const values = collectAbilityNumericValues(unit, key)
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : fallback
}

export function getAbilityBoolean(unit: BattleUnit, key: string): boolean {
  return (
    unit.abilities?.some((a) => {
      const def = ABILITY_MAP[a.abilityId]
      const v = def?.effects[key]
      return v === true || v === 1 || v === 'true'
    }) ?? false
  )
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

function isWeaknessKnownForAttacker(
  attacker: BattleUnit,
  weakness: WeaknessInstance,
): boolean {
  if (attacker.isAdventurer) return weakness.known
  // Enemies do not have adventurer weaknesses, but treat them as known if used.
  return true
}

function applyWeaknessEffects(
  rng: SeededRng,
  attacker: BattleUnit,
  defender: BattleUnit,
  attackType: 'melee' | 'ranged' | 'magic',
  context: BattleContext,
  isFlank: boolean,
  element: string,
): { multiplier: number; statuses: string[] } {
  let multiplier = 1
  const statuses: string[] = []

  if (!defender.weaknesses) return { multiplier, statuses }

  for (const w of defender.weaknesses) {
    if (!isWeaknessKnownForAttacker(attacker, w)) continue
    const def = WEAKNESS_MAP[w.weaknessId]
    if (!def) continue

    if (def.element && def.element === element) {
      multiplier = Math.max(multiplier, def.multiplier ?? 1.5)
    }
    if (def.id === 'rearAttack' && isFlank && def.multiplier) {
      multiplier = Math.max(multiplier, def.multiplier)
    }

    if (!def.effect) continue

    switch (def.effect) {
      case 'defenseDown': {
        if (def.id === 'water' && context.water) {
          const value = Math.round((def.multiplier ?? 1.2) * 5)
          addStatus(defender, 'defenseDown', 2, value, attacker.id)
          statuses.push('defenseDown')
        }
        break
      }
      case 'stunChance': {
        const condition =
          (def.id === 'brightLight' && context.lighting === 'bright') ||
          (def.id === 'smoke' && context.smoke) ||
          (def.id === 'flightImpairment' &&
            attackType === 'ranged' &&
            hasAbility(defender, 'flight'))
        if (condition) {
          const chance = Math.round((def.multiplier ?? 1.2) * 20)
          if (rng.chance(chance)) {
            addStatus(defender, 'stunned', 1, 0, attacker.id)
            statuses.push('stunned')
          }
        }
        break
      }
      case 'fleeChance': {
        if (def.id === 'loudNoise' && context.noise >= 50) {
          const chance = Math.round((def.multiplier ?? 1.2) * 20)
          if (rng.chance(chance)) {
            addStatus(defender, 'frightened', 2, 5, attacker.id)
            statuses.push('frightened')
          }
        }
        break
      }
      case 'disable': {
        if (
          def.id === 'flightImpairment' &&
          attackType === 'ranged' &&
          hasAbility(defender, 'flight')
        ) {
          const chance = Math.round((def.multiplier ?? 1.2) * 20)
          if (rng.chance(chance)) {
            addStatus(defender, 'stunned', 1, 0, attacker.id)
            statuses.push('stunned')
          }
        }
        break
      }
      case 'moraleDown': {
        // commanderLoss is triggered by leader death, handled in morale.
        break
      }
      case 'damage': {
        if (def.multiplier) multiplier = Math.max(multiplier, def.multiplier)
        break
      }
    }
  }

  return { multiplier, statuses }
}

export function rollAttack(
  rng: SeededRng,
  attacker: BattleUnit,
  defender: BattleUnit,
  attackerSkill: keyof BattleUnit['skills'],
  defenderSkill: keyof BattleUnit['skills'],
  damageBase: number,
  element: string,
  options: AttackOptions = {},
): ActionResult {
  const {
    modifier = 0,
    critMultiplier = 1.5,
    context = {
      lighting: 'normal',
      noise: 0,
      water: false,
      smoke: false,
    },
    attackType = 'melee',
    isFlank = false,
    firstRoundHitBonus = 0,
    swarmAllyCount = 0,
  } = options

  let hitModifier = modifier
  if (firstRoundHitBonus > 0 && attacker.isAdventurer) {
    hitModifier += firstRoundHitBonus
  }
  if (attackType === 'melee' && hasAbility(defender, 'flight')) {
    const evadeValue = getAbilityNumeric(defender, 'evadeMelee', 1)
    hitModifier -= evadeValue * 40
  }
  if (hasStatus(attacker, 'stealthed')) hitModifier += 10
  if (hasStatus(attacker, 'frightened')) hitModifier -= 5
  if (hasStatus(defender, 'frightened')) hitModifier += 5

  const chance = calculateHitChance(
    attacker,
    defender,
    attackerSkill,
    defenderSkill,
    hitModifier,
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
      successChance: chance,
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

  const physicalReduction = getAbilityNumeric(defender, 'physicalReduction', 0)
  const magicReduction = getAbilityNumeric(defender, 'magicReduction', 0)
  if (
    attackType !== 'magic' &&
    element === 'physical' &&
    physicalReduction > 0
  ) {
    reduction += physicalReduction
  }
  if (attackType === 'magic' && magicReduction > 0) {
    reduction += magicReduction
  }

  if (
    attackType !== 'magic' &&
    !isFlank &&
    hasAbility(defender, 'frontDefense')
  ) {
    reduction += getAbilityNumeric(defender, 'frontReduction', 0)
  }

  const weaknessResult = applyWeaknessEffects(
    rng,
    attacker,
    defender,
    attackType,
    context,
    isFlank,
    element,
  )
  const multiplier = weaknessResult.multiplier
  const appliedStatuses = [...weaknessResult.statuses]

  let final = Math.max(1, raw - reduction) * multiplier
  if (critical) final *= critMultiplier

  if (context.lighting === 'dark' && hasAbility(attacker, 'darknessBoost')) {
    final += getAbilityNumeric(attacker, 'darkAttackBonus', 0)
  }
  if (hasAbility(attacker, 'swarmCoordination') && swarmAllyCount > 0) {
    final += getAbilityNumeric(attacker, 'swarmBonus', 0) * swarmAllyCount
  }

  final = Math.max(1, Math.round(final))
  defender.hp -= final

  const poisonChance = getAbilityNumeric(attacker, 'poisonChance', 0)
  if (hasAbility(attacker, 'poisonAttack') && poisonChance > 0) {
    if (rng.chance(Math.round(poisonChance * 100))) {
      addStatus(
        defender,
        'poisoned',
        3,
        getAbilityNumeric(attacker, 'poisonDamage', 3),
        attacker.id,
      )
      appliedStatuses.push('poisoned')
    }
  }
  const bleedChance = getAbilityNumeric(attacker, 'bleedChance', 0)
  if (hasAbility(attacker, 'bleedAttack') && bleedChance > 0) {
    if (rng.chance(Math.round(bleedChance * 100))) {
      addStatus(
        defender,
        'bleeding',
        3,
        getAbilityNumeric(attacker, 'bleedDamage', 3),
        attacker.id,
      )
      appliedStatuses.push('bleeding')
    }
  }
  const fearChance = getAbilityNumeric(attacker, 'fearChance', 0)
  if (hasAbility(attacker, 'fear') && fearChance > 0) {
    if (rng.chance(Math.round(fearChance * 100))) {
      addStatus(defender, 'frightened', 3, 5, attacker.id)
      appliedStatuses.push('frightened')
    }
  }

  return {
    hit,
    critical,
    fumble,
    roll,
    successChance: chance,
    damage: raw,
    damageDealt: final,
    statusApplied: appliedStatuses,
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
  if (hasStatus(target, 'healBlocked')) return 0
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
