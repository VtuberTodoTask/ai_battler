import { describe, expect, it } from 'vitest'
import { runExpedition } from './expedition.ts'
import { initializeExpeditionState } from './state.ts'
import { SeededRng } from '../rng/seededRng.ts'
import {
  makePairedParty,
  makeSurveyParty,
  makeSurveyRequest,
} from './test-utils.ts'
import { generateAdventurer } from '../generators/adventurerGenerator.ts'
import type { Adventurer } from '../models/types.ts'
import type {
  CheckResult,
  ExpeditionExecutionContext,
  ExpeditionOutcomeContext,
  ExpeditionRequest,
  SurveyObjectiveState,
} from './types.ts'
import {
  calculateSurveyAverageQuality,
  calculateSurveyCoverage,
  calculateSurveyProgress,
  determineSurveyOutcome,
  getSurveyObjective,
  initializeSurveyObjectiveState,
  preferredSurveyRole,
  runInitialSurveySector,
  surveyRng,
  surveySkillForFocus,
  validateSurveyRequest,
} from './objectives/survey.ts'

function surveyState(
  result: ReturnType<typeof runExpedition>,
): SurveyObjectiveState {
  expect(result.state.objectiveState?.type).toBe('survey')
  return result.state.objectiveState as SurveyObjectiveState
}

function makeSurveyContext(
  request: ExpeditionRequest,
  party: Adventurer[],
): ExpeditionExecutionContext {
  const state = initializeExpeditionState(request, party)
  state.metadata = {
    difficulty: request.difficulty,
    requestFeatures: request.features,
    threatFeatures: request.features,
    ...state.metadata,
  }
  state.objectiveState = initializeSurveyObjectiveState(request)
  return {
    request,
    party,
    state,
    rng: new SeededRng(request.seed),
  }
}

function makeOutcomeContext(
  request: ExpeditionRequest,
  party: Adventurer[],
): ExpeditionOutcomeContext {
  return makeSurveyContext(request, party)
}

function makeControlledSurveyParty(
  fourthRole: 'healer' | 'support',
): Adventurer[] {
  const seed = 'support-ctrl'
  const party: Adventurer[] = [
    generateAdventurer({ seed: `${seed}:slot:0`, rank: 'C', role: 'scout' }),
    generateAdventurer({ seed: `${seed}:slot:1`, rank: 'C', role: 'vanguard' }),
    generateAdventurer({ seed: `${seed}:slot:2`, rank: 'C', role: 'guardian' }),
    generateAdventurer({ seed: `${seed}:slot:3`, rank: 'C', role: fourthRole }),
  ]
  party[3].skills.scouting = 0
  party[3].skills.survival = 0
  party[3].skills.trapDetection = 0
  party[3].skills.defenseMagic = 0
  return party
}

function findSectorSeed(
  targetResult: CheckResult,
  maxAttempts = 300,
): {
  context: ExpeditionExecutionContext
  request: ExpeditionRequest
  party: Adventurer[]
} {
  const difficulty =
    targetResult === 'failure' || targetResult === 'criticalFailure' ? 1000 : 0
  const sectors = [
    { id: 'a', name: 'A', focus: 'route' as const, difficulty },
    { id: 'b', name: 'B', focus: 'terrain' as const, difficulty },
    { id: 'c', name: 'C', focus: 'arcane' as const, difficulty },
  ]
  for (let i = 0; i < maxAttempts; i++) {
    const seed = `sector-${targetResult}-${i}`
    const request = makeSurveyRequest(
      seed,
      'C',
      { sectors, minimumAcceptableQuality: 70 },
      false,
      { features: [] },
    )
    const party = makePairedParty(
      ['scout', 'vanguard', 'guardian', 'healer'],
      seed,
      'C',
    )
    const context = makeSurveyContext(request, party)
    runInitialSurveySector(context)
    const log = context.state.logs.find((l) => l.type === 'surveySectorResult')
    if (log?.check?.result === targetResult) {
      return { context, request, party }
    }
  }
  throw new Error(`Could not find seed for ${targetResult}`)
}

