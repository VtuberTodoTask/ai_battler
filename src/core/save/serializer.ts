import { GAME_VERSION, SAVE_FORMAT_VERSION } from '../../version.ts'
import { deepClone } from '../util.ts'
import type { TavernCampaignState } from '../tavern/campaign/types.ts'
import { SeededRng } from '../rng/seededRng.ts'
import type {
  CampaignRandomState,
  GameSaveData,
  PersistentPresentationState,
  SaveMetadata,
  SaveRepository,
  SaveSlotSummary,
} from './types.ts'
import {
  SaveValidationErrorClass,
  type SaveValidationError,
  validateGameSave,
} from './validation.ts'

export { SaveValidationErrorClass, type SaveValidationError }

export const SLOT_IDS = ['autosave', 'slot-1', 'slot-2', 'slot-3'] as const

export const SLOT_LABELS: Record<string, string> = {
  autosave: 'オートセーブ',
  'slot-1': 'セーブ 1',
  'slot-2': 'セーブ 2',
  'slot-3': 'セーブ 3',
}

export interface SaveInput {
  campaign: TavernCampaignState
  persistentPresentationState?: PersistentPresentationState
  playTimeSeconds?: number
}

export function buildInitialRandomState(seed: string): CampaignRandomState {
  return {
    initialSeed: seed,
    state: new SeededRng(seed).serialize(),
  }
}

export function serializeGameSave(input: SaveInput): GameSaveData {
  const campaign = deepClone(input.campaign)
  const now = new Date().toISOString()
  const metadata: SaveMetadata = {
    saveFormatVersion: SAVE_FORMAT_VERSION,
    gameVersion: GAME_VERSION,
    saveId: `save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    slotId: '',
    createdAt: now,
    updatedAt: now,
    currentDay: campaign.dayNumber,
    campaignSeed: campaign.seed,
    playTimeSeconds: input.playTimeSeconds ?? 0,
  }

  return {
    metadata,
    campaign,
    randomState: buildInitialRandomState(campaign.seed),
    persistentPresentationState: {
      viewedActivityIds:
        input.persistentPresentationState?.viewedActivityIds ?? [],
      viewedReportIds: input.persistentPresentationState?.viewedReportIds ?? [],
    },
  }
}

export function deserializeGameSave(raw: unknown): GameSaveData {
  let parsed: unknown
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new SaveValidationErrorClass(
        'セーブデータのJSONが壊れています',
        'invalid-json',
      )
    }
  } else {
    parsed = raw
  }

  validateGameSave(parsed)

  const data = parsed as GameSaveData
  return {
    metadata: { ...data.metadata, updatedAt: new Date().toISOString() },
    campaign: deepClone(data.campaign),
    randomState: data.randomState,
    persistentPresentationState: {
      viewedActivityIds:
        data.persistentPresentationState?.viewedActivityIds ?? [],
      viewedReportIds: data.persistentPresentationState?.viewedReportIds ?? [],
    },
  }
}

export async function listSaveSlotSummaries(
  repository: SaveRepository,
): Promise<SaveSlotSummary[]> {
  const existing = await repository.list()
  const existingById = new Map(existing.map((s) => [s.slotId, s]))

  return SLOT_IDS.map((slotId) => {
    const existing = existingById.get(slotId)
    if (existing) return existing
    return {
      slotId,
      label: SLOT_LABELS[slotId] ?? slotId,
      empty: true,
      isAutosave: slotId === 'autosave',
    }
  })
}

export async function saveToSlot(
  repository: SaveRepository,
  slotId: string,
  input: SaveInput,
): Promise<void> {
  const data = serializeGameSave(input)
  data.metadata.slotId = slotId
  await repository.save(slotId, data)
}

export async function loadFromSlot(
  repository: SaveRepository,
  slotId: string,
): Promise<GameSaveData> {
  const raw = await repository.load(slotId)
  if (!raw) {
    throw new SaveValidationErrorClass(
      'セーブデータが見つかりません',
      'corrupted-data',
    )
  }
  return deserializeGameSave(raw)
}
