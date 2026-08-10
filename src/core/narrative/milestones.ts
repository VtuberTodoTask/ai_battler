import type { CampaignParty } from '../tavern/campaign/types.ts'
import type {
  CharacterArcSignal,
  NarrativeRelationshipMilestone,
  NarrativeRequestInfo,
  RelationshipMilestone,
  RelationshipMilestoneCandidate,
  RelationshipMilestoneType,
} from './types.ts'

interface MilestoneThresholdConfig {
  minSignalStrength: number
  minSignalConfidence: number
  minSharedExpeditions: number
  minSupportingMemories: number
}

const DEFAULT_THRESHOLD: MilestoneThresholdConfig = {
  minSignalStrength: 55,
  minSignalConfidence: 60,
  minSharedExpeditions: 3,
  minSupportingMemories: 2,
}

function sortedPairKey(a: string, b: string): string {
  return [a, b].sort().join(':')
}

function pairKey(a: string, b: string): string {
  return `${a}:${b}`
}

function getRelationship(party: CampaignParty, a: string, b: string) {
  return party.memberRelationships?.[pairKey(a, b)]
}

function sharedExpeditions(party: CampaignParty, a: string, b: string): number {
  return (
    party.sharedExpeditionCounts?.[sortedPairKey(a, b)] ??
    getRelationship(party, a, b)?.sharedExpeditions ??
    0
  )
}

function memberMap(party: CampaignParty): Map<string, string> {
  return new Map(party.party.members.map((m) => [m.id, m.name ?? m.id]))
}

function milestoneKey(
  type: RelationshipMilestoneType,
  sourceCharacterId: string | undefined,
  targetCharacterId: string | undefined,
  characterIds: string[],
): string {
  if (sourceCharacterId && targetCharacterId)
    return `${type}:${sourceCharacterId}:${targetCharacterId}`
  return `${type}:${[...characterIds].sort().join(':')}`
}

function isSignalEstablished(signal: CharacterArcSignal | undefined): boolean {
  return signal !== undefined && signal.status === 'established'
}

function isSignalStrong(
  signal: CharacterArcSignal | undefined,
  threshold: MilestoneThresholdConfig,
): boolean {
  return (
    signal !== undefined &&
    signal.status === 'established' &&
    signal.strength >= threshold.minSignalStrength &&
    signal.confidence >= threshold.minSignalConfidence &&
    signal.supportingMemoryIds.length >= threshold.minSupportingMemories
  )
}

function findSignal(
  party: CampaignParty,
  type: string,
  sourceCharacterId?: string,
  targetCharacterId?: string,
): CharacterArcSignal | undefined {
  return party.arcSignals?.find((s) => {
    if (s.type !== type) return false
    if (sourceCharacterId && targetCharacterId) {
      return (
        s.sourceCharacterId === sourceCharacterId &&
        s.targetCharacterId === targetCharacterId
      )
    }
    return true
  })
}

function findSignalForPair(
  party: CampaignParty,
  type: string,
  a: string,
  b: string,
): CharacterArcSignal | undefined {
  const set = new Set([a, b])
  return party.arcSignals?.find(
    (s) =>
      s.type === type &&
      s.characterIds.length === 2 &&
      set.has(s.characterIds[0]!) &&
      set.has(s.characterIds[1]!),
  )
}

function positiveMemoryCount(
  party: CampaignParty,
  a: string,
  b: string,
): number {
  const aToB = getRelationship(party, a, b)?.recentEvents ?? []
  const bToA = getRelationship(party, b, a)?.recentEvents ?? []
  return aToB
    .concat(bToA)
    .filter(
      (m) =>
        m.type === 'healed' ||
        m.type === 'rescued' ||
        m.type === 'protected' ||
        m.type === 'supported' ||
        m.type === 'shared_success' ||
        m.type === 'trust_event',
    ).length
}

function negativeMemoryCount(
  party: CampaignParty,
  a: string,
  b: string,
): number {
  const aToB = getRelationship(party, a, b)?.recentEvents ?? []
  const bToA = getRelationship(party, b, a)?.recentEvents ?? []
  return aToB
    .concat(bToA)
    .filter(
      (m) =>
        m.type === 'abandoned' ||
        m.type === 'conflict' ||
        m.type === 'disagreement' ||
        m.type === 'shared_failure' ||
        m.type === 'casualty',
    ).length
}