describe('Survey validation and initialization', () => {
  it('validates a survey request with 3 sectors', () => {
    const request = makeSurveyRequest('validate', 'C')
    expect(() => validateSurveyRequest(request)).not.toThrow()
  })

  it('rejects a survey request without exactly 3 sectors', () => {
    const request = makeSurveyRequest('validate', 'C', {
      sectors: [{ id: 'a', name: 'A', focus: 'route', difficulty: 10 }],
    })
    expect(() => validateSurveyRequest(request)).toThrow('exactly 3 sectors')
  })

  it('rejects duplicate sector ids', () => {
    const request = makeSurveyRequest('validate', 'C', {
      sectors: [
        { id: 'a', name: 'A', focus: 'route', difficulty: 10 },
        { id: 'a', name: 'B', focus: 'terrain', difficulty: 10 },
        { id: 'c', name: 'C', focus: 'arcane', difficulty: 10 },
      ],
    })
    expect(() => validateSurveyRequest(request)).toThrow('Duplicate')
  })

  it('initializes objective state from request', () => {
    const request = makeSurveyRequest('init', 'C')
    const state = initializeSurveyObjectiveState(request)
    expect(state.type).toBe('survey')
    expect(state.sectors).toHaveLength(3)
    expect(state.sectors.every((s) => !s.attempted)).toBe(true)
    expect(state.coveragePercent).toBe(0)
    expect(state.averageQuality).toBe(0)
  })
})

describe('Survey helpers', () => {
  it('maps focus to skill and preferred role', () => {
    expect(surveySkillForFocus('route')).toBe('scouting')
    expect(preferredSurveyRole('route')).toBe('scout')
    expect(surveySkillForFocus('terrain')).toBe('survival')
    expect(preferredSurveyRole('terrain')).toBe('ranger')
    expect(surveySkillForFocus('hazard')).toBe('trapDetection')
    expect(preferredSurveyRole('hazard')).toBe('scout')
    expect(surveySkillForFocus('arcane')).toBe('defenseMagic')
    expect(preferredSurveyRole('arcane')).toBe('mage')
  })

  it('calculates coverage from surveyed sectors', () => {
    const base = initializeSurveyObjectiveState(makeSurveyRequest('cov', 'C'))
    expect(calculateSurveyCoverage(base)).toBe(0)
    base.sectors[0].surveyed = true
    expect(calculateSurveyCoverage(base)).toBeCloseTo(33.333, 3)
    base.sectors[1].surveyed = true
    expect(calculateSurveyCoverage(base)).toBeCloseTo(66.667, 3)
    base.sectors[2].surveyed = true
    expect(calculateSurveyCoverage(base)).toBe(100)
  })

  it('calculates average quality over surveyed sectors only', () => {
    const base = initializeSurveyObjectiveState(makeSurveyRequest('avg', 'C'))
    expect(calculateSurveyAverageQuality(base)).toBe(0)
    base.sectors[0].surveyed = true
    base.sectors[0].quality = 80
    expect(calculateSurveyAverageQuality(base)).toBe(80)
    base.sectors[1].surveyed = true
    base.sectors[1].quality = 55
    expect(calculateSurveyAverageQuality(base)).toBe(67.5)
    base.sectors[2].surveyed = true
    base.sectors[2].quality = 100
    expect(calculateSurveyAverageQuality(base)).toBeCloseTo(78.333, 3)
  })

  it('calculates progress from surveyed sectors and returned report', () => {
    const base = initializeSurveyObjectiveState(makeSurveyRequest('prog', 'C'))
    expect(calculateSurveyProgress(base)).toBe(0)
    base.sectors[0].surveyed = true
    expect(calculateSurveyProgress(base)).toBe(25)
    base.sectors[1].surveyed = true
    expect(calculateSurveyProgress(base)).toBe(50)
    base.reportReturned = true
    expect(calculateSurveyProgress(base)).toBe(75)
    base.sectors[2].surveyed = true
    expect(calculateSurveyProgress(base)).toBe(100)
  })
})

