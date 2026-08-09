import { Adventurer, AdventurerRole, SkillName } from '../../models/types.ts'
import {
  CheckResult,
  ExpeditionEffect,
  ExpeditionExecutionContext,
  ExpeditionObjectiveHandler,
  ExpeditionOutcome,
  ExpeditionOutcomeContext,
  ExpeditionRequest,
  ExpeditionState,
  SurveyAreaConfig,
  SurveyObjectiveState,
  SurveySectorConfig,
  SurveySectorFocus,
  SurveySectorState,
} from '../types.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import { addLog, logEntry } from '../logs.ts'
import {
  applyExpeditionDamage,
  consumeSupplies,
  getActiveParty,
  getNonDeadParty,
} from '../state.ts'
import { clamp } from '../../util.ts'
import { isUnresolvedSeriousInjury } from '../injuries.ts'
import { rankPenaltyForRequest, resolveSkillCheck } from '../checks.ts'

const SURVEY_QUALITY: Record<CheckResult, number> = {
  criticalSuccess: 100,
  success: 80,
  partialSuccess: 55,
  failure: 0,
  criticalFailure: 0,
}

export function surveyRng(
  request: ExpeditionRequest,
  stage: string,
): SeededRng {
  return new SeededRng(`${request.seed}:survey:${stage}`)
}

export function getSurveyConfig(
  request: ExpeditionRequest,
): NonNullable<ExpeditionRequest['survey']> {
  if (request.survey === undefined) {
    throw new Error('Survey request requires survey configuration')
  }
  return request.survey
}

export function getSurveyObjective(
  state: ExpeditionState,
): SurveyObjectiveState {
  const obj = state.objectiveState
  if (obj === undefined || obj.type !== 'survey') {
    throw new Error('Survey objective state is missing')
  }
  return obj
}

function validateSurveyAreaConfig(area: SurveyAreaConfig): void {
  if (area.id === '') {
    throw new Error('Survey area id must not be empty')
  }
  if (area.name === '') {
    throw new Error('Survey area name must not be empty')
  }
  if (area.sectors.length !== 3) {
    throw new Error('Survey area must contain exactly 3 sectors')
  }
  const ids = new Set<string>()
  for (const sector of area.sectors) {
    if (sector.id === '') {
      throw new Error('Survey sector id must not be empty')
    }
    if (sector.name === '') {
      throw new Error('Survey sector name must not be empty')
    }
    if (ids.has(sector.id)) {
      throw new Error(`Duplicate survey sector id: ${sector.id}`)
    }
    ids.add(sector.id)
    if (sector.difficulty < 0 || !Number.isFinite(sector.difficulty)) {
      throw new Error(
        `Survey sector difficulty must be a finite non-negative number: ${sector.id}`,
      )
    }
  }
  if (
    area.minimumAcceptableQuality < 1 ||
    area.minimumAcceptableQuality > 100 ||
    !Number.isInteger(area.minimumAcceptableQuality)
  ) {
    throw new Error(
      'Survey minimumAcceptableQuality must be an integer between 1 and 100',
    )
  }
}

export function validateSurveyRequest(request: ExpeditionRequest): void {
  if (request.objectiveType !== 'survey') {
    throw new Error('Expected objectiveType survey')
  }
  if (request.survey === undefined) {
    throw new Error('Survey request requires survey configuration')
  }
  validateSurveyAreaConfig(request.survey.area)
}

function initializeSectorState(sector: SurveySectorConfig): SurveySectorState {
  return {
    id: sector.id,
    name: sector.name,
    focus: sector.focus,
    difficulty: sector.difficulty,
    attempted: false,
    surveyed: false,
    quality: 0,
    responsibleMemberIds: [],
    assistanceMemberIds: [],
  }
}

export function initializeSurveyObjectiveState(
  request: ExpeditionRequest,
): SurveyObjectiveState {
  const config = getSurveyConfig(request)
  validateSurveyAreaConfig(config.area)
  return {
    type: 'survey',
    areaId: config.area.id,
    areaName: config.area.name,
    minimumAcceptableQuality: config.area.minimumAcceptableQuality,
    sectors: config.area.sectors.map(initializeSectorState),
    coveragePercent: 0,
    averageQuality: 0,
    reportPrepared: false,
    reportReturned: false,
    reportLostDuringReturn: false,
    progress: 0,
    completed: false,
  }
}

