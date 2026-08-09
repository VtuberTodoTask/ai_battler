import {
  Adventurer,
  AdventurerRole,
  BattleResult,
  SkillName,
} from '../../models/types.ts'
import {
  EliminationObjectiveState,
  ExpeditionBattleResolvedContext,
  ExpeditionExecutionContext,
  ExpeditionLogEntry,
  ExpeditionObjectiveHandler,
  ExpeditionObjectiveState,
  ExpeditionOutcome,
  ExpeditionOutcomeContext,
  ExpeditionRequest,
  ExpeditionState,
} from '../types.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import { addLog, logEntry } from '../logs.ts'
import {
  averagePartyMorale,
  getActiveParty,
  getNonDeadParty,
} from '../state.ts'
import { clamp } from '../../util.ts'
import { isUnresolvedSeriousInjury } from '../injuries.ts'
import { rankPenaltyForRequest, resolveSkillCheck } from '../checks.ts'

export function eliminationProgressFact(
  objectiveState: EliminationObjectiveState,
): string {
  const {
    requiredTargetIds,
    defeatedTargetIds,
    escapedTargetIds,
    survivingTargetIds,
    unknownTargetIds,
    confirmedTargetIds,
    progress,
    confirmationRequired,
  } = objectiveState
  const parts: string[] = [
    `討伐対象として${requiredTargetIds.length}体が指定された`,
    `戦闘で${defeatedTargetIds.length}体を撃破した`,
  ]
  if (escapedTargetIds.length > 0) {
    parts.push(`${escapedTargetIds.length}体が逃亡した`)
  }
  if (survivingTargetIds.length > 0) {
    parts.push(`${survivingTargetIds.length}体が生存している`)
  }
  if (unknownTargetIds.length > 0) {
    parts.push(`${unknownTargetIds.length}体の最終状態を確認できなかった`)
  }
  parts.push(`討伐進捗は${progress}%となった`)
  if (confirmedTargetIds.length > 0) {
    parts.push(
      `撃破した${defeatedTargetIds.length}体のうち${confirmedTargetIds.length}体の討伐を確認した`,
    )
  }

  const hasUnknown = unknownTargetIds.length > 0
  const hasSurviving = survivingTargetIds.length > 0
  const allDefeated =
    !hasUnknown &&
    !hasSurviving &&
    requiredTargetIds.length > 0 &&
    defeatedTargetIds.length === requiredTargetIds.length
  const allConfirmed =
    !hasUnknown && confirmedTargetIds.length === requiredTargetIds.length
  const allNeutralized =
    !hasUnknown &&
    !hasSurviving &&
    requiredTargetIds.length > 0 &&
    defeatedTargetIds.length + escapedTargetIds.length ===
      requiredTargetIds.length

  if (allDefeated && allConfirmed) {
    parts.push('全対象の討伐を確認した')
  } else if (allDefeated) {
    parts.push('全対象を撃破したが討伐確認が未完了のため依頼目的は未完了')
  } else if (!confirmationRequired && allNeutralized) {
    parts.push(
      `対象${defeatedTargetIds.length}体を撃破し、${escapedTargetIds.length}体を退却させた`,
    )
    parts.push('周辺の脅威排除には成功した')
  } else if (allNeutralized) {
    parts.push(
      `対象${defeatedTargetIds.length}体を撃破し、${escapedTargetIds.length}体を退却させたが、討伐確認が未完了のため依頼目的は未完了`,
    )
  } else {
    parts.push('討伐対象が残っているため依頼目的は未完了')
  }
  return parts.join('。')
}

