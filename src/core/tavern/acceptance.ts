import type {
  AdventurerParty,
  AcceptanceReasonCode,
  OfferEvaluation,
  PublicRequestProfile,
} from './types.ts'

const RANK_VALUE: Record<string, number> = {
  E: 0,
  D: 1,
  C: 2,
  B: 3,
  A: 4,
  S: 5,
}

const OBJECTIVE_RELEVANT_ROLES: Record<
  PublicRequestProfile['objectiveType'],
  string[]
> = {
  investigation: ['scout', 'ranger', 'mage', 'support'],
  elimination: ['vanguard', 'guardian', 'mage', 'healer'],
  rescue: ['scout', 'guardian', 'healer', 'vanguard'],
  escort: ['guardian', 'support', 'ranger', 'healer'],
  retrieval: ['scout', 'vanguard', 'support', 'ranger'],
  survey: ['scout', 'ranger', 'mage', 'support'],
}

const ENVIRONMENT_RELEVANT_ROLES: Record<string, string[]> = {
  magical: ['mage'],
  cave: ['scout'],
  ruins: ['scout'],
  urban: ['scout'],
  forest: ['ranger'],
  mountain: ['ranger'],
  plains: ['ranger'],
  swamp: ['ranger'],
  desert: ['ranger'],
}

function rankValue(rank: string): number {
  return RANK_VALUE[rank] ?? 0
}

function buildRelevantRoles(request: PublicRequestProfile): Set<string> {
  const roles = new Set<string>(
    OBJECTIVE_RELEVANT_ROLES[request.objectiveType] ?? [],
  )
  const environmentRoles = ENVIRONMENT_RELEVANT_ROLES[request.environment] ?? []
  for (const role of environmentRoles) {
    roles.add(role)
  }
  return roles
}

function countRelevantRoles(
  party: AdventurerParty,
  relevantRoles: Set<string>,
): number {
  return party.members.filter((member) => relevantRoles.has(member.role)).length
}

function computeLeaderJudgment(party: AdventurerParty): number {
  const leader = party.members.find((m) => m.id === party.leaderId)
  if (!leader) {
    return 0
  }
  const raw = Math.round(
    (leader.stats.int + leader.stats.per + leader.skills.leadership) / 3,
  )
  return Math.max(0, Math.min(100, raw))
}

export function evaluateOffer(
  request: PublicRequestProfile,
  party: AdventurerParty,
): OfferEvaluation {
  const requestRankValue = rankValue(request.rank)
  const partyRankValue = rankValue(party.rank)
  const rankGap = requestRankValue - partyRankValue

  const relevantRoles = buildRelevantRoles(request)
  const relevantRoleCount = countRelevantRoles(party, relevantRoles)
  const leaderJudgment = computeLeaderJudgment(party)

  let decision: 'accepted' | 'declined'
  let reason: AcceptanceReasonCode

  if (rankGap >= 2) {
    decision = 'declined'
    reason = 'tooDangerous'
  } else if (rankGap === 1) {
    if (relevantRoleCount >= 3 && leaderJudgment >= 55) {
      decision = 'accepted'
      reason = 'challengingButSuitable'
    } else if (relevantRoleCount < 3) {
      decision = 'declined'
      reason = 'poorFit'
    } else {
      decision = 'declined'
      reason = 'tooDangerous'
    }
  } else if (rankGap === 0) {
    if (relevantRoleCount >= 1) {
      decision = 'accepted'
      reason = 'appropriate'
    } else {
      decision = 'declined'
      reason = 'poorFit'
    }
  } else {
    decision = 'accepted'
    reason = 'appropriate'
  }

  return {
    decision,
    reason,
    requestRank: request.rank,
    partyRank: party.rank,
    rankGap,
    relevantRoleCount,
    leaderJudgment,
  }
}

export function acceptanceReasonText(reason: AcceptanceReasonCode): string {
  switch (reason) {
    case 'appropriate':
      return '「この依頼なら対応できる。引き受けよう」'
    case 'challengingButSuitable':
      return '「少し危険な仕事だが、今のメンバーなら対応できる。引き受けよう」'
    case 'tooDangerous':
      return '「悪いが、この依頼は今の俺たちには荷が重い」'
    case 'poorFit':
      return '「この仕事は俺たち向きではない。別のパーティを当たってくれ」'
  }
}

export function toPublicRequestProfile(
  request: Pick<
    import('./types.ts').TavernRequestOffer,
    'id' | 'objectiveType' | 'rank' | 'environment' | 'publicTags'
  >,
): PublicRequestProfile {
  return {
    id: request.id,
    objectiveType: request.objectiveType,
    rank: request.rank,
    environment: request.environment,
    publicTags: request.publicTags,
  }
}