describe('Survey result mapping', () => {
  const cases: {
    result: CheckResult
    surveyed: boolean
    quality: number
    elapsed: number
  }[] = [
    { result: 'criticalSuccess', surveyed: true, quality: 100, elapsed: 0 },
    { result: 'success', surveyed: true, quality: 80, elapsed: 0 },
    { result: 'partialSuccess', surveyed: true, quality: 55, elapsed: 1 },
    { result: 'failure', surveyed: false, quality: 0, elapsed: 1 },
    { result: 'criticalFailure', surveyed: false, quality: 0, elapsed: 2 },
  ]

  for (const c of cases) {
    it(`maps ${c.result} to surveyed=${c.surveyed}, quality=${c.quality}, elapsed=${c.elapsed}`, () => {
      const { context } = findSectorSeed(c.result)
      const state = getSurveyObjective(context.state)
      const sector = state.sectors[0]
      expect(sector.attempted).toBe(true)
      expect(sector.result).toBe(c.result)
      expect(sector.surveyed).toBe(c.surveyed)
      expect(sector.quality).toBe(c.quality)
      expect(context.state.elapsedTime).toBe(c.elapsed)
      expect(sector.responsibleMemberIds.length).toBeGreaterThan(0)
    })
  }
})

describe('Survey flow integration', () => {
  it('runs all 3 sectors when active members remain', () => {
    const request = makeSurveyRequest('flow', 'C', {
      sectors: [
        { id: 'a', name: 'A', focus: 'route', difficulty: 5 },
        { id: 'b', name: 'B', focus: 'terrain', difficulty: 5 },
        { id: 'c', name: 'C', focus: 'arcane', difficulty: 5 },
      ],
    })
    const party = makeSurveyParty('flow', 'C')
    const result = runExpedition(request, party)
    const state = surveyState(result)
    expect(state.sectors.filter((s) => s.attempted).length).toBe(3)
  })

  it('stops surveying if party becomes incapacitated', () => {
    const request = makeSurveyRequest('stop', 'C', {
      sectors: [
        { id: 'a', name: 'A', focus: 'route', difficulty: 1000 },
        { id: 'b', name: 'B', focus: 'terrain', difficulty: 1000 },
        { id: 'c', name: 'C', focus: 'arcane', difficulty: 1000 },
      ],
    })
    const party = makeSurveyParty('stop', 'C')
    const result = runExpedition(request, party)
    const state = surveyState(result)
    expect(state.sectors.filter((s) => s.surveyed).length).toBeLessThan(3)
  })

  it('prepares report when at least one sector is surveyed', () => {
    const request = makeSurveyRequest('report', 'C', {
      sectors: [
        { id: 'a', name: 'A', focus: 'route', difficulty: 0 },
        { id: 'b', name: 'B', focus: 'terrain', difficulty: 1000 },
        { id: 'c', name: 'C', focus: 'arcane', difficulty: 1000 },
      ],
    })
    const party = makeSurveyParty('report', 'C')
    const result = runExpedition(request, party)
    const state = surveyState(result)
    expect(state.reportPrepared).toBe(true)
  })

  it('does not prepare report when no sectors are surveyed', () => {
    const request = makeSurveyRequest('noreport', 'C', {
      sectors: [
        { id: 'a', name: 'A', focus: 'route', difficulty: 1000 },
        { id: 'b', name: 'B', focus: 'terrain', difficulty: 1000 },
        { id: 'c', name: 'C', focus: 'arcane', difficulty: 1000 },
      ],
    })
    const party = makeSurveyParty('noreport', 'C')
    const result = runExpedition(request, party)
    const state = surveyState(result)
    expect(state.reportPrepared).toBe(false)
  })
})

