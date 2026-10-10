// Port of core/src/test/kotlin/dev/arc/ep133/features/PadSoundsTest.kt
// (PadSoundCache over an in-memory PadSoundStore instead of a @TempDir).
import { describe, expect, it } from 'vitest'
import type { NameEntry } from '../../../src/core/features/librarySearch'
import { memoryPadSoundStore, PadSoundCache, type PadSoundStore } from '../../../src/core/features/padSoundCache'
import { PadSounds } from '../../../src/core/features/padSounds'
import { BackupDevice, type BackupRecord } from '../../../src/core/text/libraryRules'

const filled = (n: number, v = 0): Uint8Array => new Uint8Array(n).fill(v)

function setup() {
  const dir = memoryPadSoundStore()
  let clock = 0
  const cache = (cap = 1000): PadSoundCache => new PadSoundCache(dir, cap, () => ++clock)
  const text = (name: string): string => new TextDecoder().decode(dir.files.get(name))
  return { dir, cache, text }
}

const backup = (id: string, at: number): BackupRecord => ({
  id,
  title: id,
  notes: '',
  createdAt: at,
  source: 'device',
  fileName: null,
  device: BackupDevice(),
  soundCount: 0,
  projectCount: 0,
  projects: [],
  slots: [],
  projectSlots: {},
  size: 0,
})

describe('PadSoundCache', () => {
  it('a copy counts while the slot keeps its name, and survives a restart', async () => {
    const { cache } = setup()
    const c = cache()
    await c.put(5, 'kick', 100, filled(10, 1))
    expect(await c.get(5, 'kick')).toEqual(filled(10, 1))
    expect(await c.get(5, 'Kick.wav')).toEqual(filled(10, 1)) // same name, other spelling
    expect(await c.get(5, 'snare')).toBeNull() // the slot holds another sound now
    expect(await c.get(6, 'kick')).toBeNull()
    expect(await c.fresh(5, 'kick', 100)).toBe(true)
    expect(await c.fresh(5, 'kick', 120)).toBe(false) // replaced by a sound of the same name
    // A new cache on the same folder reads the index back.
    expect(await cache().get(5, 'kick')).toEqual(filled(10, 1))
    expect(await cache().bytes()).toBe(10)
  })

  it('past the cap the least recently played go first', async () => {
    const { cache } = setup()
    const c = cache(25)
    await c.put(1, 'a', 1, filled(10))
    await c.put(2, 'b', 1, filled(10))
    await c.get(1, 'a') // 1 is now newer than 2
    await c.put(3, 'c', 1, filled(10))
    expect(await c.get(2, 'b')).toBeNull()
    expect(await c.fresh(1, 'a', 1)).toBe(true)
    expect(await c.fresh(3, 'c', 1)).toBe(true)
    expect(await c.bytes()).toBe(20)
  })

  it('a play is noted in memory and written on flush, not on every play', async () => {
    const { cache, text } = setup()
    const c = cache(25)
    await c.put(1, 'a', 1, filled(10))
    await c.put(2, 'b', 1, filled(10))
    const written = text('index.json')
    await c.get(1, 'a')
    expect(text('index.json')).toBe(written)
    await c.flush()
    // After a restart, 1 is still the newer one: 2 goes first.
    const again = cache(25)
    await again.put(3, 'c', 1, filled(10))
    expect(await again.get(2, 'b')).toBeNull()
    expect(await again.fresh(1, 'a', 1)).toBe(true)
  })

  it('a broken index reads as empty, and clear empties it', async () => {
    const { dir, cache } = setup()
    dir.files.set('index.json', new TextEncoder().encode('not json'))
    const c = cache()
    expect(await c.get(1, 'a')).toBeNull()
    await c.put(1, 'a', 1, filled(3))
    await c.clear()
    expect(await c.get(1, 'a')).toBeNull()
    expect(await c.bytes()).toBe(0)
    expect(dir.files.size).toBe(0)
  })

  it("copies lists each copy's name by slot, after a restart too", async () => {
    const { cache } = setup()
    const c = cache()
    expect(await c.copies()).toEqual(new Map())
    await c.put(5, 'kick', 100, filled(10))
    await c.put(7, 'Snare.wav', 100, filled(10))
    expect(await c.copies()).toEqual(
      new Map([
        [5, 'kick'],
        [7, 'Snare.wav'],
      ]),
    )
    expect(await cache().copies()).toEqual(
      new Map([
        [5, 'kick'],
        [7, 'Snare.wav'],
      ]),
    )
    await c.clear()
    expect(await c.copies()).toEqual(new Map())
  })

  // Web cases.

  it('keeps the index in the order it was written, as Kotlin does', async () => {
    const { dir, cache, text } = setup()
    const c = cache()
    await c.put(9, 'i', 1, filled(1))
    await c.put(2, 'b', 1, filled(1))
    expect(text('index.json')).toBe('{"9":{"name":"i","size":1,"usedAt":1},"2":{"name":"b","size":1,"usedAt":2}}')
    // Equal play times: the first in the index goes first, after a restart too.
    dir.files.set('index.json', new TextEncoder().encode('{"9":{"name":"i","size":1,"usedAt":5},"2":{"name":"b","size":1,"usedAt":5}}'))
    const again = cache(2)
    await again.put(4, 'd', 1, filled(1))
    expect(await again.fresh(9, 'i', 1)).toBe(false)
    expect(await again.fresh(2, 'b', 1)).toBe(true)
  })

  it('an index entry without its file, or with bad fields, is skipped', async () => {
    const { dir, cache } = setup()
    dir.files.set('s1.wav', filled(4))
    dir.files.set('s3.wav', filled(4))
    dir.files.set('s4.wav', filled(4))
    dir.files.set(
      'index.json',
      new TextEncoder().encode('{"1":{"name":"a","size":4},"2":{"name":"b","size":4,"usedAt":1},"x":{},"3":{"size":4},"4":{"name":"d","size":"big"}}'),
    )
    const c = cache()
    expect(await c.fresh(1, 'a', 4)).toBe(true) // usedAt defaults to 0
    expect(await c.fresh(2, 'b', 4)).toBe(false) // no s2.wav
    expect(await c.fresh(3, '', 4)).toBe(false)
    expect(await c.fresh(4, 'd', 4)).toBe(false)
  })

  it('a copy that cannot be read counts as none, and calls run in order', async () => {
    const base = memoryPadSoundStore()
    const failing: PadSoundStore = { ...base, read: (n) => (n === 's1.wav' ? Promise.reject(new Error('gone')) : base.read(n)) }
    const c = new PadSoundCache(failing)
    const put = c.put(1, 'a', 1, filled(2))
    const fresh = c.fresh(1, 'a', 1) // queued behind the put
    expect(await fresh).toBe(true)
    await put
    expect(await c.get(1, 'a')).toBeNull()
  })
})