export function determineEliminationOutcome(
  request: ExpeditionRequest,
  state: ExpeditionState,
  party: Adventurer[],
): ExpeditionOutcome {
  const avgMorale = averagePartyMorale(state)
  const timeExceeded =
    request.timeLimit !== undefined && state.elapsedTime > request.timeLimit
  const noSupplies = state.supplies.food <= 0
  const unresolvedSerious = state.injuries.filter(
    isUnresolvedSeriousInjury,
  ).length
  const allCasualties = state.casualties.length === party.length
  const activeCount = getActiveParty(party, state).length
  const allIncapacitated =
    !allCasualties &&
    activeCount === 0 &&
    getNonDeadParty(party, state).length > 0

  if (allCasualties || allIncapacitated) {
    return 'lostExpedition'
  }

  const obj = state.objectiveState
  if (obj === undefined || obj.type !== 'elimination') {
    throw new Error(
      'determineEliminationOutcome called without elimination objectiveState',
    )
  }

  const {
    requiredTargetIds,
    defeatedTargetIds,
    escapedTargetIds,
    survivingTargetIds,
    unknownTargetIds,
    confirmedTargetIds,
    progress,
    confirmationRequired,
  } = obj
  const hasUnknown = unknownTargetIds.length > 0
  const hasSurviving = survivingTargetIds.length > 0
  const allDefeated =
    !hasUnknown &&
    !hasSurviving &&
    requiredTargetIds.length > 0 &&
    defeatedTargetIds.length === requiredTargetIds.length
  const allConfirmed =
    !hasUnknown &&
    requiredTargetIds.length > 0 &&
    confirmedTargetIds.length === requiredTargetIds.length
  const allNeutralized =
    !hasUnknown &&
    !hasSurviving &&
    requiredTargetIds.length > 0 &&
    defeatedTargetIds.length + escapedTargetIds.length ===
      requiredTargetIds.length
  const hasCasualties = state.casualties.length > 0
  const majorDamage = hasCasualties || unresolvedSerious > 0
  const returnIssues = timeExceeded || noSupplies || avgMorale < 40

  if (allDefeated && allConfirmed) {
    if (!majorDamage && !returnIssues) {
      return 'completeSuccess'
    }
    return 'success'
  }

  if (allDefeated && !allConfirmed) {
    return 'failedObjective'
  }

  if (!confirmationRequired && allNeutralized) {
    return 'success'
  }

  const forcedBattleRetreat =
    state.battleOutcome === 'retreat' ||
    state.battleOutcome === 'stalemate' ||
    state.battleOutcome === 'defeat'

  if (progress >= 40) {
    return 'partialSuccess'
  }
  if (forcedBattleRetreat) {
    return 'forcedRetreat'
  }
  return 'failedObjective'
}

export function resolveEliminationTargets(
  state: ExpeditionState,
  result: BattleResult,
  request: ExpeditionRequest,
  battleId: string,
): void {
  const obj = state.objectiveState
  if (obj === undefined || obj.type !== 'elimination') return

  const requiredTargetIds = obj.requiredTargetIds
  if (requiredTargetIds.length === 0) {
    addLog(
      state,
      logEntry(
        'battle',
        'diagnostic',
        [],
        [`戦闘${battleId}: 討伐対象IDが設定されていない`],
      ),
    )
    return
  }

  const defeated = new Set(result.defeatedEnemies)
  const surviving = new Set(result.survivingEnemies)
  const escaped = new Set(result.escapedEnemies)

  const defeatedTargetIds: string[] = []
  const escapedTargetIds: string[] = []
  const survivingTargetIds: string[] = []
  const unknownTargetIds: string[] = []

  for (const id of requiredTargetIds) {
    if (defeated.has(id)) {
      defeatedTargetIds.push(id)
    } else if (escaped.has(id)) {
      escapedTargetIds.push(id)
    } else if (surviving.has(id)) {
      survivingTargetIds.push(id)
    } else {
      unknownTargetIds.push(id)
    }
  }

  if (unknownTargetIds.length > 0) {
    addLog(
      state,
      logEntry(
        'battle',
        'diagnostic',
        [],
        [
          `戦闘${battleId}: 討伐対象 ${unknownTargetIds.join(', ')} の最終状態が不明`,
        ],
      ),
    )
  }

  const confirmationRequired =
    request.elimination?.confirmationRequired ?? false
  const confirmedTargetIds = confirmationRequired ? [] : [...defeatedTargetIds]
  const progress = clamp(
    Math.round((defeatedTargetIds.length / requiredTargetIds.length) * 100),
    0,
    100,
  )

  const requiredSet = new Set(requiredTargetIds)
  const confirmedUnique = confirmedTargetIds.filter((id) => requiredSet.has(id))

  obj.confirmationRequired = confirmationRequired
  obj.defeatedTargetIds = defeatedTargetIds
  obj.escapedTargetIds = escapedTargetIds
  obj.survivingTargetIds = survivingTargetIds
  obj.unknownTargetIds = unknownTargetIds
  obj.confirmedTargetIds = confirmedUnique
  obj.progress = progress
  updateEliminationCompleted(obj)

  state.objectiveProgress = progress
  state.objectiveCompleted = obj.completed

  addLog(
    state,
    logEntry(
      'battle',
      'eliminationTargetsAssigned',
      [],
      [
        `討伐対象として${requiredTargetIds.length}体が指定された`,
        `戦闘で${defeatedTargetIds.length}体を撃破した`,
        ...(escapedTargetIds.length > 0
          ? [`${escapedTargetIds.length}体が逃亡した`]
          : []),
        ...(survivingTargetIds.length > 0
          ? [`${survivingTargetIds.length}体が生存している`]
          : []),
        ...(unknownTargetIds.length > 0
          ? [`${unknownTargetIds.length}体の最終状態を確認できなかった`]
          : []),
        `討伐進捗は${progress}%となった`,
      ],
      [
        {
          type: 'eliminationTargets',
          value: requiredTargetIds.length,
        },
        {
          type: 'eliminationDefeated',
          value: defeatedTargetIds.length,
        },
        {
          type: 'eliminationEscaped',
          value: escapedTargetIds.length,
        },
        {
          type: 'eliminationSurviving',
          value: survivingTargetIds.length,
        },
        {
          type: 'eliminationUnknown',
          value: unknownTargetIds.length,
        },
        {
          type: 'eliminationProgress',
          value: progress,
        },
      ],
    ),
  )
}

