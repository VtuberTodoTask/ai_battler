import type { AdventurerRole } from '../../../core/models/types.ts'
import type { CharacterRelationship } from '../../../core/narrative/types.ts'
import type { PartyLifecycleStatus } from '../../../core/tavern/campaign/types.ts'
import {
  countryLabel as identityCountryLabel,
  genderLabel as identityGenderLabel,
  speciesLabel as identitySpeciesLabel,
} from '../../../core/identity/labels.ts'

export {
  identityCountryLabel as countryLabel,
  identityGenderLabel as genderLabel,
  identitySpeciesLabel as speciesLabel,
}

const ROLE_LABELS: Record<AdventurerRole, string> = {
  vanguard: '前衛',
  guardian: '護衛',
  scout: '偵察',
  ranger: '射手',
  mage: '魔術師',
  healer: '治療師',
  support: '支援',
}

export function roleLabel(role: AdventurerRole | undefined): string {
  if (!role) return '—'
  return ROLE_LABELS[role] ?? role
}

const LIFECYCLE_STATUS_LABELS: Record<PartyLifecycleStatus, string> = {
  staying: '滞在中',
  away: '旅の途中',
  retired: '引退',
}

/** Player-facing translation of a party's internal lifecycle status. Internal
 * values (staying/away/retired) must never be shown to the player raw. */
export function lifecycleStatusLabel(status: PartyLifecycleStatus): string {
  return LIFECYCLE_STATUS_LABELS[status]
}

const INJURY_TYPE_LABELS: Record<'light' | 'serious', string> = {
  light: '軽傷',
  serious: '重症',
}

export function injuryTypeLabel(type: string): string {
  return INJURY_TYPE_LABELS[type as 'light' | 'serious'] ?? type
}

const STATUS_EFFECT_LABELS: Record<string, string> = {
  poisoned: '毒',
  bleeding: '出血',
  stunned: '気絶',
  weakened: '衰弱',
  guarded: 'ガード',
  frightened: '恐怖',
  healBlocked: '回復不可',
  stealthed: '隠密',
  defenseDown: '防御低下',
}

export function statusEffectLabel(type: string): string {
  return STATUS_EFFECT_LABELS[type] ?? type
}

const SKILL_LABELS: Record<string, string> = {
  melee: '近接戦闘',
  ranged: '遠距離戦闘',
  defense: '防御',
  tactics: '戦術',
  attackMagic: '攻撃魔術',
  defenseMagic: '防御魔術',
  healing: '治癒',
  scouting: '偵察',
  stealth: '隠密',
  trapDetection: '罠探知',
  trapDisarm: '罠解除',
  survival: '生存',
  monsterKnowledge: '魔物知識',
  firstAid: '応急手当',
  leadership: '統率',
}

export function skillLabel(skill: string): string {
  return SKILL_LABELS[skill] ?? skill
}

export function relationshipPresentationLabel(
  rel: CharacterRelationship | undefined,
): string {
  if (!rel) return 'まだ特筆すべき関係はない'
  const parts: string[] = []
  if (rel.affinity >= 60) parts.push('親密')
  else if (rel.affinity <= 40) parts.push('一定の距離がある')
  if (rel.trust >= 60) parts.push('強く信頼している')
  else if (rel.trust <= 40) parts.push('信頼が薄い')
  if (rel.respect >= 60) parts.push('尊敬している')
  if (rel.tension >= 60) parts.push('意見が衝突しやすい')
  if (parts.length === 0) return 'まだ特筆すべき関係はない'
  return parts.join('・')
}
