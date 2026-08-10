import type { Adventurer, CharacterNarrativeProfile } from '../models/types.ts'
import { buildCharacterNarrativeProfile } from '../identity/generator.ts'

export function deriveCharacterNarrativeProfile(
  member: Adventurer,
): CharacterNarrativeProfile {
  if (member.narrativeProfile) {
    return member.narrativeProfile
  }
  return buildCharacterNarrativeProfile(member)
}

export function formatNarrativeProfile(
  profile: CharacterNarrativeProfile | undefined,
): string {
  if (!profile) return '特筆すべきプロフィールは記録されていない'
  const parts: string[] = []
  if (profile.temperament) parts.push(`気質: ${profile.temperament}`)
  if (profile.socialStyle) parts.push(`対人: ${profile.socialStyle}`)
  if (profile.values && profile.values.length > 0)
    parts.push(`重視: ${profile.values.join('・')}`)
  if (profile.flaws && profile.flaws.length > 0)
    parts.push(`欠点: ${profile.flaws.join('・')}`)
  if (profile.fears && profile.fears.length > 0)
    parts.push(`恐れ: ${profile.fears.join('・')}`)
  if (profile.habits && profile.habits.length > 0)
    parts.push(`癖: ${profile.habits.join('・')}`)
  if (profile.speechStyle) parts.push(`口調: ${profile.speechStyle}`)
  if (profile.beliefs && profile.beliefs.length > 0)
    parts.push(`信念: ${profile.beliefs.join('・')}`)
  if (profile.attitudes && profile.attitudes.length > 0)
    parts.push(`態度: ${profile.attitudes.join('；')}`)
  if (profile.contradictions && profile.contradictions.length > 0) {
    const c = profile.contradictions[0]
    parts.push(`矛盾: ${c.sideA}が、${c.sideB}場面で影響を受ける`)
  }
  return parts.join(' / ') || '特筆すべきプロフィールは記録されていない'
}