export function calculateSurveyCoverage(
  objective: SurveyObjectiveState,
): number {
  const surveyed = objective.sectors.filter((s) => s.surveyed).length
  return (surveyed / objective.sectors.length) * 100
}

export function calculateSurveyAverageQuality(
  objective: SurveyObjectiveState,
): number {
  const surveyed = objective.sectors.filter((s) => s.surveyed)
  if (surveyed.length === 0) return 0
  return surveyed.reduce((sum, s) => sum + s.quality, 0) / surveyed.length
}

export function calculateSurveyProgress(
  objective: SurveyObjectiveState,
): number {
  const surveyedCount = objective.sectors.filter((s) => s.surveyed).length
  return clamp(surveyedCount * 25 + (objective.reportReturned ? 25 : 0), 0, 100)
}

export function surveySkillForFocus(focus: SurveySectorFocus): SkillName {
  switch (focus) {
    case 'route':
      return 'scouting'
    case 'terrain':
      return 'survival'
    case 'hazard':
      return 'trapDetection'
    case 'arcane':
      return 'defenseMagic'
  }
}

export function preferredSurveyRole(focus: SurveySectorFocus): AdventurerRole {
  switch (focus) {
    case 'route':
      return 'scout'
    case 'terrain':
      return 'ranger'
    case 'hazard':
      return 'scout'
    case 'arcane':
      return 'mage'
  }
}

function surveySupportBonus(
  party: Adventurer[],
  state: ExpeditionState,
): number {
  const active = getActiveParty(party, state)
  return active.some((a) => a.role === 'support') ? 5 : 0
}

function surveyToolsBonus(state: ExpeditionState): {
  bonus: number
  hasTools: boolean
} {
  const hasTools = state.supplies.tools >= 1
  return { bonus: hasTools ? 10 : 0, hasTools }
}

