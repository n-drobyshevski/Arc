// Port of the folder ArcController gives PadSoundCache (app/src/main/kotlin/dev/arc/ep133/controller/ArcController.kt:
// `PadSoundCache(File(context.filesDir, "pad-sounds"))`)
//
// Live's copies of the device's pad sounds, kept in the library database's
// "padSounds" store (db.ts, version 3): one row per file of the cache's
// folder (s<slot>.wav and index.json), so core/features/padSoundCache works
// unchanged on top of it.
//
// Web deltas:
// - A java.io.File directory becomes an IndexedDB store; each write is one
//   transaction, which gives the cache's "replace as one step" contract
//   without a temporary file.
// - File.length is cheap on Android, but reading a row's size here means
//   reading the whole sample, and the cache adds up every copy's size on each
//   put (eviction) and for Settings. So the sizes of the rows this page wrote
//   or read are remembered, and only an unknown one is read.

import type { PadSoundStore } from '../../core/features/padSoundCache'
import { STORE, request, transact, type PadSoundRow } from './db'

/** Bytes as stored: a plain Uint8Array copy (a view of a bigger buffer would store all of it). */
function own(bytes: Uint8Array): Uint8Array {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice()
}

function asBytes(v: unknown): Uint8Array | null {
  if (v instanceof Uint8Array) return v
  if (v instanceof ArrayBuffer) return new Uint8Array(v)
  return null
}

/** The cache's folder in the library database (the "padSounds" store of [db]). */
export class IdbPadSoundStore implements PadSoundStore {
  /** Each row's size in bytes, as this page last wrote or read it. */
  private readonly sizes = new Map<string, number>()

  constructor(private readonly db: IDBDatabase) {}

  async read(name: string): Promise<Uint8Array | null> {
    const row = (await transact(this.db, STORE.padSounds, 'readonly', (t) => request(t.objectStore(STORE.padSounds).get(name)))) as
      | PadSoundRow
      | undefined
    const bytes = row ? asBytes(row.bytes) : null
    if (bytes === null) this.sizes.delete(name)
    else this.sizes.set(name, bytes.length)
    return bytes
  }

  async write(name: string, bytes: Uint8Array): Promise<void> {
    this.sizes.delete(name)
    await transact(this.db, STORE.padSounds, 'readwrite', (t) => {
      t.objectStore(STORE.padSounds).put({ name, bytes: own(bytes) } satisfies PadSoundRow)
    })
    this.sizes.set(name, bytes.length)
  }

  async remove(name: string): Promise<void> {
    this.sizes.delete(name)
    await transact(this.db, STORE.padSounds, 'readwrite', (t) => {
      t.objectStore(STORE.padSounds).delete(name)
    })
  }

  async has(name: string): Promise<boolean> {
    const key = await transact(this.db, STORE.padSounds, 'readonly', (t) => request(t.objectStore(STORE.padSounds).getKey(name)))
    return key !== undefined
  }

  async size(name: string): Promise<number> {
    return this.sizes.get(name) ?? (await this.read(name))?.length ?? 0
  }

  async list(): Promise<string[]> {
    const keys = await transact(this.db, STORE.padSounds, 'readonly', (t) => request(t.objectStore(STORE.padSounds).getAllKeys()))
    return keys.map(String)
  }
}
