import type { GameSaveData, SaveRepository, SaveSlotSummary } from './types.ts'
import { deserializeGameSave, SLOT_LABELS } from './serializer.ts'

export class InMemorySaveRepository implements SaveRepository {
  private readonly _store = new Map<string, GameSaveData>()

  async list(): Promise<SaveSlotSummary[]> {
    const entries = Array.from(this._store.entries())
    return entries.map(([slotId, data]) => ({
      slotId,
      label: SLOT_LABELS[slotId] ?? slotId,
      empty: false,
      isAutosave: slotId === 'autosave',
      metadata: {
        currentDay: data.metadata.currentDay,
        updatedAt: data.metadata.updatedAt,
        campaignSeed: data.metadata.campaignSeed,
        gameVersion: data.metadata.gameVersion,
        saveFormatVersion: data.metadata.saveFormatVersion,
      },
    }))
  }

  async load(slotId: string): Promise<GameSaveData | null> {
    const data = this._store.get(slotId)
    return data ? deserializeGameSave(data) : null
  }

  async save(slotId: string, data: GameSaveData): Promise<void> {
    this._store.set(slotId, data)
  }

  async delete(slotId: string): Promise<void> {
    this._store.delete(slotId)
  }

  /** Test helper to seed a slot directly. */
  seed(slotId: string, data: GameSaveData): void {
    this._store.set(slotId, data)
  }

  /** Test helper to inspect stored raw data. */
  getRaw(slotId: string): GameSaveData | undefined {
    return this._store.get(slotId)
  }
}
