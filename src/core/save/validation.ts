import { GAME_VERSION, SAVE_FORMAT_VERSION } from '../../version.ts'
import {
  TAVERN_ECONOMY_CONFIG,
  buildDailyOperatingCostEntryId,
  buildLedgerEntryId,
  buildMainQuestPaymentEntryId,
  buildUpgradePurchaseEntryId,
} from '../economy/index.ts'
import { computeQuestSettlement } from '../economy/questReward.ts'
import {
  buildQuestReputationEventId,
  computeQuestReputationDelta,
  deriveTavernRank,
} from '../tavern/campaign/reputation.ts'
import {
  BASE_PARTY_CAPACITY,
  MAX_TAVERN_UPGRADE_LEVEL,
  TAVERN_UPGRADE_IDS,
  getEffectivePartyCapacity,
  getUpgradeLevelConfig,
  trainingYardXpBonusForLevel,
} from '../tavern/campaign/upgrades.ts'
import { PARTY_LIFECYCLE_CONFIG } from '../tavern/campaign/lifecycle.ts'
import {
  EXPEDITION_GROWTH_XP,
  PARTY_GROWTH_XP_THRESHOLD,
  SKILL_GROWTH_PER_MILESTONE,
  TRAINING_GROWTH_XP,
  planSkillGrowthForMember,
} from '../tavern/campaign/progression.ts'
import { MAX_SKILL_NORMAL, MAX_SKILL_S } from '../balance/constants.ts'
import { ROLE_MAP } from '../../data/roles.ts'
import {
  collectDueChainRequests,
  resolveQuestChainsForDay,
} from '../tavern/campaign/questChains.ts'
import {
  collectDueEventRequest,
  prepareWorldEventsForDay,
  resolveWorldEventsForDay,
} from '../tavern/campaign/worldEvents.ts'
import {
  MAIN_QUEST_THREAT_DEFINITION_MAP,
  NATIONAL_THREAT_IDS,
} from '../mainQuest/threats.ts'
import { mapMainQuestOutcomeToExpeditionOutcome } from '../mainQuest/simulation.ts'
import {
  replayMainQuestBattleTrace,
  statusEffectsEqual,
} from '../mainQuest/replay.ts'
import { MAIN_QUEST_BATTLE_ANCHOR_IDS } from '../mainQuest/types.ts'
import { isKnownStatusEffectType } from '../battle/statusLabels.ts'
import type {
  MainQuestBattleInitialSnapshot,
  MainQuestBattleTrace,
  MainQuestSimulationResult,
  MainQuestThreatId,
} from '../mainQuest/types.ts'
import type {
  AdventurerRank,
  AdventurerRole,
  SkillName,
  SkillSet,
  StatusEffect,
} from '../models/types.ts'
import type { ExpeditionOutcome } from '../expedition/types.ts'
import type { ResolvedDispatch } from '../tavern/types.ts'
import type {
  CampaignProgressionSource,
  PartyLifecycleStatus,
  QuestChainState,
  TavernRank,
  TavernUpgradeId,
  WorldEventState,
} from '../tavern/campaign/types.ts'
import type { GameSaveData, SaveMetadata } from './types.ts'
import { SaveValidationErrorClass, type SaveValidationError } from './types.ts'

export { SaveValidationErrorClass, type SaveValidationError }

const ALLOWED_OUTCOMES = [
  'completeSuccess',
  'success',
  'partialSuccess',
  'failedObjective',
  'forcedRetreat',
  'lostExpedition',
] as const

const ALLOWED_SETTLEMENT_REASONS = [
  'objective_completed',
  'partial_objective',
  'objective_failed',
] as const

const ALLOWED_LEDGER_KINDS = [
  'opening_balance',
  'quest_commission',
  'daily_operating_cost',
  'upgrade_purchase',
  'main_quest_payment',
] as const

const ALLOWED_RANKS = ['E', 'D', 'C', 'B', 'A', 'S'] as const

const SKILL_NAMES = [
  'melee',
  'ranged',
  'defense',
  'tactics',
  'attackMagic',
  'defenseMagic',
  'healing',
  'scouting',
  'stealth',
  'trapDetection',
  'trapDisarm',
  'survival',
  'monsterKnowledge',
  'firstAid',
  'leadership',
] as const

const EXPEDITION_XP_SOURCES = [
  'completeSuccess',
  'success',
  'partialSuccess',
  'failedObjective',
  'forcedRetreat',
] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasString(obj: Record<string, unknown>, key: string): boolean {
  return typeof obj[key] === 'string'
}

function isValidCurrencyAmount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  )
}

function isValidSignedCurrencyAmount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= Number.MIN_SAFE_INTEGER &&
    value <= Number.MAX_SAFE_INTEGER
  )
}

function isValidReputationScore(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= Number.MIN_SAFE_INTEGER &&
    value <= Number.MAX_SAFE_INTEGER
  )
}

function assertValidSignedCurrencyAmount(
  value: number,
  message: string,
): number {
  if (!isValidSignedCurrencyAmount(value)) {
    throw new SaveValidationErrorClass(message, 'corrupted-data')
  }
  return value
}

function assertPlainObject(
  value: unknown,
  message: string,
): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new SaveValidationErrorClass(message, 'corrupted-data')
  }
}

function validateRewardTerms(
  value: unknown,
  context: string,
): asserts value is { promisedReward: number; tavernCommissionBps: number } {
  assertPlainObject(value, `${context}の形式が不正です`)
  if (!isValidCurrencyAmount(value.promisedReward)) {
    throw new SaveValidationErrorClass(
      `${context}の報酬額が不正です`,
      'corrupted-data',
    )
  }
  if (
    typeof value.tavernCommissionBps !== 'number' ||
    !Number.isInteger(value.tavernCommissionBps) ||
    value.tavernCommissionBps < 0 ||
    value.tavernCommissionBps > 10000
  ) {
    throw new SaveValidationErrorClass(
      `${context}の手数料率が不正です`,
      'corrupted-data',
    )
  }
}

function validateSettlement(
  value: unknown,
  context: string,
  rewardTerms?: { promisedReward: number; tavernCommissionBps: number },
  outcome?: string,
): asserts value is {
  promisedReward: number
  payoutRateBps: number
  paidReward: number
  tavernCommission: number
  settlementReason: string
} {
  assertPlainObject(value, `${context}の形式が不正です`)

  if (!isValidCurrencyAmount(value.promisedReward)) {
    throw new SaveValidationErrorClass(
      `${context}の提示報酬が不正です`,
      'corrupted-data',
    )
  }
  if (
    typeof value.payoutRateBps !== 'number' ||
    !Number.isInteger(value.payoutRateBps) ||
    value.payoutRateBps < 0 ||
    value.payoutRateBps > 10000
  ) {
    throw new SaveValidationErrorClass(
      `${context}の支払率が不正です`,
      'corrupted-data',
    )
  }
  if (!isValidCurrencyAmount(value.paidReward)) {
    throw new SaveValidationErrorClass(
      `${context}の支払額が不正です`,
      'corrupted-data',
    )
  }
  if (!isValidCurrencyAmount(value.tavernCommission)) {
    throw new SaveValidationErrorClass(
      `${context}の手数料が不正です`,
      'corrupted-data',
    )
  }
  if (!ALLOWED_SETTLEMENT_REASONS.includes(value.settlementReason as never)) {
    throw new SaveValidationErrorClass(
      `${context}の精算理由が不正です`,
      'corrupted-data',
    )
  }

  if (
    value.payoutRateBps !== 0 &&
    value.payoutRateBps !== 5000 &&
    value.payoutRateBps !== 10000
  ) {
    throw new SaveValidationErrorClass(
      `${context}の支払率が許可された値ではありません`,
      'corrupted-data',
    )
  }

  if (rewardTerms && ALLOWED_OUTCOMES.includes(outcome as never)) {
    const expected = computeQuestSettlement(rewardTerms, outcome as never)
    if (
      value.promisedReward !== expected.promisedReward ||
      value.payoutRateBps !== expected.payoutRateBps ||
      value.paidReward !== expected.paidReward ||
      value.tavernCommission !== expected.tavernCommission ||
      value.settlementReason !== expected.settlementReason
    ) {
      throw new SaveValidationErrorClass(
        `${context}の精算内容が一致しません`,
        'corrupted-data',
      )
    }
  }
}

function validateRequest(
  value: unknown,
  context: string,
): {
  promisedReward: number
  tavernCommissionBps: number
  rank: AdventurerRank
} {
  assertPlainObject(value, `${context}の形式が不正です`)
  if (!hasString(value, 'id') || (value.id as string).length === 0) {
    throw new SaveValidationErrorClass(
      `${context}のIDがありません`,
      'corrupted-data',
    )
  }
  if (!ALLOWED_RANKS.includes(value.rank as never)) {
    throw new SaveValidationErrorClass(
      `${context}のランクが不正です`,
      'corrupted-data',
    )
  }
  validateRewardTerms(value.rewardTerms, `${context}の報酬条件`)
  return {
    ...(value.rewardTerms as {
      promisedReward: number
      tavernCommissionBps: number
    }),
    rank: value.rank as AdventurerRank,
  }
}

type LedgerValidationRecord =
  | { kind: 'opening_balance'; day: number; amount: number; id: string }
  | {
      kind: 'quest_commission'
      day: number
      amount: number
      id: string
      requestId: string
      partyId: string
    }
  | { kind: 'daily_operating_cost'; day: number; amount: number; id: string }
  | {
      kind: 'upgrade_purchase'
      day: number
      amount: number
      id: string
      upgradeId: string
      targetLevel: number
    }
  | {
      kind: 'main_quest_payment'
      day: number
      amount: number
      id: string
      threatId: string
      attemptId: string
      partyId: string
    }

function validateLedgerEntry(
  value: unknown,
  seenIds: Set<string>,
): LedgerValidationRecord {
  assertPlainObject(value, '帳簿エントリの形式が不正です')

  if (!hasString(value, 'id') || (value.id as string).length === 0) {
    throw new SaveValidationErrorClass(
      '帳簿エントリIDがありません',
      'corrupted-data',
    )
  }
  const id = value.id as string
  if (seenIds.has(id)) {
    throw new SaveValidationErrorClass(
      '重複した帳簿エントリIDがあります',
      'corrupted-data',
    )
  }
  seenIds.add(id)

  if (
    typeof value.day !== 'number' ||
    !Number.isInteger(value.day) ||
    value.day < 0
  ) {
    throw new SaveValidationErrorClass(
      '帳簿エントリの日数が不正です',
      'corrupted-data',
    )
  }
  const day = value.day as number

  if (!ALLOWED_LEDGER_KINDS.includes(value.kind as never)) {
    throw new SaveValidationErrorClass(
      '帳簿エントリの種別が不正です',
      'corrupted-data',
    )
  }
  const kind = value.kind as LedgerValidationRecord['kind']

  if (!isValidSignedCurrencyAmount(value.amount)) {
    throw new SaveValidationErrorClass(
      '帳簿エントリの金額が不正です',
      'corrupted-data',
    )
  }
  const amount = value.amount as number
  if (amount === 0) {
    throw new SaveValidationErrorClass(
      '帳簿に0円の取引が含まれています',
      'corrupted-data',
    )
  }

  assertPlainObject(value.source, '帳簿エントリのソースが不正です')
  const source = value.source as Record<string, unknown>

  switch (kind) {
    case 'opening_balance': {
      if (id !== 'opening-balance') {
        throw new SaveValidationErrorClass(
          '開業資金の帳簿IDが不正です',
          'corrupted-data',
        )
      }
      if (day !== 0) {
        throw new SaveValidationErrorClass(
          '開業資金の日数が不正です',
          'corrupted-data',
        )
      }
      if (amount !== TAVERN_ECONOMY_CONFIG.initialFunds) {
        throw new SaveValidationErrorClass(
          '開業資金の金額が不正です',
          'corrupted-data',
        )
      }
      if (source.type !== 'campaign_start') {
        throw new SaveValidationErrorClass(
          '開業資金のソース種別が不正です',
          'corrupted-data',
        )
      }
      return { kind, day, amount, id }
    }
    case 'daily_operating_cost': {
      const expectedId = buildDailyOperatingCostEntryId(day)
      if (id !== expectedId) {
        throw new SaveValidationErrorClass(
          '営業費の帳簿IDが不正です',
          'corrupted-data',
        )
      }
      if (day < 1) {
        throw new SaveValidationErrorClass(
          '営業費の日数が不正です',
          'corrupted-data',
        )
      }
      if (amount !== -TAVERN_ECONOMY_CONFIG.dailyOperatingCost) {
        throw new SaveValidationErrorClass(
          '営業費の金額が不正です',
          'corrupted-data',
        )
      }
      if (source.type !== 'daily_operating_cost') {
        throw new SaveValidationErrorClass(
          '営業費のソース種別が不正です',
          'corrupted-data',
        )
      }
      return { kind, day, amount, id }
    }
    case 'quest_commission': {
      if (day < 1) {
        throw new SaveValidationErrorClass(
          '手数料エントリの日数が不正です',
          'corrupted-data',
        )
      }
      if (amount <= 0) {
        throw new SaveValidationErrorClass(
          '手数料エントリの金額が不正です',
          'corrupted-data',
        )
      }
      if (source.type !== 'expedition') {
        throw new SaveValidationErrorClass(
          '手数料エントリのソース種別が不正です',
          'corrupted-data',
        )
      }
      if (
        !hasString(source, 'requestId') ||
        (source.requestId as string).length === 0
      ) {
        throw new SaveValidationErrorClass(
          '帳簿エントリの依頼IDがありません',
          'corrupted-data',
        )
      }
      if (
        !hasString(source, 'partyId') ||
        (source.partyId as string).length === 0
      ) {
        throw new SaveValidationErrorClass(
          '帳簿エントリのパーティIDがありません',
          'corrupted-data',
        )
      }
      const requestId = source.requestId as string
      const partyId = source.partyId as string
      const expectedId = buildLedgerEntryId(day, requestId, partyId)
      if (id !== expectedId) {
        throw new SaveValidationErrorClass(
          '帳簿エントリIDが計算値と一致しません',
          'corrupted-data',
        )
      }
      return { kind, day, amount, id, requestId, partyId }
    }
    case 'upgrade_purchase': {
      if (day < 1) {
        throw new SaveValidationErrorClass(
          '設備購入エントリの日数が不正です',
          'corrupted-data',
        )
      }
      if (amount >= 0) {
        throw new SaveValidationErrorClass(
          '設備購入エントリの金額が不正です',
          'corrupted-data',
        )
      }
      if (source.type !== 'tavern_upgrade') {
        throw new SaveValidationErrorClass(
          '設備購入エントリのソース種別が不正です',
          'corrupted-data',
        )
      }
      if (
        !hasString(source, 'upgradeId') ||
        (source.upgradeId as string).length === 0
      ) {
        throw new SaveValidationErrorClass(
          '設備購入エントリの設備IDがありません',
          'corrupted-data',
        )
      }
      const upgradeId = source.upgradeId as string
      if (!TAVERN_UPGRADE_IDS.includes(upgradeId as TavernUpgradeId)) {
        throw new SaveValidationErrorClass(
          '設備購入エントリの設備IDが不明です',
          'corrupted-data',
        )
      }
      if (
        typeof source.targetLevel !== 'number' ||
        !Number.isInteger(source.targetLevel) ||
        source.targetLevel < 1 ||
        source.targetLevel > MAX_TAVERN_UPGRADE_LEVEL
      ) {
        throw new SaveValidationErrorClass(
          '設備購入エントリの対象レベルが不正です',
          'corrupted-data',
        )
      }
      const targetLevel = source.targetLevel as number
      const levelConfig = getUpgradeLevelConfig(
        upgradeId as TavernUpgradeId,
        targetLevel,
      )
      if (!levelConfig) {
        throw new SaveValidationErrorClass(
          '設備購入エントリの対象レベルが定義されていません',
          'corrupted-data',
        )
      }
      if (amount !== -levelConfig.cost) {
        throw new SaveValidationErrorClass(
          '設備購入エントリの金額が費用と一致しません',
          'corrupted-data',
        )
      }
      const expectedId = buildUpgradePurchaseEntryId(upgradeId, targetLevel)
      if (id !== expectedId) {
        throw new SaveValidationErrorClass(
          '設備購入エントリIDが計算値と一致しません',
          'corrupted-data',
        )
      }
      return { kind, day, amount, id, upgradeId, targetLevel }
    }
    case 'main_quest_payment': {
      if (day < 1) {
        throw new SaveValidationErrorClass(
          '主依頼支払いエントリの日数が不正です',
          'corrupted-data',
        )
      }
      if (amount >= 0) {
        throw new SaveValidationErrorClass(
          '主依頼支払いエントリの金額が不正です',
          'corrupted-data',
        )
      }
      if (source.type !== 'main_quest') {
        throw new SaveValidationErrorClass(
          '主依頼支払いエントリのソース種別が不正です',
          'corrupted-data',
        )
      }
      if (
        !hasString(source, 'threatId') ||
        (source.threatId as string).length === 0
      ) {
        throw new SaveValidationErrorClass(
          '主依頼支払いエントリの脅威IDがありません',
          'corrupted-data',
        )
      }
      if (
        !hasString(source, 'attemptId') ||
        (source.attemptId as string).length === 0
      ) {
        throw new SaveValidationErrorClass(
          '主依頼支払いエントリの試行IDがありません',
          'corrupted-data',
        )
      }
      if (
        !hasString(source, 'partyId') ||
        (source.partyId as string).length === 0
      ) {
        throw new SaveValidationErrorClass(
          '主依頼支払いエントリのパーティIDがありません',
          'corrupted-data',
        )
      }
      const threatId = source.threatId as string
      const attemptId = source.attemptId as string
      const partyId = source.partyId as string
      const expectedId = buildMainQuestPaymentEntryId(threatId, attemptId)
      if (id !== expectedId) {
        throw new SaveValidationErrorClass(
          '主依頼支払いエントリIDが計算値と一致しません',
          'corrupted-data',
        )
      }
      return { kind, day, amount, id, threatId, attemptId, partyId }
    }
  }
}

