import {
  Adventurer,
  AdventurerRank,
  AdventurerRole,
  Difficulty,
  SkillName,
} from '../models/types.ts'
import {
  CheckResult,
  DiscoveredInformation,
  ExpeditionFeature,
  ExpeditionPhase,
  ExpeditionRequest,
  ExpeditionState,
} from './types.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { clamp } from '../util.ts'
import { getActiveParty, hasFeature } from './state.ts'
import { requestFeaturesFromState } from './information.ts'

export const EXPEDITION_RANK_PENALTY: Record<AdventurerRank, number> = {
  E: 0,
  D: 4,
  C: 8,
  B: 12,
  A: 16,
  S: 20,
}

export function rankPenaltyForRequest(request: ExpeditionRequest): number {
  return EXPEDITION_RANK_PENALTY[request.rank]
}

export function featurePenaltyForSkill(
  features: ExpeditionFeature[],
  skill: SkillName,
): number {
  let penalty = 0
  if (
    (skill === 'trapDetection' || skill === 'scouting') &&
    (hasFeature(features, 'traps') || hasFeature(features, 'ambushRisk'))
  ) {
    penalty += 10
  }
  if (
    (skill === 'scouting' || skill === 'survival') &&
    (hasFeature(features, 'poorVisibility') ||
      hasFeature(features, 'navigationDifficulty'))
  ) {
    penalty += 10
  }
  if (
    (skill === 'survival' || skill === 'melee') &&
    hasFeature(features, 'unstableTerrain')
  ) {
    penalty += skill === 'melee' ? 5 : 10
  }
  if (skill === 'firstAid' && hasFeature(features, 'poisonRisk')) {
    penalty += 10
  }
  if (skill === 'leadership' && hasFeature(features, 'retreatDifficulty')) {
    penalty += 10
  }
  if (skill === 'monsterKnowledge' && hasFeature(features, 'flyingEnemies')) {
    penalty += 5
  }
  return penalty
}

export function roleBonusForSkill(
  party: Adventurer[],
  skill: SkillName,
): number {
  const mapping: Partial<Record<SkillName, AdventurerRole[]>> = {
    trapDetection: ['scout'],
    trapDisarm: ['scout'],
    stealth: ['scout'],
    scouting: ['scout', 'ranger'],
    survival: ['ranger', 'scout'],
    melee: ['vanguard', 'guardian'],
    defense: ['guardian', 'vanguard'],
    firstAid: ['healer'],
    healing: ['healer'],
    leadership: ['support'],
    tactics: ['support', 'vanguard'],
    monsterKnowledge: ['mage'],
    attackMagic: ['mage'],
    defenseMagic: ['mage'],
    ranged: ['ranger'],
  }
  const roles = mapping[skill] ?? []
  return Math.min(
    roles.reduce((sum, role) => sum + roleSkillBonus(party, role, skill), 0),
    25,
  )
}

export function absencePenaltyForSkill(
  party: Adventurer[],
  skill: SkillName,
): number {
  const mapping: Partial<Record<SkillName, AdventurerRole[]>> = {
    trapDetection: ['scout'],
    scouting: ['scout', 'ranger'],
    survival: ['ranger'],
    melee: ['vanguard'],
    firstAid: ['healer'],
    healing: ['healer'],
    leadership: ['support'],
    monsterKnowledge: ['mage'],
    defenseMagic: ['mage'],
  }
  const roles = mapping[skill] ?? []
  let penalty = 0
  for (const role of roles) {
    if (!hasRole(party, role)) penalty += 8
  }
  return penalty
}

export function resolveSkillCheck(
  rng: SeededRng,
  party: Adventurer[],
  state: ExpeditionState,
  phase: ExpeditionPhase,
  skill: SkillName,
  preferredRole: AdventurerRole | undefined,
  difficultyModifier: number,
  rankPenalty: number,
  toolCost = 0,
): {
  result: CheckResult
  primary: Adventurer
  assistants: Adventurer[]
  effectiveValue: number
  roll: number
} {
  const active = getActiveParty(party, state)
  if (active.length === 0) {
    throw new Error(`Cannot resolve ${phase} check: no active party members`)
  }
  const { primary, assistants } = selectResponsible(
    active,
    skill,
    preferredRole,
  )
  const assistance = calculateAssistanceBonus(assistants, skill)

  let equipment = 0
  if (toolCost > 0) {
    if (state.supplies.tools >= toolCost) {
      equipment = calculateEquipmentBonus(toolCost)
      state.supplies.tools -= toolCost
    } else {
      equipment = -10
    }
  }

  const info = calculateInformationBonus(skill, state.information)
  const roleBonus = roleBonusForSkill(active, skill)
  const absencePenalty = absencePenaltyForSkill(active, skill)
  const featurePenalty = featurePenaltyForSkill(
    requestFeaturesFromState(state),
    skill,
  )

  const base = primary.skills[skill]
  const effectiveValue = clamp(
    base +
      assistance +
      equipment +
      info +
      roleBonus -
      difficultyModifier -
      rankPenalty -
      difficultyBasePenalty(
        (state.metadata?.difficulty as Difficulty | undefined) ?? 'normal',
      ) -
      absencePenalty -
      featurePenalty,
    1,
    100,
  )

  const { roll, result } = resolveCheck(rng, effectiveValue)

  return { result, primary, assistants, effectiveValue, roll }
}

