import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runExpedition } from '../src/core/expedition/expedition.ts'
import { makeParty } from '../src/core/expedition/regression.ts'
import { makeSurveyRequest } from '../src/core/expedition/test-utils.ts'
import type { SurveyObjectiveState } from '../src/core/expedition/types.ts'

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
  areaOverrides: NonNullable<Parameters<typeof makeSurveyRequest>[2]>
  battle: boolean
  roles: (
    'vanguard' | 'guardian' | 'mage' | 'healer' | 'scout' | 'ranger' | 'support'
  )[]
  description: string
}

export const sampleCases: SampleCase[] = [
  {
    id: 'A',
    seed: 's49',
    rank: 'S',
    areaOverrides: {},
    battle: false,
    roles: ['scout', 'ranger', 'mage', 'support'],
    description: 'completeSuccess: 全3区画を高品質で測量し酒場まで報告',
  },
  {
    id: 'B',
    seed: 's1',
    rank: 'C',
    areaOverrides: {},
    battle: false,
    roles: ['scout', 'ranger', 'mage', 'support'],
    description: 'success: 全3区画を測量し報告したがcomplete閾値には至らない',
  },
  {
    id: 'C',
    seed: 's1',
    rank: 'C',
    areaOverrides: { minimumAcceptableQuality: 95 },
    battle: false,
    roles: ['scout', 'ranger', 'mage', 'support'],
    description: 'partialSuccess: 全3区画を測量したが要求品質を下回った',
  },
  {
    id: 'D',
    seed: 's1',
    rank: 'C',
    areaOverrides: {
      sectors: [
        { id: 'north', name: '北区画', focus: 'route', difficulty: 1000 },
        { id: 'center', name: '中央区画', focus: 'terrain', difficulty: 1000 },
        { id: 'south', name: '南区画', focus: 'arcane', difficulty: 1000 },
      ],
    },
    battle: false,
    roles: ['vanguard', 'guardian', 'mage', 'healer'],
    description: 'failedObjective: 全ての区画で測量に失敗し報告も作成できない',
  },
  {
    id: 'E',
    seed: 'fr0',
    rank: 'C',
    areaOverrides: {
      sectors: [
        { id: 'north', name: '北区画', focus: 'route', difficulty: 1000 },
        { id: 'center', name: '中央区画', focus: 'terrain', difficulty: 0 },
        { id: 'south', name: '南区画', focus: 'arcane', difficulty: 0 },
      ],
    },
    battle: true,
    roles: ['scout', 'ranger', 'mage', 'healer'],
    description: 'forcedRetreat: 戦闘で敗退し測量を中止',
  },
]

export function runSampleCase(c: SampleCase) {
  const request = makeSurveyRequest(c.seed, c.rank, c.areaOverrides, c.battle)
  const party = makeParty(c.roles, c.seed, c.rank)
  const result = runExpedition(request, party)
  const objective = result.state.objectiveState as SurveyObjectiveState
  return { result, objective, request }
}

export function generatePhase3SurveySample(): string {
  const sections = sampleCases.map((c) => {
    const { result, objective, request } = runSampleCase(c)
    const areaId = request.survey!.area.id
    const logSummary = result.state.logs
      .filter(
        (l) =>
          l.type.startsWith('survey') ||
          l.type === 'battleResolved' ||
          l.type === 'travel' ||
          l.type === 'expeditionOutcome',
      )
      .map((l) => `- ${l.phase}: ${l.type} / ${l.facts[0] ?? '(no fact)'}`)
      .join('\n')
    const effects = result.state.logs
      .flatMap((l) => l.effects)
      .filter((e) => e.type.startsWith('survey'))
      .map((e) => `${e.type}=${e.value}`)
      .join(', ')
    const assignedLog = result.state.logs.find(
      (l) => l.type === 'surveyAreaAssigned',
    )
    const assignedEffect = assignedLog?.effects.find(
      (e) => e.type === 'surveyAreaAssigned',
    )
    const sectorSummary = objective.sectors
      .map(
        (s) =>
          `  - ${s.name} (${s.focus}): surveyed=${s.surveyed}, quality=${s.quality}, result=${s.result ?? 'none'}`,
      )
      .join('\n')
    return `## ケース ${c.id}: ${c.description}

- **seed**: ${c.seed}
- **rank**: ${c.rank}
- **party**: ${c.roles.join(', ')}
- **battle**: ${c.battle ? 'enabled' : 'disabled'}
- **遠征結果**: ${result.outcome}
- **areaId**: ${areaId}
- **areaName**: ${objective.areaName}
- **minimumAcceptableQuality**: ${objective.minimumAcceptableQuality}
- **coveragePercent**: ${objective.coveragePercent.toFixed(2)}%
- **averageQuality**: ${objective.averageQuality.toFixed(2)}
- **reportPrepared**: ${objective.reportPrepared}
- **reportReturned**: ${objective.reportReturned}
- **reportLostDuringReturn**: ${objective.reportLostDuringReturn}
- **progress**: ${objective.progress}%
- **区画状況**:
${sectorSummary}
- **surveyAreaAssigned index**: ${result.state.logs.findIndex((l) => l.type === 'surveyAreaAssigned')}
- **surveyAreaAssigned structured metadata**:
  - areaId: ${assignedEffect?.targetId}
  - areaName: ${assignedEffect?.metadata?.name}
  - minimumAcceptableQuality: ${assignedEffect?.metadata?.minimumAcceptableQuality}
  - sectors: ${JSON.stringify(assignedEffect?.metadata?.sectors)}
- **主要ログ**:
${logSummary}
- **survey effects**: ${effects}
`
  })

  return `# Phase 3.6 測量・地域調査依頼（survey）サンプル

${sections.join('\n---\n\n')}`
}

if (isMainModule()) {
  const report = generatePhase3SurveySample()
  writeFileSync('PHASE3_SURVEY_SAMPLE.md', report)
  console.log('Generated PHASE3_SURVEY_SAMPLE.md')
}
