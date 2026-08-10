import type {
  CharacterNarrativeContext,
  CharacterRelationshipSnapshot,
  NarrativeMemberSnapshot,
  NarrativeRequestInfo,
} from '../narrative/types.ts'
import { countryLabel, genderLabel, speciesLabel } from './labels.ts'

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[\s・、。.\\/()[\]「」『』！？?!]/g, '')
}

function tokenize(text: string): string[] {
  const normalized = normalizeText(text)
  // Simple n-gram-ish token set for Japanese/ASCII mixed text.
  const tokens = new Set<string>()
  for (let i = 0; i < normalized.length; i++) {
    for (let len = 2; len <= 4 && i + len <= normalized.length; len++) {
      tokens.add(normalized.slice(i, i + len))
    }
  }
  return [...tokens]
}

function relevanceScore(text: string, queryTokens: Set<string>): number {
  const normalized = normalizeText(text)
  let score = 0
  for (const token of queryTokens) {
    if (normalized.includes(token)) score += token.length
  }
  return score
}

function buildQueryTokens(
  focusSummary: string,
  request: NarrativeRequestInfo,
  sceneCharacterIds: string[],
): Set<string> {
  const parts = [
    focusSummary,
    request.title,
    request.briefing,
    request.objectiveType,
    request.environment,
    ...request.publicTags,
    ...sceneCharacterIds,
  ]
  const tokens = new Set<string>()
  for (const part of parts) {
    if (!part) continue
    for (const token of tokenize(part)) {
      tokens.add(token)
    }
  }
  return tokens
}

function identitySummary(member: NarrativeMemberSnapshot): string | undefined {
  if (!member.identity) return undefined
  const parts: string[] = [
    speciesLabel(member.identity.species),
    countryLabel(member.identity.countryOfOrigin),
    genderLabel(member.identity.gender),
  ]
  if (member.lifeBackground?.formerOccupation) {
    parts.push(`元${member.lifeBackground.formerOccupation}`)
  }
  return parts.join(' / ')
}

export function projectCharacterContextForNarrative(
  member: NarrativeMemberSnapshot,
  focusSummary: string,
  request: NarrativeRequestInfo,
  sceneCharacterIds: string[],
  relationships: CharacterRelationshipSnapshot[],
): CharacterNarrativeContext {
  const queryTokens = buildQueryTokens(focusSummary, request, sceneCharacterIds)

  const relevantBackground: string[] = []
  const backgroundCandidates: (string | undefined)[] = [
    member.lifeBackground?.childhood,
    member.lifeBackground?.education,
    member.lifeBackground?.formerOccupation
      ? `元${member.lifeBackground.formerOccupation}`
      : undefined,
    member.lifeBackground?.reasonForAdventuring,
    member.identity?.familyBackground,
    member.identity?.socialOrigin,
    member.identity?.regionOfOrigin,
  ]

  for (const text of backgroundCandidates) {
    if (!text) continue
    if (relevanceScore(text, queryTokens) > 0) {
      relevantBackground.push(text)
    }
  }

  const relevantCulturalInfluences: string[] = []
  if (member.culturalInfluences) {
    for (const inf of member.culturalInfluences) {
      const text = `${inf.value} ${inf.personalInterpretation ?? ''} ${inf.source}`
      if (relevanceScore(text, queryTokens) > 0) {
        relevantCulturalInfluences.push(
          `${inf.value}: ${inf.personalInterpretation ?? inf.attitude}`,
        )
      }
    }
  }

  const relevantExperiences: string[] = []
  if (member.lifeBackground?.formativeExperiences) {
    for (const exp of member.lifeBackground.formativeExperiences) {
      const text = `${exp.summary} ${exp.interpretation ?? ''}`
      if (relevanceScore(text, queryTokens) > 0) {
        relevantExperiences.push(
          `${exp.summary}${exp.interpretation ? ` → ${exp.interpretation}` : ''}`,
        )
      }
    }
  }

  const currentTraits = member.narrativeProfile
    ? [
        member.narrativeProfile.temperament,
        member.narrativeProfile.socialStyle,
        ...(member.narrativeProfile.values ?? []),
        ...(member.narrativeProfile.flaws ?? []),
      ].filter((x): x is string => !!x)
    : []

  const relationshipHints: string[] = []
  let romanticHint: string | undefined
  for (const rel of relationships) {
    if (rel.sourceCharacterId !== member.id) continue
    if (!sceneCharacterIds.includes(rel.targetCharacterId)) continue
    if (rel.affinity >= 70 || rel.trust >= 70) {
      relationshipHints.push(`${rel.targetName}を厚く信頼している`)
    } else if (rel.tension >= 70) {
      relationshipHints.push(`${rel.targetName}に対して緊張がある`)
    }
    if (
      rel.romanticAttraction !== undefined &&
      rel.romanticAttraction >= 60 &&
      rel.romanticAttraction < 100
    ) {
      romanticHint = `${rel.targetName}を特に意識している`
    }
  }

  return {
    characterId: member.id,
    identitySummary: identitySummary(member),
    relevantBackground:
      relevantBackground.length > 0 ? relevantBackground : undefined,
    relevantCulturalInfluences:
      relevantCulturalInfluences.length > 0
        ? relevantCulturalInfluences
        : undefined,
    relevantExperiences:
      relevantExperiences.length > 0 ? relevantExperiences : undefined,
    currentTraits: currentTraits.length > 0 ? currentTraits : undefined,
    relationshipHints:
      relationshipHints.length > 0 ? relationshipHints : undefined,
    romanticHint,
  }
}

export function projectCharacterContextsForNarrative(
  members: NarrativeMemberSnapshot[],
  focusSummary: string,
  request: NarrativeRequestInfo,
  sceneCharacterIds: string[],
  relationships: CharacterRelationshipSnapshot[],
): CharacterNarrativeContext[] {
  const relevantMembers =
    sceneCharacterIds.length > 0
      ? members.filter((m) => sceneCharacterIds.includes(m.id))
      : members
  return relevantMembers.map((m) =>
    projectCharacterContextForNarrative(
      m,
      focusSummary,
      request,
      sceneCharacterIds,
      relationships,
    ),
  )
}
