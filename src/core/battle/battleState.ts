import { deepClone } from '../util.ts'
import { Adventurer, Enemy, StatusEffect } from '../models/types.ts'

export interface BattleUnit {
  id: string
  name: string
  isAdventurer: boolean
  original: Adventurer | Enemy
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  morale: number
  stats: {
    str: number
    con: number
    dex: number
    int: number
    per: number
    wil: number
    soc: number
  }
  skills: {
    melee: number
    ranged: number
    defense: number
    tactics: number
    attackMagic: number
    defenseMagic: number
    healing: number
    scouting: number
    stealth: number
    trapDetection: number
    trapDisarm: number
    survival: number
    monsterKnowledge: number
    firstAid: number
    leadership: number
  }
  role?: string
  rank?: string
  species?: string
  traits?: { traitId: string; name: string }[]
  abilities?: { abilityId: string; name: string }[]
  weaknesses?: { weaknessId: string; name: string; known: boolean }[]
  behavior?: {
    aggression: number
    caution: number
    targetPreference: string
    retreatThreshold: number
    protectsLeader: boolean
    usesAbilitiesFirst: boolean
  }
  equipment?: {
    weapon: { kind: string; damage: number; element?: string }
    armor: { reduction: number }
  }
  threatCost?: number
  initiative: number
  isAlive: boolean
  escaped: boolean
  statusEffects: StatusEffect[]
  usedAbilities: Set<string>
  isSummoned: boolean
  retreatProposalRejected?: boolean
}

export function createAdventurerUnit(adv: Adventurer): BattleUnit {
  const startHp = adv.currentHp ?? adv.maxHp
  return {
    id: adv.id,
    name: adv.name,
    isAdventurer: true,
    original: deepClone(adv),
    hp: startHp,
    maxHp: adv.maxHp,
    mp: adv.maxMp,
    maxMp: adv.maxMp,
    morale: adv.morale,
    stats: { ...adv.stats },
    skills: { ...adv.skills },
    role: adv.role,
    rank: adv.rank,
    traits: deepClone(adv.traits),
    abilities: undefined,
    weaknesses: undefined,
    behavior: undefined,
    equipment: adv.equipment
      ? {
          weapon: {
            kind: adv.equipment.weapon.kind,
            damage: adv.equipment.weapon.damage,
            element: adv.equipment.weapon.element,
          },
          armor: { reduction: adv.equipment.armor.reduction },
        }
      : undefined,
    initiative: 0,
    isAlive: startHp > 0,
    escaped: false,
    statusEffects: [],
    usedAbilities: new Set<string>(),
    isSummoned: false,
  }
}

export function createEnemyUnit(enemy: Enemy): BattleUnit {
  const startHp = enemy.currentHp ?? enemy.maxHp
  return {
    id: enemy.id,
    name: enemy.name,
    isAdventurer: false,
    original: deepClone(enemy),
    hp: startHp,
    maxHp: enemy.maxHp,
    mp: 0,
    maxMp: 0,
    morale: enemy.morale,
    stats: { ...enemy.stats },
    skills: { ...enemy.skills },
    role: undefined,
    rank: enemy.rank,
    species: enemy.species,
    traits: undefined,
    abilities: deepClone(enemy.abilities),
    weaknesses: deepClone(enemy.weaknesses),
    behavior: { ...enemy.behavior },
    threatCost: enemy.threatCost,
    equipment: enemy.equipment
      ? {
          weapon: {
            kind: enemy.equipment.weapon.kind,
            damage: enemy.equipment.weapon.damage,
            element: enemy.equipment.weapon.element,
          },
          armor: { reduction: enemy.equipment.armor.reduction },
        }
      : undefined,
    initiative: 0,
    isAlive: startHp > 0,
    escaped: false,
    statusEffects: [],
    usedAbilities: new Set<string>(),
    isSummoned: false,
  }
}

export function getAliveAdventurers(state: {
  party: BattleUnit[]
}): BattleUnit[] {
  return state.party.filter((u) => u.isAlive && !u.escaped)
}

export function getAliveEnemies(state: {
  enemies: BattleUnit[]
}): BattleUnit[] {
  return state.enemies.filter((u) => u.isAlive && !u.escaped)
}

export function getAllAliveUnits(state: {
  party: BattleUnit[]
  enemies: BattleUnit[]
}): BattleUnit[] {
  return [...getAliveAdventurers(state), ...getAliveEnemies(state)]
}