export function logEliminationConfirmationState(
  state: ExpeditionState,
  objective: EliminationObjectiveState,
  facts: string[],
  actorIds: string[] = [],
  check?: ExpeditionLogEntry['check'],
): void {
  addLog(
    state,
    logEntry(
      'objective',
      'eliminationConfirmation',
      actorIds,
      facts,
      [
        {
          type: 'eliminationConfirmed',
          value: objective.confirmedTargetIds.length,
        },
        {
          type: 'eliminationCompleted',
          value: objective.completed ? 1 : 0,
        },
      ],
      check,
    ),
  )
}

export function updateEliminationCompleted(
  objective: EliminationObjectiveState,
): void {
  const hasUnknown = objective.unknownTargetIds.length > 0
  const hasSurviving = objective.survivingTargetIds.length > 0
  const requiredTargetIds = objective.requiredTargetIds
  const allDefeated =
    !hasUnknown &&
    !hasSurviving &&
    requiredTargetIds.length > 0 &&
    objective.defeatedTargetIds.length === requiredTargetIds.length
  const allConfirmed =
    !hasUnknown &&
    requiredTargetIds.length > 0 &&
    objective.confirmedTargetIds.length === requiredTargetIds.length
  const allNeutralized =
    !hasUnknown &&
    !hasSurviving &&
    requiredTargetIds.length > 0 &&
    objective.defeatedTargetIds.length + objective.escapedTargetIds.length ===
      requiredTargetIds.length

  if (allDefeated && allConfirmed) {
    objective.completed = true
  } else if (!objective.confirmationRequired && allNeutralized) {
    objective.completed = true
  } else {
    objective.completed = false
  }
}

