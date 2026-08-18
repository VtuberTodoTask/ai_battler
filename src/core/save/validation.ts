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
  MAX_TAVERN_UPGRADE_LEVEL,
  TAVERN_UPGRADE_IDS,
  getUpgradeLevelConfig,
} from '../tavern/campaign/upgrades.ts'
import type { AdventurerRank } from '../models/types.ts'
import type { ExpeditionOutcome } from '../expedition/types.ts'
import type { TavernRank, TavernUpgradeId } from '../tavern/campaign/types.ts'
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