function conflictMemoryCount(
  party: CampaignParty,
  a: string,
  b: string,
): number {
  const aToB = getRelationship(party, a, b)?.recentEvents ?? []
  const bToA = getRelationship(party, b, a)?.recentEvents ?? []
  return aToB
    .concat(bToA)
    .filter((m) => m.type === 'conflict' || m.type === 'disagreement').length
}

function laterCooperationCount(
  party: CampaignParty,
  a: string,
  b: string,
): number {
  const sharedFailure = [
    ...(getRelationship(party, a, b)?.recentEvents ?? []),
    ...(getRelationship(party, b, a)?.recentEvents ?? []),
  ].filter((m) => m.type === 'shared_failure')
  if (sharedFailure.length === 0) return 0
  const latestFailureDay = Math.max(...sharedFailure.map((m) => m.day ?? 0))
  return [
    ...(getRelationship(party, a, b)?.recentEvents ?? []),
    ...(getRelationship(party, b, a)?.recentEvents ?? []),
  ].filter(
    (m) =>
      (m.type === 'shared_success' ||
        m.type === 'healed' ||
        m.type === 'rescued' ||
        m.type === 'supported') &&
      (m.day ?? 0) > latestFailureDay,
  ).length
}

function signalMemoryIds(signals: CharacterArcSignal[]): string[] {
  const ids = new Set<string>()
  for (const s of signals) {
    for (const id of s.supportingMemoryIds) ids.add(id)
  }
  return [...ids]
}

function candidateFromSignals(
  type: RelationshipMilestoneType,
  characterIds: string[],
  signals: CharacterArcSignal[],
  sourceCharacterId?: string,
  targetCharacterId?: string,
): RelationshipMilestoneCandidate {
  const strength =
    signals.reduce((sum, s) => sum + s.strength, 0) /
    Math.max(1, signals.length)
  const confidence =
    signals.reduce((sum, s) => sum + s.confidence, 0) /
    Math.max(1, signals.length)
  const supportingMemoryIds = signalMemoryIds(signals)
  return {
    type,
    characterIds,
    sourceCharacterId,
    targetCharacterId,
    score: strength,
    confidence,
    supportingArcSignalIds: signals.map((s) => s.id),
    supportingMemoryIds,
    eligible: false,
  }
}

function makeEligible(
  candidate: RelationshipMilestoneCandidate,
): RelationshipMilestoneCandidate {
  return { ...candidate, eligible: true }
}

