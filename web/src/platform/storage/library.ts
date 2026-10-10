// Port of app/src/main/kotlin/dev/arc/ep133/data/Library.kt (+ PakStore.kt, BackupDao.kt, SearchIndex.kt, reference/src/library.js)
//
// The backup library: rows plus .pak files in IndexedDB, with a copy of both
// in a library folder outside the browser when the user picked one
// ([target], Android's Documents/arc). Copy failures never fail the library
// operation; they come back as copyError or go to [onExternalError].
//
// Web deltas:
// - Room + PakStore become one IndexedDB database (db.ts). A save writes the
//   file, row, names and index mark in one transaction, which replaces the
//   temp-file rename and makes "file before row" automatic; [sweep] still
//   removes files without a row (a reference-era leftover, say).
// - The Mutex serialising file writes stays (a promise chain), so two copies
//   to the folder never interleave their library.json writes.
// - Room Flows become [subscribe]: listeners hear about every write in this
//   tab, and about writes in other tabs through BroadcastChannel('arc').
// - Android always has Documents/arc to copy to (MediaStore). The web copies
//   only once a folder was picked (FSA, Chromium), so every copy step is
//   skipped while [target] is null, and the folder counts as "picked"
//   (Android's tree mode, which lists the folder) whenever there is one.
//   Reconnecting a remembered folder needs a tap ([reconnectFolder]).
// - restoreFrom takes any ExternalTarget, including a read-only FileListTarget
//   (<input webkitdirectory>), which is read but never adopted.
// - [exportZip] (no Android equivalent): the folder's content as one zip, for
//   browsers that cannot pick a folder (with live.json, from [live]).

import { describePak, openPak } from '../../core/backup/pak'
import {
  FILE as INDEX_FILE,
  fileFor,
  merge,
  parse,
  toJson,
  type IndexEntry,
  type LibraryIndexData,
} from '../../core/backup/libraryIndex'
import { search as searchNames, type NameEntry, type SearchGroup } from '../../core/features/librarySearch'
import { writeZip } from '../../core/formats/zip'
import { FeatureText } from '../../core/text/featureText'
import { BackupDevice, importTitle, sorted, toPrune, type BackupRecord } from '../../core/text/libraryRules'
import { Strings } from '../../core/text/strings'
import { browserChannel, type ArcChannel } from './channel'
import {
  STORE,
  fileBytes,
  namesOf,
  normaliseRecord,
  openArcDb,
  request,
  storedRecord,
  transact,
  type FileRow,
  type KvRow,
  type NameRow,
  type OpenOptions,
} from './db'
import {
  FsaTarget,
  LIVE_FILE,
  MemoryTarget,
  isIndex,
  isLibraryFolder,
  isLive,
  isPak,
  type DirHandleLike,
  type ExternalTarget,
  type FolderFile,
} from './external'

/** A saved backup, and what went wrong copying it to the folder (null if nothing). */
export interface Saved {
  record: BackupRecord
  copyError: string | null
}

/** What restoring needs from a .pak (its description). */
export interface RestoredPak {
  createdAt: number
  device: BackupDevice
  soundCount: number
  projectCount: number
  projects: number[]
  slots: number[]
  projectSlots: Record<number, number[]>
  soundNames: Record<number, string>
}

export type Describe = (bytes: Uint8Array) => RestoredPak | Promise<RestoredPak>

/** ArcController.restoreFromFolder's describe: the pak's own date (else now), and no serial. */
export async function describeForRestore(bytes: Uint8Array, now: () => number = Date.now): Promise<RestoredPak> {
  const d = describePak(await openPak(bytes))
  return {
    createdAt: d.generatedAt ?? now(),
    device: BackupDevice(d.device.product, d.device.sku, '', d.device.osVersion),
    soundCount: d.soundCount,
    projectCount: d.projectCount,
    projects: d.projects,
    slots: d.slots,
    projectSlots: d.projectSlots,
    soundNames: d.soundNames,
  }
}

/** What a restore from the folder brought back (Library.kt Restored). */
export interface Restored {
  count: number
  settings: Record<string, string>
  /** Live's last read (live.json), when the folder had one. */
  live: string | null
}

