import {
  applyBattleResultToExpedition,
  buildBattleParty,
  environmentEffectsToBattleContext,
  runExpeditionBattle,
} from './battleIntegration.ts'
import {
  applyExpeditionDamage,
  getActiveParty,
  getNonDeadParty,
} from './state.ts'
import {
  applyKnownEnemyWeaknesses,
  buildBattleEntrySnapshot,
  matchKnownEnemyAbilities,
} from './information.ts'
import {
  convertBattleInjuries,
  isUnresolvedInjury,
  isUnresolvedSeriousInjury,
  treatMember,
} from './injuries.ts'
import {
  resolveEliminationTargets,
  runEliminationObjective,
} from './objectives/elimination.ts'
import { resolveSkillCheck } from './checks.ts'
import { OBJECTIVE_HANDLERS } from './expedition.ts'
import { SeededRng } from '../rng/seededRng.ts'
import type {
  ExpeditionObjectiveHandler,
  ExpeditionOutcome,
  ExpeditionOutcomeContext,
  ExpeditionRequest,
  ExpeditionState,
} from './types.ts'
import type { Adventurer } from '../models/types.ts'

function determineOutcome(
  request: ExpeditionRequest,
  state: ExpeditionState,
  party: Adventurer[],
): ExpeditionOutcome {
  const handler = (
    OBJECTIVE_HANDLERS as Record<string, ExpeditionObjectiveHandler | undefined>
  )[request.objectiveType]
  if (!handler) {
    throw new Error(`Unsupported objectiveType: ${request.objectiveType}`)
  }
  const context: ExpeditionOutcomeContext = {
    request,
    party,
    state,
    rng: new SeededRng(request.seed),
  }
  return handler.determineOutcome(context)
}

export const expeditionTestInternals = {
  applyExpeditionDamage,
  isUnresolvedInjury,
  isUnresolvedSeriousInjury,
  determineOutcome,
  getActiveParty,
  getNonDeadParty,
  buildBattleParty,
  environmentEffectsToBattleContext,
  applyKnownEnemyWeaknesses,
  matchKnownEnemyAbilities,
  convertBattleInjuries,
  applyBattleResultToExpedition,
  runExpeditionBattle,
  buildBattleEntrySnapshot,
  resolveSkillCheck,
  treatMember,
  resolveEliminationTargets,
  runEliminationObjective,
}
