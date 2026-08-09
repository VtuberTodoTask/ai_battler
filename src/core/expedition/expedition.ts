import { Adventurer } from '../models/types.ts'
import type {
  ExpeditionExecutionContext,
  ExpeditionExecutionOptions,
  ExpeditionFlowDefinition,
  ExpeditionObjectiveHandler,
  ExpeditionOutcome,
  ExpeditionRequest,
  ExpeditionResult,
} from './types.ts'
import { SeededRng } from '../rng/seededRng.ts'
import { buildBattleEntrySnapshot } from './information.ts'
import { getActiveParty, initializeExpeditionState } from './state.ts'
import { runAftermath } from './phases/aftermath.ts'
import { runApproach } from './phases/approach.ts'
import { runExpeditionBattle } from './battleIntegration.ts'
import { runExploration } from './phases/exploration.ts'
import { runPreparation } from './phases/preparation.ts'
import { runReturn } from './phases/return.ts'
import { investigationHandler } from './objectives/investigation.ts'
import { eliminationHandler } from './objectives/elimination.ts'
import { rescueHandler } from './objectives/rescue.ts'
import { escortHandler } from './objectives/escort.ts'
import { retrievalHandler } from './objectives/retrieval.ts'
import { surveyHandler } from './objectives/survey.ts'

export const EXPEDITION_PHASES = [
  'preparation',
  'approach',
  'contact',
  'exploration',
  'objective',
  'battle',
  'return',
  'aftermath',
] as const

type ImplementedObjectiveType =
  'investigation' | 'elimination' | 'rescue' | 'escort' | 'retrieval' | 'survey'

export const OBJECTIVE_HANDLERS: Record<
  ImplementedObjectiveType,
  ExpeditionObjectiveHandler
> = {
  investigation: investigationHandler,
  elimination: eliminationHandler,
  rescue: rescueHandler,
  escort: escortHandler,
  retrieval: retrievalHandler,
  survey: surveyHandler,
}

function shouldSkipObjectiveAfterBattle(
  flow: ExpeditionFlowDefinition,
  state: { battleOutcome?: string },
): boolean {
  if (flow.objectiveAfterForcedBattleRetreat === false) return false
  if (flow.battle !== 'optional') return false
  if (state.battleOutcome === undefined) return false
  return (
    state.battleOutcome === 'retreat' ||
    state.battleOutcome === 'stalemate' ||
    state.battleOutcome === 'defeat' ||
    state.battleOutcome === 'totalLoss'
  )
}

export function runExpedition(
  request: ExpeditionRequest,
  party: Adventurer[],
  options?: ExpeditionExecutionOptions,
): ExpeditionResult {
  const objectiveType = request.objectiveType
  if (!(objectiveType in OBJECTIVE_HANDLERS)) {
    throw new Error(`Unsupported objectiveType: ${objectiveType}`)
  }

  const handler =
    OBJECTIVE_HANDLERS[objectiveType as keyof typeof OBJECTIVE_HANDLERS]
  const flow = handler.flow

  handler.validateRequest(request)

  const rng = new SeededRng(request.seed)
  const state = initializeExpeditionState(request, party)
  state.metadata = {
    difficulty: request.difficulty,
    requestFeatures: request.features,
    threatFeatures: request.features,
    ...state.metadata,
  }
  if (options?.missionSpecializationMatch !== undefined) {
    state.metadata.missionSpecializationMatch =
      options.missionSpecializationMatch
  }
  state.objectiveState = handler.initializeObjectiveState(request)

  const context: ExpeditionExecutionContext = {
    request,
    party,
    state,
    rng,
  }

  if (flow.preparation) runPreparation(request, party, state, rng)
  handler.afterPreparation?.(context)
  if (flow.approach) runApproach(request, party, state, rng)
  if (flow.exploration) runExploration(request, party, state, rng)

  if (flow.battle !== 'none') {
    handler.beforeBattle?.(context)
    state.battleEntrySnapshot = buildBattleEntrySnapshot(request, party, state)
    const battleEnabled =
      flow.battle === 'required' ||
      (request.battle !== undefined && request.battle.enabled === true)
    if (battleEnabled && getActiveParty(party, state).length > 0) {
      const battleExecution = runExpeditionBattle(request, party, state)
      handler.onBattleResolved?.({
        ...context,
        battleId: battleExecution.battleId,
        battleResult: battleExecution.battleResult,
        battleRecord: battleExecution.battleRecord,
        initialEnemyIds: battleExecution.initialEnemyIds,
      })
    }
  }

  if (getActiveParty(party, state).length === 0) {
    state.currentPhase = 'aftermath'
    return {
      request,
      outcome: handler.determineOutcome(context),
      state,
      party,
    }
  }

  if (
    flow.objective &&
    !shouldSkipObjectiveAfterBattle(flow, state) &&
    getActiveParty(party, state).length > 0
  ) {
    handler.runObjective(context)
  }

  if (getActiveParty(party, state).length === 0) {
    state.currentPhase = 'aftermath'
    return {
      request,
      outcome: handler.determineOutcome(context),
      state,
      party,
    }
  }

  if (flow.return) {
    handler.beforeReturn?.(context)
    runReturn(request, party, state, rng)
    handler.afterReturn?.(context)
  }
  if (flow.aftermath) runAftermath(request, party, state, rng, handler)

  state.currentPhase = 'aftermath'
  const outcome: ExpeditionOutcome = handler.determineOutcome(context)

  return { request, outcome, state, party }
}
