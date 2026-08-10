import type { CharacterNarrativeProfile } from '../models/types.ts'
import type {
  CharacterRelationshipSnapshot,
  NarrativeDirection,
  NarrativeMemberSnapshot,
  NarrativeSceneSelection,
  NarrativeTimelineBeat,
} from './types.ts'

interface BeatScore {
  beat: NarrativeTimelineBeat
  index: number
  score: number
}

function normalizeText(text: string): string {
  return text.toLowerCase()
}

function profileKeywords(profile: CharacterNarrativeProfile): string[] {
  const keywords: string[] = []
  const add = (value: string | undefined) => {
    if (value) keywords.push(normalizeText(value))
  }
  add(profile.temperament)
  add(profile.socialStyle)
  add(profile.speechStyle)
  for (const v of profile.values ?? []) add(v)
  for (const f of profile.flaws ?? []) add(f)
  for (const f of profile.fears ?? []) add(f)
  for (const h of profile.habits ?? []) add(h)
  return keywords
}

function profileRelevance(
  beat: NarrativeTimelineBeat,
  member: NarrativeMemberSnapshot | undefined,
): number {
  if (!member?.narrativeProfile) return 0
  const keywords = profileKeywords(member.narrativeProfile)
  if (keywords.length === 0) return 0
  const text = normalizeText(beat.text)
  let hits = 0
  for (const keyword of keywords) {
    if (text.includes(keyword)) hits += 1
  }
  return hits * 15
}

function relationshipRelevance(
  sourceId: string | undefined,
  targetId: string | undefined,
  relationshipMap: ReadonlyMap<string, CharacterRelationshipSnapshot>,
): number {
  if (!sourceId || !targetId || sourceId === targetId) return 0
  const rel = relationshipMap.get(`${sourceId}:${targetId}`)
  if (!rel) return 0
  let boost = 0
  if (rel.affinity >= 60) boost += 8
  if (rel.affinity <= 40) boost += 8
  if (rel.trust >= 60) boost += 6
  if (rel.trust <= 40) boost += 6
  if (rel.tension >= 60) boost += 10
  if (rel.respect >= 60) boost += 4
  return boost
}

function allRelationshipBoost(
  beat: NarrativeTimelineBeat,
  memberMap: ReadonlyMap<string, NarrativeMemberSnapshot>,
  relationshipMap: ReadonlyMap<string, CharacterRelationshipSnapshot>,
): number {
  const ids = new Set<string>([
    ...(beat.actorIds ?? []),
    ...(beat.targetIds ?? []),
  ])
  let boost = 0
  for (const source of ids) {
    for (const target of ids) {
      if (source === target) continue
      boost += relationshipRelevance(source, target, relationshipMap)
    }
  }
  for (const id of ids) {
    const member = memberMap.get(id)
    if (member) boost += profileRelevance(beat, member)
  }
  return boost
}

function computeBeatScore(
  beat: NarrativeTimelineBeat,
  memberMap: ReadonlyMap<string, NarrativeMemberSnapshot>,
  relationshipMap: ReadonlyMap<string, CharacterRelationshipSnapshot>,
): number {
  let score = beat.importance
  score += allRelationshipBoost(beat, memberMap, relationshipMap)
  return score
}

export function scoreBeats(
  timeline: NarrativeTimelineBeat[],
  members: NarrativeMemberSnapshot[],
  characterRelationships?: CharacterRelationshipSnapshot[],
): BeatScore[] {
  const memberMap = new Map(members.map((m) => [m.id, m]))
  const relationshipMap = new Map(
    (characterRelationships ?? []).map((r) => [
      `${r.sourceCharacterId}:${r.targetCharacterId}`,
      r,
    ]),
  )
  return timeline.map((beat, index) => ({
    beat,
    index,
    score: computeBeatScore(beat, memberMap, relationshipMap),
  }))
}

export function determineNarrativeDirection(
  timeline: NarrativeTimelineBeat[],
  members: NarrativeMemberSnapshot[],
  characterRelationships?: CharacterRelationshipSnapshot[],
): NarrativeDirection {
  const scored = scoreBeats(timeline, members, characterRelationships)
  const assigned = new Set<number>()
  const mainScenes: NarrativeSceneSelection[] = []
  const secondaryScenes: NarrativeSceneSelection[] = []
  const montageBeatIds: string[] = []

  const MAIN_THRESHOLD = 80
  const SECONDARY_THRESHOLD = 60
  const MONTAGE_THRESHOLD = 40

  function buildScene(
    startIndex: number,
    endIndex: number,
  ): NarrativeSceneSelection {
    const sceneBeats = scored.slice(startIndex, endIndex + 1).map((s) => s.beat)
    const beatIds = sceneBeats.map((b) => b.id)
    const focus = sceneBeats.map((b) => b.text).join(' → ')
    const first = sceneBeats[0]!
    const phase = first.phase
    const reason =
      sceneBeats.length > 1
        ? `${phase}における連続した出来事（重要度 ${first.importance}）`
        : `${phase}の重要な出来事（重要度 ${first.importance}）`
    return { beatIds, focus, reason }
  }

  function includeConsecutive(
    start: number,
    threshold: number,
    maxLength: number,
  ): number {
    let end = start
    while (
      end + 1 < scored.length &&
      !assigned.has(end + 1) &&
      scored[end + 1]!.score >= threshold &&
      end - start + 1 < maxLength
    ) {
      end++
    }
    return end
  }

  const maxMainScenes = 2
  const maxSecondaryScenes = 2
  const maxSceneLength = 2

  for (let i = 0; i < scored.length; i++) {
    if (assigned.has(i)) continue
    const current = scored[i]!

    if (current.score >= MAIN_THRESHOLD && mainScenes.length < maxMainScenes) {
      const end = includeConsecutive(i, SECONDARY_THRESHOLD, maxSceneLength)
      for (let j = i; j <= end; j++) assigned.add(j)
      mainScenes.push(buildScene(i, end))
      continue
    }

    if (
      current.score >= SECONDARY_THRESHOLD &&
      secondaryScenes.length < maxSecondaryScenes
    ) {
      const end = includeConsecutive(i, SECONDARY_THRESHOLD, maxSceneLength)
      for (let j = i; j <= end; j++) assigned.add(j)
      secondaryScenes.push(buildScene(i, end))
      continue
    }

    if (current.beat.importance >= MONTAGE_THRESHOLD) {
      montageBeatIds.push(current.beat.id)
    }
    assigned.add(i)
  }

  return { mainScenes, secondaryScenes, montageBeatIds }
}
