import type { ObjectiveType } from '../expedition/types.ts'
import { SeededRng } from '../rng/seededRng.ts'

export const MISSION_SPECIALIZATION_OBJECTIVES: ObjectiveType[] = [
  'investigation',
  'elimination',
  'rescue',
  'escort',
  'retrieval',
  'survey',
]

export interface PartyMissionSpecialization {
  strongObjective: ObjectiveType
  weakObjective: ObjectiveType
}

export type MissionSpecializationMatch = 'strong' | 'neutral' | 'weak'

export const MISSION_SPECIALIZATION_CHECK_MODIFIER: Record<
  MissionSpecializationMatch,
  number
> = {
  strong: 8,
  neutral: 0,
  weak: -8,
}

export const ELIMINATION_SPECIALIZATION_THREAT_MULTIPLIER: Record<
  MissionSpecializationMatch,
  number
> = {
  strong: 0.92,
  neutral: 1.0,
  weak: 1.08,
}

export function generateMissionSpecialization(
  seed: string,
  index: number,
): PartyMissionSpecialization {
  const rng = new SeededRng(`${seed}:party:${index}:mission-specialization`)
  const strongObjective = rng.pick(MISSION_SPECIALIZATION_OBJECTIVES)
  const weakCandidates = MISSION_SPECIALIZATION_OBJECTIVES.filter(
    (o) => o !== strongObjective,
  )
  const weakObjective = rng.pick(weakCandidates)
  return { strongObjective, weakObjective }
}

export function getMissionSpecializationMatch(
  specialization: PartyMissionSpecialization | undefined,
  objectiveType: ObjectiveType,
): MissionSpecializationMatch {
  if (!specialization) return 'neutral'
  if (specialization.strongObjective === objectiveType) return 'strong'
  if (specialization.weakObjective === objectiveType) return 'weak'
  return 'neutral'
}
