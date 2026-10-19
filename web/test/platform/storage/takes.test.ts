// Port of Takes.kt's behaviour (app/src/main/kotlin/dev/arc/ep133/data/Takes.kt) on IndexedDB v4 ("takes"),
// and of app/src/test/kotlin/dev/arc/ep133/data/TakesTest.kt (trims and duplicates), for both stores.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { TakeTrim } from '../../../src/core/features/takeTrim'
import { decodeWav, encodeWav } from '../../../src/core/formats/wav'
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
    expect(a).toEqual({
      name: 'take-20261005-142301.wav',
      createdAt: AT,
      seconds: 1,
      bytes: 44 + 48000 * 4,
      frames: 48000,
      rate: 48000,
      channels: 2,
      trim: null,
      keptSeconds: 1,
    })
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

  // One second of stereo at 8 kHz, each frame's samples its own number (and its negative).
  const counted = (): { take: RecordedTake; wav: Uint8Array } => {
    const pcm = new Uint8Array(8_000 * 4)
    const dv = new DataView(pcm.buffer)
    for (let f = 0; f < 8_000; f++) {
      dv.setInt16(f * 4, f, true)
      dv.setInt16(f * 4 + 2, -f, true)
    }
    const wav = encodeWav(pcm, 2, 8_000)
    return { take: { wav: new Blob([wav as BlobPart]), frames: 8_000, rate: 8_000, seconds: 1 }, wav }
  }

  it('a trim is kept beside the take and sends only its part', async () => {
    const s = await make()
    const { take: tk, wav } = counted()
    const f = await s.add(tk, 1_000_000)
    const whole = (await s.list())[0]!
    expect(whole.frames).toBe(8_000)
    expect(whole.trim).toBeNull()
    expect(await s.readKept(whole)).toEqual(wav)

    await s.setTrim(f.name, new TakeTrim(2_000, 6_000))
    const t = (await s.list())[0]!
    expect(t.trim).toEqual(new TakeTrim(2_000, 6_000))
    expect(t.keptSeconds).toBe(0.5)
    const part = decodeWav((await s.readKept(t))!)
    expect(part.pcm.length).toBe(4_000 * 4)
    expect(part.pcm[0]! | (part.pcm[1]! << 8)).toBe(2_000)

    await s.setTrim(f.name, null)
    expect((await s.list())[0]!.trim).toBeNull()
  })

  it('a duplicate is the newest, its trim with it, and a delete takes the trim away', async () => {
    const s = await make()
    const f = await s.add(counted().take, 1_000_000)
    await s.setTrim(f.name, new TakeTrim(100, 900))
    const copy = await s.duplicate(f.name, 2_000_000_000)
    const list = await s.list()
    expect(list.map((t) => t.name)).toEqual([copy.name, f.name])
    expect(list[0]!.trim).toEqual(new TakeTrim(100, 900))
    await s.delete(f.name)
    expect((await s.list()).map((t) => t.name)).toEqual([copy.name])
    // Web: the trim went with its row; the copy keeps its own.
    expect((await s.list())[0]!.trim).toEqual(new TakeTrim(100, 900))
  })

  it("a mono take (SAMPLE's recording moved in) is read as one channel, and its part sent as one (web: from its size)", async () => {
    const s = await make()
    const wav = encodeWav(new Uint8Array(8_000 * 2), 1, 8_000)
    const f = await s.add({ wav: new Blob([wav as BlobPart]), frames: 8_000, rate: 8_000, seconds: 1 }, AT)
    expect(f).toMatchObject({ channels: 1, bytes: 44 + 8_000 * 2 })
    await s.setTrim(f.name, new TakeTrim(0, 4_000))
    const part = decodeWav((await s.readKept((await s.list())[0]!))!)
    expect([part.channels, part.pcm.length]).toEqual([1, 4_000 * 2])
  })
})