describe('Survey outcome semantics', () => {
  function setupOutcome(
    requestSeed: string,
    areaOverrides: NonNullable<Parameters<typeof makeSurveyRequest>[2]>,
  ): {
    context: ExpeditionOutcomeContext
    objective: SurveyObjectiveState
  } {
    const request = makeSurveyRequest(requestSeed, 'C', areaOverrides, false, {
      features: [],
    })
    const party = makePairedParty(
      ['scout', 'ranger', 'mage', 'support'],
      requestSeed,
      'C',
    )
    const context = makeOutcomeContext(request, party)
    const objective = getSurveyObjective(context.state)
    return { context, objective }
  }

  it('returns completeSuccess for full high-quality survey', () => {
    const { context, objective } = setupOutcome('complete', {
      minimumAcceptableQuality: 70,
    })
    objective.sectors.forEach((s) => {
      s.attempted = true
      s.surveyed = true
      s.result = 'success'
      s.quality = 100
    })
    objective.averageQuality = calculateSurveyAverageQuality(objective)
    objective.reportReturned = true
    context.state.elapsedTime = 1
    expect(determineSurveyOutcome(context)).toBe('completeSuccess')
  })

  it('returns success for full survey with quality above minimum but below complete threshold', () => {
    const { context, objective } = setupOutcome('success', {
      minimumAcceptableQuality: 70,
    })
    objective.sectors.forEach((s) => {
      s.attempted = true
      s.surveyed = true
      s.result = 'success'
      s.quality = 80
    })
    objective.averageQuality = calculateSurveyAverageQuality(objective)
    objective.reportReturned = true
    expect(determineSurveyOutcome(context)).toBe('success')
  })

  it('returns success even with casualties if quality is sufficient', () => {
    const { context, objective } = setupOutcome('success-casualty', {
      minimumAcceptableQuality: 70,
    })
    objective.sectors.forEach((s) => {
      s.attempted = true
      s.surveyed = true
      s.result = 'success'
      s.quality = 80
    })
    objective.averageQuality = calculateSurveyAverageQuality(objective)
    objective.reportReturned = true
    context.state.casualties.push(context.party[0].id)
    expect(determineSurveyOutcome(context)).toBe('success')
  })

  it('returns partialSuccess for 2/3 surveyed with returned report', () => {
    const { context, objective } = setupOutcome('partial', {
      minimumAcceptableQuality: 70,
    })
    objective.sectors[0].attempted = true
    objective.sectors[0].surveyed = true
    objective.sectors[0].result = 'success'
    objective.sectors[0].quality = 80
    objective.sectors[1].attempted = true
    objective.sectors[1].surveyed = true
    objective.sectors[1].result = 'success'
    objective.sectors[1].quality = 80
    objective.averageQuality = calculateSurveyAverageQuality(objective)
    objective.reportReturned = true
    expect(determineSurveyOutcome(context)).toBe('partialSuccess')
  })

  it('returns partialSuccess for full survey with insufficient average quality', () => {
    const { context, objective } = setupOutcome('partial-quality', {
      minimumAcceptableQuality: 95,
    })
    objective.sectors.forEach((s) => {
      s.attempted = true
      s.surveyed = true
      s.result = 'success'
      s.quality = 80
    })
    objective.averageQuality = calculateSurveyAverageQuality(objective)
    objective.reportReturned = true
    expect(determineSurveyOutcome(context)).toBe('partialSuccess')
  })

  it('returns failedObjective when 0-1 sectors are surveyed', () => {
    const { context, objective } = setupOutcome('failed', {
      minimumAcceptableQuality: 70,
    })
    objective.sectors[0].attempted = true
    objective.sectors[0].surveyed = false
    objective.sectors[0].result = 'failure'
    objective.sectors[0].quality = 0
    objective.reportReturned = false
    expect(determineSurveyOutcome(context)).toBe('failedObjective')
  })

  it('returns forcedRetreat when battle forces retreat after sector 1', () => {
    const { context, objective } = setupOutcome('retreat', {
      minimumAcceptableQuality: 70,
    })
    objective.sectors[0].attempted = true
    objective.sectors[0].surveyed = true
    objective.sectors[0].result = 'success'
    objective.sectors[0].quality = 80
    objective.reportReturned = false
    context.state.battleOutcome = 'retreat'
    expect(determineSurveyOutcome(context)).toBe('forcedRetreat')
  })

  it('returns lostExpedition when all party members are casualties', () => {
    const { context, objective } = setupOutcome('lost', {
      minimumAcceptableQuality: 70,
    })
    objective.sectors[0].surveyed = true
    context.state.casualties = context.party.map((a) => a.id)
    expect(determineSurveyOutcome(context)).toBe('lostExpedition')
  })
})

