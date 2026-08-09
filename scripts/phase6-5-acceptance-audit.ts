import { writeFileSync } from 'node:fs'
import {
  evaluateOffer,
  toPublicRequestProfile,
  acceptanceReasonText,
} from '../src/core/tavern/acceptance.ts'
import { generateTavernDay } from '../src/core/tavern/dayGenerator.ts'

const SEEDS = [
  'phase6-5-accept-001',
  'phase6-5-accept-002',
  'phase6-5-accept-003',
]

interface ContextScenario {
  affinity: number
  financialPressure: number
  riskTolerance: 'cautious' | 'balanced' | 'bold'
  growthMilestones: number
  label: string
}

const CONTEXTS: ContextScenario[] = [
  {
    affinity: 10,
    financialPressure: 40,
    riskTolerance: 'balanced',
    growthMilestones: 0,
    label: 'neutral',
  },
  {
    affinity: 80,
    financialPressure: 40,
    riskTolerance: 'balanced',
    growthMilestones: 0,
    label: 'high-affinity',
  },
  {
    affinity: 40,
    financialPressure: 85,
    riskTolerance: 'balanced',
    growthMilestones: 0,
    label: 'needs-income',
  },
  {
    affinity: 40,
    financialPressure: 40,
    riskTolerance: 'bold',
    growthMilestones: 0,
    label: 'bold',
  },
  {
    affinity: 60,
    financialPressure: 40,
    riskTolerance: 'cautious',
    growthMilestones: 0,
    label: 'cautious',
  },
  {
    affinity: 40,
    financialPressure: 40,
    riskTolerance: 'balanced',
    growthMilestones: 4,
    label: 'grown',
  },
]

interface AuditRecord {
  seed: string
  request: { id: string; objectiveType: string; rank: string }
  party: { id: string; rank: string }
  rankGap: number
  context: ContextScenario
  decision: string
  reason: string
  score: number
  threshold: number
  quote: string
  modifiers: Record<string, number>
}

function runSeed(seed: string): AuditRecord[] {
  const day = generateTavernDay(seed)
  const records: AuditRecord[] = []

  for (const requestOffer of day.requests) {
    const request = toPublicRequestProfile(requestOffer)
    for (const party of day.parties.map((tp) => tp.party)) {
      for (const context of CONTEXTS) {
        const result = evaluateOffer(request, party, context)
        records.push({
          seed,
          request: {
            id: request.id,
            objectiveType: request.objectiveType,
            rank: request.rank,
          },
          party: { id: party.id, rank: party.rank },
          rankGap: result.rankGap,
          context,
          decision: result.decision,
          reason: result.reason,
          score: result.acceptanceScore,
          threshold: result.acceptanceThreshold,
          quote: acceptanceReasonText(result.reason),
          modifiers: result.modifiers,
        })
      }
    }
  }

  return records
}

function runAudit() {
  const allRecords: AuditRecord[] = []
  for (const seed of SEEDS) {
    allRecords.push(...runSeed(seed))
  }

  // Determinism check: evaluate the first record twice.
  const first = allRecords[0]
  let deterministic = true
  if (first) {
    const day = generateTavernDay(first.seed)
    const requestOffer = day.requests.find((r) => r.id === first.request.id)
    const party = day.parties.find((p) => p.party.id === first.party.id)?.party
    if (requestOffer && party) {
      const request = toPublicRequestProfile(requestOffer)
      const a = evaluateOffer(request, party, first.context)
      const b = evaluateOffer(request, party, first.context)
      deterministic = JSON.stringify(a) === JSON.stringify(b)
    }
  }

  const byRankGap: Record<number, { total: number; accepted: number }> = {}
  const byContext: Record<string, { total: number; accepted: number }> = {}
  for (const r of allRecords) {
    byRankGap[r.rankGap] ??= { total: 0, accepted: 0 }
    byRankGap[r.rankGap].total += 1
    if (r.decision === 'accepted') byRankGap[r.rankGap].accepted += 1

    byContext[r.context.label] ??= { total: 0, accepted: 0 }
    byContext[r.context.label].total += 1
    if (r.decision === 'accepted') byContext[r.context.label].accepted += 1
  }

  const json = {
    deterministic,
    seedCount: SEEDS.length,
    recordCount: allRecords.length,
    byRankGap,
    byContext,
    records: allRecords,
  }

  writeFileSync(
    'reports/phase6_5_acceptance_audit.json',
    JSON.stringify(json, null, 2),
  )

  console.log('Acceptance audit complete:', json.recordCount, 'records')
  console.log('JSON: reports/phase6_5_acceptance_audit.json')
  console.log('Deterministic:', deterministic)
  console.log('By rank gap:', byRankGap)
  console.log('By context:', byContext)
}

runAudit()
