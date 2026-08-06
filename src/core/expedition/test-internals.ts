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
import { determineOutcome } from './outcome.ts'
import {
  resolveEliminationTargets,
  runEliminationObjective,
} from './objectives/elimination.ts'
import { resolveSkillCheck } from './checks.ts'

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
