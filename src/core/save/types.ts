import type { TavernCampaignState } from '../tavern/campaign/types.ts'
import type { SeededRngState } from '../rng/seededRng.ts'

export interface SaveMetadata {
  saveFormatVersion: string
  gameVersion: string
  saveId: string
  slotId: string
  createdAt: string
  updatedAt: string
  currentDay: number
  campaignSeed: string
  playTimeSeconds?: number
}

export interface CampaignRandomState {
  initialSeed: string
  state: SeededRngState
}

export interface PersistentPresentationState {
  viewedActivityIds: string[]
  viewedReportIds: string[]
}

export interface GameSaveData {
  metadata: SaveMetadata
  campaign: TavernCampaignState
  randomState: CampaignRandomState
  persistentPresentationState: PersistentPresentationState
}

export interface SaveSlotSummary {
  slotId: string
  label: string
  isAutosave: boolean
  empty: boolean
  metadata?: {
    currentDay: number
    updatedAt: string
    campaignSeed: string
    gameVersion: string
    saveFormatVersion: string
  }
  incompatible?: boolean
  incompatibilityReason?: string
}

export interface SaveRepository {
  list(): Promise<SaveSlotSummary[]>
  load(slotId: string): Promise<GameSaveData | null>
  save(slotId: string, data: GameSaveData): Promise<void>
  delete(slotId: string): Promise<void>
}

export type SaveValidationError =
  | 'invalid-json'
  | 'missing-metadata'
  | 'game-version-mismatch'
  | 'save-format-mismatch'
  | 'corrupted-data'

export class SaveValidationErrorClass extends Error {
  constructor(
    message: string,
    public readonly code: SaveValidationError,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'SaveValidationError'
  }
}
