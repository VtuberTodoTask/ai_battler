import { ROLE_MAP } from '../../data/roles.ts'
import { clamp } from '../util.ts'
import type {
  AcceptanceContext,
  AcceptanceReasonCode,
  AdventurerParty,
  OfferEvaluation,
  PartyRiskTolerance,
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

export const DEFAULT_ACCEPTANCE_CONTEXT: AcceptanceContext = {
  affinity: 10,
  financialPressure: 40,
  riskTolerance: 'balanced',
  growthMilestones: 0,
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

export function computeLeaderJudgment(party: AdventurerParty): number {
  const leader = party.members.find((m) => m.id === party.leaderId)
  if (!leader) {
    return 0
  }
  const raw = Math.round(
    (leader.stats.int + leader.stats.per + leader.skills.leadership) / 3,
  )
  return Math.max(0, Math.min(100, raw))
}

function computeRelevantCapability(
  party: AdventurerParty,
  relevantRoles: Set<string>,
): number {
  const relevantMembers = party.members.filter((m) => relevantRoles.has(m.role))
  if (relevantMembers.length === 0) return 0

  const values = relevantMembers.map((m) => {
    const expert = ROLE_MAP[m.role]?.expertSkills ?? []
    if (expert.length === 0) return 0
    return Math.max(...expert.map((skill) => m.skills[skill]))
  })
  const average = values.reduce((a, b) => a + b, 0) / values.length

  if (average >= 80) return 8
  if (average >= 70) return 5
  if (average >= 60) return 2
  if (average < 45) return -5
  return 0
}

function hpReadiness(party: AdventurerParty): number {
  const ratio =
    party.members.reduce((sum, m) => sum + m.currentHp / m.maxHp, 0) /
    party.members.length
  if (ratio < 0.5) return -15
  if (ratio < 0.75) return -5
  return 0
}

function moraleReadiness(party: AdventurerParty): number {
  const average =
    party.members.reduce((sum, m) => sum + m.morale, 0) / party.members.length
  if (average < 40) return -10
  if (average < 60) return -5
  if (average >= 80) return 3
  return 0
}

function affinityModifier(affinity: number): number {
  if (affinity < 20) return -5
  if (affinity < 40) return 0
  if (affinity < 60) return 6
  if (affinity < 80) return 12
  return 18
}

function financialPressureModifier(pressure: number): number {
  if (pressure < 20) return -5
  if (pressure < 40) return 0
  if (pressure < 60) return 5
  if (pressure < 80) return 10
  return 15
}

function riskModifier(riskTolerance: PartyRiskTolerance): number {
  if (riskTolerance === 'cautious') return -10
  if (riskTolerance === 'bold') return 10
  return 0
}

function roleFitModifier(relevantRoleCount: number): number {
  if (relevantRoleCount === 0) return -25
  if (relevantRoleCount === 1) return -10
  if (relevantRoleCount === 2) return 0
  if (relevantRoleCount === 3) return 10
  return 15
}

function leaderJudgmentModifier(leaderJudgment: number): number {
  return clamp(Math.round((leaderJudgment - 50) / 5), -10, 10)
}

function baseModifier(rankGap: number): number {
  if (rankGap === 0) return 60
  if (rankGap === 1) return 30
  return 0
}

export function computeAcceptanceModifiers(
  party: AdventurerParty,
  request: PublicRequestProfile,
  context: AcceptanceContext,
) {
  const relevantRoles = buildRelevantRoles(request)
  const relevantRoleCount = countRelevantRoles(party, relevantRoles)
  const leaderJudgment = computeLeaderJudgment(party)
  const relevantCapability = computeRelevantCapability(party, relevantRoles)

  const rankGap = rankValue(request.rank) - rankValue(party.rank)

  const modifiers = {
    base: baseModifier(rankGap),
    roleFit: roleFitModifier(relevantRoleCount),
    leaderJudgment: leaderJudgmentModifier(leaderJudgment),
    relevantCapability,
    growth: clamp(context.growthMilestones * 3, 0, 12),
    affinity: affinityModifier(context.affinity),
    financialPressure: financialPressureModifier(context.financialPressure),
    risk: riskModifier(context.riskTolerance),
    hpReadiness: hpReadiness(party),
    moraleReadiness: moraleReadiness(party),
  }

  const score = Object.values(modifiers).reduce((a, b) => a + b, 0)
  return {
    rankGap,
    relevantRoleCount,
    leaderJudgment,
    modifiers,
    score,
  }
}

function thresholdFor(rankGap: number, relevantRoleCount: number): number {
  if (rankGap === 1 && relevantRoleCount === 0) return 65
  return 50
}

function chooseAcceptedReason(
  context: AcceptanceContext,
  modifiers: OfferEvaluation['modifiers'],
): AcceptanceReasonCode {
  const candidates = [
    { key: 'affinity', value: modifiers.affinity, min: 12 },
    { key: 'financialPressure', value: modifiers.financialPressure, min: 10 },
    { key: 'risk', value: modifiers.risk, min: 10 },
    { key: 'growth', value: modifiers.growth, min: 6 },
  ] as const

  const best = candidates.reduce((a, b) => (b.value > a.value ? b : a))

  if (best.key === 'affinity' && context.affinity >= 60 && best.value >= 12) {
    return 'trustedBroker'
  }
  if (
    best.key === 'financialPressure' &&
    context.financialPressure >= 60 &&
    best.value >= 10
  ) {
    return 'needsIncome'
  }
  if (
    best.key === 'risk' &&
    context.riskTolerance === 'bold' &&
    best.value >= 10
  ) {
    return 'boldChallenge'
  }
  return 'challengingButSuitable'
}

function chooseDeclinedReason(
  context: AcceptanceContext,
  modifiers: OfferEvaluation['modifiers'],
  rankGap: number,
  relevantRoleCount: number,
  score: number,
  threshold: number,
): AcceptanceReasonCode {
  if (rankGap >= 2) return 'tooDangerous'
  if (relevantRoleCount === 0) return 'poorFit'
  if (rankGap === 1 && relevantRoleCount < 3) return 'poorFit'

  const scoreWithoutRisk = score - modifiers.risk
  if (
    context.riskTolerance === 'cautious' &&
    modifiers.risk === -10 &&
    scoreWithoutRisk >= threshold
  ) {
    return 'cautious'
  }

  const scoreWithoutReadiness =
    score - modifiers.hpReadiness - modifiers.moraleReadiness
  if (
    (modifiers.hpReadiness < 0 || modifiers.moraleReadiness < 0) &&
    scoreWithoutReadiness >= threshold
  ) {
    return 'notReady'
  }

  if (rankGap === 1) return 'tooDangerous'
  return 'tooDangerous'
}

export function evaluateOffer(
  request: PublicRequestProfile,
  party: AdventurerParty,
  context?: Partial<AcceptanceContext>,
): OfferEvaluation {
  const fullContext: AcceptanceContext = {
    ...DEFAULT_ACCEPTANCE_CONTEXT,
    ...context,
  }

  const { rankGap, relevantRoleCount, leaderJudgment, modifiers, score } =
    computeAcceptanceModifiers(party, request, fullContext)

  const threshold = thresholdFor(rankGap, relevantRoleCount)

  let decision: 'accepted' | 'declined'
  let reason: AcceptanceReasonCode

  if (rankGap >= 2) {
    decision = 'declined'
    reason = 'tooDangerous'
  } else if (rankGap <= -1) {
    decision = 'accepted'
    reason = 'appropriate'
  } else {
    decision = score >= threshold ? 'accepted' : 'declined'
    if (decision === 'accepted') {
      reason =
        rankGap === 0
          ? 'appropriate'
          : chooseAcceptedReason(fullContext, modifiers)
    } else {
      reason = chooseDeclinedReason(
        fullContext,
        modifiers,
        rankGap,
        relevantRoleCount,
        score,
        threshold,
      )
    }
  }

  return {
    decision,
    reason,
    requestRank: request.rank,
    partyRank: party.rank,
    rankGap,
    relevantRoleCount,
    leaderJudgment,
    acceptanceScore: score,
    acceptanceThreshold: threshold,
    modifiers,
    affinity: fullContext.affinity,
    financialPressure: fullContext.financialPressure,
    riskTolerance: fullContext.riskTolerance,
  }
}

export function acceptanceReasonText(reason: AcceptanceReasonCode): string {
  switch (reason) {
    case 'appropriate':
      return '「この依頼なら対応できる。引き受けよう」'
    case 'challengingButSuitable':
      return '「少し危険な仕事だが、今のメンバーなら対応できる。引き受けよう」'
    case 'trustedBroker':
      return '「格上の仕事か……だが、あんたの紹介なら信じてみよう」'
    case 'needsIncome':
      return '「危険なのは分かっているが、今は稼ぎが必要だ。引き受ける」'
    case 'boldChallenge':
      return '「格上か。面白い、やってみよう」'
    case 'tooDangerous':
      return '「悪いが、この依頼は今の俺たちには荷が重い」'
    case 'poorFit':
      return '「この仕事は俺たち向きではない。別のパーティを当たってくれ」'
    case 'cautious':
      return '「やれなくはないかもしれないが、今は無理をする時じゃない」'
    case 'notReady':
      return '「今の状態でこの仕事を受けるのは危険だ。今回は断る」'
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