export function runSurveySector(
  context: ExpeditionExecutionContext,
  sector: SurveySectorState,
  phase: 'contact' | 'objective',
): void {
  const { request, party, state } = context
  const objective = getSurveyObjective(state)

  if (getActiveParty(party, state).length === 0) return
  if (sector.attempted) return

  const skill = surveySkillForFocus(sector.focus)
  const preferredRole = preferredSurveyRole(sector.focus)
  const rng = surveyRng(request, `sector:${sector.id}`)
  const rankPenalty = rankPenaltyForRequest(request)

  const support = surveySupportBonus(party, state)
  const { bonus: toolsBonus, hasTools } = surveyToolsBonus(state)

  const difficultyModifier = sector.difficulty - support - toolsBonus

  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      phase,
      skill,
      preferredRole,
      difficultyModifier,
      rankPenalty,
    )

  sector.attempted = true
  sector.result = result
  sector.responsibleMemberIds = [primary.id]
  sector.assistanceMemberIds = assistants.map((a) => a.id)

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess' || result === 'success') {
    sector.surveyed = true
    sector.quality = SURVEY_QUALITY[result]
    facts.push(
      `${sector.name}の測量を完了した。測量精度は${sector.quality}だった`,
    )
  } else if (result === 'partialSuccess') {
    sector.surveyed = true
    sector.quality = SURVEY_QUALITY.partialSuccess
    state.elapsedTime += 1
    facts.push(
      `${sector.name}について不完全ながら測量記録を取得した。測量精度は${sector.quality}だった`,
    )
  } else if (result === 'failure') {
    sector.surveyed = false
    sector.quality = 0
    state.elapsedTime += 1
    facts.push(`${sector.name}の測量を完了できなかった`)
  } else {
    sector.surveyed = false
    sector.quality = 0
    state.elapsedTime += 2
    const active = getActiveParty(party, state)
    if (active.length > 0) {
      const target = primary
      const damageEffect = applyExpeditionDamage(
        state,
        party,
        target,
        rng.integer(3, 6),
        `${sector.name}の測量事故`,
        false,
        rng,
      )
      effects.push(damageEffect)
      if (damageEffect.value && damageEffect.value > 0) {
        facts.push(
          `${primary.name}が${sector.name}の測量に失敗し、作業中に事故が発生した。${damageEffect.value}のダメージを受けた`,
        )
      } else {
        facts.push(
          `${primary.name}が${sector.name}の測量に失敗し、作業中に事故が発生した`,
        )
      }
    } else {
      facts.push(
        `${primary.name}が${sector.name}の測量に失敗し、作業中に事故が発生した`,
      )
    }
  }

  if (
    (result === 'criticalSuccess' ||
      result === 'success' ||
      result === 'partialSuccess') &&
    hasTools
  ) {
    consumeSupplies(state, 0, 0, 1)
    facts.push('用具を1消費して測量を助けた')
    effects.push({ type: 'supplyConsume', value: 1, targetId: 'tools' })
  }

  objective.coveragePercent = calculateSurveyCoverage(objective)
  objective.averageQuality = calculateSurveyAverageQuality(objective)

  effects.push({
    type: 'surveySectorSurveyed',
    value: sector.surveyed ? 1 : 0,
    targetId: sector.id,
    metadata: { areaId: objective.areaId, sectorId: sector.id },
  })
  effects.push({
    type: 'surveySectorQuality',
    value: sector.quality,
    targetId: sector.id,
    metadata: { areaId: objective.areaId, sectorId: sector.id },
  })
  effects.push({
    type: 'surveySectorResult',
    value: sector.quality,
    targetId: sector.id,
    metadata: {
      areaId: objective.areaId,
      sectorId: sector.id,
      sectorName: sector.name,
      focus: sector.focus,
      skill,
      result,
      surveyed: sector.surveyed,
      quality: sector.quality,
      responsibleMemberIds: sector.responsibleMemberIds,
      assistanceMemberIds: sector.assistanceMemberIds,
    },
  })
  effects.push({
    type: 'surveyCoverage',
    value: objective.coveragePercent,
    targetId: objective.areaId,
  })
  effects.push({
    type: 'surveyAverageQuality',
    value: objective.averageQuality,
    targetId: objective.areaId,
  })
  effects.push({
    type: 'surveySurveyedSectorCount',
    value: objective.sectors.filter((s) => s.surveyed).length,
    targetId: objective.areaId,
  })
  effects.push({
    type: 'surveyProgress',
    value: calculateSurveyProgress(objective),
    targetId: objective.areaId,
  })

  addLog(
    state,
    logEntry(
      phase,
      'surveySectorResult',
      [primary.id, ...assistants.map((a) => a.id)],
      facts,
      effects,
      {
        skill,
        effectiveValue,
        roll,
        result,
      },
      [objective.areaId, sector.id],
    ),
  )
}

function logSurveyAreaAssigned(context: ExpeditionExecutionContext): void {
  const { state } = context
  const objective = getSurveyObjective(state)

  const sectorMeta = objective.sectors.map((s) => ({
    id: s.id,
    name: s.name,
    focus: s.focus,
    difficulty: s.difficulty,
  }))

  addLog(
    state,
    logEntry(
      'preparation',
      'surveyAreaAssigned',
      [],
      [
        `「${objective.areaName}」の${objective.sectors.length}区画を測量する任務を開始した`,
      ],
      [
        {
          type: 'surveyAreaAssigned',
          value: 1,
          targetId: objective.areaId,
          metadata: {
            name: objective.areaName,
            minimumAcceptableQuality: objective.minimumAcceptableQuality,
            sectors: sectorMeta,
          },
        },
        {
          type: 'surveyCoverage',
          value: 0,
          targetId: objective.areaId,
        },
        {
          type: 'surveyAverageQuality',
          value: 0,
          targetId: objective.areaId,
        },
        {
          type: 'surveySurveyedSectorCount',
          value: 0,
          targetId: objective.areaId,
        },
        {
          type: 'surveyReportPrepared',
          value: 0,
          targetId: objective.areaId,
        },
        {
          type: 'surveyReportReturned',
          value: 0,
          targetId: objective.areaId,
        },
        {
          type: 'surveyProgress',
          value: 0,
          targetId: objective.areaId,
        },
      ],
      undefined,
      [objective.areaId],
    ),
  )
}