export function getRoleMembers(
  party: Adventurer[],
  role: string,
): Adventurer[] {
  return party.filter((a) => a.role === role)
}

export function hasRole(party: Adventurer[], role: string): boolean {
  return party.some((a) => a.role === role)
}

export function roleCount(party: Adventurer[], role: string): number {
  return party.filter((a) => a.role === role).length
}

export interface ResponsibleSelection {
  primary: Adventurer
  assistants: Adventurer[]
}

export function selectResponsible(
  party: Adventurer[],
  skill: SkillName,
  preferredRole?: string,
): ResponsibleSelection {
  const ordered = [...party].sort((a, b) => b.skills[skill] - a.skills[skill])
  let primary = ordered[0]
  if (preferredRole) {
    const roleMembers = getRoleMembers(party, preferredRole)
    if (roleMembers.length > 0) {
      primary = roleMembers.reduce((best, a) =>
        a.skills[skill] > best.skills[skill] ? a : best,
      )
    }
  }
  const assistants = ordered.filter((a) => a.id !== primary.id).slice(0, 2)
  return { primary, assistants }
}

export function calculateAssistanceBonus(
  assistants: Adventurer[],
  skill: SkillName,
): number {
  return clamp(
    assistants.reduce((sum, a) => sum + Math.floor(a.skills[skill] / 20), 0) *
      2,
    0,
    20,
  )
}

export function calculateEquipmentBonus(toolCost: number): number {
  return toolCost * 5
}

export function calculateInformationBonus(
  skill: SkillName,
  information: DiscoveredInformation[],
): number {
  return information.some((i) => i.source.includes(skill)) ? 5 : 0
}

export function difficultyBasePenalty(difficulty: string): number {
  switch (difficulty) {
    case 'easy':
      return -10
    case 'normal':
      return 0
    case 'hard':
      return 10
    case 'deadly':
      return 20
    default:
      return 0
  }
}

export function resolveCheck(
  rng: SeededRng,
  skillValue: number,
): { roll: number; result: CheckResult } {
  const effective = clamp(skillValue, 1, 100)
  const roll = rng.d100()
  const criticalThreshold = Math.max(1, Math.floor(effective / 5))
  const partialThreshold = Math.min(95, effective + 20)

  let result: CheckResult
  if (roll <= criticalThreshold) {
    result = 'criticalSuccess'
  } else if (roll <= effective) {
    result = 'success'
  } else if (roll <= partialThreshold) {
    result = 'partialSuccess'
  } else if (roll >= 96) {
    result = 'criticalFailure'
  } else {
    result = 'failure'
  }
  return { roll, result }
}

export function roleSkillBonus(
  party: Adventurer[],
  role: string,
  skill: SkillName,
): number {
  const members = getRoleMembers(party, role)
  if (members.length === 0) return 0
  const best = members.reduce((max, a) => Math.max(max, a.skills[skill]), 0)
  return Math.floor(best / 10)
}

export function rolePrimarySkill(
  party: Adventurer[],
  role: string,
  skill: SkillName,
): number {
  const members = getRoleMembers(party, role)
  if (members.length === 0) return 0
  return members.reduce((max, a) => Math.max(max, a.skills[skill]), 0)
}

export function primaryRoleForSkill(skill: SkillName): string {
  const mapping: Partial<Record<SkillName, string>> = {
    trapDetection: 'scout',
    trapDisarm: 'scout',
    stealth: 'scout',
    scouting: 'scout',
    survival: 'ranger',
    melee: 'vanguard',
    defense: 'guardian',
    firstAid: 'healer',
    healing: 'healer',
    leadership: 'support',
    tactics: 'support',
    monsterKnowledge: 'mage',
    attackMagic: 'mage',
    defenseMagic: 'mage',
    ranged: 'ranger',
  }
  return mapping[skill] ?? ''
}