function validateFinance(value: unknown): {
  funds: number
  ledgerById: Map<string, LedgerValidationRecord>
} {
  assertPlainObject(value, '酒場資金データが壊れています')
  const finance = value as Record<string, unknown>

  if (!isValidSignedCurrencyAmount(finance.funds)) {
    throw new SaveValidationErrorClass(
      '酒場資金の値が不正です',
      'corrupted-data',
    )
  }

  if (!Array.isArray(finance.ledgerEntries)) {
    throw new SaveValidationErrorClass(
      '帳簿データが壊れています',
      'corrupted-data',
    )
  }

  const seenIds = new Set<string>()
  const ledgerById = new Map<string, LedgerValidationRecord>()
  let runningTotal = 0
  let openingBalanceCount = 0

  for (const entry of finance.ledgerEntries) {
    const validated = validateLedgerEntry(entry, seenIds)
    ledgerById.set(validated.id, validated)
    runningTotal = assertValidSignedCurrencyAmount(
      runningTotal + validated.amount,
      '帳簿合計が安全な整数範囲を超えました',
    )
    if (validated.kind === 'opening_balance') {
      openingBalanceCount++
    }
  }

  if (openingBalanceCount !== 1) {
    throw new SaveValidationErrorClass(
      '開業資金の帳簿エントリが1件ではありません',
      'corrupted-data',
    )
  }

  if ((finance.funds as number) !== runningTotal) {
    throw new SaveValidationErrorClass(
      '酒場資金と帳簿の合計が一致しません',
      'corrupted-data',
    )
  }

  return { funds: finance.funds as number, ledgerById }
}

interface ReputationEventValidationRecord {
  id: string
  day: number
  delta: number
  requestId: string
  partyId: string
}

function validateReputationEvent(
  value: unknown,
  seenIds: Set<string>,
): ReputationEventValidationRecord {
  assertPlainObject(value, '評判イベントの形式が不正です')

  if (!hasString(value, 'id') || (value.id as string).length === 0) {
    throw new SaveValidationErrorClass(
      '評判イベントIDがありません',
      'corrupted-data',
    )
  }
  const id = value.id as string
  if (seenIds.has(id)) {
    throw new SaveValidationErrorClass(
      '重複した評判イベントIDがあります',
      'corrupted-data',
    )
  }
  seenIds.add(id)

  if (
    typeof value.day !== 'number' ||
    !Number.isInteger(value.day) ||
    value.day < 1
  ) {
    throw new SaveValidationErrorClass(
      '評判イベントの日数が不正です',
      'corrupted-data',
    )
  }
  const day = value.day as number

  if (value.kind !== 'quest_outcome') {
    throw new SaveValidationErrorClass(
      '評判イベントの種別が不正です',
      'corrupted-data',
    )
  }

  if (!isValidReputationScore(value.delta) || (value.delta as number) === 0) {
    throw new SaveValidationErrorClass(
      '評判イベントの変化量が不正です',
      'corrupted-data',
    )
  }
  const delta = value.delta as number

  assertPlainObject(value.source, '評判イベントのソースが不正です')
  const source = value.source as Record<string, unknown>
  if (source.type !== 'expedition') {
    throw new SaveValidationErrorClass(
      '評判イベントのソース種別が不正です',
      'corrupted-data',
    )
  }
  if (
    !hasString(source, 'requestId') ||
    (source.requestId as string).length === 0
  ) {
    throw new SaveValidationErrorClass(
      '評判イベントの依頼IDがありません',
      'corrupted-data',
    )
  }
  if (
    !hasString(source, 'partyId') ||
    (source.partyId as string).length === 0
  ) {
    throw new SaveValidationErrorClass(
      '評判イベントのパーティIDがありません',
      'corrupted-data',
    )
  }
  const requestId = source.requestId as string
  const partyId = source.partyId as string

  const expectedId = buildQuestReputationEventId(day, requestId, partyId)
  if (id !== expectedId) {
    throw new SaveValidationErrorClass(
      '評判イベントIDが計算値と一致しません',
      'corrupted-data',
    )
  }

  return { id, day, delta, requestId, partyId }
}

function validateReputationState(value: unknown): {
  score: number
  peakScore: number
  eventById: Map<string, ReputationEventValidationRecord>
  eventsByDay: Map<number, ReputationEventValidationRecord[]>
} {
  assertPlainObject(value, '酒場評判データが壊れています')
  const reputation = value as Record<string, unknown>

  if (!isValidReputationScore(reputation.score)) {
    throw new SaveValidationErrorClass(
      '酒場評判の値が不正です',
      'corrupted-data',
    )
  }
  if (!isValidReputationScore(reputation.peakScore)) {
    throw new SaveValidationErrorClass(
      '酒場評判の最高値が不正です',
      'corrupted-data',
    )
  }
  const score = reputation.score as number
  const peakScore = reputation.peakScore as number

  if (peakScore < 0) {
    throw new SaveValidationErrorClass(
      '酒場評判の最高値が負の値です',
      'corrupted-data',
    )
  }
  if (peakScore < score) {
    throw new SaveValidationErrorClass(
      '酒場評判の最高値が現在値を下回っています',
      'corrupted-data',
    )
  }

  if (!Array.isArray(reputation.events)) {
    throw new SaveValidationErrorClass(
      '評判イベントデータが壊れています',
      'corrupted-data',
    )
  }

  const seenIds = new Set<string>()
  const eventById = new Map<string, ReputationEventValidationRecord>()
  const eventsByDay = new Map<number, ReputationEventValidationRecord[]>()
  for (const raw of reputation.events) {
    const event = validateReputationEvent(raw, seenIds)
    eventById.set(event.id, event)
    const list = eventsByDay.get(event.day) ?? []
    list.push(event)
    eventsByDay.set(event.day, list)
  }

  return { score, peakScore, eventById, eventsByDay }
}

function validateUpgradeState(value: unknown): Record<TavernUpgradeId, number> {
  assertPlainObject(value, '設備データが壊れています')
  const upgrades = value as Record<string, unknown>

  assertPlainObject(upgrades.levels, '設備レベルデータが壊れています')
  const levels = upgrades.levels as Record<string, unknown>

  const result: Record<string, number> = {}
  for (const upgradeId of TAVERN_UPGRADE_IDS) {
    const level = levels[upgradeId]
    if (
      typeof level !== 'number' ||
      !Number.isInteger(level) ||
      level < 0 ||
      level > MAX_TAVERN_UPGRADE_LEVEL
    ) {
      throw new SaveValidationErrorClass(
        `設備 ${upgradeId} のレベルが不正です`,
        'corrupted-data',
      )
    }
    result[upgradeId] = level
  }

  for (const key of Object.keys(levels)) {
    if (!TAVERN_UPGRADE_IDS.includes(key as TavernUpgradeId)) {
      throw new SaveValidationErrorClass(
        `未知の設備IDがあります: ${key}`,
        'corrupted-data',
      )
    }
  }

  return result as Record<TavernUpgradeId, number>
}

/**
 * Proves that every upgrade purchase AND Main Quest Dispatch payment
 * (Phase 9.8, item 137 — the same "afford-at-the-time" replay Phase 9.3.1
 * established for upgrades) was affordable at the moment it happened,
 * using the funds available at the *start* of its day (day 0's opening
 * balance through the end of the prior day) — never that day's later
 * income (quest commissions) and never the ledger array's insertion
 * order, since same-day purchases/payments are aggregated rather than
 * treated as a sequence. Negative funds are otherwise legal (Phase 9.1+),
 * so this checks affordability at purchase time rather than requiring
 * non-negative final funds.
 */
function validateUpgradePurchaseAffordability(
  ledgerById: Map<string, LedgerValidationRecord>,
  currentDayNumber: number,
): void {
  const entriesByDay = new Map<number, LedgerValidationRecord[]>()
  for (const entry of ledgerById.values()) {
    const list = entriesByDay.get(entry.day)
    if (list) {
      list.push(entry)
    } else {
      entriesByDay.set(entry.day, [entry])
    }
  }

  let runningFunds = 0
  for (let day = 0; day <= currentDayNumber; day++) {
    const dayEntries = entriesByDay.get(day) ?? []
    const fundsAtStartOfDay = runningFunds

    const upgradeSpendForDay = dayEntries
      .filter(
        (entry) =>
          entry.kind === 'upgrade_purchase' ||
          entry.kind === 'main_quest_payment',
      )
      .reduce((sum, entry) => sum - entry.amount, 0)

    if (upgradeSpendForDay > 0 && upgradeSpendForDay > fundsAtStartOfDay) {
      throw new SaveValidationErrorClass(
        '設備購入・主依頼支払いエントリの時点で資金が不足しています',
        'corrupted-data',
      )
    }

    const dayTotal = dayEntries.reduce((sum, entry) => sum + entry.amount, 0)
    runningFunds = assertValidSignedCurrencyAmount(
      runningFunds + dayTotal,
      '帳簿合計が安全な整数範囲を超えました',
    )
  }
}

function validateDayReputationSummary(
  value: unknown,
  expected: {
    beforeScore: number
    delta: number
    afterScore: number
    beforeRank: number
    afterRank: number
    promoted: boolean
  },
): void {
  assertPlainObject(value, '評判サマリーの形式が不正です')
  const summary = value as Record<string, unknown>
  if (
    summary.beforeScore !== expected.beforeScore ||
    summary.delta !== expected.delta ||
    summary.afterScore !== expected.afterScore ||
    summary.beforeRank !== expected.beforeRank ||
    summary.afterRank !== expected.afterRank ||
    summary.promoted !== expected.promoted
  ) {
    throw new SaveValidationErrorClass(
      '評判サマリーが期待値と一致しません',
      'corrupted-data',
    )
  }
}

type ExpectedLedgerEntry =
  | {
      kind: 'quest_commission'
      day: number
      requestId: string
      partyId: string
      amount: number
    }
  | { kind: 'daily_operating_cost'; day: number }

interface ExpectedReputationEvent {
  day: number
  requestId: string
  partyId: string
  delta: number
}

function validateResolvedDispatch(
  value: unknown,
  day: number,
  ledgerById: Map<string, LedgerValidationRecord>,
  expectedLedgerById: Map<string, ExpectedLedgerEntry>,
  reputationEventById: Map<string, ReputationEventValidationRecord>,
  expectedReputationEventById: Map<string, ExpectedReputationEvent>,
): void {
  assertPlainObject(value, '依頼結果の形式が不正です')
  const resolved = value as Record<string, unknown>

  if (resolved.status !== 'resolved' && resolved.status !== 'notBrokered') {
    throw new SaveValidationErrorClass(
      '依頼結果の status が不正です',
      'corrupted-data',
    )
  }

  if (
    !hasString(resolved, 'requestId') ||
    (resolved.requestId as string).length === 0
  ) {
    throw new SaveValidationErrorClass(
      '依頼結果のIDがありません',
      'corrupted-data',
    )
  }

  const request = validateRequest(
    resolved.request,
    `依頼 ${resolved.requestId as string} のデータ`,
  )

  // Invariant across every ResolvedDispatch (chain follow-ups and normal
  // requests alike): the outer requestId and the inner request's own id
  // must always agree — otherwise a save could point requestId at a real,
  // scheduled request while smuggling a different (tampered) request body.
  if ((resolved.request as Record<string, unknown>).id !== resolved.requestId) {
    throw new SaveValidationErrorClass(
      '依頼結果のIDと依頼データのIDが一致しません',
      'corrupted-data',
    )
  }

  if (!Array.isArray(resolved.memberIds)) {
    throw new SaveValidationErrorClass(
      '依頼結果のメンバー一覧が不正です',
      'corrupted-data',
    )
  }
  for (const id of resolved.memberIds as unknown[]) {
    if (typeof id !== 'string') {
      throw new SaveValidationErrorClass(
        '依頼結果のメンバーIDが不正です',
        'corrupted-data',
      )
    }
  }

  if (resolved.status === 'resolved') {
    if (
      !hasString(resolved, 'partyId') ||
      (resolved.partyId as string).length === 0
    ) {
      throw new SaveValidationErrorClass(
        '依頼結果のパーティIDがありません',
        'corrupted-data',
      )
    }

    if (
      resolved.partyName !== undefined &&
      typeof resolved.partyName !== 'string'
    ) {
      throw new SaveValidationErrorClass(
        '依頼結果のパーティ名が不正です',
        'corrupted-data',
      )
    }

    if (
      resolved.leaderName !== undefined &&
      typeof resolved.leaderName !== 'string'
    ) {
      throw new SaveValidationErrorClass(
        '依頼結果のリーダー名が不正です',
        'corrupted-data',
      )
    }

    if (resolved.memberIds.length === 0) {
      throw new SaveValidationErrorClass(
        '依頼結果のメンバー一覧が空です',
        'corrupted-data',
      )
    }

    if (!resolved.result) {
      throw new SaveValidationErrorClass(
        '解決済み依頼結果に遠征結果がありません',
        'corrupted-data',
      )
    }

    assertPlainObject(resolved.result, '遠征結果の形式が不正です')
    const result = resolved.result as Record<string, unknown>
    if (!ALLOWED_OUTCOMES.includes(result.outcome as never)) {
      throw new SaveValidationErrorClass(
        '遠征結果の outcome が不正です',
        'corrupted-data',
      )
    }

    if (!resolved.settlement) {
      throw new SaveValidationErrorClass(
        '遠征結果に精算情報がありません',
        'corrupted-data',
      )
    }

    validateSettlement(
      resolved.settlement,
      `依頼 ${resolved.requestId as string} の精算`,
      request,
      result.outcome as string,
    )

    const settlement = resolved.settlement as {
      tavernCommission: number
    }
    const partyId = resolved.partyId as string
    const expectedId = buildLedgerEntryId(
      day,
      resolved.requestId as string,
      partyId,
    )

    if (settlement.tavernCommission > 0) {
      if (expectedLedgerById.has(expectedId)) {
        throw new SaveValidationErrorClass(
          '重複した精算用帳簿IDが検出されました',
          'corrupted-data',
        )
      }
      expectedLedgerById.set(expectedId, {
        kind: 'quest_commission',
        day,
        requestId: resolved.requestId as string,
        partyId,
        amount: settlement.tavernCommission,
      })

      const entry = ledgerById.get(expectedId)
      if (!entry) {
        throw new SaveValidationErrorClass(
          '精算に対応する帳簿エントリがありません',
          'corrupted-data',
        )
      }
      if (
        entry.kind !== 'quest_commission' ||
        entry.amount !== settlement.tavernCommission
      ) {
        throw new SaveValidationErrorClass(
          '帳簿エントリの金額と手数料が一致しません',
          'corrupted-data',
        )
      }
    } else {
      if (ledgerById.has(expectedId)) {
        throw new SaveValidationErrorClass(
          '手数料0の精算に帳簿エントリが存在します',
          'corrupted-data',
        )
      }
    }

    const expectedReputationEventId = buildQuestReputationEventId(
      day,
      resolved.requestId as string,
      partyId,
    )
    if (expectedReputationEventById.has(expectedReputationEventId)) {
      throw new SaveValidationErrorClass(
        '重複した評判イベントIDが検出されました',
        'corrupted-data',
      )
    }
    const expectedReputationDelta = computeQuestReputationDelta(
      request.rank,
      result.outcome as ExpeditionOutcome,
    )
    expectedReputationEventById.set(expectedReputationEventId, {
      day,
      requestId: resolved.requestId as string,
      partyId,
      delta: expectedReputationDelta,
    })
    const reputationEvent = reputationEventById.get(expectedReputationEventId)
    if (!reputationEvent) {
      throw new SaveValidationErrorClass(
        '遠征結果に対応する評判イベントがありません',
        'corrupted-data',
      )
    }
    if (reputationEvent.delta !== expectedReputationDelta) {
      throw new SaveValidationErrorClass(
        '評判イベントの変化量が期待値と一致しません',
        'corrupted-data',
      )
    }

    if (resolved.report && isPlainObject(resolved.report)) {
      const report = resolved.report as Record<string, unknown>
      if (report.settlement) {
        validateSettlement(
          report.settlement,
          `依頼 ${resolved.requestId as string} の報告書精算`,
          request,
          result.outcome as string,
        )
        const reportSettlement = report.settlement as {
          promisedReward: number
          payoutRateBps: number
          paidReward: number
          tavernCommission: number
          settlementReason: string
        }
        const canonical = resolved.settlement as typeof reportSettlement
        if (
          reportSettlement.promisedReward !== canonical.promisedReward ||
          reportSettlement.payoutRateBps !== canonical.payoutRateBps ||
          reportSettlement.paidReward !== canonical.paidReward ||
          reportSettlement.tavernCommission !== canonical.tavernCommission ||
          reportSettlement.settlementReason !== canonical.settlementReason
        ) {
          throw new SaveValidationErrorClass(
            '報告書の精算と canonical 精算が一致しません',
            'corrupted-data',
          )
        }
      }
    }
  } else {
    if (resolved.result) {
      throw new SaveValidationErrorClass(
        '未解決の依頼結果に遠征結果が含まれています',
        'corrupted-data',
      )
    }
    if (resolved.report) {
      throw new SaveValidationErrorClass(
        '未解決の依頼結果に報告書が含まれています',
        'corrupted-data',
      )
    }
    if (resolved.settlement) {
      throw new SaveValidationErrorClass(
        '未解決の依頼結果に精算情報が含まれています',
        'corrupted-data',
      )
    }
    if (resolved.partyId !== undefined) {
      throw new SaveValidationErrorClass(
        '未解決の依頼結果にパーティIDが含まれています',
        'corrupted-data',
      )
    }
    if (resolved.partyName !== undefined) {
      throw new SaveValidationErrorClass(
        '未解決の依頼結果にパーティ名が含まれています',
        'corrupted-data',
      )
    }
    if (resolved.leaderName !== undefined) {
      throw new SaveValidationErrorClass(
        '未解決の依頼結果にリーダー名が含まれています',
        'corrupted-data',
      )
    }
    if (resolved.memberIds.length !== 0) {
      throw new SaveValidationErrorClass(
        '未解決の依頼結果のメンバー一覧が空ではありません',
        'corrupted-data',
      )
    }
  }
}