describe('Survey structured logs and reconstruction', () => {
  it('logs surveyAreaAssigned exactly once before approach', () => {
    const request = makeSurveyRequest('assigned', 'C', undefined, false)
    const party = makePairedParty(
      ['scout', 'ranger', 'mage', 'support'],
      'assigned',
      'C',
    )
    const result = runExpedition(request, party)
    const assigned = result.state.logs.filter(
      (l) => l.type === 'surveyAreaAssigned',
    )
    expect(assigned).toHaveLength(1)
    const assignedIndex = result.state.logs.findIndex(
      (l) => l.type === 'surveyAreaAssigned',
    )
    const firstTravelIndex = result.state.logs.findIndex(
      (l) => l.type === 'travel',
    )
    expect(assignedIndex).toBeLessThan(firstTravelIndex)

    const state = surveyState(result)
    const effect = assigned[0].effects.find(
      (e) => e.type === 'surveyAreaAssigned',
    )
    expect(effect).toBeDefined()
    expect(effect!.targetId).toBe(state.areaId)
    expect(effect!.metadata).toMatchObject({
      name: state.areaName,
      minimumAcceptableQuality: state.minimumAcceptableQuality,
    })
    expect(assigned[0].targetIds).toEqual([state.areaId])
  })

  it('reconstructs the full state from structured logs', () => {
    const request = makeSurveyRequest('reconstruct', 'C', {
      minimumAcceptableQuality: 70,
    })
    const party = makePairedParty(
      ['scout', 'ranger', 'mage', 'support'],
      'reconstruct',
      'C',
    )
    const result = runExpedition(request, party)
    const state = surveyState(result)
    const logs = result.state.logs

    const assignedLog = logs.find((l) => l.type === 'surveyAreaAssigned')!
    const assignedEffect = assignedLog.effects.find(
      (e) => e.type === 'surveyAreaAssigned',
    )!

    const getLast = (type: string): number | undefined => {
      let last: number | undefined
      for (const log of logs) {
        for (const effect of log.effects) {
          if (effect.type === type) last = effect.value
        }
      }
      return last
    }

    const getSectorLast = (
      sectorId: string,
      type: string,
    ): number | undefined => {
      let last: number | undefined
      for (const log of logs) {
        for (const effect of log.effects) {
          if (effect.targetId === sectorId && effect.type === type) {
            last = effect.value
          }
        }
      }
      return last
    }

    const reconstructedSectors = state.sectors.map((sector) => {
      const sectorResult = logs
        .filter((l) => l.type === 'surveySectorResult')
        .flatMap((l) => l.effects)
        .find(
          (e) =>
            e.type === 'surveySectorResult' &&
            e.metadata &&
            (e.metadata as { sectorId: string }).sectorId === sector.id,
        )
      const resultValue = sectorResult?.metadata as
        | {
            result: CheckResult
            surveyed: boolean
            quality: number
            responsibleMemberIds: string[]
            assistanceMemberIds: string[]
            focus: string
            skill: string
          }
        | undefined
      return {
        id: sector.id,
        name: sector.name,
        focus: resultValue?.focus ?? sector.focus,
        difficulty: sector.difficulty,
        attempted: resultValue !== undefined,
        surveyed: resultValue?.surveyed ?? false,
        result: resultValue?.result,
        quality: getSectorLast(sector.id, 'surveySectorQuality') ?? 0,
        responsibleMemberIds: resultValue?.responsibleMemberIds ?? [],
        assistanceMemberIds: resultValue?.assistanceMemberIds ?? [],
      }
    })

    const reconstructed = {
      areaId: state.areaId,
      areaName: assignedEffect.metadata?.name,
      minimumAcceptableQuality:
        assignedEffect.metadata?.minimumAcceptableQuality,
      sectors: reconstructedSectors,
      coveragePercent: getLast('surveyCoverage') ?? 0,
      averageQuality: getLast('surveyAverageQuality') ?? 0,
      reportPrepared: Boolean(getLast('surveyReportPrepared')),
      reportReturned: Boolean(getLast('surveyReportReturned')),
      reportLostDuringReturn: Boolean(getLast('surveyReportLostDuringReturn')),
      progress: getLast('surveyProgress') ?? 0,
      completed: Boolean(getLast('surveyCompleted')),
    }

    expect(reconstructed).toEqual({
      areaId: state.areaId,
      areaName: state.areaName,
      minimumAcceptableQuality: state.minimumAcceptableQuality,
      sectors: state.sectors.map((s) => ({
        id: s.id,
        name: s.name,
        focus: s.focus,
        difficulty: s.difficulty,
        attempted: s.attempted,
        surveyed: s.surveyed,
        result: s.result,
        quality: s.quality,
        responsibleMemberIds: s.responsibleMemberIds,
        assistanceMemberIds: s.assistanceMemberIds,
      })),
      coveragePercent: state.coveragePercent,
      averageQuality: state.averageQuality,
      reportPrepared: state.reportPrepared,
      reportReturned: state.reportReturned,
      reportLostDuringReturn: state.reportLostDuringReturn,
      progress: state.progress,
      completed: state.completed,
    })
  })

  it('keeps survey results out of state.information', () => {
    const request = makeSurveyRequest('info', 'C', {
      sectors: [
        { id: 'a', name: 'A', focus: 'route', difficulty: 0 },
        { id: 'b', name: 'B', focus: 'terrain', difficulty: 0 },
        { id: 'c', name: 'C', focus: 'arcane', difficulty: 0 },
      ],
    })
    const party = makePairedParty(
      ['scout', 'ranger', 'mage', 'support'],
      'info',
      'C',
    )
    const result = runExpedition(request, party)
    const surveyIds = surveyState(result).sectors.map((s) => s.id)
    const infoIds = result.state.information.map((i) => i.id)
    for (const id of surveyIds) {
      expect(infoIds).not.toContain(id)
    }
  })
})

