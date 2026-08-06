import { Adventurer, AdventurerRole, SkillName } from '../../models/types.ts'
import {
  ExpeditionEffect,
  ExpeditionExecutionContext,
  ExpeditionObjectiveHandler,
  ExpeditionOutcome,
  ExpeditionOutcomeContext,
  ExpeditionRequest,
  ExpeditionState,
  InvestigationObjectiveState,
} from '../types.ts'
import { SeededRng } from '../../rng/seededRng.ts'
import { addLog, logEntry } from '../logs.ts'
import {
  addMoraleAll,
  averagePartyMorale,
  getActiveParty,
  getNonDeadParty,
  hasFeature,
} from '../state.ts'
import { isUnresolvedSeriousInjury } from '../injuries.ts'
import { rankPenaltyForRequest, resolveSkillCheck } from '../checks.ts'

export function objectiveProgressFact(progress: number): string {
  if (progress <= 0) return '目的に関する成果を得られなかった'
  if (progress < 40) return '手がかりは得たが、依頼目的は達成できなかった'
  if (progress < 60) return '依頼目的を部分的に達成した'
  if (progress < 100) return '最低限の目的を達成した'
  return '依頼目的を完全に達成した'
}

export function setObjectiveCompletedFromProgress(
  state: ExpeditionState,
): void {
  state.objectiveCompleted = state.objectiveProgress >= 60
}

export function runObjective(
  request: ExpeditionRequest,
  party: Adventurer[],
  state: ExpeditionState,
  rng: SeededRng,
): void {
  if (getActiveParty(party, state).length === 0) return
  state.currentPhase = 'objective'

  const skill: SkillName =
    request.environment === 'magical' || request.environment === 'ruins'
      ? 'monsterKnowledge'
      : 'scouting'
  const preferredRole: AdventurerRole | undefined =
    skill === 'monsterKnowledge' ? 'mage' : 'scout'

  const difficulty =
    10 +
    (hasFeature(request.features, 'poorVisibility') ? 5 : 0) +
    (hasFeature(request.features, 'navigationDifficulty') ? 5 : 0) +
    (state.objectiveProgress < 40 ? 10 : 0)
  const rankPenalty = rankPenaltyForRequest(request)

  const { result, primary, assistants, effectiveValue, roll } =
    resolveSkillCheck(
      rng,
      party,
      state,
      'objective',
      skill,
      preferredRole,
      difficulty,
      rankPenalty,
    )

  const facts: string[] = []
  const effects: ExpeditionEffect[] = []

  if (result === 'criticalSuccess' || result === 'success') {
    facts.push(`${primary.name}が目標となる情報を確認した`)
    state.objectiveProgress = 100
  } else if (result === 'partialSuccess') {
    state.objectiveProgress = Math.min(100, state.objectiveProgress + 20)
    if (state.objectiveProgress >= 60 && state.objectiveProgress < 100) {
      facts.push('最低限の目的を達成した')
    }
  } else {
    facts.push('目的の達成に失敗した')
    if (result === 'criticalFailure') {
      state.elapsedTime += 3
    }
  }

  if (
    request.timeLimit !== undefined &&
    state.elapsedTime > request.timeLimit
  ) {
    facts.push('制限時間を超過した')
  }

  setObjectiveCompletedFromProgress(state)
  facts.push(objectiveProgressFact(state.objectiveProgress))

  if (result === 'criticalSuccess') {
    addMoraleAll(state, party, 5)
    effects.push({ type: 'moraleChange', value: 5 })
  }

  addLog(
    state,
    logEntry(
      'objective',
      'objectiveCheck',
      [primary.id, ...assistants.map((a) => a.id)],
      facts,
      effects,
      {
        skill,
        effectiveValue,
        roll,
        result,
      },
    ),
  )
}

export function determineInvestigationOutcome(
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
  const hasCasualties = state.casualties.length > 0
  const activeCount = getActiveParty(party, state).length
  const allIncapacitated =
    !allCasualties &&
    activeCount === 0 &&
    getNonDeadParty(party, state).length > 0

  if (allCasualties || allIncapacitated) {
    return 'lostExpedition'
  }

  const forcedBattleRetreat =
    state.battleOutcome === 'retreat' ||
    state.battleOutcome === 'stalemate' ||
    state.battleOutcome === 'defeat'

  let outcome: ExpeditionOutcome
  if (
    state.objectiveProgress >= 100 &&
    !hasCasualties &&
    unresolvedSerious === 0 &&
    avgMorale >= 40 &&
    !timeExceeded &&
    !noSupplies
  ) {
    outcome = 'completeSuccess'
  } else if (state.objectiveProgress >= 60) {
    outcome = 'success'
  } else if (state.objectiveProgress >= 40) {
    outcome = 'partialSuccess'
  } else if (forcedBattleRetreat) {
    outcome = 'forcedRetreat'
  } else {
    outcome = 'failedObjective'
  }

  if (timeExceeded || noSupplies || avgMorale < 15) {
    if (outcome === 'completeSuccess') outcome = 'success'
    else if (outcome === 'success') outcome = 'partialSuccess'
    else if (outcome === 'partialSuccess') outcome = 'failedObjective'
    else outcome = 'forcedRetreat'
  }

  if (hasCasualties || unresolvedSerious > 1) {
    if (outcome === 'completeSuccess') outcome = 'success'
    else if (outcome === 'success') outcome = 'partialSuccess'
    else if (outcome === 'partialSuccess') outcome = 'failedObjective'
    else outcome = 'lostExpedition'
  }

  return outcome
}

export function initializeInvestigationObjectiveState(
  _request: ExpeditionRequest,
): InvestigationObjectiveState {
  return { type: 'investigation' }
}

export const investigationHandler: ExpeditionObjectiveHandler = {
  validateRequest() {
    // investigation accepts the default request shape
  },
  initializeObjectiveState: initializeInvestigationObjectiveState,
  runObjective(context: ExpeditionExecutionContext): void {
    runObjective(context.request, context.party, context.state, context.rng)
  },
  finalizeObjectiveState(context: ExpeditionExecutionContext): {
    objectiveCompleted: boolean
    progressFact: string
  } {
    setObjectiveCompletedFromProgress(context.state)
    return {
      objectiveCompleted: context.state.objectiveCompleted,
      progressFact: objectiveProgressFact(context.state.objectiveProgress),
    }
  },
  determineOutcome(context: ExpeditionOutcomeContext): ExpeditionOutcome {
    return determineInvestigationOutcome(
      context.request,
      context.state,
      context.party,
    )
  },
}