export function detectRelationshipMilestoneCandidates(
  party: CampaignParty,
  _day: number,
  threshold: MilestoneThresholdConfig = DEFAULT_THRESHOLD,
): RelationshipMilestoneCandidate[] {
  const candidates: RelationshipMilestoneCandidate[] = []
  const members = party.party.members

  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i]!.id
      const b = members[j]!.id
      const shared = sharedExpeditions(party, a, b)

      // established_mutual_reliance
      const aReliesB = findSignal(party, 'growing_reliance', a, b)
      const bReliesA = findSignal(party, 'growing_reliance', b, a)
      if (
        isSignalStrong(aReliesB, threshold) &&
        isSignalStrong(bReliesA, threshold) &&
        shared >= threshold.minSharedExpeditions
      ) {
        candidates.push(
          makeEligible(
            candidateFromSignals(
              'established_mutual_reliance',
              [a, b],
              [aReliesB!, bReliesA!],
            ),
          ),
        )
      }

      // established_directional_reliance
      const directions: Array<[string, string]> = [
        [a, b],
        [b, a],
      ]
      for (const [source, target] of directions) {
        const strong = findSignal(party, 'growing_reliance', source, target)
        const reverse = findSignal(party, 'growing_reliance', target, source)
        if (
          isSignalStrong(strong, threshold) &&
          !isSignalEstablished(reverse) &&
          shared >= threshold.minSharedExpeditions
        ) {
          candidates.push(
            makeEligible(
              candidateFromSignals(
                'established_directional_reliance',
                [source, target],
                [strong!],
                source,
                target,
              ),
            ),
          )
        }
      }

      // established_working_rhythm
      const comfort = findSignalForPair(party, 'comfortable_familiarity', a, b)
      if (
        isSignalStrong(comfort, threshold) &&
        shared >= threshold.minSharedExpeditions &&
        positiveMemoryCount(party, a, b) >= 3 &&
        !isSignalEstablished(
          findSignalForPair(party, 'recurring_conflict', a, b),
        )
      ) {
        candidates.push(
          makeEligible(
            candidateFromSignals(
              'established_working_rhythm',
              [a, b],
              [comfort!],
            ),
          ),
        )
      }

      // established_reciprocal_support
      const reciprocal = findSignalForPair(party, 'reciprocal_support', a, b)
      if (
        isSignalStrong(reciprocal, threshold) &&
        shared >= threshold.minSharedExpeditions &&
        positiveMemoryCount(party, a, b) >= 3
      ) {
        candidates.push(
          makeEligible(
            candidateFromSignals(
              'established_reciprocal_support',
              [a, b],
              [reciprocal!],
            ),
          ),
        )
      }

      // established_trusted_friction
      const relA = getRelationship(party, a, b)
      const conflict = findSignalForPair(party, 'recurring_conflict', a, b)
      const anyReliance =
        isSignalEstablished(aReliesB) || isSignalEstablished(bReliesA)
      if (
        anyReliance &&
        isSignalEstablished(conflict) &&
        relA &&
        relA.trust >= 70 &&
        relA.tension >= 70 &&
        shared >= 2
      ) {
        const supporting = [aReliesB, bReliesA, conflict].filter(
          (s): s is CharacterArcSignal => s !== undefined,
        )
        candidates.push(
          makeEligible(
            candidateFromSignals(
              'established_trusted_friction',
              [a, b],
              supporting,
            ),
          ),
        )
      }

      // established_decision_friction
      const friction = findSignalForPair(party, 'decision_friction', a, b)
      if (
        (isSignalEstablished(friction) ||
          (isSignalEstablished(conflict) &&
            conflictMemoryCount(party, a, b) >= 2)) &&
        shared >= 2
      ) {
        const supporting = [friction, conflict].filter(
          (s): s is CharacterArcSignal => s !== undefined,
        )
        candidates.push(
          makeEligible(
            candidateFromSignals(
              'established_decision_friction',
              [a, b],
              supporting,
            ),
          ),
        )
      }

      // established_strained_trust
      const eroding = findSignalForPair(party, 'eroding_trust', a, b)
      const erodingReverse = findSignalForPair(party, 'eroding_trust', b, a)
      const activeEroding =
        isSignalEstablished(eroding) || isSignalEstablished(erodingReverse)
      if (
        activeEroding &&
        relA &&
        relA.trust >= 55 &&
        negativeMemoryCount(party, a, b) >= 2
      ) {
        const supporting = [eroding, erodingReverse].filter(
          (s): s is CharacterArcSignal => s !== undefined,
        )
        candidates.push(
          makeEligible(
            candidateFromSignals(
              'established_strained_trust',
              [a, b],
              supporting,
            ),
          ),
        )
      }

      // established_shared_resilience
      const failureBond = findSignalForPair(party, 'shared_failure_bond', a, b)
      const relAStats = getRelationship(party, a, b)
      if (
        isSignalStrong(failureBond, threshold) &&
        laterCooperationCount(party, a, b) >= 1 &&
        relAStats &&
        relAStats.affinity >= 55
      ) {
        candidates.push(
          makeEligible(
            candidateFromSignals(
              'established_shared_resilience',
              [a, b],
              [failureBond!],
            ),
          ),
        )
      }
    }

    // persistent_romantic_interest (directional per source)
    const sourceCharacterId = members[i]!.id
    for (let j = 0; j < members.length; j++) {
      if (i === j) continue
      const targetCharacterId = members[j]!.id
      const rel = getRelationship(party, sourceCharacterId, targetCharacterId)
      const romantic = findSignal(
        party,
        'romantic_interest_possible',
        sourceCharacterId,
        targetCharacterId,
      )
      const shared = sharedExpeditions(
        party,
        sourceCharacterId,
        targetCharacterId,
      )
      if (
        rel &&
        rel.romanticAttraction !== undefined &&
        rel.romanticAttraction >= 60 &&
        isSignalStrong(romantic, { ...threshold, minSharedExpeditions: 2 }) &&
        shared >= 2
      ) {
        candidates.push(
          makeEligible(
            candidateFromSignals(
              'persistent_romantic_interest',
              [sourceCharacterId, targetCharacterId],
              [romantic!],
              sourceCharacterId,
              targetCharacterId,
            ),
          ),
        )
      }
    }
  }

  // Deduplicate by key, keeping the eligible candidate with highest score.
  const byKey = new Map<string, RelationshipMilestoneCandidate>()
  for (const c of candidates) {
    const key = milestoneKey(
      c.type,
      c.sourceCharacterId,
      c.targetCharacterId,
      c.characterIds,
    )
    const existing = byKey.get(key)
    if (!existing || c.score > existing.score) {
      byKey.set(key, c)
    }
  }
  return [...byKey.values()]
}

