// Port of app/src/main/kotlin/dev/arc/ep133/data/Takes.kt
//
// Live's takes (an addition): WAVs named after when they were made
// (`take-20261005-142301.wav`), newest first.
//
// Web deltas:
// - Android's files/takes folder becomes the library database's "takes"
//   store (db.ts, version 4): one row per take, holding its WAV as a Blob
//   with the frames and rate its header says, so listing needs no file read.
//   Kotlin's repair of a header cut off mid-take has no counterpart: a take
//   is only stored once whole (LiveAudio hands it over at its end).
// - The time stamp is the browser's local time, as SimpleDateFormat's is the
//   phone's.

import type { RecordedTake } from '../audio/liveAudio'
import { STORE, request, transact, type TakeRow } from './db'

/** A take recorded in Live: its file name, when it was made and how long it is. */
export interface TakeInfo {
  readonly name: string
  readonly createdAt: number
  readonly seconds: number
  readonly bytes: number
}

/** Where takes are kept. */
export interface TakeStore {
  /** The takes, newest first. */
  list(): Promise<TakeInfo[]>
  /** Keeps [take], made at [now] (ms), under a new name. */
  add(take: RecordedTake, now: number): Promise<TakeInfo>
  /** A take's WAV, or null when there is no such take. */
  read(name: string): Promise<Blob | null>
  delete(name: string): Promise<void>
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

/** "take-20261005-142301" for [ms] in local time (Takes.kt's stamp, yyyyMMdd-HHmmss). */
export function takeBase(ms: number): string {
  const d = new Date(ms)
  return `take-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/** A name for a take made at [now] that [taken] doesn't have: base.wav, then base-2.wav, … */
export function newTakeName(now: number, taken: (name: string) => boolean): string {
  const base = takeBase(now)
  let name = `${base}.wav`
  for (let n = 2; taken(name); n++) name = `${base}-${n}.wav`
  return name
}

function infoOf(r: Pick<TakeRow, 'name' | 'createdAt' | 'frames' | 'rate'>): TakeInfo {
  return { name: r.name, createdAt: r.createdAt, seconds: r.frames / r.rate, bytes: 44 + r.frames * 4 }
}

/** Newest first, then by name (Takes.kt's order). */
function newestFirst(a: TakeInfo, b: TakeInfo): number {
  return b.createdAt - a.createdAt || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0)
}

/** Takes in the library database's "takes" store. */
export class IdbTakeStore implements TakeStore {
  constructor(private readonly db: IDBDatabase) {}

  async list(): Promise<TakeInfo[]> {
    const rows = (await transact(this.db, STORE.takes, 'readonly', (t) => request(t.objectStore(STORE.takes).getAll()))) as TakeRow[]
    return rows.filter((r) => r.frames > 0 && r.rate > 0).map(infoOf).sort(newestFirst)
  }

  async add(take: RecordedTake, now: number): Promise<TakeInfo> {
    return transact(this.db, STORE.takes, 'readwrite', async (t) => {
      const store = t.objectStore(STORE.takes)
      const names = new Set((await request(store.getAllKeys())).map(String))
      const row: TakeRow = { name: newTakeName(now, (n) => names.has(n)), createdAt: now, frames: take.frames, rate: take.rate, wav: take.wav }
      await request(store.put(row))
      return infoOf(row)
    })
  }

  async read(name: string): Promise<Blob | null> {
    const row = (await transact(this.db, STORE.takes, 'readonly', (t) => request(t.objectStore(STORE.takes).get(name)))) as TakeRow | undefined
    return row?.wav ?? null
  }

  async delete(name: string): Promise<void> {
    await transact(this.db, STORE.takes, 'readwrite', (t) => {
      t.objectStore(STORE.takes).delete(name)
    })
  }
}

/** Takes kept for the page's life (no database, and tests). */
export function memoryTakeStore(): TakeStore & { readonly rows: Map<string, TakeRow> } {
  const rows = new Map<string, TakeRow>()
  return {
    rows,
    list: () => Promise.resolve([...rows.values()].map(infoOf).sort(newestFirst)),
    add: (take, now) => {
      const row: TakeRow = { name: newTakeName(now, (n) => rows.has(n)), createdAt: now, frames: take.frames, rate: take.rate, wav: take.wav }
      rows.set(row.name, row)
      return Promise.resolve(infoOf(row))
    },
    read: (name) => Promise.resolve(rows.get(name)?.wav ?? null),
    delete: (name) => {
      rows.delete(name)
      return Promise.resolve()
    },
  }
}
