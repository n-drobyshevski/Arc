// Port of Takes.kt's behaviour (app/src/main/kotlin/dev/arc/ep133/data/Takes.kt) on IndexedDB v4 ("takes").
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { openArcDb } from '../../../src/platform/storage/db'
import { IdbTakeStore, memoryTakeStore, newTakeName, takeBase, type TakeStore } from '../../../src/platform/storage/takeStore'
import type { RecordedTake } from '../../../src/platform/audio/liveAudio'

let n = 0
const fresh = (): string => `arc-takes-${++n}-${Math.random().toString(36).slice(2)}`
const take = (frames: number, rate = 48000): RecordedTake => ({ wav: new Blob([new Uint8Array(44 + frames * 4)]), frames, rate, seconds: frames / rate })
// 5 Oct 2026 14:23:01 local time.
const AT = new Date(2026, 9, 5, 14, 23, 1).getTime()

describe('take names', () => {
  it('are made from local time, as Takes.kt stamps them', () => {
    expect(takeBase(AT)).toBe('take-20261005-142301')
    expect(newTakeName(AT, () => false)).toBe('take-20261005-142301.wav')
  })
  it('get -2, -3 when the second is taken', () => {
    const taken = new Set(['take-20261005-142301.wav', 'take-20261005-142301-2.wav'])
    expect(newTakeName(AT, (x) => taken.has(x))).toBe('take-20261005-142301-3.wav')
  })
})

const stores: [string, () => Promise<TakeStore>][] = [
  ['IdbTakeStore', async () => new IdbTakeStore(await openArcDb({ name: fresh() }))],
  ['memoryTakeStore', () => Promise.resolve(memoryTakeStore())],
]

describe.each(stores)('%s', (_, make) => {
  it('adds, lists newest first, reads and deletes', async () => {
    const s = await make()
    expect(await s.list()).toEqual([])
    const a = await s.add(take(48000), AT)
    expect(a).toEqual({ name: 'take-20261005-142301.wav', createdAt: AT, seconds: 1, bytes: 44 + 48000 * 4 })
    const b = await s.add(take(24000), AT + 60_000)
    const c = await s.add(take(4800), AT + 60_000)
    expect(c.name).toBe('take-20261005-142401-2.wav')
    // Same second: by name, descending, as Kotlin's thenByDescending puts them.
    expect((await s.list()).map((t) => t.name)).toEqual([b.name, c.name, a.name])
    const wav = await s.read(a.name)
    expect(wav?.size).toBe(44 + 48000 * 4)
    await s.delete(a.name)
    expect(await s.read(a.name)).toBeNull()
    expect((await s.list()).map((t) => t.name)).toEqual([b.name, c.name])
  })
})