export function runInitialSurveySector(
  context: ExpeditionExecutionContext,
): void {
  const { party, state } = context
  const objective = getSurveyObjective(state)
  if (getActiveParty(party, state).length === 0) return
  if (objective.sectors.length === 0) return
  runSurveySector(context, objective.sectors[0], 'contact')
}

export function runRemainingSurveySectors(
  context: ExpeditionExecutionContext,
): void {
  const { party, state } = context
  const objective = getSurveyObjective(state)
  for (let i = 1; i < objective.sectors.length; i++) {
    if (getActiveParty(party, state).length === 0) return
    runSurveySector(context, objective.sectors[i], 'objective')
  }
}

export function prepareSurveyReport(context: ExpeditionExecutionContext): void {
  const { party, state } = context
  const objective = getSurveyObjective(state)
  const surveyed = objective.sectors.filter((s) => s.surveyed)
  objective.reportPrepared = surveyed.length > 0

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (objective.reportPrepared) {
    facts.push(
      `${surveyed.length}区画分の測量記録を整理し、持ち帰る準備を行った`,
    )
  } else {
    facts.push('測量記録を作成できなかった')
  }

  effects.push({
    type: 'surveyReportPrepared',
    value: objective.reportPrepared ? 1 : 0,
    targetId: objective.areaId,
    metadata: {
      surveyedSectorIds: surveyed.map((s) => s.id),
    },
  })
  effects.push({
    type: 'surveyCoverage',
    value: objective.coveragePercent,
    targetId: objective.areaId,
  })
  effects.push({
    type: 'surveyAverageQuality',
    value: objective.averageQuality,
    targetId: objective.areaId,
  })
  effects.push({
    type: 'surveySurveyedSectorCount',
    value: surveyed.length,
    targetId: objective.areaId,
  })
  effects.push({
    type: 'surveyProgress',
    value: calculateSurveyProgress(objective),
    targetId: objective.areaId,
  })

  if (getActiveParty(party, state).length > 0) {
    addLog(
      state,
      logEntry(
        'return',
        'surveyReportPrepared',
        [],
        facts,
        effects,
        undefined,
        [objective.areaId],
      ),
    )
  }
}

export function resolveSurveyReportReturn(
  context: ExpeditionExecutionContext,
): void {
  const { party, state } = context
  const objective = getSurveyObjective(state)
  const active = getActiveParty(party, state)

  if (!objective.reportPrepared) {
    objective.reportReturned = false
    objective.reportLostDuringReturn = false
    return
  }

  if (active.length > 0) {
    objective.reportReturned = true
    objective.reportLostDuringReturn = false
    addLog(
      state,
      logEntry(
        'return',
        'surveyReportReturned',
        [],
        ['測量記録を酒場まで持ち帰った'],
        [
          {
            type: 'surveyReportReturned',
            value: 1,
            targetId: objective.areaId,
          },
          {
            type: 'surveyProgress',
            value: calculateSurveyProgress(objective),
            targetId: objective.areaId,
          },
        ],
        undefined,
        [objective.areaId],
      ),
    )
  } else {
    objective.reportReturned = false
    objective.reportLostDuringReturn = true
    addLog(
      state,
      logEntry(
        'return',
        'surveyReportLost',
        [],
        ['測量記録を持ち帰ったことを確認できなかった'],
        [
          {
            type: 'surveyReportLostDuringReturn',
            value: 1,
            targetId: objective.areaId,
          },
          {
            type: 'surveyProgress',
            value: calculateSurveyProgress(objective),
            targetId: objective.areaId,
          },
        ],
        undefined,
        [objective.areaId],
      ),
    )
  }
}

