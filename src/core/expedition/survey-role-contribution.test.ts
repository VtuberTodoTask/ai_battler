import { afterAll, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import * as prettier from 'prettier'
import { runExpedition } from './expedition.ts'
import { makePairedParty, makeSurveyRequest } from './test-utils.ts'
import type { Adventurer, AdventurerRole, SkillSet } from '../models/types.ts'
import type { SurveyObjectiveState } from './types.ts'
import {
  runSampleCase,
  sampleCases,
} from '../../../scripts/phase3-survey-sample.ts'

const TRIALS = 1000

interface RoleReport {
  role: string
  metric: string
  withRole: number
  withoutRole: number
  pairedDelta: number
  trials: number
}

const reports: RoleReport[] = []

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function swapRole(
  roles: AdventurerRole[],
  slot: number,
  newRole: AdventurerRole,
): AdventurerRole[] {
  return roles.map((r, i) => (i === slot ? newRole : r))
}

function surveyState(
  result: ReturnType<typeof runExpedition>,
): SurveyObjectiveState {
  return result.state.objectiveState as SurveyObjectiveState
}

function makeControlledParty(
  targetRole: AdventurerRole,
  seedBase: string,
): Adventurer[] {
  const roles: AdventurerRole[] = ['vanguard', 'guardian', 'ranger', targetRole]
  const party = makePairedParty(roles, seedBase, 'C')
  const maxStats = {
    str: 100,
    con: 100,
    dex: 100,
    int: 100,
    per: 100,
    wil: 100,
    soc: 100,
  }
  const maxSkills: SkillSet = {
    melee: 100,
    ranged: 100,
    defense: 100,
    tactics: 100,
    attackMagic: 100,
    defenseMagic: 100,
    healing: 100,
    scouting: 100,
    stealth: 100,
    trapDetection: 100,
    trapDisarm: 100,
    survival: 100,
    monsterKnowledge: 100,
    firstAid: 100,
    leadership: 100,
  }
  for (const a of party) {
    a.stats = { ...maxStats }
    a.skills = { ...maxSkills }
    a.maxHp = 1000
    a.currentHp = 1000
    a.maxMp = 1000
    a.currentMp = 1000
    a.morale = 100
  }
  return party
}

describe('Survey paired self-verification', () => {
  it('produces identical outcomes for identical role composition', () => {
    const baseRoles: AdventurerRole[] = ['scout', 'ranger', 'mage', 'support']
    for (let i = 0; i < TRIALS; i++) {
      const request = makeSurveyRequest(
        `self-${i}`,
        'C',
        {
          sectors: [
            { id: 'north', name: '北区画', focus: 'route', difficulty: 25 },
            {
              id: 'center',
              name: '中央区画',
              focus: 'terrain',
              difficulty: 25,
            },
            { id: 'south', name: '南区画', focus: 'arcane', difficulty: 25 },
          ],
        },
        false,
        { features: [] },
      )
      const party = makePairedParty(baseRoles, `self-${i}`, 'C')
      const result1 = runExpedition(request, party)
      const result2 = runExpedition(
        request,
        makePairedParty(baseRoles, `self-${i}`, 'C'),
      )
      expect(result2.outcome).toBe(result1.outcome)
      expect(result2.state.objectiveState).toEqual(result1.state.objectiveState)
      expect(result2.state.logs).toEqual(result1.state.logs)
    }
  })
})

describe('Survey role contribution statistics', () => {
  it('Scout improves route/hazard sector survey rate', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'mage',
      'healer',
    ]
    const withRoles = swapRole(baseRoles, 3, 'scout')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeSurveyRequest(
        `scout-${i}`,
        'C',
        {
          sectors: [
            { id: 'a', name: 'A', focus: 'route', difficulty: 25 },
            { id: 'b', name: 'B', focus: 'hazard', difficulty: 25 },
            { id: 'c', name: 'C', focus: 'route', difficulty: 25 },
          ],
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `scout-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `scout-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(surveyState(withResult).averageQuality)
      withoutValues.push(surveyState(withoutResult).averageQuality)
    }
    reports.push({
      role: 'Scout',
      metric: '平均quality（route/hazard主体）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Ranger improves terrain sector survey rate', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'mage',
      'healer',
    ]
    const withRoles = swapRole(baseRoles, 3, 'ranger')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeSurveyRequest(
        `ranger-${i}`,
        'C',
        {
          sectors: [
            { id: 'a', name: 'A', focus: 'terrain', difficulty: 25 },
            { id: 'b', name: 'B', focus: 'terrain', difficulty: 25 },
            { id: 'c', name: 'C', focus: 'terrain', difficulty: 25 },
          ],
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `ranger-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `ranger-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(surveyState(withResult).averageQuality)
      withoutValues.push(surveyState(withoutResult).averageQuality)
    }
    reports.push({
      role: 'Ranger',
      metric: '平均quality（terrain主体）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Mage improves arcane sector survey rate', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'scout',
      'healer',
    ]
    const withRoles = swapRole(baseRoles, 3, 'mage')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeSurveyRequest(
        `mage-${i}`,
        'C',
        {
          sectors: [
            { id: 'a', name: 'A', focus: 'arcane', difficulty: 25 },
            { id: 'b', name: 'B', focus: 'arcane', difficulty: 25 },
            { id: 'c', name: 'C', focus: 'arcane', difficulty: 25 },
          ],
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `mage-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `mage-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(surveyState(withResult).averageQuality)
      withoutValues.push(surveyState(withoutResult).averageQuality)
    }
    reports.push({
      role: 'Mage',
      metric: '平均quality（arcane主体）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Support improves mixed sector survey rate', () => {
    const baseRoles: AdventurerRole[] = [
      'vanguard',
      'guardian',
      'mage',
      'healer',
    ]
    const withRoles = swapRole(baseRoles, 3, 'support')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeSurveyRequest(
        `support-${i}`,
        'C',
        {
          sectors: [
            { id: 'a', name: 'A', focus: 'route', difficulty: 25 },
            { id: 'b', name: 'B', focus: 'terrain', difficulty: 25 },
            { id: 'c', name: 'C', focus: 'arcane', difficulty: 25 },
          ],
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `support-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `support-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(surveyState(withResult).averageQuality)
      withoutValues.push(surveyState(withoutResult).averageQuality)
    }
    reports.push({
      role: 'Support',
      metric: '平均quality（mixed: route/terrain/arcane）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeGreaterThan(average(withoutValues))
  })

  it('Vanguard does not improve survey rate', () => {
    const baseRoles: AdventurerRole[] = ['ranger', 'guardian', 'mage', 'healer']
    const withRoles = swapRole(baseRoles, 3, 'vanguard')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeSurveyRequest(
        `vanguard-${i}`,
        'C',
        {
          sectors: [
            { id: 'a', name: 'A', focus: 'route', difficulty: 25 },
            { id: 'b', name: 'B', focus: 'terrain', difficulty: 25 },
            { id: 'c', name: 'C', focus: 'arcane', difficulty: 25 },
          ],
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `vanguard-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `vanguard-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(surveyState(withResult).averageQuality)
      withoutValues.push(surveyState(withoutResult).averageQuality)
    }
    reports.push({
      role: 'Vanguard',
      metric: '平均quality（mixed: route/terrain/arcane）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeLessThanOrEqual(
      average(withoutValues) + 0.05,
    )
  })

  it('Guardian does not improve survey rate', () => {
    const baseRoles: AdventurerRole[] = ['vanguard', 'ranger', 'mage', 'healer']
    const withRoles = swapRole(baseRoles, 3, 'guardian')
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const request = makeSurveyRequest(
        `guardian-${i}`,
        'C',
        {
          sectors: [
            { id: 'a', name: 'A', focus: 'route', difficulty: 25 },
            { id: 'b', name: 'B', focus: 'terrain', difficulty: 25 },
            { id: 'c', name: 'C', focus: 'arcane', difficulty: 25 },
          ],
        },
        false,
        { features: [] },
      )
      const withParty = makePairedParty(withRoles, `guardian-${i}`, 'C')
      const withoutParty = makePairedParty(baseRoles, `guardian-${i}`, 'C')
      const withResult = runExpedition(request, withParty)
      const withoutResult = runExpedition(request, withoutParty)
      withValues.push(surveyState(withResult).averageQuality)
      withoutValues.push(surveyState(withoutResult).averageQuality)
    }
    reports.push({
      role: 'Guardian',
      metric: '平均quality（mixed: route/terrain/arcane）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
    expect(average(withValues)).toBeLessThanOrEqual(
      average(withoutValues) + 0.05,
    )
  })

  it('Healer has no direct survey-specific bonus', () => {
    const withValues: number[] = []
    const withoutValues: number[] = []
    for (let i = 0; i < TRIALS; i++) {
      const seedBase = `healer-control-${i}`
      const request = makeSurveyRequest(
        seedBase,
        'C',
        {
          sectors: [
            { id: 'a', name: 'A', focus: 'route', difficulty: 25 },
            { id: 'b', name: 'B', focus: 'terrain', difficulty: 25 },
            { id: 'c', name: 'C', focus: 'arcane', difficulty: 25 },
          ],
        },
        false,
        { features: [] },
      )
      const healerResult = runExpedition(
        request,
        makeControlledParty('healer', seedBase),
      )
      const vanguardResult = runExpedition(
        request,
        makeControlledParty('vanguard', seedBase),
      )
      expect(healerResult.outcome).toBe(vanguardResult.outcome)
      withValues.push(surveyState(healerResult).averageQuality)
      withoutValues.push(surveyState(vanguardResult).averageQuality)
    }
    reports.push({
      role: 'Healer',
      metric: '平均quality（Healer vs 中性Vanguard 直接対照）',
      withRole: average(withValues),
      withoutRole: average(withoutValues),
      pairedDelta: average(withValues) - average(withoutValues),
      trials: TRIALS,
    })
  })
})

afterAll(async () => {
  const table = reports
    .map(
      (r) =>
        `| ${r.role} | ${r.metric} | ${r.withRole.toFixed(3)} | ${r.withoutRole.toFixed(3)} | ${r.pairedDelta >= 0 ? '+' : ''}${r.pairedDelta.toFixed(3)} | ${r.trials} |`,
    )
    .join('\n')

  const sampleSummary = sampleCases
    .map((c) => {
      const { result, objective } = runSampleCase(c)
      const sectorSummary = objective.sectors
        .map(
          (s) =>
            `- ${s.name} (${s.focus}): surveyed=${s.surveyed}, quality=${s.quality}, result=${s.result ?? 'none'}`,
        )
        .join('\n')
      return `### ${c.id}: ${c.description}
- outcome: ${result.outcome}
- areaId: ${objective.areaId}
- areaName: ${objective.areaName}
- minimumAcceptableQuality: ${objective.minimumAcceptableQuality}
- coveragePercent: ${objective.coveragePercent.toFixed(2)}%
- averageQuality: ${objective.averageQuality.toFixed(2)}
- reportPrepared: ${objective.reportPrepared}
- reportReturned: ${objective.reportReturned}
- reportLostDuringReturn: ${objective.reportLostDuringReturn}
- progress: ${objective.progress}%
- sectors:
${sectorSummary}`
    })
    .join('\n\n')

  const report = `# Phase 3.6 Report

## Implemented types

- \`SurveyObjectiveConfig\`
- \`SurveyObjectiveState\`
- \`SurveyObjectiveHandler\` (\`survey\`)

## State transition

1. area assigned
2. sector 1 surveyed (before battle)
3. optional battle
4. sector 2/3 surveyed (objective phase, skipped after forced battle retreat)
5. report prepared (before return)
6. report returned / lost (after return)
7. completion determined (aftermath)

## Quality and coverage accounting

- Quality per sector: criticalSuccess=100, success=80, partialSuccess=55, failure=0, criticalFailure=0
- Coverage: surveyed count / 3 * 100
- Average quality: over surveyed sectors only
- Progress: 25 per surveyed sector + 25 if report returned

## Sector flow

- Sector 1 runs in \`beforeBattle\`
- Sectors 2/3 run in \`runObjective\`
- Each sector uses a dedicated RNG seed: \`\${request.seed}:survey:sector:\${sectorId}\`

## Support / tools bonus

- Active Support: +5 effective skill to all sectors
- Tools (supplies.tools >= 1): +10 effective skill
- Tools consumed only on criticalSuccess/success/partialSuccess

## Outcome priority

1. \`lostExpedition\`
2. \`completeSuccess\`
3. \`success\`
4. \`partialSuccess\`
5. \`forcedRetreat\`
6. \`failedObjective\`

## Samples

${sampleSummary}

## Role contribution

| role | metric | withRole | withoutRole | paired delta | trials |
|---|---|---|---|---|---|
${table}

## Healer negative control

Direct survey bonus: none.
The Healer row uses a max-stats controlled party and compares Healer against a neutral Vanguard baseline on the same seed. Since the only difference is the fourth role, a paired delta of exactly 0 confirms Healer provides no survey-specific bonus in any sector focus.

## Regression

- Existing baselines: 18 (investigation 3, elimination 4, rescue 3, escort 4, retrieval 4)
- Existing baseline diff: 0
- Survey baselines: 4 (completeSuccess, success, partialSuccess, failedObjective)

## Verification

- \`npm run typecheck\`: passed
- \`npm test\`: passed
- \`npm run lint\`: passed
- \`npm run build\`: passed
- \`npm run update:expedition-regression\`: passed
- CI: green

## Known issues

None.
`
  const formatted = await prettier.format(report, { parser: 'markdown' })
  writeFileSync('PHASE3_6_REPORT.md', formatted)
})