/** navigator.storage, as far as used here. */
export interface StorageManagerLike {
  estimate?(): Promise<{ quota?: number; usage?: number }>
  persist?(): Promise<boolean>
  persisted?(): Promise<boolean>
}

/** A change to the library; [remote] when another tab made it. */
export interface LibraryChange {
  remote: boolean
}

/** A remembered folder's state: none picked, usable, or waiting for a tap (or refused). */
export type FolderStatus = 'none' | 'granted' | 'prompt' | 'denied'

export interface LibraryOptions {
  db: IDBDatabase
  /** The folder copies go to; null until one is picked. */
  target?: ExternalTarget | null
  /** navigator.storage; null where there is none. */
  storage?: StorageManagerLike | null
  /** Default: BroadcastChannel('arc'). */
  channel?: ArcChannel
  newId?: () => string
  now?: () => number
}

export interface OpenLibraryOptions extends Omit<LibraryOptions, 'db'> {
  db?: IDBDatabase
  dbOptions?: OpenOptions
}

/** crypto.randomUUID, with the reference's fallback. */
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

const message = (e: unknown): string => (e instanceof Error ? e.message || String(e) : String(e))

const KV_DIR = 'dirHandle'
const KV_PICKED = 'folderPicked'
const KV_OVERRIDE = 'fileOverride:'
/** The kv row Live's patterns are kept in (an addition): one JSON for every project, as Android's patterns.json. */
const KV_PATTERNS = 'patterns'

/** A promise-chain mutex (kotlinx Mutex.withLock, not reentrant). */
class Mutex {
  private tail: Promise<void> = Promise.resolve()

  run<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.tail.then(fn)
    this.tail = r.then(
      () => {},
      () => {},
    )
    return r
  }
}

function asBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' })
}

export class Library {
  /** Settings kept with the library in the folder, read when the index is written. */
  settings: () => Record<string, string> = () => ({})

  /** Called with what went wrong when the folder copy could not be written. */
  onExternalError: (message: string) => void = () => {}

  /** Live's last read as live.json text, for [exportZip] (null when there is none). */
  live: () => string | null | Promise<string | null> = () => null

  readonly db: IDBDatabase
  private external: ExternalTarget | null
  private pending: FsaTarget | null = null
  private pickedStored = false
  private readonly storage: StorageManagerLike | null
  private readonly channel: ArcChannel
  private readonly makeId: () => string
  private readonly now: () => number
  private readonly listeners = new Set<(c: LibraryChange) => void>()
  private readonly unsubscribeChannel: () => void
  // Serialises file writes, deletes and the startup sweep, so the sweep never
  // removes a file that is being saved.
  private readonly files = new Mutex()
  private readonly restoring = new Mutex()

  constructor(options: LibraryOptions) {
    this.db = options.db
    this.external = options.target ?? null
    this.storage =
      options.storage !== undefined
        ? options.storage
        : ((globalThis.navigator as { storage?: StorageManagerLike } | undefined)?.storage ?? null)
    this.channel = options.channel ?? browserChannel()
    this.makeId = options.newId ?? newId
    this.now = options.now ?? Date.now
    this.unsubscribeChannel = this.channel.subscribe((m) => {
      if (m.type === 'library') this.emit({ remote: true })
    })
  }

  /** Opens the database (upgrading it) and reads what the library remembers about its folder. */
  static async open(options: OpenLibraryOptions = {}): Promise<Library> {
    const db = options.db ?? (await openArcDb(options.dbOptions))
    const lib = new Library({ ...options, db })
    lib.pickedStored = (await lib.kvGet(KV_PICKED)) === true
    return lib
  }

  close(): void {
    this.unsubscribeChannel()
    this.channel.close()
    this.listeners.clear()
    this.db.close()
  }

  // ---------- observing ----------