export function finalizeSurveyObjectiveState(
  context: ExpeditionExecutionContext,
): { objectiveCompleted: boolean; progressFact: string } {
  const objective = getSurveyObjective(context.state)
  objective.coveragePercent = calculateSurveyCoverage(objective)
  objective.averageQuality = calculateSurveyAverageQuality(objective)
  objective.progress = calculateSurveyProgress(objective)
  const surveyedCount = objective.sectors.filter((s) => s.surveyed).length
  objective.completed =
    objective.reportReturned &&
    surveyedCount >= 2 &&
    objective.averageQuality >= objective.minimumAcceptableQuality

  context.state.objectiveProgress = objective.progress
  context.state.objectiveCompleted = objective.completed

  const progressFact = `${objective.areaName}の測量進捗: ${objective.progress}% (${objective.sectors.filter((s) => s.surveyed).length}/${objective.sectors.length}区画, 平均精度${objective.averageQuality.toFixed(0)})`

  const finalLogType = objective.completed ? 'surveyCompleted' : 'surveyFailed'

  const effects: ExpeditionEffect[] = [
    {
      type: 'surveyCoverage',
      value: objective.coveragePercent,
      targetId: objective.areaId,
    },
    {
      type: 'surveyAverageQuality',
      value: objective.averageQuality,
      targetId: objective.areaId,
    },
    {
      type: 'surveyProgress',
      value: objective.progress,
      targetId: objective.areaId,
    },
    {
      type: 'surveyCompleted',
      value: objective.completed ? 1 : 0,
      targetId: objective.areaId,
    },
  ]

  addLog(
    context.state,
    logEntry(
      'aftermath',
      finalLogType,
      [],
      [progressFact],
      effects,
      undefined,
      [objective.areaId],
    ),
  )

  return {
    objectiveCompleted: objective.completed,
    progressFact,
  }
}

export function determineSurveyOutcome(
  context: ExpeditionOutcomeContext,
): ExpeditionOutcome {
  const { request, party, state } = context
  const allCasualties = state.casualties.length === party.length
  const activeCount = getActiveParty(party, state).length
  const allIncapacitated =
    !allCasualties &&
    activeCount === 0 &&
    getNonDeadParty(party, state).length > 0

  if (allCasualties || allIncapacitated) {
    return 'lostExpedition'
  }

  const objective = getSurveyObjective(state)
  const battleOutcome = state.battleOutcome
  const forcedBattleRetreat =
    battleOutcome === 'retreat' ||
    battleOutcome === 'stalemate' ||
    battleOutcome === 'defeat' ||
    battleOutcome === 'totalLoss'

  const surveyedCount = objective.sectors.filter((s) => s.surveyed).length
  const allSurveyed = surveyedCount === objective.sectors.length

  const timeExceeded =
    request.timeLimit !== undefined && state.elapsedTime > request.timeLimit
  const hasCasualties = state.casualties.length > 0
  const unresolvedSerious = state.injuries.filter(
    isUnresolvedSeriousInjury,
  ).length

  const completeQualityThreshold = Math.max(
    objective.minimumAcceptableQuality,
    85,
  )

  if (forcedBattleRetreat) {
    return 'forcedRetreat'
  }

  if (
    objective.reportReturned &&
    allSurveyed &&
    objective.averageQuality >= completeQualityThreshold &&
    !hasCasualties &&
    unresolvedSerious === 0 &&
    !timeExceeded
  ) {
    return 'completeSuccess'
  }

  if (
    objective.reportReturned &&
    surveyedCount >= 2 &&
    objective.averageQuality >= objective.minimumAcceptableQuality
  ) {
    return 'success'
  }

  if (
    objective.reportReturned &&
    surveyedCount >= 2 &&
    objective.averageQuality < objective.minimumAcceptableQuality
  ) {
    return 'partialSuccess'
  }

  return 'failedObjective'
}

export const surveyHandler: ExpeditionObjectiveHandler = {
  flow: {
    preparation: true,
    approach: true,
    exploration: true,
    battle: 'optional',
    objective: true,
    return: true,
    aftermath: true,
  },
  validateRequest: validateSurveyRequest,
  initializeObjectiveState: initializeSurveyObjectiveState,
  afterPreparation(context: ExpeditionExecutionContext): void {
    logSurveyAreaAssigned(context)
  },
  beforeBattle(context: ExpeditionExecutionContext): void {
    runInitialSurveySector(context)
  },
  runObjective: runRemainingSurveySectors,
  beforeReturn: prepareSurveyReport,
  afterReturn: resolveSurveyReportReturn,
  finalizeObjectiveState: finalizeSurveyObjectiveState,
  determineOutcome: determineSurveyOutcome,
}