describe('Survey determinism and seed independence', () => {
  it('produces identical results for identical request and party', () => {
    const request = makeSurveyRequest('det', 'C', {
      sectors: [
        { id: 'a', name: 'A', focus: 'route', difficulty: 15 },
        { id: 'b', name: 'B', focus: 'terrain', difficulty: 15 },
        { id: 'c', name: 'C', focus: 'arcane', difficulty: 15 },
      ],
    })
    const party = makePairedParty(
      ['scout', 'ranger', 'mage', 'support'],
      'det',
      'C',
    )
    const result1 = runExpedition(request, party)
    const result2 = runExpedition(
      request,
      makePairedParty(['scout', 'ranger', 'mage', 'support'], 'det', 'C'),
    )
    expect(result2.outcome).toBe(result1.outcome)
    expect(result2.state.objectiveState).toEqual(result1.state.objectiveState)
    expect(result2.state.logs).toEqual(result1.state.logs)
  })

  it('uses sector id in the RNG seed', () => {
    const request = makeSurveyRequest('seed', 'C', {
      sectors: [
        { id: 'north', name: 'North', focus: 'route', difficulty: 15 },
        { id: 'center', name: 'Center', focus: 'terrain', difficulty: 15 },
        { id: 'south', name: 'South', focus: 'arcane', difficulty: 15 },
      ],
    })
    const northRng1 = surveyRng(request, 'sector:north').d100()
    const centerRng1 = surveyRng(request, 'sector:center').d100()

    const request2 = makeSurveyRequest('seed', 'C', {
      sectors: [
        { id: 'alpha', name: 'Alpha', focus: 'route', difficulty: 15 },
        { id: 'center', name: 'Center', focus: 'terrain', difficulty: 15 },
        { id: 'south', name: 'South', focus: 'arcane', difficulty: 15 },
      ],
    })
    const centerRng2 = surveyRng(request2, 'sector:center').d100()
    const southRng2 = surveyRng(request2, 'sector:south').d100()

    expect(centerRng1).toBe(centerRng2)
    expect(northRng1).not.toBe(southRng2)
  })
})