function validateDayRequests(value: unknown): void {
  if (!Array.isArray(value)) {
    throw new SaveValidationErrorClass(
      '依頼リストの形式が不正です',
      'corrupted-data',
    )
  }
  const seenIds = new Set<string>()
  for (const request of value) {
    validateRequest(request, '依頼データ')
    const id = (request as Record<string, unknown>).id as string
    if (seenIds.has(id)) {
      throw new SaveValidationErrorClass(
        '本日の依頼IDが重複しています',
        'corrupted-data',
      )
    }
    seenIds.add(id)
  }
}

function validateDayResults(
  value: unknown,
  day: number,
  ledgerById: Map<string, LedgerValidationRecord>,
  expectedLedgerById: Map<string, ExpectedLedgerEntry>,
  reputationEventById: Map<string, ReputationEventValidationRecord>,
  expectedReputationEventById: Map<string, ExpectedReputationEvent>,
): void {
  if (!Array.isArray(value)) {
    throw new SaveValidationErrorClass(
      '依頼結果リストの形式が不正です',
      'corrupted-data',
    )
  }
  for (const result of value) {
    validateResolvedDispatch(
      result,
      day,
      ledgerById,
      expectedLedgerById,
      reputationEventById,
      expectedReputationEventById,
    )
  }
}

interface ReputationReplayState {
  score: number
  peak: number
}

function validateHistoryRecord(
  value: unknown,
  ledgerById: Map<string, LedgerValidationRecord>,
  expectedLedgerById: Map<string, ExpectedLedgerEntry>,
  reputationEventById: Map<string, ReputationEventValidationRecord>,
  expectedReputationEventById: Map<string, ExpectedReputationEvent>,
  reputationEventsByDay: Map<number, ReputationEventValidationRecord[]>,
  replay: ReputationReplayState,
  rankAtStartOfDay: Map<number, TavernRank>,
): void {
  assertPlainObject(value, '履歴レコードの形式が不正です')
  const record = value as Record<string, unknown>
  if (
    typeof record.dayNumber !== 'number' ||
    !Number.isInteger(record.dayNumber) ||
    (record.dayNumber as number) < 1
  ) {
    throw new SaveValidationErrorClass(
      '履歴レコードの日数が不正です',
      'corrupted-data',
    )
  }

  const dayNumber = record.dayNumber as number
  expectedLedgerById.set(buildDailyOperatingCostEntryId(dayNumber), {
    kind: 'daily_operating_cost',
    day: dayNumber,
  })

  validateDayResults(
    record.results,
    dayNumber,
    ledgerById,
    expectedLedgerById,
    reputationEventById,
    expectedReputationEventById,
  )

  const beforeScore = replay.score
  const beforePeak = replay.peak
  const beforeRank = deriveTavernRank(beforePeak)
  rankAtStartOfDay.set(dayNumber, beforeRank)
  const dayEvents = reputationEventsByDay.get(dayNumber) ?? []
  const dayDelta = dayEvents.reduce((sum, event) => sum + event.delta, 0)
  const afterScore = beforeScore + dayDelta
  const afterPeak = Math.max(beforePeak, afterScore)
  const afterRank = deriveTavernRank(afterPeak)

  validateDayReputationSummary(record.reputationSummary, {
    beforeScore,
    delta: dayDelta,
    afterScore,
    beforeRank,
    afterRank,
    promoted: afterRank > beforeRank,
  })

  replay.score = afterScore
  replay.peak = afterPeak
}

interface ValidatedLifecycleState {
  firstArrivalDay: number
  visitCount: number
  lastDepartureDay?: number
  returnEligibleDay?: number
}

function validateLifecycleState(
  value: unknown,
  expectedStatus: PartyLifecycleStatus,
  context: string,
): ValidatedLifecycleState {
  assertPlainObject(value, `${context}のLifecycleデータが壊れています`)
  const lifecycle = value as Record<string, unknown>

  if (lifecycle.status !== expectedStatus) {
    throw new SaveValidationErrorClass(
      `${context}のLifecycle状態が不正です`,
      'corrupted-data',
    )
  }

  if (
    typeof lifecycle.firstArrivalDay !== 'number' ||
    !Number.isInteger(lifecycle.firstArrivalDay) ||
    lifecycle.firstArrivalDay < 1
  ) {
    throw new SaveValidationErrorClass(
      `${context}の初回来訪日が不正です`,
      'corrupted-data',
    )
  }

  if (
    typeof lifecycle.visitCount !== 'number' ||
    !Number.isInteger(lifecycle.visitCount) ||
    lifecycle.visitCount < 1
  ) {
    throw new SaveValidationErrorClass(
      `${context}の来訪回数が不正です`,
      'corrupted-data',
    )
  }

  let lastDepartureDay: number | undefined
  if (lifecycle.lastDepartureDay !== undefined) {
    if (
      typeof lifecycle.lastDepartureDay !== 'number' ||
      !Number.isInteger(lifecycle.lastDepartureDay) ||
      lifecycle.lastDepartureDay < 1
    ) {
      throw new SaveValidationErrorClass(
        `${context}の旅立ち日が不正です`,
        'corrupted-data',
      )
    }
    lastDepartureDay = lifecycle.lastDepartureDay
  }

  let returnEligibleDay: number | undefined
  if (lifecycle.returnEligibleDay !== undefined) {
    if (
      typeof lifecycle.returnEligibleDay !== 'number' ||
      !Number.isInteger(lifecycle.returnEligibleDay)
    ) {
      throw new SaveValidationErrorClass(
        `${context}の再訪可能日が不正です`,
        'corrupted-data',
      )
    }
    returnEligibleDay = lifecycle.returnEligibleDay
  }

  return {
    firstArrivalDay: lifecycle.firstArrivalDay,
    visitCount: lifecycle.visitCount,
    lastDepartureDay,
    returnEligibleDay,
  }
}

/**
 * Validates the persistent party roster across all three lifecycle
 * collections: unique party/character identity, valid status per
 * collection, arrival/departure/return-eligibility date invariants, and
 * that the staying roster never exceeds the (upgrade-derived) effective
 * capacity. Deliberately does not validate the full AdventurerParty
 * structure (members' stats etc.) — that is outside the existing save
 * validation's scope.
 */
function validatePartyLifecycle(
  campaign: Record<string, unknown>,
  currentDayNumber: number,
  effectiveCapacity: number,
): void {
  if (!Array.isArray(campaign.awayParties)) {
    throw new SaveValidationErrorClass(
      '旅立ったパーティのデータが壊れています',
      'corrupted-data',
    )
  }
  if (!Array.isArray(campaign.retiredParties)) {
    throw new SaveValidationErrorClass(
      '引退したパーティのデータが壊れています',
      'corrupted-data',
    )
  }

  const parties = campaign.parties as unknown[]
  const awayParties = campaign.awayParties
  const retiredParties = campaign.retiredParties

  if (parties.length > effectiveCapacity) {
    throw new SaveValidationErrorClass(
      '滞在中のパーティ数が設備上限を超えています',
      'corrupted-data',
    )
  }

  const seenPartyIds = new Set<string>()
  const seenCharacterIds = new Set<string>()

  function checkPartyEntry(
    value: unknown,
    expectedStatus: PartyLifecycleStatus,
  ): void {
    assertPlainObject(value, 'パーティデータが壊れています')
    const party = value as Record<string, unknown>

    if (!hasString(party, 'id') || (party.id as string).length === 0) {
      throw new SaveValidationErrorClass(
        'パーティIDがありません',
        'corrupted-data',
      )
    }
    const id = party.id as string
    if (seenPartyIds.has(id)) {
      throw new SaveValidationErrorClass(
        '同じパーティIDが複数のLifecycle集合に存在します',
        'corrupted-data',
      )
    }
    seenPartyIds.add(id)

    if (
      typeof party.arrivalDay !== 'number' ||
      !Number.isInteger(party.arrivalDay) ||
      party.arrivalDay < 1
    ) {
      throw new SaveValidationErrorClass(
        'パーティの来訪日が不正です',
        'corrupted-data',
      )
    }
    const arrivalDay = party.arrivalDay as number
    if (arrivalDay > currentDayNumber) {
      throw new SaveValidationErrorClass(
        'パーティの来訪日が未来の日付です',
        'corrupted-data',
      )
    }

    const lifecycle = validateLifecycleState(
      party.lifecycle,
      expectedStatus,
      `パーティ ${id}`,
    )

    if (lifecycle.firstArrivalDay > arrivalDay) {
      throw new SaveValidationErrorClass(
        '初回来訪日が今回の来訪日より後になっています',
        'corrupted-data',
      )
    }
    if (
      lifecycle.visitCount === 1 &&
      lifecycle.firstArrivalDay !== arrivalDay
    ) {
      throw new SaveValidationErrorClass(
        '来訪回数が1のパーティは初回来訪日と今回の来訪日が一致する必要があります',
        'corrupted-data',
      )
    }
    if (lifecycle.visitCount >= 2 && lifecycle.firstArrivalDay >= arrivalDay) {
      throw new SaveValidationErrorClass(
        '来訪回数が2以上のパーティは初回来訪日が今回の来訪日より前である必要があります',
        'corrupted-data',
      )
    }

    if (expectedStatus === 'staying') {
      if (lifecycle.returnEligibleDay !== undefined) {
        throw new SaveValidationErrorClass(
          '滞在中のパーティに再訪可能日が設定されています',
          'corrupted-data',
        )
      }
    } else {
      if (lifecycle.lastDepartureDay === undefined) {
        throw new SaveValidationErrorClass(
          '旅立ったパーティに旅立ち日がありません',
          'corrupted-data',
        )
      }
      if (lifecycle.lastDepartureDay < arrivalDay) {
        throw new SaveValidationErrorClass(
          '旅立ち日が来訪日より前になっています',
          'corrupted-data',
        )
      }
      if (lifecycle.lastDepartureDay > currentDayNumber - 1) {
        throw new SaveValidationErrorClass(
          '旅立ち日が未来の日付です',
          'corrupted-data',
        )
      }

      if (expectedStatus === 'away') {
        if (lifecycle.returnEligibleDay === undefined) {
          throw new SaveValidationErrorClass(
            '旅立ったパーティに再訪可能日がありません',
            'corrupted-data',
          )
        }
        if (
          lifecycle.returnEligibleDay !==
          lifecycle.lastDepartureDay + PARTY_LIFECYCLE_CONFIG.returnCooldownDays
        ) {
          throw new SaveValidationErrorClass(
            '再訪可能日がクールダウン計算と一致しません',
            'corrupted-data',
          )
        }
      } else {
        if (lifecycle.returnEligibleDay !== undefined) {
          throw new SaveValidationErrorClass(
            '引退したパーティに再訪可能日が設定されています',
            'corrupted-data',
          )
        }
      }
    }

    const partyMembers = (party.party as Record<string, unknown> | undefined)
      ?.members
    if (Array.isArray(partyMembers)) {
      for (const member of partyMembers) {
        if (isPlainObject(member) && hasString(member, 'id')) {
          const memberId = member.id as string
          if (seenCharacterIds.has(memberId)) {
            throw new SaveValidationErrorClass(
              '同じ冒険者IDが複数のパーティに存在します',
              'corrupted-data',
            )
          }
          seenCharacterIds.add(memberId)
        }
      }
    }
  }

  for (const p of parties) checkPartyEntry(p, 'staying')
  for (const p of awayParties) checkPartyEntry(p, 'away')
  for (const p of retiredParties) checkPartyEntry(p, 'retired')
}

/** Order-independent structural equality for plain JSON-shaped data — used
 * instead of JSON.stringify comparison so key insertion order (which can
 * legitimately differ between a freshly-replayed object literal and a
 * round-tripped save) never causes a false rejection. `undefined` and a
 * genuinely-absent key are treated the same, matching how optional fields
 * are actually constructed (omitted, never set to `undefined`) throughout
 * this codebase and how JSON serialization drops them. */
function deepEqualPlain(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }
    return a.every((v, i) => deepEqualPlain(v, b[i]))
  }
  if (
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object'
  ) {
    const ao = a as Record<string, unknown>
    const bo = b as Record<string, unknown>
    const keysA = Object.keys(ao).filter((k) => ao[k] !== undefined)
    const keysB = Object.keys(bo).filter((k) => bo[k] !== undefined)
    if (keysA.length !== keysB.length) return false
    return keysA.every(
      (k) =>
        Object.prototype.hasOwnProperty.call(bo, k) &&
        deepEqualPlain(ao[k], bo[k]),
    )
  }
  return false
}

/**
 * Phase 9.6 Quest Chain causal-integrity validation. Quest Chains are not
 * self-authoritative either: `campaign.questChains` and every
 * `history[].questChainEvents` must be exactly what
 * resolveQuestChainsForDay — the SAME pure reducer the runtime uses —
 * produces when replayed day-by-day from real Day Facts (each day's
 * resolved results and reputation-derived Tavern Rank), not merely an
 * internally well-formed chain graph. A single deep-equality check against
 * the replay's final chains array subsumes nearly every structural
 * requirement (unique/known/sequential/rank/objective/scheduled-day —
 * since the reducer only ever constructs a chain that already satisfies
 * all of them), so this function's own explicit checks are limited to
 * what a pure day-by-day replay cannot express on its own: the active
 * chain / currentDay.requests linkage (a "now" snapshot, not history) and
 * a global duplicate-resolution guard.
 */
