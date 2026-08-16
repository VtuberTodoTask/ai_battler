import type { GameSaveData, SaveRepository, SaveSlotSummary } from './types.ts'
import { deserializeGameSave, SLOT_LABELS } from './serializer.ts'

const DB_NAME = 'adventurers-tavern'
const STORE_NAME = 'saves'
const DB_VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'slotId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB open failed'))
  })
}

export class IndexedDbSaveRepository implements SaveRepository {
  private readonly _dbPromise: Promise<IDBDatabase>

  constructor() {
    this._dbPromise = openDatabase()
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this._dbPromise
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    const request = callback(store)
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () =>
        reject(request.error ?? new Error('IndexedDB request failed'))
    })
  }

  async list(): Promise<SaveSlotSummary[]> {
    const raw = await this.withStore('readonly', (store) => store.getAll())
    const items = Array.isArray(raw)
      ? (raw as Array<{ slotId: string; data: GameSaveData }>)
      : []
    return items.map((item) => {
      const data = item.data
      return {
        slotId: item.slotId,
        label: SLOT_LABELS[item.slotId] ?? item.slotId,
        empty: false,
        isAutosave: item.slotId === 'autosave',
        metadata: {
          currentDay: data.metadata.currentDay,
          updatedAt: data.metadata.updatedAt,
          campaignSeed: data.metadata.campaignSeed,
          gameVersion: data.metadata.gameVersion,
          saveFormatVersion: data.metadata.saveFormatVersion,
        },
      }
    })
  }

  async load(slotId: string): Promise<GameSaveData | null> {
    const raw = await this.withStore('readonly', (store) => store.get(slotId))
    if (!raw) return null
    const data = (raw as { data: GameSaveData }).data
    return deserializeGameSave(data)
  }

  async save(slotId: string, data: GameSaveData): Promise<void> {
    await this.withStore('readwrite', (store) => store.put({ slotId, data }))
  }

  async delete(slotId: string): Promise<void> {
    await this.withStore('readwrite', (store) => store.delete(slotId))
  }
}