export function runEliminationObjective(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
): void {
  state.currentPhase = 'objective'

  const obj = state.objectiveState
  if (obj === undefined || obj.type !== 'elimination') {
    return
  }

  const { defeatedTargetIds, confirmationRequired } = obj

  if (defeatedTargetIds.length === 0) {
    obj.confirmedTargetIds = []
    updateEliminationCompleted(obj)
    state.objectiveCompleted = obj.completed
    logEliminationConfirmationState(state, obj, [
      '撃破対象が存在しないため、討伐確認は行われなかった',
      eliminationProgressFact(obj),
    ])
    return
  }

  if (!confirmationRequired) {
    obj.confirmedTargetIds = [...defeatedTargetIds]
    updateEliminationCompleted(obj)
    state.objectiveCompleted = obj.completed
    logEliminationConfirmationState(state, obj, [
      `撃破した${defeatedTargetIds.length}体の討伐を自動確認した`,
      eliminationProgressFact(obj),
    ])
    return
  }

  const skippedBattleOutcome =
    state.battleOutcome === 'retreat' ||
    state.battleOutcome === 'stalemate' ||
    state.battleOutcome === 'defeat'

  if (skippedBattleOutcome) {
    obj.confirmedTargetIds = []
    updateEliminationCompleted(obj)
    state.objectiveCompleted = obj.completed
    logEliminationConfirmationState(state, obj, [
      '撤退または戦闘継続不能のため、討伐確認を実施できなかった',
      eliminationProgressFact(obj),
    ])
    return
  }

  const confirmationSkill: SkillName =
    request.environment === 'magical' || request.environment === 'ruins'
      ? 'monsterKnowledge'
      : request.environment === 'mountain' || request.environment === 'desert'
        ? 'survival'
        : 'scouting'
  const preferredRole: AdventurerRole | undefined =
    confirmationSkill === 'monsterKnowledge'
      ? 'mage'
      : confirmationSkill === 'scouting'
        ? 'scout'
        : 'ranger'
  const rankPenalty = rankPenaltyForRequest(request)

  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'objective',
      confirmationSkill,
      preferredRole,
      10,
      rankPenalty,
    )

  const facts: string[] = []

  if (result === 'criticalSuccess' || result === 'success') {
    obj.confirmedTargetIds = [...defeatedTargetIds]
    facts.push(`撃破した${defeatedTargetIds.length}体の討伐を確認した`)
  } else if (result === 'partialSuccess') {
    const confirmCount = Math.ceil(defeatedTargetIds.length / 2)
    obj.confirmedTargetIds = defeatedTargetIds.slice(0, confirmCount)
    facts.push(
      `撃破した${defeatedTargetIds.length}体のうち${confirmCount}体の討伐を確認した`,
    )
  } else if (result === 'failure') {
    obj.confirmedTargetIds = []
    facts.push('討伐確認に失敗した')
  } else {
    obj.confirmedTargetIds = []
    facts.push('討伐証明品を紛失・誤認した')
  }

  updateEliminationCompleted(obj)
  state.objectiveCompleted = obj.completed

  facts.push(eliminationProgressFact(obj))

  logEliminationConfirmationState(
    state,
    obj,
    facts,
    [primary.id, ...assistants.map((a) => a.id)],
    {
      skill: confirmationSkill,
      effectiveValue,
      roll,
      result,
    },
  )
}

export function initializeEliminationObjectiveState(
  request: ExpeditionRequest,
): ExpeditionObjectiveState {
  if (request.elimination === undefined) {
    throw new Error('Elimination request requires elimination configuration')
  }
  return {
    type: 'elimination',
    mode: request.elimination.mode,
    confirmationRequired: request.elimination.confirmationRequired,
    requiredTargetIds: [],
    defeatedTargetIds: [],
    escapedTargetIds: [],
    survivingTargetIds: [],
    unknownTargetIds: [],
    confirmedTargetIds: [],
    progress: 0,
    completed: false,
  }
}

export const eliminationHandler: ExpeditionObjectiveHandler = {
  flow: {
    preparation: true,
    approach: true,
    exploration: true,
    battle: 'required',
    objective: true,
    return: true,
    aftermath: true,
  },
  validateRequest(request: ExpeditionRequest): void {
    if (request.elimination === undefined) {
      throw new Error('Elimination request requires elimination configuration')
    }
    if (request.battle === undefined) {
      throw new Error('Elimination request requires battle configuration')
    }
    if (!request.battle.enabled) {
      throw new Error('Elimination request requires battle.enabled === true')
    }
  },
  initializeObjectiveState: initializeEliminationObjectiveState,
  onBattleResolved(context: ExpeditionBattleResolvedContext): void {
    const obj = context.state.objectiveState
    if (obj !== undefined && obj.type === 'elimination') {
      obj.requiredTargetIds = context.initialEnemyIds
    }
    resolveEliminationTargets(
      context.state,
      context.battleResult,
      context.request,
      context.battleId,
    )
  },
  runObjective(context: ExpeditionExecutionContext): void {
    runEliminationObjective(
      context.request,
      context.party,
      context.state,
      context.rng,
    )
  },
  finalizeObjectiveState(context: ExpeditionExecutionContext): {
    objectiveCompleted: boolean
    progressFact: string
  } {
    const obj = context.state.objectiveState
    if (!obj || obj.type !== 'elimination') {
      throw new Error('Elimination objective state is missing')
    }
    updateEliminationCompleted(obj)
    context.state.objectiveCompleted = obj.completed
    return {
      objectiveCompleted: obj.completed,
      progressFact: eliminationProgressFact(obj),
    }
  },
  determineOutcome(context: ExpeditionOutcomeContext): ExpeditionOutcome {
    return determineEliminationOutcome(
      context.request,
      context.state,
      context.party,
    )
  },
}
