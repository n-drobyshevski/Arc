// Port of app/src/main/kotlin/dev/arc/ep133/data/SampleFiles.kt
//
// SAMPLE's recordings (an addition): each take kept on a pad, or waiting on
// the review sheet, as a WAV of its own (smp-yyyyMMdd-HHmmss.wav), until it is
// on the EP-133 or let go of. What is left from before a start (the page
// closed on a take waiting for KEEP) goes to Takes, never lost ([strays]).
//
// Web deltas: Android's files/samples folder becomes the library database's
// "samples" store (db.ts, version 5); [MemorySampleStore] is the tests' and
// ?demo's.

import { STORE, request, transact, type SampleRow } from './db'

const two = (n: number): string => String(n).padStart(2, '0')

/** "smp-20261011-174501" for [ms] in local time (SampleFiles' stamp). */
export function sampleBase(ms: number): string {
  const d = new Date(ms)
  return `smp-${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`
}

/** A name for a recording made at [now] that [taken] doesn't have: base.wav, then base-2.wav, … */
export function newSampleName(now: number, taken: (name: string) => boolean): string {
  const base = sampleBase(now)
  let name = `${base}.wav`
  for (let n = 2; taken(name); n++) name = `${base}-${n}.wav`
  return name
}

/** Where SAMPLE's recordings are kept. */
export interface SampleStore {
  /** Keeps [wav], made at [now] (ms), under a new name; returns it. */
  write(now: number, wav: Uint8Array): Promise<string>
  /** A recording's WAV, or null when there is none of that name. */
  read(name: string): Promise<Uint8Array | null>
  delete(name: string): Promise<void>
  /** The recordings written before [before] (ms) that [referenced] doesn't name: left from an earlier start. */
  strays(referenced: ReadonlySet<string>, before: number): Promise<string[]>
}

/** Recordings in the library database's "samples" store. */
export class IdbSampleStore implements SampleStore {
  constructor(private readonly db: IDBDatabase) {}

  write(now: number, wav: Uint8Array): Promise<string> {
    return transact(this.db, STORE.samples, 'readwrite', async (t) => {
      const store = t.objectStore(STORE.samples)
      const names = new Set((await request(store.getAllKeys())).map(String))
      const row: SampleRow = { name: newSampleName(now, (n) => names.has(n)), createdAt: now, wav }
      await request(store.put(row))
      return row.name
    })
  }

  async read(name: string): Promise<Uint8Array | null> {
    const row = (await transact(this.db, STORE.samples, 'readonly', (t) => request(t.objectStore(STORE.samples).get(name)))) as SampleRow | undefined
    return row?.wav ?? null
  }

  async delete(name: string): Promise<void> {
    await transact(this.db, STORE.samples, 'readwrite', (t) => request(t.objectStore(STORE.samples).delete(name)))
  }

  async strays(referenced: ReadonlySet<string>, before: number): Promise<string[]> {
    const rows = (await transact(this.db, STORE.samples, 'readonly', (t) => request(t.objectStore(STORE.samples).getAll()))) as SampleRow[]
    return rows.filter((r) => r.createdAt < before && !referenced.has(r.name)).map((r) => r.name)
  }
}

/** Recordings in memory (tests, ?demo). */
export class MemorySampleStore implements SampleStore {
  readonly rows = new Map<string, SampleRow>()

  async write(now: number, wav: Uint8Array): Promise<string> {
    const name = newSampleName(now, (n) => this.rows.has(n))
    this.rows.set(name, { name, createdAt: now, wav })
    return name
  }

  async read(name: string): Promise<Uint8Array | null> {
    return this.rows.get(name)?.wav ?? null
  }

  async delete(name: string): Promise<void> {
    this.rows.delete(name)
  }

  async strays(referenced: ReadonlySet<string>, before: number): Promise<string[]> {
    return [...this.rows.values()].filter((r) => r.createdAt < before && !referenced.has(r.name)).map((r) => r.name)
  }
}