describe('Survey tools and support bonus', () => {
  for (const result of ['success', 'partialSuccess'] as const) {
    it(`consumes tools on ${result}`, () => {
      const { context } = findSectorSeed(result)
      const log = context.state.logs.find(
        (l) => l.type === 'surveySectorResult',
      )!
      const consume = log.effects.find(
        (e) => e.type === 'supplyConsume' && e.targetId === 'tools',
      )
      expect(consume).toBeDefined()
      expect(consume!.value).toBe(1)
    })
  }

  for (const result of ['failure', 'criticalFailure'] as const) {
    it(`does not consume tools on ${result}`, () => {
      const { context } = findSectorSeed(result)
      const log = context.state.logs.find(
        (l) => l.type === 'surveySectorResult',
      )!
      const consume = log.effects.find(
        (e) => e.type === 'supplyConsume' && e.targetId === 'tools',
      )
      expect(consume).toBeUndefined()
    })
  }

  it('gives active Support a +5 effective bonus', () => {
    const seed = 'support-bonus'
    const baseRequest = makeSurveyRequest(
      seed,
      'C',
      {
        sectors: [
          { id: 'a', name: 'A', focus: 'route', difficulty: 30 },
          { id: 'b', name: 'B', focus: 'terrain', difficulty: 30 },
          { id: 'c', name: 'C', focus: 'arcane', difficulty: 30 },
        ],
      },
      false,
      { features: [] },
    )
    const baseParty = makeControlledSurveyParty('healer')
    const supportParty = makeControlledSurveyParty('support')

    const baseContext = makeSurveyContext(baseRequest, baseParty)
    const supportContext = makeSurveyContext(baseRequest, supportParty)
    runInitialSurveySector(baseContext)
    runInitialSurveySector(supportContext)

    const baseLog = baseContext.state.logs.find(
      (l) => l.type === 'surveySectorResult',
    )!
    const supportLog = supportContext.state.logs.find(
      (l) => l.type === 'surveySectorResult',
    )!

    expect(supportLog.check!.effectiveValue).toBe(
      baseLog.check!.effectiveValue + 5,
    )
  })
})

describe('Survey battle state separation', () => {
  it('does not change enemy composition based on survey config', () => {
    const seed = 'battle-separation'
    const baseRequest = makeSurveyRequest(seed, 'C', {
      sectors: [
        { id: 'a', name: 'A', focus: 'route', difficulty: 15 },
        { id: 'b', name: 'B', focus: 'terrain', difficulty: 15 },
        { id: 'c', name: 'C', focus: 'arcane', difficulty: 15 },
      ],
    })
    const changedRequest = makeSurveyRequest(seed, 'C', {
      sectors: [
        { id: 'a', name: 'A', focus: 'hazard', difficulty: 80 },
        { id: 'b', name: 'B', focus: 'terrain', difficulty: 5 },
        { id: 'c', name: 'C', focus: 'arcane', difficulty: 5 },
      ],
      minimumAcceptableQuality: 95,
    })
    const party = makePairedParty(
      ['vanguard', 'guardian', 'mage', 'healer'],
      seed,
      'C',
    )

    const baseResult = runExpedition(baseRequest, party)
    const changedResult = runExpedition(changedRequest, party)
    expect(baseResult.state.battles[0]?.enemyComposition).toBe(
      changedResult.state.battles[0]?.enemyComposition,
    )
    expect(baseResult.state.battles[0]?.enemyIds).toEqual(
      changedResult.state.battles[0]?.enemyIds,
    )
  })
})

describe('Survey critical failure damage', () => {
  it('applies non-fatal expedition damage to the primary on critical failure', () => {
    const { context } = findSectorSeed('criticalFailure')
    const log = context.state.logs.find((l) => l.type === 'surveySectorResult')!
    expect(log.check!.result).toBe('criticalFailure')
    const damageEffects = log.effects.filter(
      (e) => e.type === 'hpDamage' && e.value && e.value > 0,
    )
    expect(damageEffects.length).toBeGreaterThan(0)
  })
})
