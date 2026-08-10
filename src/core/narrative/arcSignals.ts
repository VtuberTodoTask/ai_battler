import type { CampaignParty } from '../tavern/campaign/types.ts'
import type {
  ArcSignalDirection,
  ArcSignalStatus,
  CharacterArcSignal,
  CharacterArcSignalType,
  CharacterRelationship,
  NarrativeArcSignal,
  NarrativeRequestInfo,
  RelationshipMemory,
  RelationshipMemoryType,
} from './types.ts'

type MemberMap = Map<string, { id: string; name: string }>

const ARC_EMERGING_THRESHOLD = 25
const ARC_ESTABLISHED_THRESHOLD = 70
const ARC_FADING_DROP = 15
const ARC_FADING_WINDOW_DAYS = 20
const ARC_MAX_AGE_DAYS = 30

const POSITIVE_MEMORY_TYPES: RelationshipMemoryType[] = [
  'rescued',
  'healed',
  'protected',
  'supported',
  'trust_event',
  'romantic_moment',
]

const NEGATIVE_MEMORY_TYPES: RelationshipMemoryType[] = [
  'abandoned',
  'conflict',
  'disagreement',
  'shared_failure',
  'retreat',
  'casualty',
]

const CONFLICT_TYPES: RelationshipMemoryType[] = ['conflict', 'disagreement']

const PROTECTIVE_TYPES: RelationshipMemoryType[] = ['rescued', 'protected']

function memberMap(party: CampaignParty): MemberMap {
  const map = new Map<string, { id: string; name: string }>()
  for (const m of party.party.members) {
    map.set(m.id, { id: m.id, name: m.name ?? m.id })
  }
  return map
}

function sortedPairKey(a: string, b: string): string {
  return [a, b].sort().join(':')
}

function pairKey(a: string, b: string): string {
  return `${a}:${b}`
}

function recencyWeight(day: number, memoryDay?: number): number {
  if (memoryDay === undefined) return 0.7
  const daysAgo = day - memoryDay
  if (daysAgo <= 0) return 1
  if (daysAgo >= ARC_MAX_AGE_DAYS) return 0.3
  return 1 - (daysAgo / ARC_MAX_AGE_DAYS) * 0.7
}

function getRelationship(
  party: CampaignParty,
  sourceId: string,
  targetId: string,
): CharacterRelationship | undefined {
  return party.memberRelationships?.[pairKey(sourceId, targetId)]
}

function getMemories(
  party: CampaignParty,
  sourceId: string,
  targetId: string,
): RelationshipMemory[] {
  return (
    party.memberRelationships?.[pairKey(sourceId, targetId)]?.recentEvents ?? []
  )
}

function sharedExpeditions(party: CampaignParty, a: string, b: string): number {
  const key = sortedPairKey(a, b)
  return (
    party.sharedExpeditionCounts?.[key] ??
    getRelationship(party, a, b)?.sharedExpeditions ??
    0
  )
}

function positiveMemories(
  memories: RelationshipMemory[],
): RelationshipMemory[] {
  return memories.filter((m) => POSITIVE_MEMORY_TYPES.includes(m.type))
}

function negativeMemories(
  memories: RelationshipMemory[],
): RelationshipMemory[] {
  return memories.filter((m) => NEGATIVE_MEMORY_TYPES.includes(m.type))
}

function conflictMemories(
  memories: RelationshipMemory[],
): RelationshipMemory[] {
  return memories.filter((m) => CONFLICT_TYPES.includes(m.type))
}

function protectMemories(memories: RelationshipMemory[]): RelationshipMemory[] {
  return memories.filter((m) => PROTECTIVE_TYPES.includes(m.type))
}

function memorySum(
  memories: { importance: number; day?: number }[],
  day: number,
): number {
  return memories.reduce(
    (sum, m) => sum + m.importance * recencyWeight(day, m.day),
    0,
  )
}

function memoryIds(memories: RelationshipMemory[]): string[] {
  return memories.map((m) => m.id)
}