export function promoteRelationshipMilestones(
  party: CampaignParty,
  day: number,
  threshold: MilestoneThresholdConfig = DEFAULT_THRESHOLD,
): RelationshipMilestone[] {
  const candidates = detectRelationshipMilestoneCandidates(
    party,
    day,
    threshold,
  )
  const existing = new Map<string, RelationshipMilestone>()
  for (const m of party.relationshipMilestones ?? []) {
    existing.set(
      milestoneKey(
        m.type,
        m.sourceCharacterId,
        m.targetCharacterId,
        m.characterIds,
      ),
      m,
    )
  }

  const next: RelationshipMilestone[] = []
  const candidateKeys = new Set<string>()

  // Promote new candidates.
  for (const c of candidates) {
    if (!c.eligible) continue
    const key = milestoneKey(
      c.type,
      c.sourceCharacterId,
      c.targetCharacterId,
      c.characterIds,
    )
    candidateKeys.add(key)
    if (existing.has(key)) continue
    const id = `milestone:${c.type}:${c.sourceCharacterId ?? ''}:${c.targetCharacterId ?? ''}:${[...c.characterIds].sort().join(':')}:${day}`
    next.push({
      id,
      type: c.type,
      characterIds: c.characterIds,
      sourceCharacterId: c.sourceCharacterId,
      targetCharacterId: c.targetCharacterId,
      achievedDay: day,
      status: 'active',
      strength: Math.round(c.score),
      confidence: Math.round(c.confidence),
      supportingArcSignalIds: c.supportingArcSignalIds,
      supportingMemoryIds: c.supportingMemoryIds,
    })
  }

  // Merge existing milestones: active if still supported, legacy otherwise.
  for (const m of party.relationshipMilestones ?? []) {
    const key = milestoneKey(
      m.type,
      m.sourceCharacterId,
      m.targetCharacterId,
      m.characterIds,
    )
    if (candidateKeys.has(key)) {
      // Keep active; optionally update strength/confidence from the matched candidate.
      const candidate = candidates.find(
        (c) =>
          milestoneKey(
            c.type,
            c.sourceCharacterId,
            c.targetCharacterId,
            c.characterIds,
          ) === key,
      )
      next.push({
        ...m,
        status: 'active',
        strength: candidate ? Math.round(candidate.score) : m.strength,
        confidence: candidate ? Math.round(candidate.confidence) : m.confidence,
      })
    } else {
      next.push({
        ...m,
        status: 'legacy',
        deactivatedDay: m.deactivatedDay ?? day,
      })
    }
  }

  // Sort deterministically: active first, then by type, then by character ids.
  next.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    if (a.type !== b.type) return a.type.localeCompare(b.type)
    return a.characterIds.join(':').localeCompare(b.characterIds.join(':'))
  })

  return next
}

export function updateRelationshipMilestones(
  party: CampaignParty,
  day: number,
  threshold: MilestoneThresholdConfig = DEFAULT_THRESHOLD,
): RelationshipMilestone[] {
  party.relationshipMilestones = promoteRelationshipMilestones(
    party,
    day,
    threshold,
  )
  return party.relationshipMilestones
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0)
}

