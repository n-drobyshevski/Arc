// Port of app/src/main/kotlin/dev/arc/ep133/data/Takes.kt
//
// Live's takes (an addition): WAVs named after when they were made
// (`take-20261005-142301.wav`), newest first. A take's trim (TakeTrim) is
// kept with it, gone with it.
//
// Web deltas:
// - Android's files/takes folder becomes the library database's "takes"
//   store (db.ts, version 4): one row per take, holding its WAV as a Blob
//   with the frames and rate its header says, so listing needs no file read.
//   Kotlin's repair of a header cut off mid-take has no counterpart: a take
//   is only stored once whole (LiveAudio hands it over at its end).
// - The .trim file beside a take is the row's trim field, holding the same
//   text; DUP's copy is a new row with it.
// - The channels are read from the WAV's size and frames (Kotlin reads the
//   header, which here would be a read of the Blob); a take's size is its
//   Blob's.
// - The time stamp is the browser's local time, as SimpleDateFormat's is the
//   phone's.
// - keptWav is readKept, and null when there is no such take.

import { TakeTrim } from '../../core/features/takeTrim'
import { encodeWav } from '../../core/formats/wav'
import type { RecordedTake } from '../audio/liveAudio'
import { STORE, request, transact, type TakeRow } from './db'

/**
 * A take recorded in Live: its file name, when it was made, how long it is
 * (all of it), its size, its sound's shape, and the part its [trim] keeps.
 */
export interface TakeInfo {
  readonly name: string
  readonly createdAt: number
  readonly seconds: number
  readonly bytes: number
  readonly frames: number
  readonly rate: number
  readonly channels: number
  readonly trim: TakeTrim | null
  /** How long the part SHARE, SAVE and EP send is: the trim's, else all of it. */
  readonly keptSeconds: number
}

/** Where takes are kept. */
export interface TakeStore {
  /** The takes, newest first. */
  list(): Promise<TakeInfo[]>
  /** Keeps [take], made at [now] (ms), under a new name. */
  add(take: RecordedTake, now: number): Promise<TakeInfo>
  /** A take's WAV, or null when there is no such take. */
  read(name: string): Promise<Blob | null>
  /** Removes the take [name], its trim with it. */
  delete(name: string): Promise<void>
  /** Keeps [trim] with the take [name] (null: the whole take again). */
  setTrim(name: string, trim: TakeTrim | null): Promise<void>
  /** A copy of the take [name], made at [now] (so it is the newest), its trim with it. */
  duplicate(name: string, now: number): Promise<TakeInfo>
  /** The WAV SHARE, SAVE and EP send: the take's trimmed part, else the whole file; null when there is no such take. */
  readKept(t: TakeInfo): Promise<Uint8Array | null>
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

/** The channels of [r]'s WAV (its 44-byte header, then whole frames): 1 or 2, 2 when it can't tell. */
function channelsOf(r: Pick<TakeRow, 'frames' | 'wav'>): number {
  return r.frames > 0 ? Math.max(1, Math.round((r.wav.size - 44) / (2 * r.frames))) : 2
}

function infoOf(r: TakeRow): TakeInfo {
  const channels = channelsOf(r)
  // A trim that doesn't read is none.
  const trim = r.trim !== undefined ? TakeTrim.parse(r.trim, r.frames, r.rate) : null
  const seconds = r.frames / r.rate
  return {
    name: r.name,
    createdAt: r.createdAt,
    seconds,
    bytes: r.wav.size,
    frames: r.frames,
    rate: r.rate,
    channels,
    trim,
    keptSeconds: trim !== null && r.rate > 0 ? trim.frames / r.rate : seconds,
  }
}

/** Newest first, then by name (Takes.kt's order). */
function newestFirst(a: TakeInfo, b: TakeInfo): number {
  return b.createdAt - a.createdAt || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0)
}

/** [t]'s kept WAV from its whole one: the trimmed part with a header of its own, else all of it. */
async function keptOf(t: TakeInfo, wav: Blob): Promise<Uint8Array> {
  const trim = t.trim
  if (trim === null) return new Uint8Array(await wav.arrayBuffer())
  const block = 2 * t.channels
  const pcm = new Uint8Array(await wav.slice(44 + trim.start * block, 44 + trim.end * block).arrayBuffer())
  return encodeWav(pcm, t.channels, t.rate)
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

  private async row(name: string): Promise<TakeRow | undefined> {
    return (await transact(this.db, STORE.takes, 'readonly', (t) => request(t.objectStore(STORE.takes).get(name)))) as TakeRow | undefined
  }

  async read(name: string): Promise<Blob | null> {
    return (await this.row(name))?.wav ?? null
  }

  async delete(name: string): Promise<void> {
    await transact(this.db, STORE.takes, 'readwrite', (t) => {
      t.objectStore(STORE.takes).delete(name)
    })
  }

  async setTrim(name: string, trim: TakeTrim | null): Promise<void> {
    await transact(this.db, STORE.takes, 'readwrite', async (t) => {
      const store = t.objectStore(STORE.takes)
      const row = (await request(store.get(name))) as TakeRow | undefined
      if (row === undefined) throw new Error(`${name}: not found`)
      const { trim: _old, ...rest } = row
      await request(store.put(trim === null ? rest : { ...rest, trim: trim.text() }))
    })
  }

  async duplicate(name: string, now: number): Promise<TakeInfo> {
    return transact(this.db, STORE.takes, 'readwrite', async (t) => {
      const store = t.objectStore(STORE.takes)
      const from = (await request(store.get(name))) as TakeRow | undefined
      if (from === undefined) throw new Error(`${name}: not found`)
      const names = new Set((await request(store.getAllKeys())).map(String))
      const row: TakeRow = { ...from, name: newTakeName(now, (n) => names.has(n)), createdAt: now }
      await request(store.put(row))
      return infoOf(row)
    })
  }

  async readKept(t: TakeInfo): Promise<Uint8Array | null> {
    const wav = await this.read(t.name)
    return wav === null ? null : keptOf(t, wav)
  }
}

/** Takes kept for the page's life (no database, and tests). */
export function memoryTakeStore(): TakeStore & { readonly rows: Map<string, TakeRow> } {
  const rows = new Map<string, TakeRow>()
  const get = (name: string): TakeRow => {
    const row = rows.get(name)
    if (row === undefined) throw new Error(`${name}: not found`)
    return row
  }
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
    setTrim: async (name, trim) => {
      const { trim: _old, ...rest } = get(name)
      rows.set(name, trim === null ? rest : { ...rest, trim: trim.text() })
    },
    duplicate: async (name, now) => {
      const row: TakeRow = { ...get(name), name: newTakeName(now, (n) => rows.has(n)), createdAt: now }
      rows.set(row.name, row)
      return infoOf(row)
    },
    readKept: async (t) => {
      const wav = rows.get(t.name)?.wav
      return wav === undefined ? null : keptOf(t, wav)
    },
  }
}
