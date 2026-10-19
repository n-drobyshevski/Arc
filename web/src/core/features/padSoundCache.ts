// Port of core/src/main/kotlin/dev/arc/ep133/features/PadSoundCache.kt
//
// arc's copy of the device's pad sounds, for Live (an addition): one WAV per
// slot (`s<slot>.wav`) and `index.json` with the name and device size each
// was read with. A copy counts only while the device still has the same
// name in that slot. Past capBytes, the least recently played go first.
//
// Web deltas:
// - The folder is a PadSoundStore (named byte blobs) instead of a java.io.File
//   directory, so the browser can keep the copies in IndexedDB; store calls
//   are async, so every public method returns a Promise. Kotlin's
//   @Synchronized becomes a queue: calls run one at a time, in call order.
// - Kotlin writes through a ".tmp" file and a rename; a store's `write`
//   replaces a blob atomically by contract, so there is no temporary blob.
// - index.json keeps the order its entries were written in (Kotlin reads it
//   into a LinkedHashMap). JSON.parse would put numeric keys in numeric order,
//   so the key order is read from the text and the index is written by hand.

import { ktTrim } from '../util/kotlinText'

/** The folder a PadSoundCache keeps its files in. */
export interface PadSoundStore {
  /** The bytes of [name], or null when there is none. May reject on a read error. */
  read(name: string): Promise<Uint8Array | null>
  /** Replaces [name] with [bytes] as one step (never half written). Rejects when it can't. */
  write(name: string, bytes: Uint8Array): Promise<void>
  /** Removes [name], if there is one. */
  remove(name: string): Promise<void>
  /** Whether [name] exists (Kotlin `File.isFile`). */
  has(name: string): Promise<boolean>
  /** The size of [name] in bytes, 0 when there is none (Kotlin `File.length`). */
  size(name: string): Promise<number>
  /** Every name in the folder. */
  list(): Promise<string[]>
}

/** A PadSoundStore in memory: for tests, and when there is nowhere to keep copies. */
export function memoryPadSoundStore(): PadSoundStore & { readonly files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>()
  return {
    files,
    read: async (name) => files.get(name)?.slice() ?? null,
    write: async (name, bytes) => {
      files.set(name, bytes.slice())
    },
    remove: async (name) => {
      files.delete(name)
    },
    has: async (name) => files.has(name),
    size: async (name) => files.get(name)?.length ?? 0,
    list: async () => [...files.keys()],
  }
}

interface Entry {
  readonly name: string
  readonly size: number
  readonly usedAt: number
}

const INDEX = 'index.json'

const file = (slot: number): string => `s${slot}.wav`

export class PadSoundCache {
  private index: Map<number, Entry> | null = null
  // When copies were played changed since index.json was written.
  private dirty = false
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly store: PadSoundStore,
    private readonly capBytes: number = 256 * 1024 * 1024,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Names as the device lists them and as a backup keeps them may differ
   * in case, spacing or a ".wav" ending; those still count as the same.
   */
  static sameName(a: string, b: string): boolean {
    return norm(a) === norm(b)
  }