function milestoneRelevanceScore(
  milestone: RelationshipMilestone,
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
  const summary = milestoneSummary(milestone, new Map())
  const summaryTokens = tokenize(summary)
  let overlap = 0
  for (const t of summaryTokens) {
    if (tokens.has(t)) overlap += 1
  }
  const characterOverlap = milestone.characterIds.filter((id) =>
    sceneCharacterIds.includes(id),
  ).length
  const characterBonus =
    milestone.characterIds.length === characterOverlap
      ? 4
      : characterOverlap * 2
  const recencyBonus = Math.max(0, 3 - (day - milestone.achievedDay) / 7)
  return (
    milestone.strength * 0.4 +
    milestone.confidence * 0.25 +
    overlap * 2 +
    characterBonus * 5 +
    recencyBonus
  )
}

export function projectRelationshipMilestonesForNarrative(
  party: CampaignParty,
  focus: string,
  request: NarrativeRequestInfo,
  sceneCharacterIds: string[],
  day: number,
): NarrativeRelationshipMilestone[] {
  const milestones = party.relationshipMilestones ?? []
  const scored = milestones.map((m) => ({
    milestone: m,
    score: milestoneRelevanceScore(m, focus, request, sceneCharacterIds, day),
  }))
  scored.sort((a, b) => b.score - a.score)

  const selected: NarrativeRelationshipMilestone[] = []
  const pairCounts = new Map<string, number>()
  const names = memberMap(party)

  for (const { milestone } of scored) {
    const characterOverlap = milestone.characterIds.filter((id) =>
      sceneCharacterIds.includes(id),
    ).length
    if (characterOverlap === 0) continue

    const key = milestone.sourceCharacterId
      ? `${milestone.sourceCharacterId}:${milestone.targetCharacterId}`
      : sortedPairKey(milestone.characterIds[0]!, milestone.characterIds[1]!)
    const count = pairCounts.get(key) ?? 0
    if (count >= 1) continue
    if (selected.length >= 3) break
    if (selected.length >= 2 && milestone.status === 'legacy') break
    selected.push({
      type: milestone.type,
      summary: milestoneSummary(milestone, names),
      strength: milestone.strength,
      confidence: milestone.confidence,
      status: milestone.status,
      characterIds: milestone.characterIds,
      sourceCharacterId: milestone.sourceCharacterId,
      targetCharacterId: milestone.targetCharacterId,
    })
    pairCounts.set(key, count + 1)
  }

  return selected
}

function milestoneSummaryBase(type: RelationshipMilestoneType): string {
  switch (type) {
    case 'established_mutual_reliance':
      return '危険時や判断時に互いを頼る関係が定着'
    case 'established_directional_reliance':
      return '危険時や判断時に相手を頼る関係が定着'
    case 'established_working_rhythm':
      return '説明を重ねなくても仕事上の役割分担が成立'
    case 'established_reciprocal_support':
      return '互いに助ける履歴が定着'
    case 'established_trusted_friction':
      return '衝突しても互いの能力や判断を頼る関係'
    case 'established_decision_friction':
      return '判断方針で繰り返しすれ違いがある関係'
    case 'established_strained_trust':
      return 'まだ信用は残っているが亀裂が定着し始めている'
    case 'established_shared_resilience':
      return '困難な失敗や被害を経験した後も協力関係が維持'
    case 'persistent_romantic_interest':
      return '恋愛的な関心が継続的な傾向になっている'
    default:
      return '関係の節目'
  }
}

export function milestoneSummary(
  milestone: RelationshipMilestone | NarrativeRelationshipMilestone,
  members: Map<string, string>,
): string {
  const a = members.get(milestone.characterIds[0]!) ?? milestone.characterIds[0]
  const b =
    members.get(milestone.characterIds[1]!) ?? milestone.characterIds[1] ?? a
  const base = milestoneSummaryBase(milestone.type)

  if (milestone.sourceCharacterId) {
    const source =
      members.get(milestone.sourceCharacterId) ?? milestone.sourceCharacterId
    const target =
      members.get(milestone.targetCharacterId!) ?? milestone.targetCharacterId!
    if (milestone.type === 'established_directional_reliance') {
      return `${source} → ${target}：${base}`
    }
    if (milestone.type === 'persistent_romantic_interest') {
      return `${source} → ${target}：${base}`
    }
  }

  return `${a} ↔ ${b}：${base}`
}

export function milestonePlayerLabel(
  milestone: RelationshipMilestone,
  members: Map<string, string>,
): string {
  return milestoneSummary(milestone, members)
}
