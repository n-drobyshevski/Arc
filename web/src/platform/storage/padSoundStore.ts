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
// - File.length is cheap on Android, and the cache adds up every copy's size
//   on each put (eviction) and for Settings. So a row keeps its bytes as a
//   Blob, whose size is known without reading the sample, and the sizes of
//   the rows this page wrote or read are remembered. Rows written before as a
//   Uint8Array are still read (and sized by reading them).

import type { PadSoundStore } from '../../core/features/padSoundCache'
import { STORE, request, transact, type PadSoundRow } from './db'

/** A row's bytes: a Blob, or a Uint8Array or ArrayBuffer in a row written before. */
async function asBytes(v: unknown): Promise<Uint8Array | null> {
  if (v instanceof Blob) return new Uint8Array(await v.arrayBuffer())
  if (v instanceof Uint8Array) return v
  if (v instanceof ArrayBuffer) return new Uint8Array(v)
  return null
}

/** A row's size in bytes, without reading a Blob's bytes; null for a row that holds none. */
function sizeOf(v: unknown): number | null {
  if (v instanceof Blob) return v.size
  if (v instanceof Uint8Array) return v.length
  if (v instanceof ArrayBuffer) return v.byteLength
  return null
}

/** The cache's folder in the library database (the "padSounds" store of [db]). */
export class IdbPadSoundStore implements PadSoundStore {
  /** Each row's size in bytes, as this page last wrote or read it. */
  private readonly sizes = new Map<string, number>()

  constructor(private readonly db: IDBDatabase) {}

  async read(name: string): Promise<Uint8Array | null> {
    const row = await this.row(name)
    const bytes = row ? await asBytes(row.bytes) : null
    if (bytes === null) this.sizes.delete(name)
    else this.sizes.set(name, bytes.length)
    return bytes
  }

  async write(name: string, bytes: Uint8Array): Promise<void> {
    this.sizes.delete(name)
    await transact(this.db, STORE.padSounds, 'readwrite', (t) => {
      t.objectStore(STORE.padSounds).put({ name, bytes: new Blob([bytes as Uint8Array<ArrayBuffer>]) } satisfies PadSoundRow)
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
    const known = this.sizes.get(name)
    if (known !== undefined) return known
    const row = await this.row(name)
    const size = row ? sizeOf(row.bytes) : null
    if (size === null) {
      this.sizes.delete(name)
      return 0
    }
    this.sizes.set(name, size)
    return size
  }

  async list(): Promise<string[]> {
    const keys = await transact(this.db, STORE.padSounds, 'readonly', (t) => request(t.objectStore(STORE.padSounds).getAllKeys()))
    return keys.map(String)
  }

  private async row(name: string): Promise<PadSoundRow | undefined> {
    return (await transact(this.db, STORE.padSounds, 'readonly', (t) => request(t.objectStore(STORE.padSounds).get(name)))) as
      | PadSoundRow
      | undefined
  }
}