  /** Runs [fn] after every earlier call has finished (Kotlin @Synchronized). */
  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn)
    this.queue = run.catch(() => undefined)
    return run
  }

  private async entries(): Promise<Map<number, Entry>> {
    if (this.index === null) this.index = await this.load()
    return this.index
  }

  private async load(): Promise<Map<number, Entry>> {
    const out = new Map<number, Entry>()
    try {
      const bytes = await this.store.read(INDEX)
      if (bytes === null) throw new Error(`${INDEX} not found`)
      const text = new TextDecoder().decode(bytes)
      const o = JSON.parse(text) as unknown
      if (o === null || typeof o !== 'object' || Array.isArray(o)) throw new Error('index is not an object')
      const obj = o as Record<string, unknown>
      for (const k of topLevelKeys(text)) {
        const slot = toIntOrNull(k)
        if (slot === null) continue
        const e = obj[k]
        if (e === null || typeof e !== 'object' || Array.isArray(e)) continue
        const fields = e as Record<string, unknown>
        const name = contentOrNull(fields, 'name')
        if (name === null) continue
        const size = longOrNull(fields, 'size')
        if (size === null) continue
        const usedAt = longOrNull(fields, 'usedAt') ?? 0
        if (await this.store.has(file(slot))) out.set(slot, { name, size, usedAt })
      }
    } catch {
      // A missing or broken index reads as what was read of it so far.
    }
    return out
  }

  private async save(): Promise<void> {
    const parts: string[] = []
    for (const [slot, e] of await this.entries()) {
      parts.push(`${JSON.stringify(String(slot))}:${JSON.stringify({ name: e.name, size: e.size, usedAt: e.usedAt })}`)
    }
    await this.store.write(INDEX, new TextEncoder().encode(`{${parts.join(',')}}`))
    this.dirty = false
  }

  /** The WAV for a slot, when it was read with this [name]. */
  get(slot: number, name: string): Promise<Uint8Array | null> {
    return this.locked(async () => {
      const entries = await this.entries()
      const e = entries.get(slot)
      if (e === undefined) return null
      if (!PadSoundCache.sameName(e.name, name)) return null
      let bytes: Uint8Array | null
      try {
        bytes = await this.store.read(file(slot))
      } catch {
        bytes = null
      }
      if (bytes === null) return null
      // Noted now, written with the next change or flush: a play doesn't wait for a write.
      entries.set(slot, { ...e, usedAt: this.now() })
      this.dirty = true
      return bytes
    })
  }

  /** Writes when each copy was last played, if that changed. */
  flush(): Promise<void> {
    return this.locked(async () => {
      if (this.dirty) await this.save()
    })
  }

  /** Whether the copy of a slot is the device's current sound ([size] as the device lists it). */
  fresh(slot: number, name: string, size: number): Promise<boolean> {
    return this.locked(async () => {
      const e = (await this.entries()).get(slot)
      return e !== undefined && PadSoundCache.sameName(e.name, name) && e.size === size
    })
  }

  put(slot: number, name: string, size: number, wav: Uint8Array): Promise<void> {
    return this.locked(async () => {
      await this.store.write(file(slot), wav)
      ;(await this.entries()).set(slot, { name, size, usedAt: this.now() })
      await this.evict(slot)
      await this.save()
    })
  }

  /** The name each copy was read with, by slot: which device sounds Live can play without the device. */
  copies(): Promise<Map<number, string>> {
    return this.locked(async () => {
      const out = new Map<number, string>()
      for (const [slot, e] of await this.entries()) out.set(slot, e.name)
      return out
    })
  }

  /** Space used, in bytes. */
  bytes(): Promise<number> {
    return this.locked(() => this.total())
  }

  clear(): Promise<void> {
    return this.locked(async () => {
      for (const name of await this.store.list()) await this.store.remove(name)
      this.index = new Map()
    })
  }

  private async total(): Promise<number> {
    let sum = 0
    for (const slot of (await this.entries()).keys()) sum += await this.store.size(file(slot))
    return sum
  }

  private async evict(keep: number): Promise<void> {
    let total = await this.total()
    const entries = await this.entries()
    // Array.prototype.sort is stable, as Kotlin's sortedBy is.
    const oldestFirst = [...entries.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt)
    for (const [slot] of oldestFirst) {
      if (total <= this.capBytes) break
      if (slot === keep) continue
      total -= await this.store.size(file(slot))
      await this.store.remove(file(slot))
      entries.delete(slot)
    }
  }
}

function norm(s: string): string {
  const t = ktTrim(s).toLowerCase()
  return ktTrim(t.endsWith('.wav') ? t.slice(0, -4) : t)
}

/** Kotlin `String.toIntOrNull()`. */
function toIntOrNull(s: string): number | null {
  if (!/^[+-]?[0-9]+$/.test(s)) return null
  const n = Number(s)
  return n >= -2147483648 && n <= 2147483647 ? n : null
}

/**
 * kotlinx `jsonPrimitive.contentOrNull`: a string as is, a number or boolean
 * as written, null for JSON null or no field. An object or array is not a
 * primitive: that throws, as Kotlin's `jsonPrimitive` does.
 */
function contentOrNull(o: Record<string, unknown>, key: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(o, key)) return null
  const v = o[key]
  if (v === null) return null
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  throw new Error(`${key} is not a JSON primitive`)
}

/** kotlinx `jsonPrimitive.longOrNull`: the content read as a whole number, else null. */
function longOrNull(o: Record<string, unknown>, key: string): number | null {
  const c = contentOrNull(o, key)
  if (c === null || !/^[+-]?[0-9]+$/.test(c)) return null
  const n = Number(c)
  return Number.isSafeInteger(n) ? n : null
}

/** The keys of the top-level JSON object in [text], in the order written (first occurrence). */
function topLevelKeys(text: string): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  let depth = 0
  let expectKey = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      if (depth === 1 && expectKey) {
        const k = JSON.parse(text.slice(i, j + 1)) as string
        if (!seen.has(k)) {
          seen.add(k)
          keys.push(k)
        }
        expectKey = false
      }
      i = j
    } else if (c === '{' || c === '[') {
      depth++
      if (depth === 1 && c === '{') expectKey = true
    } else if (c === '}' || c === ']') {
      depth--
    } else if (c === ',' && depth === 1) {
      expectKey = true
    }
  }
  return keys
}