  /** Hears about every change (this tab's writes, and other tabs'). */
  subscribe(listener: (change: LibraryChange) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(change: LibraryChange): void {
    for (const l of [...this.listeners]) {
      try {
        l(change)
      } catch {
        // One listener's failure doesn't stop the others.
      }
    }
  }

  private changed(): void {
    this.emit({ remote: false })
    this.channel.post({ type: 'library' })
  }

  // ---------- reads ----------

  /** Newest first; ties in id order (Room: ORDER BY created_at DESC, id ASC). */
  async list(): Promise<BackupRecord[]> {
    const rows = await transact(this.db, STORE.backups, 'readonly', (t) => request(t.objectStore(STORE.backups).getAll()))
    return sorted(rows.map(normaliseRecord))
  }

  async get(id: string): Promise<BackupRecord | null> {
    const row: unknown = await transact(this.db, STORE.backups, 'readonly', (t) => request(t.objectStore(STORE.backups).get(id)))
    return row === undefined ? null : normaliseRecord(row)
  }

  /** Every indexed sound name, for searching. */
  async names(): Promise<NameEntry[]> {
    const rows = (await transact(this.db, STORE.names, 'readonly', (t) =>
      request(t.objectStore(STORE.names).getAll()),
    )) as NameRow[]
    return rows.map((r) => ({ backupId: r.backupId, slot: r.slot, name: r.name }))
  }

  /** LibrarySearch over the stored names, in library order. */
  async search(query: string): Promise<SearchGroup<BackupRecord>[]> {
    const [names, backups] = await Promise.all([this.names(), this.list()])
    return searchNames(names, backups, query)
  }

  /** The .pak's bytes; throws Strings.FILE_MISSING when the file is gone. */
  async bytes(id: string): Promise<Uint8Array> {
    const row = (await transact(this.db, STORE.files, 'readonly', (t) => request(t.objectStore(STORE.files).get(id)))) as
      | FileRow
      | undefined
    if (!row) throw new Error(Strings.FILE_MISSING)
    return fileBytes(row)
  }

  /** The .pak as a Blob (application/zip), for saving or sharing (Android's file(id)). */
  async blob(id: string): Promise<Blob> {
    const row = (await transact(this.db, STORE.files, 'readonly', (t) => request(t.objectStore(STORE.files).get(id)))) as
      | FileRow
      | undefined
    if (!row) throw new Error(Strings.FILE_MISSING)
    if (row.blob instanceof Blob) return row.blob
    return asBlob(await fileBytes(row))
  }

  /** Free space for the library: quota minus usage, or null when the browser won't say. */
  async estimate(): Promise<number | null> {
    try {
      const e = await this.storage?.estimate?.()
      if (!e || e.quota == null) return null
      return Math.max(0, e.quota - (e.usage ?? 0))
    } catch {
      return null
    }
  }

  /** Asks the browser not to evict the library (at boot). Returns whether it is persisted. */
  async persist(): Promise<boolean> {
    try {
      const s = this.storage
      if (!s?.persist) return false
      if (s.persisted && (await s.persisted())) return true
      return await s.persist()
    } catch {
      return false
    }
  }

  // ---------- writes ----------

  /**
   * Stores the file, row, sound names and index mark together, then the copy
   * in the folder. The result says if that copy failed.
   */
  async save(record: BackupRecord, bytes: Uint8Array, soundNames: Readonly<Record<number, string>>): Promise<Saved> {
    const row: BackupRecord = { ...record, id: record.id || this.makeId(), size: bytes.length }
    const copyError = await this.files.run(async () => {
      await this.store(row, bytes, soundNames, null)
      this.changed()
      return this.copyOut(async (ext) => {
        await ext.write(await this.externalName(row), bytes)
        await this.writeIndex(ext)
      })
    })
    return { record: row, copyError }
  }

  /** One transaction: file, row, names (replaced), index mark, and a file override when given. */
  private store(
    row: BackupRecord,
    bytes: Uint8Array,
    soundNames: Readonly<Record<number, string>>,
    override: string | null,
  ): Promise<void> {
    const stores = [STORE.files, STORE.backups, STORE.names, STORE.indexed, STORE.kv] as const
    return transact(this.db, stores, 'readwrite', (t) => {
      t.objectStore(STORE.files).put({ id: row.id, blob: asBlob(bytes) } satisfies FileRow)
      t.objectStore(STORE.backups).put(storedRecord(row))
      const names = t.objectStore(STORE.names)
      names.delete(namesOf(row.id))
      for (const [slot, name] of Object.entries(soundNames)) {
        names.put({ backupId: row.id, slot: Number(slot), name } satisfies NameRow)
      }
      t.objectStore(STORE.indexed).put({ backupId: row.id })
      if (override !== null) t.objectStore(STORE.kv).put({ key: KV_OVERRIDE + row.id, value: override } satisfies KvRow)
    })
  }

  /** Changes a backup's title and notes (nothing when it is gone), then the index in the folder. */
  async update(id: string, title: string, notes: string): Promise<void> {
    const found = await transact(this.db, STORE.backups, 'readwrite', async (t) => {
      const s = t.objectStore(STORE.backups)
      const row: unknown = await request(s.get(id))
      if (row === undefined) return false
      s.put({ ...(row as Record<string, unknown>), title, notes })
      return true
    })
    if (found) this.changed()
    const err = await this.files.run(() => this.copyOut((ext) => this.writeIndex(ext)))
    if (err !== null) this.onExternalError(err)
  }

  /** Deletes a backup, and its file in the folder; returns what went wrong with the folder, if anything. */
  async delete(id: string): Promise<string | null> {
    return this.files.run(async () => {
      const row = await this.get(id)
      const name = row ? await this.externalName(row) : null
      const stores = [STORE.backups, STORE.files, STORE.names, STORE.indexed, STORE.kv] as const
      await transact(this.db, stores, 'readwrite', (t) => {
        t.objectStore(STORE.backups).delete(id)
        t.objectStore(STORE.names).delete(namesOf(id))
        t.objectStore(STORE.indexed).delete(id)
        t.objectStore(STORE.files).delete(id)
        t.objectStore(STORE.kv).delete(KV_OVERRIDE + id)
      })
      this.changed()
      return this.copyOut(async (ext) => {
        if (name !== null) await ext.delete(name)
        await this.writeIndex(ext)
      })
    })
  }

  /**
   * Deletes the oldest backups beyond [keep] (LibraryRules.toPrune), never
   * [keepId]. Returns how many were deleted (a failed delete is not counted).
   */
  async prune(keep: number | null, keepId: string | null = null): Promise<number> {
    if (keep === null) return 0
    const drop = toPrune(await this.list(), keep).filter((b) => b.id !== keepId)
    let removed = 0
    for (const b of drop) {
      try {
        await this.delete(b.id)
        removed++
      } catch {
        // Not counted.
      }
    }
    return removed
  }

  // ---------- maintenance ----------

  /** Removes files with no library row (PakStore.sweep). */
  async sweep(): Promise<void> {
    await this.files.run(() =>
      transact(this.db, [STORE.backups, STORE.files], 'readwrite', async (t) => {
        const ids = new Set((await request(t.objectStore(STORE.backups).getAllKeys())).map(String))
        const files = t.objectStore(STORE.files)
        for (const k of await request(files.getAllKeys())) if (!ids.has(String(k))) files.delete(k)
      }),
    )
  }

  /** Names and index marks left behind for backups that are gone (SearchDao.dropOrphans). */
  async dropOrphans(): Promise<void> {
    await transact(this.db, [STORE.backups, STORE.names, STORE.indexed], 'readwrite', async (t) => {
      const ids = new Set((await request(t.objectStore(STORE.backups).getAllKeys())).map(String))
      const names = t.objectStore(STORE.names)
      for (const k of await request(names.getAllKeys())) {
        const backupId = Array.isArray(k) ? String(k[0]) : ''
        if (!ids.has(backupId)) names.delete(k)
      }
      const marks = t.objectStore(STORE.indexed)
      for (const k of await request(marks.getAllKeys())) if (!ids.has(String(k))) marks.delete(k)
    })
  }

  /**
   * Indexes the sound names of backups saved before search existed (or whose
   * names were not stored). One backup at a time; a damaged file is skipped
   * and tried again next start.
   */
  async indexMissing(): Promise<void> {
    await this.dropOrphans()
    const [ids, indexed] = await transact(this.db, [STORE.backups, STORE.indexed], 'readonly', (t) =>
      Promise.all([request(t.objectStore(STORE.backups).getAllKeys()), request(t.objectStore(STORE.indexed).getAllKeys())]),
    )
    const done = new Set(indexed.map(String))
    for (const key of ids) {
      const id = String(key)
      if (done.has(id)) continue
      const bytes = await this.files.run(async () => {
        if ((await this.get(id)) === null) return null
        try {
          return await this.bytes(id)
        } catch {
          return null
        }
      })
      if (bytes === null) continue
      let names: Record<number, string>
      try {
        names = {}
        for (const [slot, s] of (await openPak(bytes)).sounds) names[slot] = s.name
      } catch {
        continue
      }
      // Only if the backup was not deleted meanwhile.
      const replaced = await this.files.run(() =>
        transact(this.db, [STORE.backups, STORE.names, STORE.indexed], 'readwrite', async (t) => {
          if ((await request(t.objectStore(STORE.backups).getKey(id))) === undefined) return false
          const store = t.objectStore(STORE.names)
          store.delete(namesOf(id))
          for (const [slot, name] of Object.entries(names)) store.put({ backupId: id, slot: Number(slot), name } satisfies NameRow)
          t.objectStore(STORE.indexed).put({ backupId: id })
          return true
        }),
      )
      if (replaced) this.changed()
    }
  }

  // ---------- the library folder ----------

  /** The folder copies go to, if any (and usable now). */
  get target(): ExternalTarget | null {
    return this.external
  }

  /** Whether the user picked the library folder (remembered, even while it waits for a tap). */
  get folderPicked(): boolean {
    return this.pickedStored || (this.external !== null && !this.external.readOnly)
  }

  /** Uses [target] for copies in this session only (tests, or a folder already granted). */
  setTarget(target: ExternalTarget | null): void {
    this.external = target && !target.readOnly ? target : null
  }

  /** Makes [target] the copy target and remembers it (its handle too, for a File System Access folder). */
  async adoptFolder(target: ExternalTarget): Promise<void> {
    if (target.readOnly) return
    this.external = target
    this.pending = null
    this.pickedStored = true
    try {
      await this.kvPut(KV_PICKED, true)
    } catch {
      // Not remembered (storage refused it): the folder is still used this session.
    }
    if (target instanceof FsaTarget) {
      try {
        await this.kvPut(KV_DIR, target.handle)
      } catch {
        // A handle the store can't keep: the folder is used this session only.
      }
    }
  }

  /**
   * At boot: the remembered folder, if its permission still holds. "prompt"
   * means a tap must call [reconnectFolder] before copies resume.
   */
  async loadFolder(): Promise<FolderStatus> {
    const handle = await this.kvGet(KV_DIR)
    if (typeof handle !== 'object' || handle === null || (handle as { kind?: unknown }).kind !== 'directory') {
      return this.external ? 'granted' : 'none'
    }
    const t = new FsaTarget(handle as DirHandleLike)
    const status = await t.permission(false)
    if (status === 'granted') {
      this.external = t
      this.pending = null
    } else {
      this.pending = t
    }
    return status
  }

  /** From a tap: asks again for the remembered folder. Run [reconcile] after "granted". */
  async reconnectFolder(): Promise<FolderStatus> {
    const t = this.pending
    if (!t) return this.external ? 'granted' : 'none'
    const status = await t.permission(true)
    if (status === 'granted') {
      this.external = t
      this.pending = null
    }
    return status
  }

  private async externalName(r: BackupRecord): Promise<string> {
    const o = await this.kvGet(KV_OVERRIDE + r.id)
    return typeof o === 'string' ? o : fileFor(r.id, r.createdAt)
  }

  private async overrides(): Promise<Map<string, string>> {
    const range = IDBKeyRange.bound(KV_OVERRIDE, KV_OVERRIDE + '￿')
    const rows = (await transact(this.db, STORE.kv, 'readonly', (t) => request(t.objectStore(STORE.kv).getAll(range)))) as KvRow[]
    const out = new Map<string, string>()
    for (const r of rows) if (typeof r.value === 'string') out.set(r.key.slice(KV_OVERRIDE.length), r.value)
    return out
  }

  /**
   * Rewrites library.json from the library. Entries of backups whose file is
   * in the folder but not in the library (one a restore could not read, say)
   * are kept, so their titles and notes aren't lost. [base] settings are kept
   * where the app has none of its own.
   */
  private async writeIndex(ext: ExternalTarget, base: Readonly<Record<string, string>> = {}): Promise<void> {
    const rows = await this.list()
    const over = await this.overrides()
    const ids = new Set(rows.map((r) => r.id))
    const entries: IndexEntry[] = rows.map((r) => ({
      id: r.id,
      file: over.get(r.id) ?? fileFor(r.id, r.createdAt),
      title: r.title,
      notes: r.notes,
      createdAt: r.createdAt,
      source: r.source,
      fileName: r.fileName,
      device: r.device,
    }))
    const listing = await ext.list()
    const present = new Set(listing.map((f) => f.name))
    const kept = (await this.readIndex(ext, listing)).entries.filter((e) => !ids.has(e.id) && present.has(e.file))
    const data: LibraryIndexData = { entries: [...entries, ...kept], settings: { ...base, ...this.settings() } }
    await ext.write(INDEX_FILE, toJson(data))
  }

  /** Every index file in a folder listing, oldest first, merged so the newest wins. */
  private async readIndex(ext: ExternalTarget, listing: readonly FolderFile[]): Promise<LibraryIndexData> {
    const files = listing.filter((f) => isIndex(f.name))
    // Kotlin sortedBy is stable, as Array.prototype.sort is.
    files.sort((a, b) => a.lastModified - b.lastModified)
    const parsed: LibraryIndexData[] = []
    for (const f of files) {
      try {
        const ix = parse(new TextDecoder().decode(await ext.read(f.name)))
        if (ix) parsed.push(ix)
      } catch {
        // Unreadable: skipped.
      }
    }
    return merge(parsed)
  }

  /** Runs a copy to the folder; returns what went wrong, if anything (null without a folder). */
  private async copyOut(block: (ext: ExternalTarget) => Promise<void>): Promise<string | null> {
    const ext = this.external
    if (!ext || ext.readOnly) return null
    try {
      await block(ext)
      return null
    } catch (e) {
      return message(e)
    }
  }

  /** Copies Live's last read of the device to the folder (as live.json). */
  async saveLive(json: string): Promise<void> {
    const err = await this.files.run(() => this.copyOut((ext) => ext.write(LIVE_FILE, json)))
    if (err !== null) this.onExternalError(err)
  }

  /** Rewrites the index in the folder (after a settings change). */
  async syncIndex(): Promise<void> {
    const err = await this.files.run(() => this.copyOut((ext) => this.writeIndex(ext)))
    if (err !== null) this.onExternalError(err)
  }

  /**
   * Copies to the folder whatever is missing there (a library from before the
   * folder, or a copy that failed earlier), then the index. An empty library
   * has nothing to protect, so a fresh install writes nothing before the user
   * can restore. Only the first error is reported.
   */
  async reconcile(): Promise<void> {
    if (!this.external || this.external.readOnly) return
    await this.files.run(async () => {
      const rows = await this.list()
      if (rows.length === 0) return
      let present: Set<string> | null = null
      try {
        present = new Set((await this.external!.list()).map((f) => f.name))
      } catch {
        present = null
      }
      let error: string | null = null
      for (const r of rows) {
        const name = await this.externalName(r)
        const err = await this.copyOut(async (e) => {
          const there = present ? present.has(name) : await e.exists(name)
          if (!there) await e.write(name, await this.bytes(r.id))
        })
        error ??= err
      }
      const ixErr = await this.copyOut((ext) => this.writeIndex(ext))
      const report = error ?? ixErr
      if (report !== null) this.onExternalError(report)
    })
  }

  /**
   * Reads the library back from a folder: every .pak in it, with titles,
   * notes and dates from the index files (the newest wins), and the
   * settings. Backups already in the library are skipped. The folder must be
   * the library's (named arc, or holding arc files); otherwise this throws
   * FeatureText.PICK_ARC_FOLDER and nothing changes. A writable folder then
   * becomes the copy target. Returns how many came back, the settings and
   * Live's last read.
   */
  async restoreFrom(target: ExternalTarget, describe: Describe = (b) => describeForRestore(b, this.now)): Promise<Restored> {
    return this.restoring.run(async () => {
      const listing = new Map<string, FolderFile>()
      for (const f of await target.list()) listing.set(f.name, f)
      if (!isLibraryFolder(target.name, listing.keys())) throw new Error(FeatureText.PICK_ARC_FOLDER)
      const index = await this.readIndex(target, [...listing.values()])
      const byFile = new Map<string, IndexEntry>()
      for (const e of index.entries) byFile.set(e.file, e)
      let count = 0
      for (const name of listing.keys()) {
        if (!isPak(name)) continue
        const entry = byFile.get(name)
        const taken = await this.files.run(async () => {
          if (entry && (await this.get(entry.id)) !== null) return true
          // One read of the overrides, not one transaction per backup per file.
          const over = await this.overrides()
          for (const r of await this.list()) if ((over.get(r.id) ?? fileFor(r.id, r.createdAt)) === name) return true
          return false
        })
        if (taken) continue
        let bytes: Uint8Array
        try {
          bytes = await target.read(name)
        } catch {
          continue
        }
        let d: RestoredPak
        try {
          d = await describe(bytes)
        } catch {
          continue
        }
        const id = entry?.id ?? this.makeId()
        const record: BackupRecord = {
          id,
          title: entry?.title ?? importTitle(name),
          notes: entry?.notes ?? '',
          createdAt: entry?.createdAt ?? d.createdAt,
          source: entry?.source ?? 'import',
          fileName: entry?.fileName ?? name,
          device: entry?.device ?? d.device,
          soundCount: d.soundCount,
          projectCount: d.projectCount,
          projects: d.projects,
          slots: d.slots,
          projectSlots: d.projectSlots,
          size: bytes.length,
        }
        // The file keeps its name; remember it when it isn't the usual one.
        const override = name !== fileFor(id, record.createdAt) ? name : null
        await this.files.run(() => this.store(record, bytes, d.soundNames, override))
        this.changed()
        count++
      }
      // The newest of live.json and any "live (1).json" next to it.
      const lives = [...listing.values()].filter((f) => isLive(f.name)).sort((a, b) => b.lastModified - a.lastModified)
      let live: string | null = null
      for (const f of lives) {
        try {
          live = new TextDecoder().decode(await target.read(f.name))
          break
        } catch {
          // Unreadable: the next one.
        }
      }
      await this.adoptFolder(target)
      const err = await this.files.run(() => this.copyOut((ext) => this.writeIndex(ext, index.settings)))
      if (err !== null) this.onExternalError(err)
      return { count, settings: index.settings, live }
    })
  }

  /**
   * The library folder's content as one zip (every .pak under its folder
   * name, plus library.json): "Export library", where no folder can be picked.
   */
  async exportZip(): Promise<Uint8Array> {
    const mem = new MemoryTarget('arc', {}, { now: this.now })
    await this.files.run(async () => {
      const over = await this.overrides()
      for (const r of await this.list()) {
        let bytes: Uint8Array
        try {
          bytes = await this.bytes(r.id)
        } catch {
          continue
        }
        await mem.write(over.get(r.id) ?? fileFor(r.id, r.createdAt), bytes)
      }
      await this.writeIndex(mem)
    })
    let live: string | null = null
    try {
      live = await this.live()
    } catch {
      live = null
    }
    if (live !== null) await mem.write(LIVE_FILE, live)
    const entries = [...mem.files].map(([path, f]) => ({ path, data: f.data, compress: path === INDEX_FILE || path === LIVE_FILE }))
    return writeZip(entries, { date: this.now() })
  }

  // ---------- PATTERN: Live's patterns (Android's files/patterns.json) ----------

  /** The patterns' JSON (Patterns.toJson), or null when none were kept. */
  async readPatterns(): Promise<string | null> {
    const v = await this.kvGet(KV_PATTERNS)
    return typeof v === 'string' ? v : null
  }

  /** Keeps the patterns' JSON; null forgets them. */
  async writePatterns(json: string | null): Promise<void> {
    if (json !== null) {
      await this.kvPut(KV_PATTERNS, json)
      return
    }
    await transact(this.db, STORE.kv, 'readwrite', (t) => {
      t.objectStore(STORE.kv).delete(KV_PATTERNS)
    })
  }

  // ---------- kv ----------

  private async kvGet(key: string): Promise<unknown> {
    const row = (await transact(this.db, STORE.kv, 'readonly', (t) => request(t.objectStore(STORE.kv).get(key)))) as KvRow | undefined
    return row?.value
  }

  private async kvPut(key: string, value: unknown): Promise<void> {
    await transact(this.db, STORE.kv, 'readwrite', (t) => {
      t.objectStore(STORE.kv).put({ key, value } satisfies KvRow)
    })
  }
}
