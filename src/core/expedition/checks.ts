import { SeededRng } from '../rng/seededRng.ts'
import type { Adventurer, SkillName } from '../models/types.ts'
import type {
  CheckResult,
  DiscoveredInformation,
  ExpeditionCheck,
  ExpeditionEffect,
  ExpeditionLogEntry,
  ExpeditionPhase,
} from './types.ts'
import { clamp } from '../util.ts'

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
      return 0
    case 'normal':
      return 10
    case 'hard':
      return 20
    case 'deadly':
      return 30
    default:
      return 10
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

export function createExpeditionCheck(
  phase: ExpeditionPhase,
  skill: SkillName,
  responsible: ResponsibleSelection,
  difficultyModifier: number,
): ExpeditionCheck {
  return {
    phase,
    skill,
    responsibleMemberIds: [responsible.primary.id],
    assistanceMemberIds: responsible.assistants.map((a) => a.id),
    difficultyModifier,
  }
}

export function formatCheckFacts(
  check: ExpeditionCheck,
  effectiveValue: number,
  result: CheckResult,
): string[] {
  return [
    `${check.phase}フェーズで ${check.skill} 判定（メイン=${check.responsibleMemberIds[0]}, 効果値=${effectiveValue.toFixed(0)}, 結果=${result}）`,
  ]
}

export function applyEffectsToMember(
  party: Adventurer[],
  targetId: string,
  effects: ExpeditionEffect[],
  currentHp: Record<string, number>,
  currentMp: Record<string, number>,
  currentMorale: Record<string, number>,
): void {
  for (const effect of effects) {
    const value = effect.value ?? 0
    switch (effect.type) {
      case 'hpDamage':
        currentHp[targetId] = clamp(currentHp[targetId] - value, 1, Infinity)
        break
      case 'hpHeal':
        currentHp[targetId] = clamp(
          currentHp[targetId] + value,
          1,
          party.find((a) => a.id === targetId)?.maxHp ?? Infinity,
        )
        break
      case 'mpDamage':
        currentMp[targetId] = clamp(currentMp[targetId] - value, 0, Infinity)
        break
      case 'mpRestore':
        currentMp[targetId] = clamp(
          currentMp[targetId] + value,
          0,
          party.find((a) => a.id === targetId)?.maxMp ?? Infinity,
        )
        break
      case 'moraleChange':
        currentMorale[targetId] = clamp(currentMorale[targetId] + value, 0, 100)
        break
      default:
        break
    }
  }
}

export function logEntry(
  phase: ExpeditionPhase,
  type: string,
  actorIds: string[],
  facts: string[],
  effects: ExpeditionEffect[] = [],
  check?: ExpeditionLogEntry['check'],
  targetIds?: string[],
): ExpeditionLogEntry {
  return {
    phase,
    type,
    actorIds,
    targetIds,
    check,
    effects,
    facts,
  }
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

export function getTopSkillMember(
  party: Adventurer[],
  skill: SkillName,
): Adventurer | undefined {
  return [...party].sort((a, b) => b.skills[skill] - a.skills[skill])[0]
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
