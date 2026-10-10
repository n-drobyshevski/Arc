// Port of app/src/main/kotlin/dev/arc/ep133/data/ArcDatabase.kt (+ BackupEntity.kt, SearchIndex.kt, Converters.kt, reference/src/library.js)
//
// IndexedDB "arc". Version 1 is the reference web app's (backups + files);
// version 2 adds the search tables Room's MIGRATION_1_2 adds on Android
// (sound_names, indexed_backups) plus a small key/value store for what Android
// keeps in SharedPreferences "external" (picked folder, file overrides).
// Version 3 adds "padSounds", Live's copies of the device's pad sounds
// (Android's files/pad-sounds folder, PadSoundCache). Version 4 adds "takes",
// Live's recorded takes (Android's files/takes folder, Takes.kt). The upgrades never
// touch existing stores, like MIGRATION_1_2 (no destructive fallback): a
// reference library on the same origin carries over.
//
// | Store    | keyPath             | Index     | Android                     |
// |----------|---------------------|-----------|-----------------------------|
// | backups  | id                  | createdAt | backups table (BackupEntity)|
// | files    | id                  |           | PakStore files/paks/{id}.pak|
// | names    | [backupId, slot]    | backupId  | sound_names                 |
// | indexed  | backupId            |           | indexed_backups             |
// | kv       | key                 |           | prefs "external"            |
// | padSounds| name                |           | files/pad-sounds/*          |
// | takes    | name                |           | files/takes/*.wav           |
//
// Web deltas:
// - Converters.kt (JSON text columns) is not needed: IndexedDB stores arrays
//   and objects natively. projectSlots is an object whose keys are strings;
//   [normaliseRecord] rebuilds it with numeric keys and number arrays.
// - Room's Flow observers become Library.subscribe (library.ts).

import { BackupDevice, type BackupRecord } from '../../core/text/libraryRules'

export const DB_NAME = 'arc'
/** ?demo's own database, so the demo never touches the real library. */
export const DEMO_DB_NAME = 'arc-demo'
export const DB_VERSION = 4

export const STORE = {
  backups: 'backups',
  files: 'files',
  names: 'names',
  indexed: 'indexed',
  kv: 'kv',
  padSounds: 'padSounds',
  takes: 'takes',
} as const
export type StoreName = (typeof STORE)[keyof typeof STORE]

/** A row in "files": the .pak bytes (a Blob of type application/zip, as the reference stored it). */
export interface FileRow {
  id: string
  blob: Blob | Uint8Array | ArrayBuffer
}

/** A row in "names" (SoundNameEntity). */
export interface NameRow {
  backupId: string
  slot: number
  name: string
}

/** A row in "indexed" (IndexedBackupEntity). */
export interface IndexedRow {
  backupId: string
}

/** A row in "padSounds": one file of PadSoundCache's folder (s<slot>.wav, index.json). */
export interface PadSoundRow {
  name: string
  bytes: Uint8Array
}

/** A row in "takes": one take's WAV and what its file name and header would say. */
export interface TakeRow {
  /** take-20261005-142301.wav (Takes.kt's file name). */
  name: string
  createdAt: number
  frames: number
  rate: number
  wav: Blob
}

/** A row in "kv". */
export interface KvRow {
  key: string
  value: unknown
}

export interface OpenOptions {
  /** Default: the global indexedDB. */
  factory?: IDBFactory
  /** Default "arc". */
  name?: string
  /**
   * Called when another tab holds an older version open and doesn't close it
   * (the reference site has no versionchange handler): the open waits until
   * that tab closes, so the app can say so instead of hanging silently.
   */
  onBlocked?: () => void
  /**
   * Called after this connection closed itself for a newer version opened in
   * another tab; every later library call fails until the page reloads.
   */
  onVersionChange?: () => void
}

/**
 * Creates whatever stores are missing for [oldVersion]. Version 0 to 1 is
 * the reference's own upgrade; 1 to 2 only adds stores (MIGRATION_1_2), and
 * 2 to 3 only adds "padSounds", 3 to 4 only "takes".
 */
export function upgrade(db: IDBDatabase, oldVersion: number, tx: IDBTransaction): void {
  if (oldVersion < 1) {
    if (!db.objectStoreNames.contains(STORE.backups)) db.createObjectStore(STORE.backups, { keyPath: 'id' })
    if (!db.objectStoreNames.contains(STORE.files)) db.createObjectStore(STORE.files, { keyPath: 'id' })
  }
  if (oldVersion < 2) {
    // The reference created "backups" without an index; Room has one on created_at.
    const backups = db.objectStoreNames.contains(STORE.backups)
      ? tx.objectStore(STORE.backups)
      : db.createObjectStore(STORE.backups, { keyPath: 'id' })
    if (!backups.indexNames.contains('createdAt')) backups.createIndex('createdAt', 'createdAt')
    if (!db.objectStoreNames.contains(STORE.files)) db.createObjectStore(STORE.files, { keyPath: 'id' })
    if (!db.objectStoreNames.contains(STORE.names)) {
      const names = db.createObjectStore(STORE.names, { keyPath: ['backupId', 'slot'] })
      names.createIndex('backupId', 'backupId')
    }
    if (!db.objectStoreNames.contains(STORE.indexed)) db.createObjectStore(STORE.indexed, { keyPath: 'backupId' })
    if (!db.objectStoreNames.contains(STORE.kv)) db.createObjectStore(STORE.kv, { keyPath: 'key' })
  }
  if (oldVersion < 3) {
    if (!db.objectStoreNames.contains(STORE.padSounds)) db.createObjectStore(STORE.padSounds, { keyPath: 'name' })
  }
  if (oldVersion < 4) {
    if (!db.objectStoreNames.contains(STORE.takes)) db.createObjectStore(STORE.takes, { keyPath: 'name' })
  }
}

