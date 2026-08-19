import { GAME_VERSION, SAVE_FORMAT_VERSION } from '../../version.ts'
import {
  TAVERN_ECONOMY_CONFIG,
  buildDailyOperatingCostEntryId,
  buildLedgerEntryId,
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
} from '../tavern/campaign/progression.ts'
import { MAX_SKILL_NORMAL, MAX_SKILL_S } from '../balance/constants.ts'
import { ROLE_MAP } from '../../data/roles.ts'
import type { AdventurerRank } from '../models/types.ts'
import type { ExpeditionOutcome } from '../expedition/types.ts'
import type {
  CampaignProgressionSource,
  PartyLifecycleStatus,
  TavernRank,
  TavernUpgradeId,
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
 * Proves that every upgrade purchase was affordable at the moment it
 * happened, using the funds available at the *start* of its day (day 0's
 * opening balance through the end of the prior day) — never that day's
 * later income (quest commissions) and never the ledger array's insertion
 * order, since same-day purchases are aggregated rather than treated as a
 * sequence. Negative funds are otherwise legal (Phase 9.1+), so this checks
 * affordability at purchase time rather than requiring non-negative final
 * funds.
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
      .filter((entry) => entry.kind === 'upgrade_purchase')
      .reduce((sum, entry) => sum - entry.amount, 0)

    if (upgradeSpendForDay > 0 && upgradeSpendForDay > fundsAtStartOfDay) {
      throw new SaveValidationErrorClass(
        '設備購入エントリの時点で資金が不足しています',
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
  for (const request of value) {
    validateRequest(request, '依頼データ')
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

    known.set(partyId, { progression, members })
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
    if (entry.kind === 'opening_balance' || entry.kind === 'upgrade_purchase') {
      // upgrade_purchase entries are cross-checked separately below,
      // against upgrade level state rather than a per-day expected map.
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