describe('PadSounds', () => {
  it('the newest backup with that sound in that slot', () => {
    const old = backup('old', 1)
    const neu = backup('new', 2)
    const other = backup('other', 3)
    const names: NameEntry[] = [
      { backupId: 'old', slot: 5, name: 'kick' },
      { backupId: 'new', slot: 5, name: 'KICK' },
      { backupId: 'other', slot: 5, name: 'snare' },
      { backupId: 'other', slot: 6, name: 'kick' },
    ]
    expect(PadSounds.newestBackupWith(5, 'kick', names, [old, neu, other])).toBe(neu)
    expect(PadSounds.newestBackupWith(7, 'kick', names, [old, neu, other])).toBeNull()
  })

  it("the sounds arc can't play without the device", () => {
    const names = new Map([
      [1, 'kick'],
      [2, 'snare'],
      [3, 'hat'],
      [4, '004.pcm'],
      [5, 'my take'],
    ])
    const copies = new Map([
      [1, 'KICK'],
      [2, 'old snare'],
    ])
    const entries: NameEntry[] = [
      { backupId: 'b', slot: 3, name: 'hat.wav' },
      { backupId: 'b', slot: 5, name: 'other take' },
      { backupId: 'c', slot: 2, name: 'clap' },
    ]
    // 1 has a copy, 3 a backup; 2's copy and 5's backup are other sounds now; 4 needs the pack.
    expect(PadSounds.unavailable(names, copies, entries, false)).toEqual(new Set([2, 4, 5]))
    expect(PadSounds.unavailable(names, copies, entries, true)).toEqual(new Set([2, 5]))
    expect(PadSounds.unavailable(new Map(), copies, entries, false)).toEqual(new Set())
  })

  it('names match ignoring case, spacing and a .wav ending', () => {
    expect(PadSoundCache.sameName(' Kick.WAV ', 'kick')).toBe(true)
    expect(PadSoundCache.sameName('kick .wav', 'kick')).toBe(true)
    expect(PadSoundCache.sameName('kick2', 'kick')).toBe(false)
  })
})
