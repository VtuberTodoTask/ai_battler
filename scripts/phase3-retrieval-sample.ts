import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runExpedition } from '../src/core/expedition/expedition.ts'
import { makeParty } from '../src/core/expedition/regression.ts'
import { makeRetrievalRequest } from '../src/core/expedition/test-utils.ts'
import type { RetrievalObjectiveState } from '../src/core/expedition/types.ts'

function isMainModule(): boolean {
  if (!process.argv[1]) return false
  const mainPath = resolve(process.argv[1])
  const modulePath = fileURLToPath(import.meta.url)
  return mainPath === modulePath
}

export interface SampleCase {
  id: string
  seed: string
  rank: 'C' | 'D' | 'E' | 'S'
  targetOverrides: Parameters<typeof makeRetrievalRequest>[2]
  battle: boolean
  requestOverrides: Partial<Parameters<typeof makeRetrievalRequest>[4]>
  description: string
}

export const sampleCases: SampleCase[] = [
  {
    id: 'A',
    seed: 's1',
    rank: 'S',
    targetOverrides: {
      locationKnown: true,
      discoveryDifficulty: 0,
      accessDifficulty: 0,
      securingDifficulty: 0,
      extractionDifficulty: 0,
      protectionDifficulty: 0,
    },
    battle: false,
    requestOverrides: { features: [] },
    description: 'completeSuccess: 対象を無傷で酒場まで回収',
  },
  {
    id: 'B',
    seed: 's0',
    rank: 'C',
    targetOverrides: {
      locationKnown: true,
      discoveryDifficulty: 0,
      accessDifficulty: 0,
      securingDifficulty: 0,
      extractionDifficulty: 0,
      protectionDifficulty: 0,
      minimumAcceptableIntegrity: 30,
    },
    battle: false,
    requestOverrides: { features: [] },
    description: 'success（搬出損傷あり）: 対象を酒場まで持ち帰ったが一部損傷',
  },
  {
    id: 'C',
    seed: 's0',
    rank: 'C',
    targetOverrides: {
      locationKnown: true,
      discoveryDifficulty: 0,
      accessDifficulty: 0,
      securingDifficulty: 0,
      extractionDifficulty: 0,
      protectionDifficulty: 0,
      initialIntegrity: 100,
      minimumAcceptableIntegrity: 98,
    },
    battle: false,
    requestOverrides: { features: [] },
    description: 'quality partial: 搬出は成功したが要求品質を下回った',
  },
  {
    id: 'D',
    seed: 's0',
    rank: 'C',
    targetOverrides: {
      locationKnown: true,
      discoveryDifficulty: 0,
      accessDifficulty: 0,
      securingDifficulty: 1000,
      extractionDifficulty: 0,
      protectionDifficulty: 0,
      initialIntegrity: 4,
      minimumAcceptableIntegrity: 1,
    },
    battle: false,
    requestOverrides: { features: [] },
    description: 'failedObjective: 確保作業で対象が破壊された',
  },
  {
    id: 'E',
    seed: 's3',
    rank: 'E',
    targetOverrides: {
      locationKnown: true,
      discoveryDifficulty: 15,
      accessDifficulty: 0,
      securingDifficulty: 1000,
      extractionDifficulty: 15,
      protectionDifficulty: 15,
      initialIntegrity: 80,
      minimumAcceptableIntegrity: 60,
    },
    battle: true,
    requestOverrides: { features: [] },
    description: 'forcedRetreat: 戦闘撤退のため回収対象を置き去り',
  },
]

export function runSampleCase(c: SampleCase) {
  const request = makeRetrievalRequest(
    c.seed,
    c.rank,
    c.targetOverrides,
    c.battle,
    c.requestOverrides,
  )
  const party = makeParty(
    ['vanguard', 'guardian', 'mage', 'healer'],
    c.seed,
    c.rank,
  )
  const result = runExpedition(request, party)
  const objective = result.state.objectiveState as RetrievalObjectiveState
  return { result, objective, request }
}

export function generatePhase3RetrievalSample(): string {
  const sections = sampleCases.map((c) => {
    const { result, objective, request } = runSampleCase(c)
    const targetId = request.retrieval!.target.id
    const carrierIds = objective.carrierIds
    const logSummary = result.state.logs
      .filter(
        (l) =>
          l.type.startsWith('retrieval') ||
          l.type === 'battleResolved' ||
          l.type === 'travel' ||
          l.type === 'expeditionOutcome',
      )
      .map((l) => `- ${l.phase}: ${l.type} / ${l.facts[0] ?? '(no fact)'}`)
      .join('\n')
    const effects = result.state.logs
      .flatMap((l) => l.effects)
      .filter((e) => e.type.startsWith('retrieval'))
      .map((e) => `${e.type}=${e.value}`)
      .join(', ')
    const assignedLog = result.state.logs.find(
      (l) => l.type === 'retrievalTargetAssigned',
    )
    const assignedEffect = assignedLog?.effects.find(
      (e) => e.type === 'retrievalTargetAssigned',
    )
    return `## ケース ${c.id}: ${c.description}

- **seed**: ${c.seed}
- **rank**: ${c.rank}
- **battle**: ${c.battle ? 'enabled' : 'disabled'}
- **遠征結果**: ${result.outcome}
- **targetId**: ${targetId}
- **対象**: ${objective.targetName}
- **bulk**: ${objective.bulk}
- **handling**: ${objective.handling}
- **fragility**: ${objective.fragility}
- **initialIntegrity**: ${objective.initialIntegrity}
- **minimumAcceptableIntegrity**: ${objective.minimumAcceptableIntegrity}
- **currentIntegrity**: ${objective.currentIntegrity}
- **carrierIds**: [${carrierIds.join(', ')}]
- **状態**: located=${objective.located}, reached=${objective.reached}, secured=${objective.secured}, extracted=${objective.extracted}, returned=${objective.returned}
- **進捗**: ${objective.progress}%
- **retrievalTargetAssigned index**: ${result.state.logs.findIndex((l) => l.type === 'retrievalTargetAssigned')}
- **retrievalTargetAssigned structured metadata**:
  - targetId: ${assignedEffect?.metadata?.targetId}
  - targetName: ${assignedEffect?.metadata?.targetName}
  - bulk: ${assignedEffect?.metadata?.bulk}
  - handling: ${assignedEffect?.metadata?.handling}
  - fragility: ${assignedEffect?.metadata?.fragility}
- **主要ログ**:
${logSummary}
- **retrieval effects**: ${effects}
`
  })

  return `# Phase 3.5 回収依頼（retrieval）サンプル

${sections.join('\n---\n\n')}`
}

if (isMainModule()) {
  const report = generatePhase3RetrievalSample()
  writeFileSync('PHASE3_RETRIEVAL_SAMPLE.md', report)
  console.log('Generated PHASE3_RETRIEVAL_SAMPLE.md')
}
