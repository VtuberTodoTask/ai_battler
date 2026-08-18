import { GAME_VERSION, SAVE_FORMAT_VERSION } from '../../version.ts'
import { computeQuestSettlement } from '../economy/questReward.ts'
import { buildLedgerEntryId } from '../economy/finance.ts'
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

const ALLOWED_LEDGER_KINDS = ['quest_commission'] as const

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

function isValidInteger(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  )
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
  if (!isValidInteger(value.tavernCommissionBps, 0, 10000)) {
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
  if (!isValidInteger(value.payoutRateBps, 0, 10000)) {
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
): { promisedReward: number; tavernCommissionBps: number } {
  assertPlainObject(value, `${context}の形式が不正です`)
  if (!hasString(value, 'id') || (value.id as string).length === 0) {
    throw new SaveValidationErrorClass(
      `${context}のIDがありません`,
      'corrupted-data',
    )
  }
  validateRewardTerms(value.rewardTerms, `${context}の報酬条件`)
  return value.rewardTerms as {
    promisedReward: number
    tavernCommissionBps: number
  }
}

function validateLedgerEntry(
  value: unknown,
  seenIds: Set<string>,
): {
  day: number
  amount: number
  id: string
  requestId: string
  partyId?: string
} {
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
    value.day < 1
  ) {
    throw new SaveValidationErrorClass(
      '帳簿エントリの日数が不正です',
      'corrupted-data',
    )
  }

  if (!ALLOWED_LEDGER_KINDS.includes(value.kind as never)) {
    throw new SaveValidationErrorClass(
      '帳簿エントリの種別が不正です',
      'corrupted-data',
    )
  }

  if (!isValidCurrencyAmount(value.amount)) {
    throw new SaveValidationErrorClass(
      '帳簿エントリの金額が不正です',
      'corrupted-data',
    )
  }

  if (value.amount === 0) {
    throw new SaveValidationErrorClass(
      '帳簿に0円の取引が含まれています',
      'corrupted-data',
    )
  }

  assertPlainObject(value.source, '帳簿エントリのソースが不正です')
  const source = value.source as Record<string, unknown>
  if (source.type !== 'expedition') {
    throw new SaveValidationErrorClass(
      '帳簿エントリのソース種別が不正です',
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
    source.partyId !== undefined &&
    (typeof source.partyId !== 'string' ||
      (source.partyId as string).length === 0)
  ) {
    throw new SaveValidationErrorClass(
      '帳簿エントリのパーティIDが不正です',
      'corrupted-data',
    )
  }

  const expectedId = buildLedgerEntryId(
    value.day as number,
    source.requestId as string,
    source.partyId as string | undefined,
  )
  if (id !== expectedId) {
    throw new SaveValidationErrorClass(
      '帳簿エントリIDが計算値と一致しません',
      'corrupted-data',
    )
  }

  return {
    day: value.day as number,
    amount: value.amount as number,
    id,
    requestId: source.requestId as string,
    partyId: source.partyId as string | undefined,
  }
}

function validateFinance(value: unknown): {
  funds: number
  ledgerById: Map<
    string,
    {
      day: number
      amount: number
      id: string
      requestId: string
      partyId?: string
    }
  >
} {
  assertPlainObject(value, '酒場資金データが壊れています')
  const finance = value as Record<string, unknown>

  if (!isValidCurrencyAmount(finance.funds)) {
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
  const ledgerById = new Map<
    string,
    {
      day: number
      amount: number
      id: string
      requestId: string
      partyId?: string
    }
  >()
  let runningTotal = 0
  for (const entry of finance.ledgerEntries) {
    const validated = validateLedgerEntry(entry, seenIds)
    ledgerById.set(validated.id, validated)
    runningTotal = validateCurrencyAmount(runningTotal + validated.amount)
  }

  if ((finance.funds as number) !== runningTotal) {
    throw new SaveValidationErrorClass(
      '酒場資金と帳簿の合計が一致しません',
      'corrupted-data',
    )
  }

  return { funds: finance.funds as number, ledgerById }
}

type ExpectedCommissionLedger = {
  day: number
  requestId: string
  partyId: string
  amount: number
}

function validateResolvedDispatch(
  value: unknown,
  day: number,
  ledgerById: Map<
    string,
    {
      day: number
      amount: number
      id: string
      requestId: string
      partyId?: string
    }
  >,
  expectedLedgerById: Map<string, ExpectedCommissionLedger>,
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

    if (expectedLedgerById.has(expectedId)) {
      throw new SaveValidationErrorClass(
        '重複した精算用帳簿IDが検出されました',
        'corrupted-data',
      )
    }
    expectedLedgerById.set(expectedId, {
      day,
      requestId: resolved.requestId as string,
      partyId,
      amount: settlement.tavernCommission,
    })

    if (settlement.tavernCommission > 0) {
      const entry = ledgerById.get(expectedId)
      if (!entry) {
        throw new SaveValidationErrorClass(
          '精算に対応する帳簿エントリがありません',
          'corrupted-data',
        )
      }
      if (entry.amount !== settlement.tavernCommission) {
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
  ledgerById: Map<
    string,
    {
      day: number
      amount: number
      id: string
      requestId: string
      partyId?: string
    }
  >,
  expectedLedgerById: Map<string, ExpectedCommissionLedger>,
): void {
  if (!Array.isArray(value)) {
    throw new SaveValidationErrorClass(
      '依頼結果リストの形式が不正です',
      'corrupted-data',
    )
  }
  for (const result of value) {
    validateResolvedDispatch(result, day, ledgerById, expectedLedgerById)
  }
}

function validateHistoryRecord(
  value: unknown,
  ledgerById: Map<
    string,
    {
      day: number
      amount: number
      id: string
      requestId: string
      partyId?: string
    }
  >,
  expectedLedgerById: Map<string, ExpectedCommissionLedger>,
): void {
  assertPlainObject(value, '履歴レコードの形式が不正です')
  const record = value as Record<string, unknown>
  if (
    typeof record.dayNumber !== 'number' ||
    !Number.isInteger(record.dayNumber) ||
    record.dayNumber < 1
  ) {
    throw new SaveValidationErrorClass(
      '履歴レコードの日数が不正です',
      'corrupted-data',
    )
  }
  validateDayResults(
    record.results,
    record.dayNumber as number,
    ledgerById,
    expectedLedgerById,
  )
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
    !Number.isInteger(campaign.dayNumber)
  ) {
    throw new SaveValidationErrorClass(
      'キャンペーン日数がありません',
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

  const { ledgerById } = validateFinance(campaign.finance)

  const expectedLedgerById = new Map<string, ExpectedCommissionLedger>()

  const currentDay = campaign.currentDay as Record<string, unknown>
  validateDayRequests(currentDay.requests)
  validateDayResults(
    currentDay.results,
    campaign.dayNumber,
    ledgerById,
    expectedLedgerById,
  )

  for (const record of campaign.history) {
    validateHistoryRecord(record, ledgerById, expectedLedgerById)
  }

  for (const [id] of ledgerById) {
    if (!expectedLedgerById.has(id)) {
      throw new SaveValidationErrorClass(
        '孤立した帳簿エントリがあります',
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

function validateCurrencyAmount(value: number): number {
  if (!isValidCurrencyAmount(value)) {
    throw new SaveValidationErrorClass('金額の値が不正です', 'corrupted-data')
  }
  return value
}
