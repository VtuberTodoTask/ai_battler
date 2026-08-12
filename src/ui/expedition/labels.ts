import type { BattleOutcome } from '../../core/models/types.ts'
import type {
  CheckResult,
  EnvironmentType,
  ExpeditionOutcome,
  ExpeditionPhase,
  ObjectiveType,
} from '../../core/expedition/types.ts'

export const OBJECTIVE_LABELS: Readonly<Record<ObjectiveType, string>> = {
  investigation: '調査',
  elimination: '討伐',
  rescue: '救出',
  escort: '護衛',
  retrieval: '回収',
  survey: '測量',
}

export const PHASE_LABELS: Readonly<Record<ExpeditionPhase, string>> = {
  preparation: '準備',
  approach: '接近',
  contact: '接触',
  exploration: '探索',
  battle: '戦闘',
  objective: '目的',
  return: '帰還',
  aftermath: '事後処理',
}

export const OUTCOME_LABELS: Readonly<Record<ExpeditionOutcome, string>> = {
  completeSuccess: '完全成功',
  success: '成功',
  partialSuccess: '部分成功',
  failedObjective: '依頼失敗',
  forcedRetreat: '撤退',
  lostExpedition: '遠征隊喪失',
}

export const BATTLE_OUTCOME_LABELS: Readonly<Record<BattleOutcome, string>> = {
  victory: '勝利',
  costlyVictory: '重傷勝利',
  partialVictory: '部分勝利',
  retreat: '撤退',
  defeat: '敗北',
  totalLoss: '全滅',
  stalemate: '膠着',
}

export const CHECK_RESULT_LABELS: Readonly<Record<CheckResult, string>> = {
  criticalSuccess: '大成功',
  success: '成功',
  partialSuccess: '部分成功',
  failure: '失敗',
  criticalFailure: '致命的失敗',
}

export const ENVIRONMENT_LABELS: Readonly<Record<EnvironmentType, string>> = {
  forest: '森林',
  mountain: '山岳',
  cave: '洞窟',
  ruins: '遺跡',
  plains: '平原',
  swamp: '湿地',
  desert: '砂漠',
  urban: '都市',
  magical: '魔境',
}