function validateQuestChains(
  campaign: Record<string, unknown>,
  history: readonly unknown[],
  currentDay: Record<string, unknown>,
): void {
  if (!Array.isArray(campaign.questChains)) {
    throw new SaveValidationErrorClass(
      '連続依頼データが壊れています',
      'corrupted-data',
    )
  }
  const campaignSeed = campaign.seed as string

  let replayedChains: QuestChainState[] = []
  const seenChainRequestIdsGlobally = new Set<string>()

  for (let i = 0; i < history.length; i++) {
    const record = history[i]
    assertPlainObject(record, '履歴レコードの形式が不正です')
    const dayNumber = i + 1

    if (!Array.isArray(record.questChainEvents)) {
      throw new SaveValidationErrorClass(
        '連続依頼イベント一覧がありません',
        'corrupted-data',
      )
    }
    if (!Array.isArray(record.results)) {
      throw new SaveValidationErrorClass(
        '依頼結果一覧の形式が不正です',
        'corrupted-data',
      )
    }
    assertPlainObject(record.reputationSummary, '評判サマリーの形式が不正です')
    if (typeof record.reputationSummary.afterRank !== 'number') {
      throw new SaveValidationErrorClass(
        '評判サマリーの酒場ランクが不正です',
        'corrupted-data',
      )
    }
    const afterTavernRank = record.reputationSummary.afterRank as TavernRank

    // Global duplicate-resolution guard: a Quest Chain follow-up request
    // is scheduled for, and can only ever be resolved on, exactly one
    // day — reusing its id in a later day's results is never legitimate.
    for (const rawResult of record.results) {
      if (
        !isPlainObject(rawResult) ||
        typeof rawResult.requestId !== 'string'
      ) {
        continue
      }
      const requestChain = isPlainObject(rawResult.request)
        ? rawResult.request.chain
        : undefined
      if (!isPlainObject(requestChain)) continue
      if (seenChainRequestIdsGlobally.has(rawResult.requestId)) {
        throw new SaveValidationErrorClass(
          '連続依頼の依頼が複数日にわたって解決されています',
          'corrupted-data',
        )
      }
      seenChainRequestIdsGlobally.add(rawResult.requestId)
    }

    // Historical Follow-up Result <-> Frozen Chain Request linkage. The
    // reducer's own final-state replay (below) trusts each day's real
    // results as-is; it cannot by itself detect a history record whose
    // stored `results[].request` was retroactively edited (reward/rank/
    // objective/chain metadata) while keeping that day's internal
    // settlement/reputation math self-consistent. So before feeding this
    // day's results into the reducer, prove each is exactly the request
    // that was actually scheduled/frozen at the start of this day.
    const expectedDueRequestById = new Map(
      collectDueChainRequests(replayedChains, dayNumber).map((r) => [r.id, r]),
    )
    const seenDueChainRequestIdsToday = new Set<string>()
    for (const rawResult of record.results) {
      if (
        !isPlainObject(rawResult) ||
        typeof rawResult.requestId !== 'string'
      ) {
        continue
      }
      const requestId = rawResult.requestId
      const rawRequest = isPlainObject(rawResult.request)
        ? rawResult.request
        : undefined
      const requestChain = rawRequest ? rawRequest.chain : undefined
      const expectedRequest = expectedDueRequestById.get(requestId)

      if (expectedRequest) {
        if (seenDueChainRequestIdsToday.has(requestId)) {
          throw new SaveValidationErrorClass(
            `連続依頼の依頼結果が重複しています (DAY ${dayNumber})`,
            'corrupted-data',
          )
        }
        seenDueChainRequestIdsToday.add(requestId)

        if (!deepEqualPlain(rawRequest, expectedRequest)) {
          throw new SaveValidationErrorClass(
            `連続依頼の依頼内容が掲示時点の内容と一致しません (DAY ${dayNumber})`,
            'corrupted-data',
          )
        }
      } else if (isPlainObject(requestChain)) {
        throw new SaveValidationErrorClass(
          `対応する予定のない連続依頼の依頼結果があります (DAY ${dayNumber})`,
          'corrupted-data',
        )
      }
    }
    for (const id of expectedDueRequestById.keys()) {
      if (!seenDueChainRequestIdsToday.has(id)) {
        throw new SaveValidationErrorClass(
          `予定されていた連続依頼の依頼結果が見つかりません (DAY ${dayNumber})`,
          'corrupted-data',
        )
      }
    }

    const { chains: nextChains, events: expectedEvents } =
      resolveQuestChainsForDay({
        campaignSeed,
        dayNumber,
        currentChains: replayedChains,
        results: record.results as unknown as ResolvedDispatch[],
        afterTavernRank,
      })
    replayedChains = nextChains

    if (!deepEqualPlain(expectedEvents, record.questChainEvents)) {
      throw new SaveValidationErrorClass(
        `連続依頼イベントが実際の日次結果の再計算結果と一致しません (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }
  }

  if (!deepEqualPlain(replayedChains, campaign.questChains)) {
    throw new SaveValidationErrorClass(
      '連続依頼の状態が履歴の再計算結果と一致しません',
      'corrupted-data',
    )
  }

  // --- Active chain <-> currentDay.requests linkage (a "now" snapshot,
  // not expressible by the historical replay above) ---
  if (!Array.isArray(currentDay.requests)) {
    throw new SaveValidationErrorClass(
      '本日の依頼一覧の形式が不正です',
      'corrupted-data',
    )
  }
  const currentDayNumber = campaign.dayNumber as number

  const expectedChainRequestById = new Map<string, unknown>()
  for (const chain of replayedChains) {
    if (chain.status !== 'active') continue
    const scheduledSteps = chain.steps.filter((s) => s.status === 'scheduled')
    if (scheduledSteps.length !== 1) {
      throw new SaveValidationErrorClass(
        '進行中の連続依頼に予定されている依頼が1件ではありません',
        'corrupted-data',
      )
    }
    const step = scheduledSteps[0]
    if (step.scheduledDay !== currentDayNumber) {
      throw new SaveValidationErrorClass(
        '連続依頼の予定日が本日と一致しません',
        'corrupted-data',
      )
    }
    expectedChainRequestById.set(step.request.id, step.request)
  }

  const seenChainRequestIds = new Set<string>()
  for (const raw of currentDay.requests) {
    if (!isPlainObject(raw) || typeof raw.id !== 'string') continue
    if (!isPlainObject(raw.chain)) continue
    const expected = expectedChainRequestById.get(raw.id)
    if (!expected) {
      throw new SaveValidationErrorClass(
        '対応する進行中の連続依頼が存在しない依頼があります',
        'corrupted-data',
      )
    }
    if (!deepEqualPlain(raw, expected)) {
      throw new SaveValidationErrorClass(
        '本日の連続依頼の内容が連続依頼の状態と一致しません',
        'corrupted-data',
      )
    }
    seenChainRequestIds.add(raw.id)
  }

  for (const id of expectedChainRequestById.keys()) {
    if (!seenChainRequestIds.has(id)) {
      throw new SaveValidationErrorClass(
        '進行中の連続依頼の依頼が本日の依頼一覧にありません',
        'corrupted-data',
      )
    }
  }
}

/**
 * Phase 9.7 World Event causal-integrity validation. Mirrors
 * validateQuestChains's design exactly: `campaign.worldEvents` and every
 * `history[].worldEventEvents` must be exactly what
 * prepareWorldEventsForDay + resolveWorldEventsForDay — the SAME pure
 * reducers the runtime uses — produce when replayed day-by-day from real
 * Day Facts, not merely an internally well-formed World Event graph. A
 * single deep-equality check against the replay's final state subsumes
 * nearly every structural requirement (known definition/unique id/valid
 * status/startedDay/plannedEndDay/responsePoints bounds/no-overlap/
 * cooldown/no-immediate-repeat — the reducers only ever construct a state
 * that already satisfies all of them), so this function's own explicit
 * checks are limited to what a pure day-by-day replay cannot express on
 * its own: the historical Event-linked request's frozen-snapshot
 * integrity (Phase 9.6.1's approach, applied here from the start) and the
 * active event / currentDay.requests linkage (a "now" snapshot).
 */
function validateWorldEvents(
  campaign: Record<string, unknown>,
  history: readonly unknown[],
  currentDay: Record<string, unknown>,
): void {
  if (!Array.isArray(campaign.worldEvents)) {
    throw new SaveValidationErrorClass(
      '世界情勢データが壊れています',
      'corrupted-data',
    )
  }
  const campaignSeed = campaign.seed as string

  let replayedWorldEvents: WorldEventState[] = []

  for (let i = 0; i < history.length; i++) {
    const record = history[i]
    assertPlainObject(record, '履歴レコードの形式が不正です')
    const dayNumber = i + 1

    if (!Array.isArray(record.worldEventEvents)) {
      throw new SaveValidationErrorClass(
        '世界情勢イベント一覧がありません',
        'corrupted-data',
      )
    }
    if (!Array.isArray(record.results)) {
      throw new SaveValidationErrorClass(
        '依頼結果一覧の形式が不正です',
        'corrupted-data',
      )
    }
    assertPlainObject(record.reputationSummary, '評判サマリーの形式が不正です')
    if (typeof record.reputationSummary.beforeRank !== 'number') {
      throw new SaveValidationErrorClass(
        '評判サマリーの酒場ランクが不正です',
        'corrupted-data',
      )
    }
    const startOfDayTavernRank = record.reputationSummary
      .beforeRank as TavernRank

    const { worldEvents: afterPrepare, events: prepareEvents } =
      prepareWorldEventsForDay({
        campaignSeed,
        dayNumber,
        worldEvents: replayedWorldEvents,
        tavernRank: startOfDayTavernRank,
      })

    // Historical Event-linked Result <-> Frozen Event Request linkage —
    // same frozen-snapshot approach as Phase 9.6.1's Quest Chain fix,
    // applied from the start here: prove each day's stored result for the
    // active event is exactly the request that was actually generated for
    // that day, not a retroactively-edited one kept internally consistent.
    const expectedDueRequestById = new Map(
      collectDueEventRequest(afterPrepare, dayNumber).map((r) => [r.id, r]),
    )
    const seenDueEventRequestIdsToday = new Set<string>()
    for (const rawResult of record.results) {
      if (
        !isPlainObject(rawResult) ||
        typeof rawResult.requestId !== 'string'
      ) {
        continue
      }
      const requestId = rawResult.requestId
      const rawRequest = isPlainObject(rawResult.request)
        ? rawResult.request
        : undefined
      const requestWorldEvent = rawRequest ? rawRequest.worldEvent : undefined
      const expectedRequest = expectedDueRequestById.get(requestId)

      if (expectedRequest) {
        if (seenDueEventRequestIdsToday.has(requestId)) {
          throw new SaveValidationErrorClass(
            `情勢依頼の依頼結果が重複しています (DAY ${dayNumber})`,
            'corrupted-data',
          )
        }
        seenDueEventRequestIdsToday.add(requestId)

        if (!deepEqualPlain(rawRequest, expectedRequest)) {
          throw new SaveValidationErrorClass(
            `情勢依頼の依頼内容が掲示時点の内容と一致しません (DAY ${dayNumber})`,
            'corrupted-data',
          )
        }
      } else if (isPlainObject(requestWorldEvent)) {
        throw new SaveValidationErrorClass(
          `対応する予定のない情勢依頼の依頼結果があります (DAY ${dayNumber})`,
          'corrupted-data',
        )
      }
    }
    for (const id of expectedDueRequestById.keys()) {
      if (!seenDueEventRequestIdsToday.has(id)) {
        throw new SaveValidationErrorClass(
          `予定されていた情勢依頼の依頼結果が見つかりません (DAY ${dayNumber})`,
          'corrupted-data',
        )
      }
    }

    const { worldEvents: afterResolve, events: resolveEvents } =
      resolveWorldEventsForDay({
        dayNumber,
        worldEvents: afterPrepare,
        results: record.results as unknown as ResolvedDispatch[],
      })

    const expectedEvents = [...prepareEvents, ...resolveEvents]
    if (!deepEqualPlain(expectedEvents, record.worldEventEvents)) {
      throw new SaveValidationErrorClass(
        `世界情勢イベントが実際の日次結果の再計算結果と一致しません (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }

    replayedWorldEvents = afterResolve
  }

  // The current (still-planning) day's World Event start decision was
  // already made by the runtime's advanceCampaignDay — replay it once
  // more here so campaign.worldEvents is checked against the SAME
  // prepareWorldEventsForDay call the runtime used, not just the state
  // left over at the end of history.
  const currentDayNumber = campaign.dayNumber as number
  const lastRecord =
    history.length > 0
      ? (history[history.length - 1] as Record<string, unknown>)
      : undefined
  const currentTavernRank =
    lastRecord && isPlainObject(lastRecord.reputationSummary)
      ? (lastRecord.reputationSummary.afterRank as TavernRank)
      : deriveTavernRank(0)

  const { worldEvents: expectedCurrentWorldEvents } = prepareWorldEventsForDay({
    campaignSeed,
    dayNumber: currentDayNumber,
    worldEvents: replayedWorldEvents,
    tavernRank: currentTavernRank,
  })

  if (!deepEqualPlain(expectedCurrentWorldEvents, campaign.worldEvents)) {
    throw new SaveValidationErrorClass(
      '世界情勢の状態が履歴の再計算結果と一致しません',
      'corrupted-data',
    )
  }

  // --- Active event <-> currentDay.requests linkage (a "now" snapshot,
  // not expressible by the historical replay above) ---
  if (!Array.isArray(currentDay.requests)) {
    throw new SaveValidationErrorClass(
      '本日の依頼一覧の形式が不正です',
      'corrupted-data',
    )
  }

  const expectedEventRequestById = new Map<string, unknown>()
  for (const request of collectDueEventRequest(
    expectedCurrentWorldEvents,
    currentDayNumber,
  )) {
    expectedEventRequestById.set(request.id, request)
  }

  const seenEventRequestIds = new Set<string>()
  for (const raw of currentDay.requests) {
    if (!isPlainObject(raw) || typeof raw.id !== 'string') continue
    if (!isPlainObject(raw.worldEvent)) continue
    const expected = expectedEventRequestById.get(raw.id)
    if (!expected) {
      throw new SaveValidationErrorClass(
        '対応する進行中の世界情勢が存在しない依頼があります',
        'corrupted-data',
      )
    }
    if (!deepEqualPlain(raw, expected)) {
      throw new SaveValidationErrorClass(
        '本日の情勢依頼の内容が世界情勢の状態と一致しません',
        'corrupted-data',
      )
    }
    seenEventRequestIds.add(raw.id)
  }

  for (const id of expectedEventRequestById.keys()) {
    if (!seenEventRequestIds.has(id)) {
      throw new SaveValidationErrorClass(
        '進行中の世界情勢の依頼が本日の依頼一覧にありません',
        'corrupted-data',
      )
    }
  }
}

const MAIN_QUEST_ANCHOR_SET = new Set<string>(MAIN_QUEST_BATTLE_ANCHOR_IDS)

/**
 * `sourceId` values the real Battle Engine actually produces for a
 * non-participant-attributed status (audited against every `addStatus`
 * call site in `../battle/battle.ts`/`actions.ts`, Phase 9.8.3 item 13):
 * `'contact'` (Contact-phase stun/weakened), `'stealthStart'` (the
 * `stealthStart` ability), and `addStatus`'s own `sourceId ?? 'system'`
 * fallback. A real participant id (party member or the boss) is the other
 * legal case — this set is deliberately not Party/Boss-limited on its own.
 */
const KNOWN_SYSTEM_STATUS_SOURCES = new Set([
  'contact',
  'stealthStart',
  'system',
])

/**
 * Generous sanity bounds, not a new Main Quest balance rule (item 15) —
 * every real `addStatus` call site uses `duration` in `[1, 3]` and `value`
 * in `[0, 8]` or so; these bounds exist only to catch obviously-corrupted
 * data (e.g. a tampered `duration: 99` or `value: 500`).
 */
const STATUS_DURATION_MAX = 20
const STATUS_VALUE_ABS_MAX = 200

/**
 * Structural validity of one full `StatusEffect` object — `type` from the
 * known whitelist, `duration` a non-negative integer within sanity bounds,
 * `value` (if present) a finite number within sanity bounds, `sourceId` a
 * known participant id or a known system source (Phase 9.8.3 items 12-15).
 * Shared by Initial Snapshot validation, per-event structural validation,
 * and (indirectly, via presence tracking) sequential consistency — never a
 * `type`-only check.
 */
function validateStatusEffectObject(
  raw: unknown,
  validParticipantIds: Set<string>,
  dayNumber: number,
): void {
  assertPlainObject(
    raw,
    `Battle Traceの状態異常オブジェクトが壊れています (DAY ${dayNumber})`,
  )
  if (typeof raw.type !== 'string' || !isKnownStatusEffectType(raw.type)) {
    throw new SaveValidationErrorClass(
      `Battle Traceに未知の状態異常があります (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }
  if (
    typeof raw.duration !== 'number' ||
    !Number.isInteger(raw.duration) ||
    raw.duration < 0 ||
    raw.duration > STATUS_DURATION_MAX
  ) {
    throw new SaveValidationErrorClass(
      `Battle Traceの状態異常durationが不正です (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }
  if (
    raw.value !== undefined &&
    (typeof raw.value !== 'number' ||
      !Number.isFinite(raw.value) ||
      Math.abs(raw.value) > STATUS_VALUE_ABS_MAX)
  ) {
    throw new SaveValidationErrorClass(
      `Battle Traceの状態異常valueが不正です (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }
  if (
    typeof raw.sourceId !== 'string' ||
    raw.sourceId.length === 0 ||
    (!validParticipantIds.has(raw.sourceId) &&
      !KNOWN_SYSTEM_STATUS_SOURCES.has(raw.sourceId))
  ) {
    throw new SaveValidationErrorClass(
      `Battle Traceの状態異常sourceIdが不正です (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }
}

/**
 * Structural integrity of one Attempt's stored `battleTrace.initialSnapshot`
 * (Phase 9.8.1 item 81) — every roster member has exactly one snapshot
 * entry, HP/MP are integers within `[0, max]`, and `statusEffects` is a
 * full, valid `StatusEffect` array (Phase 9.8.3 — never just type names).
 * Never assumes full HP/MP (item 7): a Main Quest Party is not guaranteed
 * to depart at full health, so this only bounds-checks, it does not
 * require `currentHp === maxHp`.
 */
function validateMainQuestInitialSnapshot(
  snapshot: Record<string, unknown>,
  rosterIds: Set<string>,
  monsterId: string,
  dayNumber: number,
): void {
  const validParticipantIds = new Set([...rosterIds, monsterId])
  if (!Array.isArray(snapshot.partyMembers)) {
    throw new SaveValidationErrorClass(
      `Battle Traceの初期状態が不正です (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }
  const seen = new Set<string>()
  for (const raw of snapshot.partyMembers) {
    assertPlainObject(
      raw,
      `Battle Traceの初期パーティ状態が壊れています (DAY ${dayNumber})`,
    )
    if (
      typeof raw.characterId !== 'string' ||
      !rosterIds.has(raw.characterId)
    ) {
      throw new SaveValidationErrorClass(
        `Battle Traceの初期状態に未知のパーティIDがあります (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }
    if (seen.has(raw.characterId)) {
      throw new SaveValidationErrorClass(
        `Battle Traceの初期状態にパーティIDの重複があります (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }
    seen.add(raw.characterId)

    if (typeof raw.maxHp !== 'number' || raw.maxHp <= 0) {
      throw new SaveValidationErrorClass(
        `Battle Traceの初期最大HPが不正です (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }
    if (
      typeof raw.currentHp !== 'number' ||
      raw.currentHp < 0 ||
      raw.currentHp > raw.maxHp
    ) {
      throw new SaveValidationErrorClass(
        `Battle Traceの初期HPが不正です (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }
    if (typeof raw.maxMp !== 'number' || raw.maxMp < 0) {
      throw new SaveValidationErrorClass(
        `Battle Traceの初期最大MPが不正です (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }
    if (
      typeof raw.currentMp !== 'number' ||
      raw.currentMp < 0 ||
      raw.currentMp > raw.maxMp
    ) {
      throw new SaveValidationErrorClass(
        `Battle Traceの初期MPが不正です (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }
    if (!Array.isArray(raw.statusEffects)) {
      throw new SaveValidationErrorClass(
        `Battle Traceの初期状態異常一覧が不正です (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }
    for (const effect of raw.statusEffects) {
      validateStatusEffectObject(effect, validParticipantIds, dayNumber)
    }
  }
  for (const id of rosterIds) {
    if (!seen.has(id)) {
      throw new SaveValidationErrorClass(
        `Battle Traceの初期状態に不足しているパーティメンバーがいます (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }
  }

  assertPlainObject(
    snapshot.monster,
    `Battle Traceの初期モンスター状態が壊れています (DAY ${dayNumber})`,
  )
  const monster = snapshot.monster
  if (typeof monster.maxHp !== 'number' || monster.maxHp <= 0) {
    throw new SaveValidationErrorClass(
      `Battle Traceのモンスター初期最大HPが不正です (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }
  if (
    typeof monster.currentHp !== 'number' ||
    monster.currentHp < 0 ||
    monster.currentHp > monster.maxHp
  ) {
    throw new SaveValidationErrorClass(
      `Battle Traceのモンスター初期HPが不正です (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }
  if (!Array.isArray(monster.statusEffects)) {
    throw new SaveValidationErrorClass(
      `Battle Traceのモンスター初期状態異常一覧が不正です (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }
  for (const effect of monster.statusEffects) {
    validateStatusEffectObject(effect, validParticipantIds, dayNumber)
  }
}

/**
 * Sequential structural consistency of every `statusApplied`/`statusRemoved`
 * fact in a Battle Trace (Phase 9.8.2 item 1) — independent of, and run
 * before, the full-state replay: a `statusRemoved` for a status the target
 * did not actually carry at that point (per the Trace itself, seeded from
 * the Initial Snapshot) is rejected outright. The real Battle Engine never
 * produces this pattern — every `removeStatus` call site that reaches a
 * `BattleLogEntry` first confirms the status is actually present via
 * `hasStatus`/an explicit pre-clear snapshot (audited in `../battle/
 * battle.ts`/`actions.ts`) — so this is a genuine tamper signal, not a
 * false positive on legitimate engine behavior.
 */
function validateMainQuestStatusTraceConsistency(
  initialSnapshot: Record<string, unknown>,
  events: Record<string, unknown>[],
  monsterId: string,
  dayNumber: number,
): void {
  // targetId -> type -> present (the effect's other fields are checked by
  // `validateStatusEffectObject` at the point each event/snapshot entry is
  // structurally validated; this map only needs to know WHICH types are
  // currently present, to catch an illegal removal — full-object final-
  // state parity is `validateMainQuestBattleTrace`'s separate job, via the
  // shared `replayMainQuestBattleTrace`/`statusEffectsEqual`).
  const presence = new Map<string, Set<string>>()

  function seed(targetId: string, statusEffects: unknown): void {
    const set = new Set<string>()
    if (Array.isArray(statusEffects)) {
      for (const e of statusEffects) {
        if (isPlainObject(e) && typeof e.type === 'string') set.add(e.type)
      }
    }
    presence.set(targetId, set)
  }

  const partyMembers = initialSnapshot.partyMembers
  if (Array.isArray(partyMembers)) {
    for (const raw of partyMembers) {
      if (isPlainObject(raw) && typeof raw.characterId === 'string') {
        seed(raw.characterId, raw.statusEffects)
      }
    }
  }
  if (isPlainObject(initialSnapshot.monster)) {
    seed(monsterId, initialSnapshot.monster.statusEffects)
  }

  for (const event of events) {
    if (event.type !== 'statusApplied' && event.type !== 'statusRemoved') {
      continue
    }
    const targetId = event.targetId
    if (typeof targetId !== 'string') continue
    const set = presence.get(targetId) ?? new Set<string>()
    presence.set(targetId, set)

    if (event.type === 'statusApplied') {
      const effect = event.effect
      if (isPlainObject(effect) && typeof effect.type === 'string') {
        set.add(effect.type)
      }
    } else {
      const status = event.status
      if (typeof status !== 'string') continue
      if (!set.has(status)) {
        throw new SaveValidationErrorClass(
          `Battle Traceが付与されていない状態異常の解除を記録しています (DAY ${dayNumber})`,
          'corrupted-data',
        )
      }
      set.delete(status)
    }
  }
}

/**
 * Structural + causal integrity of one Attempt's stored `battleTrace`
 * against its `result` (Phase 9.8.1 items 81-84) — never re-runs
 * `runBattle` (nothing else in this validator re-executes combat
 * simulations either; see `validateMainQuest`'s own docs for why). Checks
 * per-event structure (ids/round-order/non-negative amounts), the Initial
 * Snapshot (`validateMainQuestInitialSnapshot`), every `occurredAnchor` is
 * from the fixed vocabulary — and, critically, replays the Trace via the
 * SAME `replayMainQuestBattleTrace` pure helper the runtime/Presentation
 * layer uses (item 83: never a second, independently-drifting algorithm)
 * to prove the replayed final HP/MP/incapacitated/dead/monsterDefeated/
 * outcome match the stored `result` exactly (item 84).
 */
function validateMainQuestBattleTrace(
  trace: Record<string, unknown>,
  result: Record<string, unknown>,
  threatId: string,
  dayNumber: number,
): void {
  if (!Array.isArray(trace.occurredAnchors)) {
    throw new SaveValidationErrorClass(
      `主依頼試行のBattle Traceが不正です (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }
  for (const anchor of trace.occurredAnchors) {
    if (typeof anchor !== 'string' || !MAIN_QUEST_ANCHOR_SET.has(anchor)) {
      throw new SaveValidationErrorClass(
        `Battle Traceに未知のanchorがあります (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }
  }

  const events = trace.events as unknown[]
  const monsterId = `mainquest:${threatId}`
  let rosterIds: Set<string> | undefined
  let lastRound = -Infinity

  for (const rawEvent of events) {
    assertPlainObject(
      rawEvent,
      `主依頼試行のBattle Traceイベントが壊れています (DAY ${dayNumber})`,
    )
    const event = rawEvent as Record<string, unknown>

    if (event.type === 'battleStarted') {
      if (!Array.isArray(event.partyMemberIds)) {
        throw new SaveValidationErrorClass(
          `Battle Traceの参加者一覧が不正です (DAY ${dayNumber})`,
          'corrupted-data',
        )
      }
      rosterIds = new Set(event.partyMemberIds as string[])
    }

    if (typeof event.round === 'number') {
      if (event.round < lastRound) {
        throw new SaveValidationErrorClass(
          `Battle Traceのround順序が不正です (DAY ${dayNumber})`,
          'corrupted-data',
        )
      }
      lastRound = event.round
    }

    if (typeof event.amount === 'number' && event.amount < 0) {
      throw new SaveValidationErrorClass(
        `Battle Traceのdamage/heal量が負の値です (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }

    const validIds = new Set([...(rosterIds ?? []), monsterId])

    if (event.type === 'statusRemoved') {
      if (
        typeof event.status !== 'string' ||
        !isKnownStatusEffectType(event.status)
      ) {
        throw new SaveValidationErrorClass(
          `Battle Traceに未知の状態異常があります (DAY ${dayNumber})`,
          'corrupted-data',
        )
      }
    }
    if (event.type === 'statusApplied') {
      validateStatusEffectObject(event.effect, validIds, dayNumber)
    }

    for (const key of ['actorId', 'targetId', 'memberId'] as const) {
      const value = event[key]
      if (typeof value === 'string' && !validIds.has(value)) {
        throw new SaveValidationErrorClass(
          `Battle Traceに未知の参加者IDがあります (DAY ${dayNumber})`,
          'corrupted-data',
        )
      }
    }
  }

  if (!rosterIds) {
    throw new SaveValidationErrorClass(
      `Battle Traceに戦闘開始イベントがありません (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }
  assertPlainObject(
    trace.initialSnapshot,
    `Battle Traceの初期状態がありません (DAY ${dayNumber})`,
  )
  validateMainQuestInitialSnapshot(
    trace.initialSnapshot as Record<string, unknown>,
    rosterIds,
    monsterId,
    dayNumber,
  )
  validateMainQuestStatusTraceConsistency(
    trace.initialSnapshot as Record<string, unknown>,
    events as Record<string, unknown>[],
    monsterId,
    dayNumber,
  )

  const replay = replayMainQuestBattleTrace(
    trace.initialSnapshot as unknown as MainQuestBattleInitialSnapshot,
    trace as unknown as MainQuestBattleTrace,
  )

  if (replay.monster.defeated !== (result.monsterDefeated === true)) {
    throw new SaveValidationErrorClass(
      `Battle TraceのBoss撃破とSimulation Resultが一致しません (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }
  if (replay.outcome !== null && replay.outcome !== result.outcome) {
    throw new SaveValidationErrorClass(
      `Battle Traceの結果とSimulation Resultが一致しません (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }

  const finalStateById = new Map<string, Record<string, unknown>>()
  if (Array.isArray(result.finalMemberStates)) {
    for (const raw of result.finalMemberStates) {
      if (isPlainObject(raw) && typeof raw.id === 'string') {
        finalStateById.set(raw.id, raw)
      }
    }
  }
  for (const member of replay.members) {
    const finalState = finalStateById.get(member.characterId)
    if (!finalState) continue
    if (
      finalState.currentHp !== member.currentHp ||
      finalState.currentMp !== member.currentMp ||
      finalState.incapacitated !== member.incapacitated ||
      finalState.dead !== member.dead
    ) {
      throw new SaveValidationErrorClass(
        `Battle Traceの再生結果がSimulation Resultの最終状態と一致しません (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }

    // Full-object comparison (type/duration/value/sourceId), never a
    // `type`-only `Set` (Phase 9.8.3 item 26/27) — a tampered `duration`/
    // `value`/`sourceId` on the stored final state, with the Trace itself
    // left untouched, disagrees with what the Trace independently replays
    // to and is rejected here exactly like any other final-state mismatch.
    const storedEffects: StatusEffect[] = Array.isArray(
      finalState.statusEffects,
    )
      ? finalState.statusEffects
          .filter(isPlainObject)
          .filter(
            (e) =>
              typeof e.type === 'string' &&
              typeof e.duration === 'number' &&
              typeof e.sourceId === 'string',
          )
          .map((e) => ({
            type: e.type as StatusEffect['type'],
            duration: e.duration as number,
            value: e.value as number | undefined,
            sourceId: e.sourceId as string,
          }))
      : []
    if (!statusEffectsEqual(member.statusEffects, storedEffects)) {
      throw new SaveValidationErrorClass(
        `Battle Traceの再生結果の状態異常がSimulation Resultの最終状態と一致しません (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }
  }
}

/**
 * Phase 9.8 Main Quest. Unlike Quest Chains/World Events, a Main Quest
 * Attempt originates from a free Player choice (Dispatch), not a
 * deterministic per-day schedule, so there is no "expected request" to
 * replay it against. What IS validated here: every Attempt's frozen
 * `request` still matches its (fixed, static) Threat Definition exactly;
 * a matching `main_quest_payment` Ledger entry exists for every Attempt
 * and vice versa (no orphans); at most one Attempt per day; Battle Trace
 * structural integrity (`validateMainQuestBattleTrace`); and — most
 * importantly — Threat/curse *causality*: a Threat can only be `defeated`,
 * Nosferatu can only be unlocked/attempted, and the curse can only be
 * `lifted`, if a real winning Attempt actually exists to justify it
 * (items 139-143). This never re-runs `runBattle` — see
 * `validateMainQuestBattleTrace`'s docs for why that is consistent with
 * the rest of this validator.
 */
/**
 * Minimal structural validation of a stored `MainQuestNarrativeScript` —
 * only the fields the Presentation runtime directly reads
 * (`MainQuestScene`'s SoundNovel push for `preBattle`/`postBattle`,
 * `buildMainQuestBattlePlaybackPlan`'s `battleInterludes` lookup). This is
 * deliberately NOT semantic validation of the AI-authored prose itself —
 * only enough to guarantee a corrupted save can never throw a runtime
 * exception mid-Presentation.
 */
function validateMainQuestNarrativeScript(
  value: unknown,
  dayNumber: number,
): void {
  assertPlainObject(
    value,
    `主依頼試行の顛末データが壊れています (DAY ${dayNumber})`,
  )
  if (
    typeof value.preBattle !== 'string' ||
    typeof value.postBattle !== 'string'
  ) {
    throw new SaveValidationErrorClass(
      `主依頼試行の顛末テキストが不正です (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }
  if (!Array.isArray(value.battleInterludes)) {
    throw new SaveValidationErrorClass(
      `主依頼試行の戦闘中セリフが不正です (DAY ${dayNumber})`,
      'corrupted-data',
    )
  }
  for (const cue of value.battleInterludes) {
    if (
      !isPlainObject(cue) ||
      typeof cue.anchorId !== 'string' ||
      typeof cue.speakerId !== 'string' ||
      typeof cue.text !== 'string'
    ) {
      throw new SaveValidationErrorClass(
        `主依頼試行の戦闘中セリフが不正です (DAY ${dayNumber})`,
        'corrupted-data',
      )
    }
  }
}

function validateMainQuest(
  campaign: Record<string, unknown>,
  ledgerById: Map<string, LedgerValidationRecord>,
  currentDayNumber: number,
): void {
  assertPlainObject(campaign.mainQuest, '主依頼データが壊れています')
  const mainQuest = campaign.mainQuest as Record<string, unknown>

  assertPlainObject(mainQuest.threats, '主依頼の脅威一覧が壊れています')
  const threats = mainQuest.threats as Record<string, unknown>
  const allThreatIds = Object.keys(
    MAIN_QUEST_THREAT_DEFINITION_MAP,
  ) as MainQuestThreatId[]

  for (const threatId of allThreatIds) {
    assertPlainObject(
      threats[threatId],
      `主依頼の脅威データが壊れています: ${threatId}`,
    )
    const state = threats[threatId] as Record<string, unknown>
    if (
      state.status !== 'locked' &&
      state.status !== 'available' &&
      state.status !== 'defeated'
    ) {
      throw new SaveValidationErrorClass(
        '主依頼の脅威状態が不正です',
        'corrupted-data',
      )
    }
    if (state.id !== threatId) {
      throw new SaveValidationErrorClass(
        '主依頼の脅威IDが一致しません',
        'corrupted-data',
      )
    }
  }

  if (
    mainQuest.playerCurseStatus !== 'active' &&
    mainQuest.playerCurseStatus !== 'lifted'
  ) {
    throw new SaveValidationErrorClass(
      '主人公の呪い状態が不正です',
      'corrupted-data',
    )
  }

  if (!Array.isArray(mainQuest.attempts)) {
    throw new SaveValidationErrorClass(
      '主依頼の試行一覧が壊れています',
      'corrupted-data',
    )
  }

  const seenAttemptIds = new Set<string>()
  const seenDayNumbers = new Set<number>()
  const victoryThreatIds = new Set<MainQuestThreatId>()
  const expectedPaymentIds = new Set<string>()

  for (const rawAttempt of mainQuest.attempts) {
    assertPlainObject(rawAttempt, '主依頼の試行データが壊れています')

    if (
      !hasString(rawAttempt, 'id') ||
      (rawAttempt.id as string).length === 0
    ) {
      throw new SaveValidationErrorClass(
        '主依頼試行のIDがありません',
        'corrupted-data',
      )
    }
    const attemptId = rawAttempt.id as string
    if (seenAttemptIds.has(attemptId)) {
      throw new SaveValidationErrorClass(
        '主依頼試行IDが重複しています',
        'corrupted-data',
      )
    }
    seenAttemptIds.add(attemptId)

    if (
      typeof rawAttempt.threatId !== 'string' ||
      !allThreatIds.includes(rawAttempt.threatId as MainQuestThreatId)
    ) {
      throw new SaveValidationErrorClass(
        '主依頼試行の脅威IDが不明です',
        'corrupted-data',
      )
    }
    const threatId = rawAttempt.threatId as MainQuestThreatId
    const definition = MAIN_QUEST_THREAT_DEFINITION_MAP[threatId]

    if (
      typeof rawAttempt.dayNumber !== 'number' ||
      !Number.isInteger(rawAttempt.dayNumber) ||
      rawAttempt.dayNumber < 1 ||
      rawAttempt.dayNumber > currentDayNumber
    ) {
      throw new SaveValidationErrorClass(
        '主依頼試行の日数が不正です',
        'corrupted-data',
      )
    }
    const dayNumber = rawAttempt.dayNumber as number
    if (seenDayNumbers.has(dayNumber)) {
      throw new SaveValidationErrorClass(
        '同じ日に複数の主依頼が存在します',
        'corrupted-data',
      )
    }
    seenDayNumbers.add(dayNumber)

    if (
      !hasString(rawAttempt, 'partyId') ||
      (rawAttempt.partyId as string).length === 0
    ) {
      throw new SaveValidationErrorClass(
        '主依頼試行のパーティIDがありません',
        'corrupted-data',
      )
    }
    const partyId = rawAttempt.partyId as string

    if (rawAttempt.fee !== definition.fee) {
      throw new SaveValidationErrorClass(
        '主依頼試行の依頼金が脅威定義と一致しません',
        'corrupted-data',
      )
    }

    assertPlainObject(rawAttempt.request, '主依頼試行のRequestが壊れています')
    const request = rawAttempt.request as Record<string, unknown>
    if (
      request.threatId !== threatId ||
      request.dayNumber !== dayNumber ||
      request.partyId !== partyId ||
      request.fee !== definition.fee ||
      request.requiredPartyRank !== definition.requiredPartyRank ||
      request.requiredAffinity !== definition.requiredAffinity
    ) {
      throw new SaveValidationErrorClass(
        '主依頼試行のRequestが脅威定義と一致しません',
        'corrupted-data',
      )
    }

    const paymentId = buildMainQuestPaymentEntryId(threatId, attemptId)
    expectedPaymentIds.add(paymentId)
    const paymentEntry = ledgerById.get(paymentId)
    if (
      !paymentEntry ||
      paymentEntry.kind !== 'main_quest_payment' ||
      paymentEntry.threatId !== threatId ||
      paymentEntry.attemptId !== attemptId ||
      paymentEntry.partyId !== partyId ||
      paymentEntry.amount !== -definition.fee ||
      paymentEntry.day !== dayNumber
    ) {
      throw new SaveValidationErrorClass(
        '主依頼試行に対応する支払いエントリがありません',
        'corrupted-data',
      )
    }

    const hasResult = rawAttempt.result !== undefined
    const hasTrace = rawAttempt.battleTrace !== undefined
    if (hasResult !== hasTrace) {
      throw new SaveValidationErrorClass(
        '主依頼試行のResultとBattle Traceが揃っていません',
        'corrupted-data',
      )
    }

    if (hasResult) {
      assertPlainObject(rawAttempt.result, '主依頼試行のResultが壊れています')
      const result = rawAttempt.result as Record<string, unknown>
      if (typeof result.monsterDefeated !== 'boolean') {
        throw new SaveValidationErrorClass(
          '主依頼試行のResultが不正です',
          'corrupted-data',
        )
      }
      if (result.monsterDefeated) {
        victoryThreatIds.add(threatId)
      }

      assertPlainObject(
        rawAttempt.battleTrace,
        '主依頼試行のBattle Traceが壊れています',
      )
      validateMainQuestBattleTrace(
        rawAttempt.battleTrace as Record<string, unknown>,
        result,
        threatId,
        dayNumber,
      )
    }

    if (
      rawAttempt.presentationStatus !== 'narrative_pending' &&
      rawAttempt.presentationStatus !== 'ready' &&
      rawAttempt.presentationStatus !== 'viewing' &&
      rawAttempt.presentationStatus !== 'completed'
    ) {
      throw new SaveValidationErrorClass(
        '主依頼試行の演出状態が不正です',
        'corrupted-data',
      )
    }
    const presentationStatus = rawAttempt.presentationStatus as
      'narrative_pending' | 'ready' | 'viewing' | 'completed'

    const hasNarrative = rawAttempt.narrative !== undefined
    if (hasNarrative) {
      validateMainQuestNarrativeScript(rawAttempt.narrative, dayNumber)
    }
    const isPendingTarget = mainQuest.pendingPresentationAttemptId === attemptId

    // Presentation-status causality (item 7): each `presentationStatus`
    // admits exactly one combination of result/narrative presence and
    // `pendingPresentationAttemptId` reference — never derivable any other
    // way, same philosophy as the Threat/Curse causality checks above.
    if (presentationStatus === 'narrative_pending') {
      if (hasNarrative) {
        throw new SaveValidationErrorClass(
          '演出状態が顛末生成待ちなのに顛末データが存在します',
          'corrupted-data',
        )
      }
      if (hasResult) {
        if (!isPendingTarget) {
          throw new SaveValidationErrorClass(
            '解決済みで顛末生成待ちの試行が保留中の演出として参照されていません',
            'corrupted-data',
          )
        }
      } else if (isPendingTarget) {
        throw new SaveValidationErrorClass(
          '未解決の試行が保留中の演出として参照されています',
          'corrupted-data',
        )
      }
    } else if (
      presentationStatus === 'ready' ||
      presentationStatus === 'viewing'
    ) {
      if (!hasResult || !hasNarrative) {
        throw new SaveValidationErrorClass(
          '演出状態に対して戦闘結果または顛末データが不足しています',
          'corrupted-data',
        )
      }
      if (!isPendingTarget) {
        throw new SaveValidationErrorClass(
          '演出進行中の試行が保留中の演出として参照されていません',
          'corrupted-data',
        )
      }
    } else {
      // completed
      if (!hasResult || !hasNarrative) {
        throw new SaveValidationErrorClass(
          '完了済みの試行に戦闘結果または顛末データが不足しています',
          'corrupted-data',
        )
      }
      if (isPendingTarget) {
        throw new SaveValidationErrorClass(
          '完了済みの試行が保留中の演出として参照されています',
          'corrupted-data',
        )
      }
    }
  }

  for (const [id, entry] of ledgerById) {
    if (entry.kind !== 'main_quest_payment') continue
    if (!expectedPaymentIds.has(id)) {
      throw new SaveValidationErrorClass(
        '孤立した主依頼支払いエントリがあります',
        'corrupted-data',
      )
    }
  }

  // Threat causality (items 139-141): defeated <=> a real winning Attempt
  // exists. Never derivable the other way around ("fake defeat").
  for (const threatId of allThreatIds) {
    const state = threats[threatId] as Record<string, unknown>
    const hasVictory = victoryThreatIds.has(threatId)
    if (state.status === 'defeated' && !hasVictory) {
      throw new SaveValidationErrorClass(
        `脅威が撃破済みとされていますが、対応する勝利した試行がありません: ${threatId}`,
        'corrupted-data',
      )
    }
    if (state.status !== 'defeated' && hasVictory) {
      throw new SaveValidationErrorClass(
        `勝利した試行があるのに脅威が撃破済みになっていません: ${threatId}`,
        'corrupted-data',
      )
    }
  }

  // Nosferatu unlock causality (item 142): locked <=> 7/7 not yet defeated.
  const allNationalDefeated = NATIONAL_THREAT_IDS.every(
    (id) => (threats[id] as Record<string, unknown>).status === 'defeated',
  )
  const nosferatuState = threats.nosferatu as Record<string, unknown>
  const hasNosferatuAttempt = (mainQuest.attempts as unknown[]).some(
    (a) => isPlainObject(a) && a.threatId === 'nosferatu',
  )
  if (
    !allNationalDefeated &&
    (nosferatuState.status !== 'locked' || hasNosferatuAttempt)
  ) {
    throw new SaveValidationErrorClass(
      '七国の脅威を全て撃破する前にNosferatuへ挑戦しています',
      'corrupted-data',
    )
  }

  // Curse causality (item 143): lifted <=> a real Nosferatu victory exists.
  const nosferatuVictory = victoryThreatIds.has('nosferatu')
  if (mainQuest.playerCurseStatus === 'lifted' && !nosferatuVictory) {
    throw new SaveValidationErrorClass(
      'Nosferatuを撃破していないのに呪いが解けています',
      'corrupted-data',
    )
  }
  if (nosferatuVictory && mainQuest.playerCurseStatus !== 'lifted') {
    throw new SaveValidationErrorClass(
      'Nosferatuを撃破しているのに呪いが解けていません',
      'corrupted-data',
    )
  }

  if (mainQuest.pendingPresentationAttemptId !== undefined) {
    if (
      typeof mainQuest.pendingPresentationAttemptId !== 'string' ||
      !seenAttemptIds.has(mainQuest.pendingPresentationAttemptId)
    ) {
      throw new SaveValidationErrorClass(
        '保留中の演出試行IDが不正です',
        'corrupted-data',
      )
    }
  }
}

interface ValidatedProgressionFields {
  growthXp: number
  totalGrowthXp: number
  growthMilestones: number
  trainingDays: number
}

/**
 * Validates the Phase 9.5 growth-arithmetic invariant that must hold for
 * every party's progression at all times:
 *   0 <= growthXp < PARTY_GROWTH_XP_THRESHOLD
 *   totalGrowthXp >= 0
 *   growthMilestones === floor(totalGrowthXp / PARTY_GROWTH_XP_THRESHOLD)
 *   growthXp === totalGrowthXp % PARTY_GROWTH_XP_THRESHOLD
 */
function validateProgressionFields(
  value: unknown,
  context: string,
): ValidatedProgressionFields {
  assertPlainObject(value, `${context}の成長データが壊れています`)
  const p = value as Record<string, unknown>

  if (
    typeof p.growthXp !== 'number' ||
    !Number.isInteger(p.growthXp) ||
    p.growthXp < 0 ||
    p.growthXp >= PARTY_GROWTH_XP_THRESHOLD
  ) {
    throw new SaveValidationErrorClass(
      `${context}の成長経験値が不正です`,
      'corrupted-data',
    )
  }
  if (
    typeof p.totalGrowthXp !== 'number' ||
    !Number.isInteger(p.totalGrowthXp) ||
    p.totalGrowthXp < 0
  ) {
    throw new SaveValidationErrorClass(
      `${context}の累積成長経験値が不正です`,
      'corrupted-data',
    )
  }
  if (
    typeof p.growthMilestones !== 'number' ||
    !Number.isInteger(p.growthMilestones) ||
    p.growthMilestones < 0
  ) {
    throw new SaveValidationErrorClass(
      `${context}の成長回数が不正です`,
      'corrupted-data',
    )
  }
  if (
    typeof p.trainingDays !== 'number' ||
    !Number.isInteger(p.trainingDays) ||
    p.trainingDays < 0
  ) {
    throw new SaveValidationErrorClass(
      `${context}の訓練日数が不正です`,
      'corrupted-data',
    )
  }

  const growthXp = p.growthXp as number
  const totalGrowthXp = p.totalGrowthXp as number
  const growthMilestones = p.growthMilestones as number

  if (
    growthMilestones !== Math.floor(totalGrowthXp / PARTY_GROWTH_XP_THRESHOLD)
  ) {
    throw new SaveValidationErrorClass(
      `${context}の成長回数が累積経験値と一致しません`,
      'corrupted-data',
    )
  }
  if (growthXp !== totalGrowthXp % PARTY_GROWTH_XP_THRESHOLD) {
    throw new SaveValidationErrorClass(
      `${context}の成長経験値が累積経験値と一致しません`,
      'corrupted-data',
    )
  }

  return {
    growthXp,
    totalGrowthXp,
    growthMilestones,
    trainingDays: p.trainingDays as number,
  }
}

/** Validates every known skill is present with an integer value within the
 * rank-appropriate cap. Returns the parsed skill map for later use. */
function validateSkillSet(
  value: unknown,
  rank: string,
  context: string,
): Record<string, number> {
  assertPlainObject(value, `${context}の技能データが壊れています`)
  const skills = value as Record<string, unknown>
  const cap = rank === 'S' ? MAX_SKILL_S : MAX_SKILL_NORMAL
  const result: Record<string, number> = {}
  for (const skill of SKILL_NAMES) {
    const v = skills[skill]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > cap) {
      throw new SaveValidationErrorClass(
        `${context}の技能「${skill}」の値が不正です`,
        'corrupted-data',
      )
    }
    result[skill] = v
  }
  return result
}

interface KnownPartyProgressionInfo {
  progression: ValidatedProgressionFields
  arrivalSerial: number
  members: Map<
    string,
    { role: string; rank: string; skills: Record<string, number> }
  >
}

/**
 * Phase 9.5.1 growth causal-integrity validation. Progression Events are
 * not self-authoritative: every experienceGained/progressionSkipped event
 * must be traceable to an actual Day Fact — a resolved Expedition outcome,
 * a same-day casualty departure, or genuine idle-training eligibility
 * reconstructed from the historical party lifecycle (replayed from
 * partyEvents) plus the historical Training Yard level (replayed from the
 * upgrade_purchase ledger) — and every skillImproved event must land on a
 * milestone actually newly earned that same day. Only once the stored
 * events are proven to match these expected causal events does the
 * arithmetic replay (growthXp/totalGrowthXp/growthMilestones/trainingDays,
 * and the before/after skill chain) run to confirm the currently-stored
 * progression/skills are exactly its result.
 */
function validatePartyProgressionAndSkills(
  campaign: Record<string, unknown>,
  history: unknown[],
  ledgerById: Map<string, LedgerValidationRecord>,
): void {
  const known = new Map<string, KnownPartyProgressionInfo>()

  function collect(value: unknown, context: string): void {
    if (!isPlainObject(value) || !hasString(value, 'id')) return
    const party = value
    const partyId = party.id as string

    const progression = validateProgressionFields(
      party.progression,
      `${context}パーティ ${partyId}`,
    )

    if (
      typeof party.arrivalSerial !== 'number' ||
      !Number.isInteger(party.arrivalSerial) ||
      party.arrivalSerial < 0
    ) {
      throw new SaveValidationErrorClass(
        `パーティ ${partyId} の来訪シリアル番号が不正です`,
        'corrupted-data',
      )
    }
    const arrivalSerial = party.arrivalSerial as number

    const members = new Map<
      string,
      { role: string; rank: string; skills: Record<string, number> }
    >()
    const partyMembers = (party.party as Record<string, unknown> | undefined)
      ?.members
    if (Array.isArray(partyMembers)) {
      for (const raw of partyMembers) {
        assertPlainObject(
          raw,
          `${context}パーティ ${partyId} のメンバーデータが壊れています`,
        )
        const member = raw
        if (!hasString(member, 'id')) continue
        const memberId = member.id as string
        const role = typeof member.role === 'string' ? member.role : ''
        const rank = typeof member.rank === 'string' ? member.rank : ''
        const skills = validateSkillSet(
          member.skills,
          rank,
          `${context}パーティ ${partyId} の ${memberId}`,
        )
        members.set(memberId, { role, rank, skills })
      }
    }

    known.set(partyId, { progression, arrivalSerial, members })
  }

  for (const p of campaign.parties as unknown[]) collect(p, '')
  for (const p of campaign.awayParties as unknown[]) collect(p, '')
  for (const p of campaign.retiredParties as unknown[]) collect(p, '')

  interface ReplayState {
    growthXp: number
    totalGrowthXp: number
    growthMilestones: number
    trainingDays: number
  }
  const replay = new Map<string, ReplayState>()
  for (const id of known.keys()) {
    replay.set(id, {
      growthXp: 0,
      totalGrowthXp: 0,
      growthMilestones: 0,
      trainingDays: 0,
    })
  }

  // Keyed by JSON.stringify([partyId, memberId, skill]) / [partyId,
  // memberId, milestone] — party/member IDs can themselves contain ':',
  // so a colon-joined string key would be ambiguous.
  const skillChain = new Map<string, number>()
  const seenMilestoneMember = new Set<string>()

  // --- Phase 9.5.2: deterministic Skill Growth replay -------------------
  //
  // Pre-pass: walk every stored skillImproved event in day order and
  // record, per (partyId, memberId, skill), the FIRST one's `before` —
  // the value that skill had before any growth ever touched it. A skill
  // that never appears in any chain never grew, so its current persistent
  // value already IS its pre-growth value. This lets the forward replay
  // below bootstrap each member's true starting skills independently of
  // whether any individual stored event later turns out to be
  // missing/tampered (a rolled-back "before" value on the very first link
  // of a chain is exactly the true initial value; a missing event simply
  // means no chain entry ever anchors that skill, so the fallback to the
  // current persistent value is used — which the forward replay's
  // planner-vs-stored cross-check independently proves correct or rejects).
  const initialSkillValue = new Map<string, number>()
  for (const rawRecord of history) {
    if (
      !isPlainObject(rawRecord) ||
      !Array.isArray(rawRecord.progressionEvents)
    ) {
      continue
    }
    for (const rawEvent of rawRecord.progressionEvents) {
      if (
        !isPlainObject(rawEvent) ||
        rawEvent.type !== 'skillImproved' ||
        typeof rawEvent.partyId !== 'string' ||
        typeof rawEvent.memberId !== 'string' ||
        typeof rawEvent.skill !== 'string' ||
        typeof rawEvent.before !== 'number'
      ) {
        continue
      }
      const key = JSON.stringify([
        rawEvent.partyId,
        rawEvent.memberId,
        rawEvent.skill,
      ])
      if (!initialSkillValue.has(key)) {
        initialSkillValue.set(key, rawEvent.before)
      }
    }
  }

  const campaignSeed = campaign.seed as string

  // Per-member working skill state, persisted across the entire replay
  // (not day-scoped) — the deterministic ground truth this member's skills
  // would actually have at any point, built forward from initialSkillValue
  // by applying planSkillGrowthForMember's own output at every milestone,
  // independent of what the save claims. Lazily created on first use.
  const workingSkills = new Map<string, SkillSet>()
  function getWorkingSkills(partyId: string, memberId: string): SkillSet {
    const stateKey = JSON.stringify([partyId, memberId])
    let skills = workingSkills.get(stateKey)
    if (!skills) {
      const member = known.get(partyId)!.members.get(memberId)!
      const built = {} as Record<string, number>
      for (const skill of SKILL_NAMES) {
        const chainKey = JSON.stringify([partyId, memberId, skill])
        built[skill] = initialSkillValue.get(chainKey) ?? member.skills[skill]
      }
      skills = built as unknown as SkillSet
      workingSkills.set(stateKey, skills)
    }
    return skills
  }

  const validSources: readonly CampaignProgressionSource[] = [
    'completeSuccess',
    'success',
    'partialSuccess',
    'failedObjective',
    'forcedRetreat',
    'training',
  ]

  // --- Historical Active/Recovery state + Training Yard level replay ---
  // Reconstructed purely from the same CampaignPartyEvent vocabulary the
  // runtime already emits — arrived/departedScheduled/finishedRecovery are
  // that day's *pre*-events (applied before evaluating that day's training
  // eligibility, mirroring advanceCampaignDay building the next day's
  // roster before resolveCampaignDay runs the idle loop);
  // departedCasualty/startedRecovery are that day's *post*-events (applied
  // only for future days, mirroring resolveCampaignDay deciding them
  // during that day's own resolution, after which the party is no longer
  // eligible going forward) — and from `upgrade_purchase` ledger entries
  // for training_yard. No new lifecycle-event vocabulary is introduced.
  const activeParties = new Set<string>()
  const recoveringParties = new Set<string>()

  const trainingYardPurchases = [...ledgerById.values()]
    .filter(
      (e): e is Extract<LedgerValidationRecord, { kind: 'upgrade_purchase' }> =>
        e.kind === 'upgrade_purchase' && e.upgradeId === 'training_yard',
    )
    .sort((a, b) => a.day - b.day)
  let trainingYardPurchaseIndex = 0
  let trainingYardLevel = 0

  const mainQuestAttempts = isPlainObject(campaign.mainQuest)
    ? campaign.mainQuest.attempts
    : undefined

  type PartyEventLike = Record<string, unknown>

  function readPartyEvents(record: Record<string, unknown>): PartyEventLike[] {
    if (!Array.isArray(record.partyEvents)) {
      throw new SaveValidationErrorClass(
        '移動イベント一覧の形式が不正です',
        'corrupted-data',
      )
    }
    return record.partyEvents.map((raw) => {
      assertPlainObject(raw, '移動イベントの形式が不正です')
      return raw
    })
  }

  for (let dayIndex = 0; dayIndex < history.length; dayIndex++) {
    const rawRecord = history[dayIndex]
    assertPlainObject(rawRecord, '履歴レコードの形式が不正です')
    const record = rawRecord
    // The caller has already proven record.dayNumber === dayIndex + 1
    // (strictly sequential, no gaps) before this function runs.
    const dayNumber = dayIndex + 1

    const partyEvents = readPartyEvents(record)

    // Pre-events: apply BEFORE evaluating this day's training eligibility.
    for (const event of partyEvents) {
      if (typeof event.partyId !== 'string') continue
      if (event.type === 'arrived') activeParties.add(event.partyId)
      else if (event.type === 'departedScheduled')
        activeParties.delete(event.partyId)
      else if (event.type === 'finishedRecovery')
        recoveringParties.delete(event.partyId)
    }

    while (
      trainingYardPurchaseIndex < trainingYardPurchases.length &&
      trainingYardPurchases[trainingYardPurchaseIndex].day <= dayNumber
    ) {
      trainingYardLevel =
        trainingYardPurchases[trainingYardPurchaseIndex].targetLevel
      trainingYardPurchaseIndex++
    }
    const expectedTrainingXp =
      TRAINING_GROWTH_XP + trainingYardXpBonusForLevel(trainingYardLevel)

    if (!Array.isArray(record.results)) {
      throw new SaveValidationErrorClass(
        '依頼結果一覧の形式が不正です',
        'corrupted-data',
      )
    }
    const dispatchedOutcomeByParty = new Map<string, string>()
    for (const raw of record.results) {
      if (!isPlainObject(raw)) continue
      if (
        raw.status === 'resolved' &&
        typeof raw.partyId === 'string' &&
        isPlainObject(raw.result) &&
        typeof raw.result.outcome === 'string'
      ) {
        dispatchedOutcomeByParty.set(raw.partyId, raw.result.outcome)
      }
    }

    // A Main-Quest-dispatched Party never appears in `record.results` (no
    // Quest Board slot — see `resolveMainQuestForDay`'s own docs), but is
    // just as much "not idle" today, and its growth XP is driven by the
    // SAME mapped-outcome table via `mapMainQuestOutcomeToExpeditionOutcome`
    // (`../mainQuest/simulation.ts`) that produced its actual
    // progressionEvent — reused here rather than reimplemented, so this
    // expectation can never silently drift from what the runtime does.
    if (Array.isArray(mainQuestAttempts)) {
      for (const raw of mainQuestAttempts) {
        if (!isPlainObject(raw)) continue
        if (
          raw.dayNumber !== dayNumber ||
          typeof raw.partyId !== 'string' ||
          !isPlainObject(raw.result)
        ) {
          continue
        }
        const outcome = mapMainQuestOutcomeToExpeditionOutcome(
          raw.result as unknown as MainQuestSimulationResult,
        )
        dispatchedOutcomeByParty.set(raw.partyId, outcome)
      }
    }

    const casualtyPartyIds = new Set(
      partyEvents
        .filter((e) => e.type === 'departedCasualty')
        .map((e) => e.partyId as string),
    )

    // Expected Growth Events for this day, derived solely from the Day
    // Facts above — never from the stored progressionEvents themselves.
    type ExpectedEvent =
      { kind: 'xp'; source: string; amount: number } | { kind: 'skip' }
    const expectedByParty = new Map<string, ExpectedEvent>()

    for (const [partyId, outcome] of dispatchedOutcomeByParty) {
      if (casualtyPartyIds.has(partyId)) {
        expectedByParty.set(partyId, { kind: 'skip' })
        continue
      }
      const xpAmount =
        EXPEDITION_GROWTH_XP[outcome as keyof typeof EXPEDITION_GROWTH_XP]
      if (xpAmount > 0) {
        expectedByParty.set(partyId, {
          kind: 'xp',
          source: outcome,
          amount: xpAmount,
        })
      }
    }
    for (const partyId of activeParties) {
      if (dispatchedOutcomeByParty.has(partyId)) continue
      if (recoveringParties.has(partyId)) continue
      expectedByParty.set(partyId, {
        kind: 'xp',
        source: 'training',
        amount: expectedTrainingXp,
      })
    }

    const events = record.progressionEvents
    if (!Array.isArray(events)) {
      throw new SaveValidationErrorClass(
        '成長イベント一覧がありません',
        'corrupted-data',
      )
    }

    // Newly-earned milestone window per party for today, captured around
    // each experienceGained's replay so a same-day skillImproved can be
    // proven to land on a milestone this day's XP actually unlocked.
    const milestonesBeforeToday = new Map<string, number>()
    const milestonesAfterToday = new Map<string, number>()

    // Expected deterministic Skill Growth for today, keyed by
    // JSON.stringify([partyId, memberId, milestoneNumber]) — populated the
    // instant a milestone is crossed (below), using the SAME pure planner
    // the runtime uses, fed by each member's deterministically-replayed
    // working skills (never the stored/current values, which is exactly
    // what is under test). A member whose planner result is null (every
    // role-candidate skill already at cap) deliberately gets no entry:
    // absence of a key means "no growth expected", so any stored
    // skillImproved event referencing that exact key is necessarily fake.
    const expectedSkillEventsToday = new Map<
      string,
      { skill: SkillName; before: number; after: number }
    >()

    for (const rawEvent of events) {
      assertPlainObject(rawEvent, '成長イベントの形式が不正です')
      const event = rawEvent

      if (
        !hasString(event, 'partyId') ||
        (event.partyId as string).length === 0
      ) {
        throw new SaveValidationErrorClass(
          '成長イベントにパーティIDがありません',
          'corrupted-data',
        )
      }
      const partyId = event.partyId as string
      const info = known.get(partyId)
      if (!info) {
        throw new SaveValidationErrorClass(
          '孤立した成長イベントがあります',
          'corrupted-data',
        )
      }

      if (
        typeof event.dayNumber !== 'number' ||
        !Number.isInteger(event.dayNumber) ||
        event.dayNumber !== dayNumber
      ) {
        throw new SaveValidationErrorClass(
          '成長イベントの日数が履歴レコードと一致しません',
          'corrupted-data',
        )
      }

      if (event.type === 'experienceGained') {
        if (!validSources.includes(event.source as CampaignProgressionSource)) {
          throw new SaveValidationErrorClass(
            '成長イベントの獲得源が不正です',
            'corrupted-data',
          )
        }
        const source = event.source as CampaignProgressionSource
        if (
          typeof event.amount !== 'number' ||
          !Number.isInteger(event.amount) ||
          event.amount <= 0
        ) {
          throw new SaveValidationErrorClass(
            '成長イベントの経験値量が不正です',
            'corrupted-data',
          )
        }
        const amount = event.amount as number
        if (
          (EXPEDITION_XP_SOURCES as readonly string[]).includes(source) &&
          amount !==
            EXPEDITION_GROWTH_XP[source as keyof typeof EXPEDITION_GROWTH_XP]
        ) {
          throw new SaveValidationErrorClass(
            '成長イベントの経験値量が固定表と一致しません',
            'corrupted-data',
          )
        }

        // Causal cross-check: this event must match a Day-Fact-derived
        // expectation exactly (party, source, amount) — proving the XP
        // was actually earned, not merely internally self-consistent.
        // Consuming the entry also enforces at most one experienceGained
        // per (partyId, dayNumber): a second event for the same party
        // finds nothing left to match.
        const expected = expectedByParty.get(partyId)
        if (
          !expected ||
          expected.kind !== 'xp' ||
          expected.source !== source ||
          expected.amount !== amount
        ) {
          throw new SaveValidationErrorClass(
            '成長イベントが実際の遠征結果・訓練資格と一致しません',
            'corrupted-data',
          )
        }
        expectedByParty.delete(partyId)

        const state = replay.get(partyId)!
        milestonesBeforeToday.set(partyId, state.growthMilestones)
        state.totalGrowthXp += amount
        state.growthXp += amount
        if (source === 'training') {
          state.trainingDays += 1
        }
        // Milestones (and the skill growth they trigger) resolve before
        // growthXpAfter is snapshotted — mirrors awardPartyGrowthXp's
        // actual mutation order (see progression.ts).
        while (state.growthXp >= PARTY_GROWTH_XP_THRESHOLD) {
          state.growthXp -= PARTY_GROWTH_XP_THRESHOLD
          state.growthMilestones += 1
          const milestoneNumber = state.growthMilestones
          const milestoneIndex = milestoneNumber - 1
          for (const [memberId, memberInfo] of info.members) {
            const memberSkills = getWorkingSkills(partyId, memberId)
            const plan = planSkillGrowthForMember(
              campaignSeed,
              info.arrivalSerial,
              {
                id: memberId,
                role: memberInfo.role as AdventurerRole,
                rank: memberInfo.rank as AdventurerRank,
                skills: memberSkills,
              },
              milestoneIndex,
            )
            if (!plan) continue
            memberSkills[plan.skill] = plan.after
            expectedSkillEventsToday.set(
              JSON.stringify([partyId, memberId, milestoneNumber]),
              plan,
            )
          }
        }
        milestonesAfterToday.set(partyId, state.growthMilestones)

        if (
          typeof event.growthXpAfter !== 'number' ||
          event.growthXpAfter !== state.growthXp
        ) {
          throw new SaveValidationErrorClass(
            '成長イベントの経験値後の値が再計算結果と一致しません',
            'corrupted-data',
          )
        }
        if (
          typeof event.totalGrowthXpAfter !== 'number' ||
          event.totalGrowthXpAfter !== state.totalGrowthXp
        ) {
          throw new SaveValidationErrorClass(
            '成長イベントの累積経験値後の値が再計算結果と一致しません',
            'corrupted-data',
          )
        }
      } else if (event.type === 'skillImproved') {
        if (
          !hasString(event, 'memberId') ||
          (event.memberId as string).length === 0
        ) {
          throw new SaveValidationErrorClass(
            '成長イベントのメンバーIDがありません',
            'corrupted-data',
          )
        }
        const memberId = event.memberId as string
        const member = info.members.get(memberId)
        if (!member) {
          throw new SaveValidationErrorClass(
            '孤立したスキル成長イベントがあります',
            'corrupted-data',
          )
        }
        if (
          typeof event.skill !== 'string' ||
          !(SKILL_NAMES as readonly string[]).includes(event.skill)
        ) {
          throw new SaveValidationErrorClass(
            'スキル成長イベントの技能名が不正です',
            'corrupted-data',
          )
        }
        const skill = event.skill as string
        const role = ROLE_MAP[member.role as keyof typeof ROLE_MAP] as
          | {
              expertSkills: readonly string[]
              trainedSkills: readonly string[]
            }
          | undefined
        const isCandidate =
          role !== undefined &&
          (role.expertSkills.includes(skill) ||
            role.trainedSkills.includes(skill))
        if (!isCandidate) {
          throw new SaveValidationErrorClass(
            'スキル成長イベントの技能がRoleの候補外です',
            'corrupted-data',
          )
        }
        if (
          typeof event.before !== 'number' ||
          !Number.isInteger(event.before) ||
          event.before < 0
        ) {
          throw new SaveValidationErrorClass(
            'スキル成長イベントの成長前の値が不正です',
            'corrupted-data',
          )
        }
        const before = event.before as number
        const cap = member.rank === 'S' ? MAX_SKILL_S : MAX_SKILL_NORMAL
        if (
          typeof event.after !== 'number' ||
          !Number.isInteger(event.after) ||
          event.after <= before ||
          event.after - before > SKILL_GROWTH_PER_MILESTONE ||
          event.after > cap
        ) {
          throw new SaveValidationErrorClass(
            'スキル成長イベントの成長後の値が不正です',
            'corrupted-data',
          )
        }
        const after = event.after as number
        if (
          typeof event.milestone !== 'number' ||
          !Number.isInteger(event.milestone) ||
          event.milestone < 1
        ) {
          throw new SaveValidationErrorClass(
            'スキル成長イベントのMilestone番号が不正です',
            'corrupted-data',
          )
        }
        const milestone = event.milestone as number

        // Causal check: milestone must be one this party's XP events
        // actually newly earned TODAY (a strict range check, generalized
        // beyond the single-milestone-per-award case the current balance
        // happens to produce) — not a future or not-yet-earned milestone,
        // and not derived from a day with no XP event for this party at
        // all (an experienceGained for this party must have already been
        // processed earlier in this same day's event list, per the
        // runtime's own emission order).
        const beforeCount = milestonesBeforeToday.get(partyId)
        const afterCount = milestonesAfterToday.get(partyId)
        if (
          beforeCount === undefined ||
          afterCount === undefined ||
          milestone <= beforeCount ||
          milestone > afterCount
        ) {
          throw new SaveValidationErrorClass(
            'スキル成長イベントのMilestoneがその日に達成されていません',
            'corrupted-data',
          )
        }

        // Primary check: this event must match the deterministic planner's
        // own output for this exact (party, member, milestone) — same
        // skill, same before, same after — proving the runtime's
        // weighted-random selection actually chose this, not merely that
        // some role-candidate skill within bounds was claimed. Absence of
        // an entry means the planner found every candidate skill capped at
        // this milestone (or this member/milestone combo was never
        // actually earned at all) — either way, no stored event should
        // exist for it.
        const expectedSkill = expectedSkillEventsToday.get(
          JSON.stringify([partyId, memberId, milestone]),
        )
        if (
          !expectedSkill ||
          expectedSkill.skill !== skill ||
          expectedSkill.before !== before ||
          expectedSkill.after !== after
        ) {
          throw new SaveValidationErrorClass(
            'スキル成長イベントが決定論的な成長選択の結果と一致しません',
            'corrupted-data',
          )
        }
        expectedSkillEventsToday.delete(
          JSON.stringify([partyId, memberId, milestone]),
        )

        const milestoneKey = JSON.stringify([partyId, memberId, milestone])
        if (seenMilestoneMember.has(milestoneKey)) {
          throw new SaveValidationErrorClass(
            '同じMilestoneで同じメンバーのスキルが複数回成長しています',
            'corrupted-data',
          )
        }
        seenMilestoneMember.add(milestoneKey)

        const chainKey = JSON.stringify([partyId, memberId, skill])
        const previousAfter = skillChain.get(chainKey)
        if (previousAfter !== undefined && previousAfter !== before) {
          throw new SaveValidationErrorClass(
            'スキル成長イベントの連鎖が一致しません',
            'corrupted-data',
          )
        }
        skillChain.set(chainKey, after)
      } else if (event.type === 'progressionSkipped') {
        if (typeof event.reason !== 'string' || event.reason.length === 0) {
          throw new SaveValidationErrorClass(
            '成長スキップイベントの理由がありません',
            'corrupted-data',
          )
        }
        // Causal check: only a party with a same-day departedCasualty
        // PartyEvent may skip growth.
        const expected = expectedByParty.get(partyId)
        if (!expected || expected.kind !== 'skip') {
          throw new SaveValidationErrorClass(
            '成長スキップイベントが死亡離脱の事実と一致しません',
            'corrupted-data',
          )
        }
        expectedByParty.delete(partyId)
      } else {
        throw new SaveValidationErrorClass(
          '成長イベントの種別が不正です',
          'corrupted-data',
        )
      }
    }

    // Anything left unconsumed is a Day Fact that should have produced a
    // growth event but didn't — e.g. an idle-eligible party with no
    // Training experienceGained, or a casualty with no progressionSkipped.
    if (expectedByParty.size > 0) {
      throw new SaveValidationErrorClass(
        '実際に発生したはずの成長イベントが記録されていません',
        'corrupted-data',
      )
    }

    // Same idea for Skill Growth: a milestone the deterministic planner
    // says should have grown some member's skill, but no matching
    // skillImproved event was ever found among today's stored events.
    if (expectedSkillEventsToday.size > 0) {
      throw new SaveValidationErrorClass(
        '実際に発生したはずのスキル成長イベントが記録されていません',
        'corrupted-data',
      )
    }

    // Post-events: apply for FUTURE days only — this day's training
    // eligibility has already been evaluated above using the state as of
    // this day's *planning*, before these facts were decided.
    for (const event of partyEvents) {
      if (typeof event.partyId !== 'string') continue
      if (event.type === 'startedRecovery') recoveringParties.add(event.partyId)
      else if (event.type === 'departedCasualty')
        activeParties.delete(event.partyId)
    }
  }

  for (const [partyId, info] of known) {
    const state = replay.get(partyId)!
    if (
      state.growthXp !== info.progression.growthXp ||
      state.totalGrowthXp !== info.progression.totalGrowthXp ||
      state.growthMilestones !== info.progression.growthMilestones ||
      state.trainingDays !== info.progression.trainingDays
    ) {
      throw new SaveValidationErrorClass(
        `パーティ ${partyId} の成長状態が履歴の再計算結果と一致しません`,
        'corrupted-data',
      )
    }
  }

  for (const [chainKey, after] of skillChain) {
    const [partyId, memberId, skill] = JSON.parse(chainKey) as [
      string,
      string,
      string,
    ]
    const member = known.get(partyId)?.members.get(memberId)
    if (!member || member.skills[skill] !== after) {
      throw new SaveValidationErrorClass(
        '現在の技能値が成長履歴の最新値と一致しません',
        'corrupted-data',
      )
    }
  }

  // Primary Skill Growth check: for every member the deterministic replay
  // above actually touched (i.e. their party earned >=1 milestone), every
  // one of their skills — not just the ones that appear in some stored
  // skillImproved chain — must exactly equal what the pure planner
  // deterministically produced across the whole campaign. A member whose
  // party never earned a milestone is never added to workingSkills and is
  // correctly skipped here — nothing about the deterministic Skill Growth
  // system could have touched their skills.
  for (const [stateKey, skills] of workingSkills) {
    const [partyId, memberId] = JSON.parse(stateKey) as [string, string]
    const member = known.get(partyId)?.members.get(memberId)
    if (!member) {
      throw new SaveValidationErrorClass(
        '孤立したスキル成長状態があります',
        'corrupted-data',
      )
    }
    for (const skill of SKILL_NAMES) {
      if (member.skills[skill] !== skills[skill]) {
        throw new SaveValidationErrorClass(
          `パーティ ${partyId} の ${memberId} の技能「${skill}」が決定論的な成長リプレイの結果と一致しません`,
          'corrupted-data',
        )
      }
    }
  }
}

/**
 * Proves that the planning day's roster snapshot (currentDay.parties) is
 * exactly the persistent staying roster (campaign.parties) — same set of
 * partyIds, no duplicates, no away/retired party smuggled in, and no
 * staying party missing. Also cross-checks a few identity fields
 * (arrivalDay, plannedDepartureDay, member id set) so the snapshot can only
 * represent the persistent party it claims to. Day-local presentation
 * fields (acceptedRequestId, availability, recoveryDaysRemaining, isNew,
 * arrivalBadge) are derived fresh every day from campaign state and are
 * deliberately NOT required to match anything stored on the persistent
 * party — this is not a full CampaignParty/TavernParty deep-equality
 * validator, only an identity/membership check.
 */
function validateCurrentDayRosterIntegrity(
  campaign: Record<string, unknown>,
  currentDay: Record<string, unknown>,
): void {
  if (!Array.isArray(currentDay.parties)) {
    throw new SaveValidationErrorClass(
      '本日のパーティ一覧が壊れています',
      'corrupted-data',
    )
  }
  const persistentParties = campaign.parties as unknown[]
  const snapshotParties = currentDay.parties

  if (snapshotParties.length !== persistentParties.length) {
    throw new SaveValidationErrorClass(
      '本日のパーティ数が滞在中のパーティ数と一致しません',
      'corrupted-data',
    )
  }

  const persistentById = new Map<string, Record<string, unknown>>()
  for (const raw of persistentParties) {
    assertPlainObject(raw, 'パーティデータが壊れています')
    if (!hasString(raw, 'id') || (raw.id as string).length === 0) {
      throw new SaveValidationErrorClass(
        'パーティIDがありません',
        'corrupted-data',
      )
    }
    persistentById.set(raw.id as string, raw)
  }

  const collectIds = (value: unknown): Set<string> => {
    const ids = new Set<string>()
    if (!Array.isArray(value)) return ids
    for (const raw of value) {
      assertPlainObject(raw, 'パーティデータが壊れています')
      if (hasString(raw, 'id')) ids.add(raw.id as string)
    }
    return ids
  }
  const awayIds = collectIds(campaign.awayParties)
  const retiredIds = collectIds(campaign.retiredParties)

  const seenSnapshotIds = new Set<string>()
  for (const raw of snapshotParties) {
    assertPlainObject(raw, '本日のパーティデータが壊れています')
    if (!hasString(raw, 'id') || (raw.id as string).length === 0) {
      throw new SaveValidationErrorClass(
        '本日のパーティIDがありません',
        'corrupted-data',
      )
    }
    const id = raw.id as string
    if (seenSnapshotIds.has(id)) {
      throw new SaveValidationErrorClass(
        '本日のパーティ一覧に重複したパーティIDがあります',
        'corrupted-data',
      )
    }
    seenSnapshotIds.add(id)

    if (awayIds.has(id) || retiredIds.has(id)) {
      throw new SaveValidationErrorClass(
        '旅立った、または引退したパーティが本日のパーティ一覧に含まれています',
        'corrupted-data',
      )
    }

    const persistent = persistentById.get(id)
    if (!persistent) {
      throw new SaveValidationErrorClass(
        '本日のパーティが滞在中のパーティ一覧にありません',
        'corrupted-data',
      )
    }

    if (raw.arrivalDay !== persistent.arrivalDay) {
      throw new SaveValidationErrorClass(
        '本日のパーティの来訪日が滞在中のパーティと一致しません',
        'corrupted-data',
      )
    }
    if (raw.plannedDepartureDay !== persistent.plannedDepartureDay) {
      throw new SaveValidationErrorClass(
        '本日のパーティの滞在予定日が滞在中のパーティと一致しません',
        'corrupted-data',
      )
    }

    const snapshotPartyObj = raw.party
    const persistentPartyObj = persistent.party
    if (isPlainObject(snapshotPartyObj) && isPlainObject(persistentPartyObj)) {
      const toMemberIdSet = (value: unknown): string[] | undefined => {
        if (!Array.isArray(value)) return undefined
        return value
          .filter(
            (m): m is Record<string, unknown> =>
              isPlainObject(m) && hasString(m, 'id'),
          )
          .map((m) => m.id as string)
          .sort()
      }
      const snapshotMemberIds = toMemberIdSet(snapshotPartyObj.members)
      const persistentMemberIds = toMemberIdSet(persistentPartyObj.members)
      if (snapshotMemberIds && persistentMemberIds) {
        const mismatched =
          snapshotMemberIds.length !== persistentMemberIds.length ||
          snapshotMemberIds.some((mid, i) => mid !== persistentMemberIds[i])
        if (mismatched) {
          throw new SaveValidationErrorClass(
            '本日のパーティのメンバー構成が滞在中のパーティと一致しません',
            'corrupted-data',
          )
        }
      }

      // Skill Snapshot Parity (Phase 9.5): a member's authoritative skill
      // values must be identical between the persistent party and today's
      // planning snapshot — growth is never partially reflected.
      const toMemberById = (
        value: unknown,
      ): Map<string, Record<string, unknown>> => {
        const map = new Map<string, Record<string, unknown>>()
        if (!Array.isArray(value)) return map
        for (const m of value) {
          if (isPlainObject(m) && hasString(m, 'id')) {
            map.set(m.id as string, m)
          }
        }
        return map
      }
      const snapshotMembersById = toMemberById(snapshotPartyObj.members)
      const persistentMembersById = toMemberById(persistentPartyObj.members)
      for (const [memberId, persistentMember] of persistentMembersById) {
        const snapshotMember = snapshotMembersById.get(memberId)
        if (!snapshotMember) continue
        const snapshotSkills = isPlainObject(snapshotMember.skills)
          ? snapshotMember.skills
          : {}
        const persistentSkills = isPlainObject(persistentMember.skills)
          ? persistentMember.skills
          : {}
        for (const skill of SKILL_NAMES) {
          if (snapshotSkills[skill] !== persistentSkills[skill]) {
            throw new SaveValidationErrorClass(
              `本日のパーティのメンバー ${memberId} の技能「${skill}」が滞在中のパーティと一致しません`,
              'corrupted-data',
            )
          }
        }
      }
    }

    // Progression Snapshot Parity (Phase 9.5): the day-local progression
    // snapshot must equal the persistent party's authoritative progression
    // in all four fields.
    const snapshotProgression = raw.progression
    const persistentProgression = persistent.progression
    if (
      isPlainObject(snapshotProgression) &&
      isPlainObject(persistentProgression)
    ) {
      for (const field of [
        'growthXp',
        'totalGrowthXp',
        'growthMilestones',
        'trainingDays',
      ] as const) {
        if (snapshotProgression[field] !== persistentProgression[field]) {
          throw new SaveValidationErrorClass(
            `本日のパーティの成長状態（${field}）が滞在中のパーティと一致しません`,
            'corrupted-data',
          )
        }
      }
    }
  }

  for (const id of persistentById.keys()) {
    if (!seenSnapshotIds.has(id)) {
      throw new SaveValidationErrorClass(
        '滞在中のパーティが本日のパーティ一覧に存在しません',
        'corrupted-data',
      )
    }
  }
}

export function validateGameSave(raw: unknown): asserts raw is GameSaveData {
  if (!isPlainObject(raw)) {
    throw new SaveValidationErrorClass(
      'セーブデータの形式が不正です',
      'corrupted-data',
    )
  }

  if (!isPlainObject(raw.metadata)) {
    throw new SaveValidationErrorClass(
      'メタデータがありません',
      'missing-metadata',
    )
  }

  const metadata = raw.metadata as unknown as SaveMetadata

  if (metadata.gameVersion !== GAME_VERSION) {
    throw new SaveValidationErrorClass(
      `ゲームバージョンが一致しません。セーブ: ${metadata.gameVersion} / 現在: ${GAME_VERSION}`,
      'game-version-mismatch',
      { saveVersion: metadata.gameVersion, currentVersion: GAME_VERSION },
    )
  }

  if (metadata.saveFormatVersion !== SAVE_FORMAT_VERSION) {
    throw new SaveValidationErrorClass(
      `セーブ形式のバージョンが一致しません。セーブ: ${metadata.saveFormatVersion} / 現在: ${SAVE_FORMAT_VERSION}`,
      'save-format-mismatch',
      {
        saveFormatVersion: metadata.saveFormatVersion,
        currentFormatVersion: SAVE_FORMAT_VERSION,
      },
    )
  }

  if (!isPlainObject(raw.campaign)) {
    throw new SaveValidationErrorClass(
      'キャンペーンデータが壊れています',
      'corrupted-data',
    )
  }

  const campaign = raw.campaign as Record<string, unknown>
  if (!hasString(campaign, 'seed')) {
    throw new SaveValidationErrorClass(
      'キャンペーンseedがありません',
      'corrupted-data',
    )
  }
  if (
    typeof campaign.dayNumber !== 'number' ||
    !Number.isInteger(campaign.dayNumber) ||
    (campaign.dayNumber as number) < 1
  ) {
    throw new SaveValidationErrorClass(
      'キャンペーン日数が1以上の整数ではありません',
      'corrupted-data',
    )
  }
  if (!Array.isArray(campaign.parties)) {
    throw new SaveValidationErrorClass(
      'パーティデータが壊れています',
      'corrupted-data',
    )
  }
  if (!isPlainObject(campaign.currentDay)) {
    throw new SaveValidationErrorClass(
      '本日のデータが壊れています',
      'corrupted-data',
    )
  }
  if (!Array.isArray(campaign.history)) {
    throw new SaveValidationErrorClass(
      '履歴データが壊れています',
      'corrupted-data',
    )
  }
  if (!Array.isArray(campaign.narrativeCandidates)) {
    throw new SaveValidationErrorClass(
      'Narrative候補データが壊れています',
      'corrupted-data',
    )
  }
  if (!Array.isArray(campaign.narrativeGenerations)) {
    throw new SaveValidationErrorClass(
      'Narrative生成データが壊れています',
      'corrupted-data',
    )
  }

  const upgradeLevels = validateUpgradeState(campaign.upgrades)

  const { ledgerById } = validateFinance(campaign.finance)

  const expectedLedgerById = new Map<string, ExpectedLedgerEntry>()

  const {
    score: reputationScore,
    peakScore: reputationPeakScore,
    eventById: reputationEventById,
    eventsByDay: reputationEventsByDay,
  } = validateReputationState(campaign.reputation)

  const expectedReputationEventById = new Map<string, ExpectedReputationEvent>()

  const currentDay = campaign.currentDay as Record<string, unknown>
  const currentDayStatus = currentDay.status
  if (currentDayStatus !== 'planning') {
    throw new SaveValidationErrorClass(
      '本日の状態が確定(planning)ではありません',
      'corrupted-data',
    )
  }

  validateDayRequests(currentDay.requests)

  if (Array.isArray(currentDay.results) && currentDay.results.length > 0) {
    throw new SaveValidationErrorClass(
      '未確定の日に依頼結果が含まれています',
      'corrupted-data',
    )
  }

  const expectedHistoryLength = (campaign.dayNumber as number) - 1
  if (campaign.history.length !== expectedHistoryLength) {
    throw new SaveValidationErrorClass(
      `履歴の日数が campaign.dayNumber と連続していません。期待: ${expectedHistoryLength}件, 実際: ${campaign.history.length}件`,
      'corrupted-data',
    )
  }

  const reputationReplay: ReputationReplayState = { score: 0, peak: 0 }
  const rankAtStartOfDay = new Map<number, TavernRank>()

  for (let i = 0; i < campaign.history.length; i++) {
    const record = campaign.history[i]
    assertPlainObject(record, '履歴レコードの形式が不正です')
    const recordDay = (record as Record<string, unknown>).dayNumber
    if (
      typeof recordDay !== 'number' ||
      !Number.isInteger(recordDay) ||
      recordDay < 1
    ) {
      throw new SaveValidationErrorClass(
        '履歴レコードの日数が不正です',
        'corrupted-data',
      )
    }
    if (recordDay !== i + 1) {
      throw new SaveValidationErrorClass(
        `履歴の日付が連続していません。index ${i} の期待日付は ${i + 1}です`,
        'corrupted-data',
      )
    }
    validateHistoryRecord(
      record,
      ledgerById,
      expectedLedgerById,
      reputationEventById,
      expectedReputationEventById,
      reputationEventsByDay,
      reputationReplay,
      rankAtStartOfDay,
    )
  }

  // The rank in effect while the current (still-planning) day is being
  // played is derived from the peak accumulated through the prior day —
  // exactly what `reputationReplay` holds once history replay completes.
  rankAtStartOfDay.set(
    campaign.dayNumber as number,
    deriveTavernRank(reputationReplay.peak),
  )

  if (
    reputationReplay.score !== reputationScore ||
    reputationReplay.peak !== reputationPeakScore
  ) {
    throw new SaveValidationErrorClass(
      '酒場評判の合計が履歴の再計算結果と一致しません',
      'corrupted-data',
    )
  }

  for (const id of reputationEventById.keys()) {
    if (!expectedReputationEventById.has(id)) {
      throw new SaveValidationErrorClass(
        '孤立した評判イベントがあります',
        'corrupted-data',
      )
    }
  }

  for (const [id, expected] of expectedReputationEventById) {
    const event = reputationEventById.get(id)
    if (!event) {
      throw new SaveValidationErrorClass(
        '遠征結果に対応する評判イベントがありません',
        'corrupted-data',
      )
    }
    if (
      event.day !== expected.day ||
      event.requestId !== expected.requestId ||
      event.partyId !== expected.partyId ||
      event.delta !== expected.delta
    ) {
      throw new SaveValidationErrorClass(
        '評判イベントが精算内容と一致しません',
        'corrupted-data',
      )
    }
  }

  for (const [id, entry] of ledgerById) {
    if (
      entry.kind === 'opening_balance' ||
      entry.kind === 'upgrade_purchase' ||
      entry.kind === 'main_quest_payment'
    ) {
      // upgrade_purchase/main_quest_payment entries are cross-checked
      // separately, against upgrade level state / Main Quest Attempts
      // respectively, rather than a per-day expected map.
      continue
    }
    if (!expectedLedgerById.has(id)) {
      throw new SaveValidationErrorClass(
        '孤立した帳簿エントリがあります',
        'corrupted-data',
      )
    }
  }

  for (const [id, expected] of expectedLedgerById) {
    const entry = ledgerById.get(id)
    if (!entry) {
      throw new SaveValidationErrorClass(
        '帳簿に必要なエントリがありません',
        'corrupted-data',
      )
    }
    if (expected.kind === 'quest_commission') {
      if (
        entry.kind !== 'quest_commission' ||
        entry.requestId !== expected.requestId ||
        entry.partyId !== expected.partyId ||
        entry.amount !== expected.amount
      ) {
        throw new SaveValidationErrorClass(
          '帳簿エントリと精算が一致しません',
          'corrupted-data',
        )
      }
    } else if (expected.kind === 'daily_operating_cost') {
      if (entry.kind !== 'daily_operating_cost') {
        throw new SaveValidationErrorClass(
          '営業費帳簿エントリの種別が一致しません',
          'corrupted-data',
        )
      }
    }
  }

  // Upgrade purchase <-> level integrity (forward + reverse, no skipped
  // levels), plus rank-requirement integrity against the tavern rank that
  // was actually in effect when each purchase's day began.
  const expectedUpgradePurchaseById = new Map<
    string,
    { upgradeId: TavernUpgradeId; targetLevel: number; cost: number }
  >()
  for (const upgradeId of TAVERN_UPGRADE_IDS) {
    const level = upgradeLevels[upgradeId]
    for (let lvl = 1; lvl <= level; lvl++) {
      const config = getUpgradeLevelConfig(upgradeId, lvl)
      if (!config) {
        throw new SaveValidationErrorClass(
          `設備 ${upgradeId} のレベル ${lvl} の設定が見つかりません`,
          'corrupted-data',
        )
      }
      expectedUpgradePurchaseById.set(
        buildUpgradePurchaseEntryId(upgradeId, lvl),
        { upgradeId, targetLevel: lvl, cost: config.cost },
      )
    }
  }

  for (const [id, entry] of ledgerById) {
    if (entry.kind !== 'upgrade_purchase') continue
    if (!expectedUpgradePurchaseById.has(id)) {
      throw new SaveValidationErrorClass(
        '孤立した設備購入エントリがあります',
        'corrupted-data',
      )
    }

    const rankAtPurchase = rankAtStartOfDay.get(entry.day)
    if (rankAtPurchase === undefined) {
      throw new SaveValidationErrorClass(
        '設備購入エントリの日付が未来の日付です',
        'corrupted-data',
      )
    }
    const config = getUpgradeLevelConfig(
      entry.upgradeId as TavernUpgradeId,
      entry.targetLevel,
    )
    if (!config || rankAtPurchase < config.requiredTavernRank) {
      throw new SaveValidationErrorClass(
        '設備購入エントリが酒場ランク要件を満たしていません',
        'corrupted-data',
      )
    }
  }

  for (const [id, expected] of expectedUpgradePurchaseById) {
    const entry = ledgerById.get(id)
    if (!entry || entry.kind !== 'upgrade_purchase') {
      throw new SaveValidationErrorClass(
        '設備レベルに対応する購入エントリがありません',
        'corrupted-data',
      )
    }
    if (
      entry.upgradeId !== expected.upgradeId ||
      entry.targetLevel !== expected.targetLevel ||
      entry.amount !== -expected.cost
    ) {
      throw new SaveValidationErrorClass(
        '設備購入エントリが設備レベルと一致しません',
        'corrupted-data',
      )
    }
  }

  validateUpgradePurchaseAffordability(ledgerById, campaign.dayNumber as number)

  const effectivePartyCapacity = getEffectivePartyCapacity(
    BASE_PARTY_CAPACITY,
    { levels: upgradeLevels },
  )
  validatePartyLifecycle(
    campaign,
    campaign.dayNumber as number,
    effectivePartyCapacity,
  )

  validatePartyProgressionAndSkills(
    campaign,
    campaign.history as unknown[],
    ledgerById,
  )

  validateCurrentDayRosterIntegrity(campaign, currentDay)

  validateQuestChains(campaign, campaign.history as unknown[], currentDay)

  validateWorldEvents(campaign, campaign.history as unknown[], currentDay)

  validateMainQuest(campaign, ledgerById, campaign.dayNumber as number)

  if (
    !isPlainObject(raw.randomState) ||
    !hasString(raw.randomState, 'initialSeed')
  ) {
    throw new SaveValidationErrorClass(
      '乱数状態が壊れています',
      'corrupted-data',
    )
  }

  if (!isPlainObject(raw.persistentPresentationState)) {
    throw new SaveValidationErrorClass(
      '表示状態が壊れています',
      'corrupted-data',
    )
  }
}
