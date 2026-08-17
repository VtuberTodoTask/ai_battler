import { GAME_VERSION, SAVE_FORMAT_VERSION } from '../../version.ts'
import type { GameSaveData, SaveMetadata } from './types.ts'
import { SaveValidationErrorClass, type SaveValidationError } from './types.ts'

export { SaveValidationErrorClass, type SaveValidationError }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasString(obj: Record<string, unknown>, key: string): boolean {
  return typeof obj[key] === 'string'
}

function hasNumber(obj: Record<string, unknown>, key: string): boolean {
  return typeof obj[key] === 'number'
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
  if (!hasNumber(campaign, 'dayNumber')) {
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

  if (!isPlainObject(campaign.finance)) {
    throw new SaveValidationErrorClass(
      '酒場資金データが壊れています',
      'corrupted-data',
    )
  }

  const finance = campaign.finance as Record<string, unknown>
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

  const ledgerIds = new Set<string>()
  for (const entry of finance.ledgerEntries) {
    if (!isPlainObject(entry)) {
      throw new SaveValidationErrorClass(
        '帳簿エントリの形式が不正です',
        'corrupted-data',
      )
    }
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new SaveValidationErrorClass(
        '帳簿エントリIDがありません',
        'corrupted-data',
      )
    }
    if (ledgerIds.has(entry.id)) {
      throw new SaveValidationErrorClass(
        '重複した帳簿エントリIDがあります',
        'corrupted-data',
      )
    }
    ledgerIds.add(entry.id)
    if (typeof entry.day !== 'number' || !Number.isInteger(entry.day)) {
      throw new SaveValidationErrorClass(
        '帳簿エントリの日数が不正です',
        'corrupted-data',
      )
    }
    if (!isValidCurrencyAmount(entry.amount)) {
      throw new SaveValidationErrorClass(
        '帳簿エントリの金額が不正です',
        'corrupted-data',
      )
    }
    if (entry.kind !== 'quest_commission') {
      throw new SaveValidationErrorClass(
        '帳簿エントリの種別が不正です',
        'corrupted-data',
      )
    }
    if (
      !isPlainObject(entry.source) ||
      entry.source.type !== 'expedition' ||
      typeof entry.source.requestId !== 'string'
    ) {
      throw new SaveValidationErrorClass(
        '帳簿エントリのソースが不正です',
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