function confidenceFromMemories(
  supporting: RelationshipMemory[],
  counter: RelationshipMemory[],
  sharedExpeditions = 0,
): number {
  let confidence = 20
  confidence += Math.min(50, supporting.length * 15)
  confidence += Math.max(-15, -counter.length * 8)
  if (sharedExpeditions > supporting.length) {
    confidence += Math.min(15, (sharedExpeditions - supporting.length) * 3)
  }
  return clamp(confidence, 0, 95)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function signalDirection(type: CharacterArcSignalType): ArcSignalDirection {
  switch (type) {
    case 'growing_reliance':
    case 'growing_trust':
    case 'recurring_support':
    case 'comfortable_familiarity':
    case 'protective_pattern':
    case 'shared_success_bond':
    case 'reciprocal_support':
    case 'romantic_interest_possible':
    case 'shared_failure_bond':
    case 'repeated_success':
      return 'positive'
    case 'recurring_conflict':
    case 'decision_friction':
    case 'eroding_trust':
    case 'growing_tension':
    case 'avoidance_pattern':
    case 'unresolved_debt':
    case 'repeated_failure':
    case 'repeated_injury':
      return 'negative'
    default:
      return 'neutral'
  }
}

function arcSignalKey(signal: CharacterArcSignal): string {
  if (signal.sourceCharacterId && signal.targetCharacterId) {
    return `${signal.type}:${signal.sourceCharacterId}:${signal.targetCharacterId}`
  }
  return `${signal.type}:${[...signal.characterIds].sort().join(':')}`
}

function statusFromStrength(
  strength: number,
  confidence: number,
  previous?: CharacterArcSignal,
): ArcSignalStatus {
  if (previous) {
    const drop = previous.strength - strength
    if (drop > ARC_FADING_DROP && strength >= ARC_EMERGING_THRESHOLD) {
      return 'fading'
    }
    if (
      previous.status === 'established' &&
      strength >= ARC_ESTABLISHED_THRESHOLD - 10
    ) {
      return 'established'
    }
  }
  if (strength >= ARC_ESTABLISHED_THRESHOLD && confidence >= 50)
    return 'established'
  if (strength >= ARC_EMERGING_THRESHOLD) return 'emerging'
  return 'emerging'
}

interface CandidateSignal {
  type: CharacterArcSignalType
  sourceId?: string
  targetId?: string
  characterIds: string[]
  strength: number
  confidence: number
  supportingMemoryIds: string[]
  supportingEventIds?: string[]
  firstDetectedDay?: number
}

function buildSignal(
  candidate: CandidateSignal,
  day: number,
  previous?: CharacterArcSignal,
): CharacterArcSignal {
  const status = statusFromStrength(
    candidate.strength,
    candidate.confidence,
    previous,
  )
  const id =
    previous?.id ??
    `arc:${candidate.type}:${candidate.sourceId ?? ''}:${candidate.targetId ?? ''}:${[...candidate.characterIds].sort().join(':')}:${day}`
  return {
    id,
    type: candidate.type,
    sourceCharacterId: candidate.sourceId,
    targetCharacterId: candidate.targetId,
    characterIds: candidate.characterIds,
    strength: clamp(candidate.strength, 0, 100),
    confidence: clamp(candidate.confidence, 0, 100),
    supportingMemoryIds: candidate.supportingMemoryIds,
    supportingEventIds: candidate.supportingEventIds,
    firstDetectedDay:
      previous?.firstDetectedDay ??
      candidate.firstDetectedDay ??
      (candidate.supportingMemoryIds.length > 0 ? day : undefined),
    lastUpdatedDay: day,
    status,
    direction: signalDirection(candidate.type),
  }
}

function makeCandidate(
  type: CharacterArcSignalType,
  ids: string[],
  strength: number,
  confidence: number,
  memories: RelationshipMemory[],
  day: number,
  sourceId?: string,
  targetId?: string,
): CandidateSignal {
  const oldestDay = memories.length
    ? Math.min(...memories.map((m) => m.day ?? day))
    : day
  return {
    type,
    characterIds: ids,
    strength,
    confidence,
    supportingMemoryIds: memoryIds(memories),
    firstDetectedDay: oldestDay,
    sourceId,
    targetId,
  }
}

function makeCandidateFromIds(
  type: CharacterArcSignalType,
  ids: string[],
  strength: number,
  confidence: number,
  supportingMemoryIds: string[],
  day: number,
  firstDetectedDay?: number,
  sourceId?: string,
): CandidateSignal {
  return {
    type,
    characterIds: ids,
    strength,
    confidence,
    supportingMemoryIds,
    firstDetectedDay:
      firstDetectedDay ?? (supportingMemoryIds.length > 0 ? day : undefined),
    sourceId,
  }
}

function detectPairSignals(
  party: CampaignParty,
  sourceId: string,
  targetId: string,
  day: number,
): CandidateSignal[] {
  const candidates: CandidateSignal[] = []
  const sourceToTarget = getMemories(party, sourceId, targetId)
  const targetToSource = getMemories(party, targetId, sourceId)
  const rel = getRelationship(party, sourceId, targetId)
  if (!rel) return candidates

  const shared = sharedExpeditions(party, sourceId, targetId)
  const positiveToSource = positiveMemories(targetToSource)
  const positiveFromSource = positiveMemories(sourceToTarget)
  const negativeToSource = negativeMemories(targetToSource)
  const conflicts = conflictMemories(sourceToTarget).concat(
    conflictMemories(targetToSource),
  )
  const sourceToTargetConflicts = conflictMemories(sourceToTarget)
  const targetToSourceConflicts = conflictMemories(targetToSource)
  const protectToSource = protectMemories(targetToSource)

  const positiveToSourceSum = memorySum(positiveToSource, day)
  const conflictSum = memorySum(conflicts, day)

  // growing_reliance: source increasingly relies on target's support/judgment.
  if (
    positiveToSource.length >= 2 ||
    (positiveToSource.length >= 1 && shared >= 2 && rel.trust >= 60)
  ) {
    const strength =
      15 +
      positiveToSourceSum * 3 +
      Math.max(0, rel.trust - 50) * 0.8 +
      Math.max(0, shared - 1) * 4
    const confidence = confidenceFromMemories(
      positiveToSource,
      negativeToSource,
      shared,
    )
    candidates.push(
      makeCandidate(
        'growing_reliance',
        [sourceId, targetId],
        strength,
        confidence,
        positiveToSource,
        day,
        sourceId,
        targetId,
      ),
    )
  }

  // recurring_support: target repeatedly supports source (weaker than growing_reliance).
  if (
    positiveToSource.length >= 2 &&
    !candidates.some(
      (c) => c.type === 'growing_reliance' && c.sourceId === sourceId,
    )
  ) {
    const strength = 20 + positiveToSourceSum * 2.5 + shared * 2
    const confidence = confidenceFromMemories(
      positiveToSource,
      negativeToSource,
      shared,
    )
    candidates.push(
      makeCandidate(
        'recurring_support',
        [sourceId, targetId],
        strength,
        confidence,
        positiveToSource,
        day,
        sourceId,
        targetId,
      ),
    )
  }

  // growing_trust: source trusts target based on repeated positive experience.
  if (positiveToSource.length >= 2 && rel.trust >= 60 && rel.tension <= 60) {
    const strength =
      20 +
      positiveToSourceSum * 2 +
      (rel.trust - 50) * 0.6 +
      Math.max(0, 60 - rel.tension) * 0.3
    const confidence = confidenceFromMemories(
      positiveToSource,
      negativeToSource,
      shared,
    )
    candidates.push(
      makeCandidate(
        'growing_trust',
        [sourceId, targetId],
        strength,
        confidence,
        positiveToSource,
        day,
        sourceId,
        targetId,
      ),
    )
  }

  // protective_pattern: target repeatedly protects or rescues source.
  if (
    protectToSource.length >= 2 ||
    (protectToSource.length >= 1 &&
      protectToSource.some((m) => m.importance >= 8))
  ) {
    const strength = 25 + memorySum(protectToSource, day) * 3 + shared * 2
    const confidence = confidenceFromMemories(
      protectToSource,
      negativeToSource,
      shared,
    )
    candidates.push(
      makeCandidate(
        'protective_pattern',
        [sourceId, targetId],
        strength,
        confidence,
        protectToSource,
        day,
        sourceId,
        targetId,
      ),
    )
  }

  // reciprocal_support: both directions have positive support memories.
  if (
    positiveFromSource.length >= 1 &&
    positiveToSource.length >= 1 &&
    positiveFromSource.length + positiveToSource.length >= 2
  ) {
    const all = positiveFromSource.concat(positiveToSource)
    const strength =
      25 +
      memorySum(all, day) * 2 +
      Math.min(positiveFromSource.length, positiveToSource.length) * 8 +
      shared * 2
    const confidence = confidenceFromMemories(all, conflicts, shared)
    candidates.push(
      makeCandidate(
        'reciprocal_support',
        [sourceId, targetId],
        strength,
        confidence,
        all,
        day,
      ),
    )
  }

  // recurring_conflict: repeated disagreements or conflicts.
  if (
    conflicts.length >= 2 ||
    (sourceToTargetConflicts.length >= 1 && targetToSourceConflicts.length >= 1)
  ) {
    const strength =
      30 + conflictSum * 3 + Math.max(0, rel.tension - 50) * 0.8 + shared * 1
    const confidence = confidenceFromMemories(
      conflicts,
      positiveToSource.concat(positiveFromSource),
      shared,
    )
    candidates.push(
      makeCandidate(
        'recurring_conflict',
        [sourceId, targetId],
        strength,
        confidence,
        conflicts,
        day,
      ),
    )
  }

  // decision_friction: a single conflict/disagreement with no later positive evidence.
  if (
    sourceToTargetConflicts.length === 1 ||
    targetToSourceConflicts.length === 1
  ) {
    const singleConflict =
      sourceToTargetConflicts[0] ?? targetToSourceConflicts[0]
    if (singleConflict) {
      const laterPositive = positiveToSource
        .concat(positiveFromSource)
        .some((m) => (m.day ?? 0) > (singleConflict.day ?? 0))
      if (!laterPositive) {
        const strength = 20 + singleConflict.importance * 1.5
        const confidence = confidenceFromMemories([singleConflict], [], shared)
        candidates.push(
          makeCandidate(
            'decision_friction',
            [sourceId, targetId],
            strength,
            confidence,
            [singleConflict],
            day,
          ),
        )
      }
    }
  }

  // eroding_trust: target let source down repeatedly or seriously.
  if (
    (negativeToSource.length >= 2 && rel.trust < 55 && rel.tension > 60) ||
    negativeToSource.some((m) => m.type === 'abandoned' && m.importance >= 7)
  ) {
    const relevant = negativeToSource.filter(
      (m) =>
        m.type === 'abandoned' ||
        m.type === 'shared_failure' ||
        m.type === 'casualty' ||
        CONFLICT_TYPES.includes(m.type),
    )
    const strength =
      25 +
      memorySum(relevant, day) * 2.5 +
      Math.max(0, 60 - rel.trust) * 0.8 +
      Math.max(0, rel.tension - 50) * 0.6
    const confidence = confidenceFromMemories(
      relevant,
      positiveToSource,
      shared,
    )
    candidates.push(
      makeCandidate(
        'eroding_trust',
        [sourceId, targetId],
        strength,
        confidence,
        relevant,
        day,
        sourceId,
        targetId,
      ),
    )
  }

  // growing_tension: high tension plus conflict history.
  if (rel.tension > 70 && conflicts.length >= 1) {
    const strength = 25 + (rel.tension - 60) * 1.2 + conflictSum * 2
    const confidence = confidenceFromMemories(
      conflicts,
      positiveToSource.concat(positiveFromSource),
      shared,
    )
    candidates.push(
      makeCandidate(
        'growing_tension',
        [sourceId, targetId],
        strength,
        confidence,
        conflicts,
        day,
      ),
    )
  }

  // comfortable_familiarity: shared history without major conflict.
  if (
    shared >= 3 &&
    rel.tension <= 60 &&
    rel.affinity >= 55 &&
    positiveToSource.length + positiveFromSource.length >= 1
  ) {
    const positiveAll = positiveToSource.concat(positiveFromSource)
    const strength =
      20 +
      Math.min(50, shared * 4) +
      memorySum(positiveAll, day) * 1.2 +
      (rel.affinity - 50) * 0.3
    const confidence = confidenceFromMemories(positiveAll, conflicts, shared)
    candidates.push(
      makeCandidate(
        'comfortable_familiarity',
        [sourceId, targetId],
        strength,
        confidence,
        positiveAll,
        day,
      ),
    )
  }

  // shared_success_bond: repeated shared successes with good relationship.
  const sharedSuccess = sourceToTarget
    .filter((m) => m.type === 'shared_success')
    .concat(targetToSource.filter((m) => m.type === 'shared_success'))
  if (sharedSuccess.length >= 2 && rel.trust >= 55 && rel.tension <= 60) {
    const strength =
      25 +
      memorySum(sharedSuccess, day) * 3 +
      (rel.trust - 50) * 0.5 +
      shared * 1.5
    const confidence = confidenceFromMemories(sharedSuccess, conflicts, shared)
    candidates.push(
      makeCandidate(
        'shared_success_bond',
        [sourceId, targetId],
        strength,
        confidence,
        sharedSuccess,
        day,
      ),
    )
  }

  // shared_failure_bond: shared failure followed by continued cooperation.
  const sharedFailure = sourceToTarget
    .filter((m) => m.type === 'shared_failure')
    .concat(targetToSource.filter((m) => m.type === 'shared_failure'))
  if (sharedFailure.length >= 1) {
    const latestFailureDay = Math.max(...sharedFailure.map((m) => m.day ?? 0))
    const laterPositive = positiveToSource
      .concat(positiveFromSource)
      .some((m) => (m.day ?? 0) > latestFailureDay)
    if (laterPositive || rel.affinity >= 55) {
      const relevant = sharedFailure.concat(
        positiveToSource
          .concat(positiveFromSource)
          .filter((m) => (m.day ?? 0) > latestFailureDay),
      )
      const strength =
        25 +
        memorySum(sharedFailure, day) * 1.5 +
        (laterPositive ? 15 : 0) +
        (rel.affinity - 50) * 0.5
      const confidence = confidenceFromMemories(relevant, conflicts, shared)
      candidates.push(
        makeCandidate(
          'shared_failure_bond',
          [sourceId, targetId],
          strength,
          confidence,
          relevant,
          day,
        ),
      )
    }
  }

  // unresolved_debt: target helped source repeatedly, source has not reciprocated.
  if (
    positiveToSource.length >= 2 &&
    positiveFromSource.length === 0 &&
    rel.trust >= 60 &&
    rel.affinity >= 55
  ) {
    const strength = 25 + positiveToSourceSum * 2.5 + (rel.trust - 50) * 0.5
    const confidence = confidenceFromMemories(positiveToSource, [], shared)
    candidates.push(
      makeCandidate(
        'unresolved_debt',
        [sourceId, targetId],
        strength,
        confidence,
        positiveToSource,
        day,
        sourceId,
        targetId,
      ),
    )
  }

  // romantic_interest_possible: directional romantic attraction plus shared positive history.
  if (rel.romanticAttraction !== undefined && rel.romanticAttraction >= 45) {
    const positiveAll = positiveToSource.concat(positiveFromSource)
    const relevantHistory = positiveAll.length > 0 ? positiveAll : []
    const strength =
      15 +
      (rel.romanticAttraction - 40) * 1.2 +
      positiveAll.length * 6 +
      shared * 2
    if (strength >= ARC_EMERGING_THRESHOLD) {
      const confidence = confidenceFromMemories(
        relevantHistory,
        conflicts,
        shared,
      )
      candidates.push(
        makeCandidate(
          'romantic_interest_possible',
          [sourceId, targetId],
          strength,
          confidence,
          relevantHistory,
          day,
          sourceId,
          targetId,
        ),
      )
    }
  }

  return candidates
}

function detectPersonalSignals(
  party: CampaignParty,
  characterId: string,
  day: number,
): CandidateSignal[] {
  const candidates: CandidateSignal[] = []
  const memories = party.characterMemories?.[characterId] ?? []
  if (memories.length === 0) return candidates

  const injuries = memories.filter(
    (m) => m.type === 'injury' || m.type === 'critical_injury',
  )
  if (injuries.length >= 2) {
    const strength = 25 + memorySum(injuries, day) * 2
    const confidence = clamp(30 + injuries.length * 15, 0, 90)
    const oldestDay = Math.min(...injuries.map((m) => m.day ?? day))
    candidates.push(
      makeCandidateFromIds(
        'repeated_injury',
        [characterId],
        strength,
        confidence,
        injuries.map((m) => m.id),
        day,
        oldestDay,
        characterId,
      ),
    )
  }

  const successes = memories.filter(
    (m) => m.type === 'major_success' || m.type === 'objective_success',
  )
  if (successes.length >= 2) {
    const strength = 25 + successes.length * 8
    const confidence = clamp(30 + successes.length * 15, 0, 90)
    const oldestDay = Math.min(...successes.map((m) => m.day ?? day))
    candidates.push(
      makeCandidateFromIds(
        'repeated_success',
        [characterId],
        strength,
        confidence,
        successes.map((m) => m.id),
        day,
        oldestDay,
        characterId,
      ),
    )
  }

  const failures = memories.filter(
    (m) =>
      m.type === 'major_failure' ||
      m.type === 'objective_failure' ||
      m.type === 'retreat',
  )
  if (failures.length >= 2) {
    const strength = 25 + failures.length * 10
    const confidence = clamp(30 + failures.length * 15, 0, 90)
    const oldestDay = Math.min(...failures.map((m) => m.day ?? day))
    candidates.push(
      makeCandidateFromIds(
        'repeated_failure',
        [characterId],
        strength,
        confidence,
        failures.map((m) => m.id),
        day,
        oldestDay,
        characterId,
      ),
    )
  }

  return candidates
}

export function detectArcSignals(
  party: CampaignParty,
  day: number,
): CharacterArcSignal[] {
  const existing = new Map<string, CharacterArcSignal>()
  for (const s of party.arcSignals ?? []) {
    existing.set(arcSignalKey(s), s)
  }

  const candidates = new Map<string, CandidateSignal>()
  const members = party.party.members

  for (let i = 0; i < members.length; i++) {
    for (let j = 0; j < members.length; j++) {
      if (i === j) continue
      const sourceId = members[i]!.id
      const targetId = members[j]!.id
      const pairCandidates = detectPairSignals(party, sourceId, targetId, day)
      for (const c of pairCandidates) {
        const key = `${c.type}:${c.sourceId ?? ''}:${c.targetId ?? ''}:${[...c.characterIds].sort().join(':')}`
        candidates.set(key, c)
      }
    }
    const personal = detectPersonalSignals(party, members[i]!.id, day)
    for (const c of personal) {
      const key = `${c.type}:${c.characterIds.join(':')}`
      candidates.set(key, c)
    }
  }

  const next: CharacterArcSignal[] = []
  const seen = new Set<string>()

  for (const c of candidates.values()) {
    const signal = buildSignal(
      c,
      day,
      existing.get(arcSignalKeyFromCandidate(c)),
    )
    const key = arcSignalKey(signal)
    if (seen.has(key)) continue
    seen.add(key)
    next.push(signal)
  }

  for (const [key, prev] of existing) {
    if (seen.has(key)) continue
    if (
      day - (prev.lastUpdatedDay ?? prev.firstDetectedDay ?? day) <
        ARC_FADING_WINDOW_DAYS &&
      prev.strength > ARC_EMERGING_THRESHOLD
    ) {
      const fadedStrength = Math.max(0, prev.strength - ARC_FADING_DROP)
      if (fadedStrength >= ARC_EMERGING_THRESHOLD) {
        next.push({
          ...prev,
          strength: fadedStrength,
          status: 'fading',
          lastUpdatedDay: day,
        })
      }
    }
  }

  next.sort((a, b) => {
    if (a.characterIds.length !== b.characterIds.length) {
      return a.characterIds.length - b.characterIds.length
    }
    if (a.strength !== b.strength) return b.strength - a.strength
    return a.type.localeCompare(b.type)
  })

  return next
}

function arcSignalKeyFromCandidate(candidate: CandidateSignal): string {
  if (candidate.sourceId && candidate.targetId) {
    return `${candidate.type}:${candidate.sourceId}:${candidate.targetId}`
  }
  return `${candidate.type}:${[...candidate.characterIds].sort().join(':')}`
}

export function updateArcSignals(
  party: CampaignParty,
  day: number,
): CharacterArcSignal[] {
  party.arcSignals = detectArcSignals(party, day)
  return party.arcSignals
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
}

function arcRelevanceScore(
  signal: CharacterArcSignal,
  focus: string,
  request: NarrativeRequestInfo,
  sceneCharacterIds: string[],
  day: number,
): number {
  const tokens = new Set(
    tokenize(
      `${focus} ${request.title} ${request.briefing} ${request.publicTags.join(' ')}`,
    ),
  )
  const summary = arcSignalSummary(signal, new Map())
  const summaryTokens = tokenize(summary)
  let overlap = 0
  for (const t of summaryTokens) {
    if (tokens.has(t)) overlap += 1
  }
  const characterOverlap = signal.characterIds.filter((id) =>
    sceneCharacterIds.includes(id),
  ).length
  const characterBonus =
    signal.characterIds.length === characterOverlap ? 3 : characterOverlap
  const recencyBonus =
    signal.lastUpdatedDay !== undefined
      ? Math.max(0, 2 - (day - signal.lastUpdatedDay) / 5)
      : 0
  return (
    signal.strength * 0.4 +
    signal.confidence * 0.2 +
    overlap * 2 +
    characterBonus * 4 +
    recencyBonus
  )
}

export function projectArcSignalsForNarrative(
  party: CampaignParty,
  focus: string,
  request: NarrativeRequestInfo,
  sceneCharacterIds: string[],
  day: number,
): NarrativeArcSignal[] {
  const signals = party.arcSignals ?? []
  const scored = signals.map((s) => ({
    signal: s,
    score: arcRelevanceScore(s, focus, request, sceneCharacterIds, day),
  }))
  scored.sort((a, b) => b.score - a.score)

  const selected: NarrativeArcSignal[] = []
  const pairCounts = new Map<string, number>()
  const memberMapForNames = memberMap(party)

  for (const { signal } of scored) {
    const characterOverlap = signal.characterIds.filter((id) =>
      sceneCharacterIds.includes(id),
    ).length
    if (characterOverlap === 0) continue

    const key = signal.sourceCharacterId
      ? `${signal.sourceCharacterId}:${signal.targetCharacterId}`
      : sortedPairKey(
          signal.characterIds[0]!,
          signal.characterIds[1] ?? signal.characterIds[0]!,
        )
    const count = pairCounts.get(key) ?? 0
    if (count >= 2) continue
    if (selected.length >= 5) break
    if (selected.length >= 3 && signal.strength < 30) break
    selected.push({
      type: signal.type,
      summary: arcSignalSummary(signal, memberMapForNames),
      strength: signal.strength,
      confidence: signal.confidence,
      status: signal.status,
      direction: signal.direction,
      characterIds: signal.characterIds,
      sourceCharacterId: signal.sourceCharacterId,
      targetCharacterId: signal.targetCharacterId,
    })
    pairCounts.set(key, count + 1)
  }

  return selected
}

function memberName(
  members: MemberMap | Map<string, string>,
  id: string,
): string {
  const entry = members.get(id)
  if (typeof entry === 'string') return entry
  return entry?.name ?? id
}

export function arcSignalSummary(
  signal: CharacterArcSignal | NarrativeArcSignal,
  members: MemberMap | Map<string, string>,
): string {
  const names = signal.characterIds.map((id) => memberName(members, id))
  const sourceName = signal.sourceCharacterId
    ? memberName(members, signal.sourceCharacterId)
    : names[0]
  const targetName = signal.targetCharacterId
    ? memberName(members, signal.targetCharacterId)
    : (names[1] ?? names[0])

  switch (signal.type) {
    case 'growing_reliance':
      return `${sourceName}は${targetName}を頼る傾向がある`
    case 'growing_trust':
      return `${sourceName}は${targetName}を信頼し始めている`
    case 'recurring_support':
      return `${targetName}が${sourceName}を繰り返し支援している`
    case 'comfortable_familiarity':
      return `${sourceName}と${targetName}は互いの行動に慣れている`
    case 'comfortable_teasing':
      return `${sourceName}と${targetName}は気安いやり取りが増えている`
    case 'protective_pattern':
      return `${targetName}が${sourceName}を守る場面が繰り返されている`
    case 'recurring_conflict':
      return `${sourceName}と${targetName}は何度も対立している`
    case 'decision_friction':
      return `${sourceName}と${targetName}の間で意見のすれ違いがある`
    case 'eroding_trust':
      return `${sourceName}は${targetName}への信頼を失いかけている`
    case 'growing_tension':
      return `${sourceName}と${targetName}の間に緊張が溜まっている`
    case 'avoidance_pattern':
      return `${sourceName}と${targetName}は互いを避ける傾向がある`
    case 'shared_failure_bond':
      return `${sourceName}と${targetName}は困難を共にし、それでも協力し合っている`
    case 'shared_success_bond':
      return `${sourceName}と${targetName}は成功を共にしてきた`
    case 'unresolved_debt':
      return `${sourceName}は${targetName}に大きな恩義を感じている`
    case 'reciprocal_support':
      return `${sourceName}と${targetName}は互いに何度も助け合っている`
    case 'romantic_interest_possible':
      return `${sourceName}は${targetName}を特に意識している傾向がある`
    case 'repeated_injury':
      return `${sourceName}は遠征で何度も傷ついている`
    case 'repeated_success':
      return `${sourceName}は成功を重ねている`
    case 'repeated_failure':
      return `${sourceName}は最近失敗が続いている`
    default:
      return `${names.join('、')}に関する傾向`
  }
}

export function arcSignalPlayerLabel(
  signal: CharacterArcSignal,
  members: MemberMap,
): string {
  return arcSignalSummary(signal, members)
}