/** Opens (and if needed upgrades) the database. */
export function openArcDb(options: OpenOptions = {}): Promise<IDBDatabase> {
  const factory = options.factory ?? globalThis.indexedDB
  if (!factory) return Promise.reject(new Error('IndexedDB is not available in this browser'))
  return new Promise((resolve, reject) => {
    const req = factory.open(options.name ?? DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const tx = req.transaction
      if (!tx) throw new Error('No upgrade transaction')
      upgrade(req.result, e.oldVersion, tx)
    }
    req.onsuccess = () => {
      const db = req.result
      // Another tab upgrading later must not be blocked by this one.
      db.onversionchange = () => {
        db.close()
        options.onVersionChange?.()
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error ?? new Error('Could not open the library'))
    req.onblocked = () => {
      // Another tab holds an older version open; ours close on versionchange,
      // the open goes on once it does.
      options.onBlocked?.()
    }
  })
}

/** A request as a promise. Await it only inside the transaction body (requests chain, so it stays active). */
export function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error('Storage request failed'))
  })
}

/**
 * Runs [body] in one transaction and resolves with its result once the
 * transaction has committed (never before, so a write is durable when this
 * resolves). Any failure aborts the whole transaction.
 */
export function transact<T>(
  db: IDBDatabase,
  stores: StoreName | readonly StoreName[],
  mode: IDBTransactionMode,
  body: (t: IDBTransaction) => T | Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let t: IDBTransaction
    try {
      t = db.transaction(stores as string | string[], mode)
    } catch (e) {
      reject(e)
      return
    }
    let result: T
    let failed: unknown = null
    let started: T | Promise<T>
    try {
      started = body(t)
    } catch (e) {
      started = Promise.reject(e)
    }
    const settled = Promise.resolve(started).then(
      (r) => {
        result = r
      },
      (e: unknown) => {
        failed ??= e
        try {
          t.abort()
        } catch {
          // Already finished.
        }
      },
    )
    t.oncomplete = () => void settled.then(() => (failed ? reject(failed) : resolve(result)))
    t.onerror = (e) => {
      // Keep the first error; the abort that follows reports it.
      failed ??= t.error ?? (e.target as IDBRequest | null)?.error ?? new Error('Storage transaction failed')
    }
    t.onabort = () => void settled.then(() => reject(failed ?? t.error ?? new Error('Storage transaction aborted')))
  })
}

/** The bytes of a "files" row, whichever form it was stored in. */
export async function fileBytes(row: FileRow): Promise<Uint8Array> {
  const b = row.blob
  if (b instanceof Uint8Array) return b
  if (b instanceof ArrayBuffer) return new Uint8Array(b)
  return new Uint8Array(await b.arrayBuffer())
}

const toInts = (v: unknown): number[] =>
  Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)) : []

/**
 * A stored backup row as a [BackupRecord]: numbers for projectSlots keys,
 * and defaults for what reference (v1) rows lack (device.serial on imports,
 * fileName on device backups).
 */
export function normaliseRecord(raw: unknown): BackupRecord {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const dev = (typeof r.device === 'object' && r.device !== null ? r.device : {}) as Record<string, unknown>
  const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : v == null ? fallback : String(v))
  const projectSlots: Record<number, number[]> = {}
  const ps = r.projectSlots
  if (typeof ps === 'object' && ps !== null) {
    for (const [k, v] of Object.entries(ps as Record<string, unknown>)) {
      const n = Number(k)
      if (Number.isInteger(n)) projectSlots[n] = toInts(v)
    }
  }
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
  return {
    id: str(r.id),
    title: str(r.title),
    notes: str(r.notes),
    createdAt: num(r.createdAt),
    source: str(r.source, 'import') || 'import',
    fileName: typeof r.fileName === 'string' ? r.fileName : null,
    device: BackupDevice(str(dev.product), str(dev.sku), str(dev.serial), str(dev.osVersion)),
    soundCount: num(r.soundCount),
    projectCount: num(r.projectCount),
    projects: toInts(r.projects),
    slots: toInts(r.slots),
    projectSlots,
    size: num(r.size),
  }
}

/** A record as stored: plain, cloneable data (projectSlots with string keys, as JSON would have them). */
export function storedRecord(r: BackupRecord): Record<string, unknown> {
  const projectSlots: Record<string, number[]> = {}
  for (const [k, v] of Object.entries(r.projectSlots)) projectSlots[k] = [...v]
  return {
    id: r.id,
    title: r.title,
    notes: r.notes,
    createdAt: r.createdAt,
    source: r.source,
    fileName: r.fileName,
    device: { product: r.device.product, sku: r.device.sku, serial: r.device.serial, osVersion: r.device.osVersion },
    soundCount: r.soundCount,
    projectCount: r.projectCount,
    projects: [...r.projects],
    slots: [...r.slots],
    projectSlots,
    size: r.size,
  }
}

/** Every key range of one backup's names: [id, -Infinity]..[id, Infinity]. */
export function namesOf(backupId: string): IDBKeyRange {
  return IDBKeyRange.bound([backupId, -Infinity], [backupId, Infinity])
}
