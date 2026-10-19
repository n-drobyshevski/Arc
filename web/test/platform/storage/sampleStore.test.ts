// Port of the synth parts of app/src/test/kotlin/dev/arc/ep133/data/SampleFilesTest.kt, on both sample stores.
// Web deltas: a row is written whole (one IndexedDB put), so there is no .tmp file and no
// "a synth write cut short leaves a tmp file the sweep at start finds"; a row's createdAt is the file's lastModified.
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { openArcDb } from '../../../src/platform/storage/db'
import { IdbSampleStore, MemorySampleStore, isSynth, type SampleStore } from '../../../src/platform/storage/sampleStore'

let n = 0
const fresh = (): string => `arc-samples-${++n}-${Math.random().toString(36).slice(2)}`

describe('sample names', () => {
  it("a synth file is told by its name, never a recording's", () => {
    expect(isSynth('syn-0a1b2c3d-1-0-9.wav')).toBe(true)
    expect(isSynth('../x/syn-0a1b2c3d-1-0-9.wav')).toBe(true)
    expect(isSynth('smp-20261007-142301.wav')).toBe(false)
    expect(isSynth('syn/smp-1.wav')).toBe(false)
  })
})

const stores: [string, () => Promise<SampleStore>][] = [
  ['IdbSampleStore', async () => new IdbSampleStore(await openArcDb({ name: fresh() }))],
  ['MemorySampleStore', () => Promise.resolve(new MemorySampleStore())],
]

describe.each(stores)('%s', (_, make) => {
  it("a synth sound is written once under its name, and a name that isn't a synth's is refused", async () => {
    const files = await make()
    const name = 'syn-0a1b2c3d-1-0-9.wav'
    await files.writeSynth(name, new Uint8Array([1, 2, 3]), 1_000)
    expect(await files.read(name)).toEqual(new Uint8Array([1, 2, 3]))
    // The same name and size: the row there is used as it is (and keeps its time).
    await files.writeSynth(name, new Uint8Array([9, 9, 9]), 5_000)
    expect(await files.read(name)).toEqual(new Uint8Array([1, 2, 3]))
    expect(await files.synthStrays(new Set(), 2_000)).toEqual([name])
    // Another size: written again.
    await files.writeSynth(name, new Uint8Array([4, 5]), 6_000)
    expect(await files.read(name)).toEqual(new Uint8Array([4, 5]))
    await expect(files.writeSynth('smp-1.wav', new Uint8Array([1]), 0)).rejects.toThrow(RangeError)
    await expect(files.writeSynth('syn-1.txt', new Uint8Array([1]), 0)).rejects.toThrow(RangeError)
  })

  it('synth files no pad change names are synth strays, and never recording strays', async () => {
    const files = await make()
    const kept = 'syn-00000001-1-0-9.wav'
    const left = 'syn-00000002-1-0-9.wav'
    await files.writeSynth(kept, new Uint8Array(1), 1_000)
    await files.writeSynth(left, new Uint8Array(1), 1_000)
    const recording = await files.write(1_000, new Uint8Array(1))
    expect(await files.synthStrays(new Set([kept]), 2_000)).toEqual([left])
    expect(await files.synthStrays(new Set(), Number.MAX_SAFE_INTEGER)).toEqual([kept, left])
    expect(await files.synthStrays(new Set(), 500)).toEqual([])
    // A recording is never a synth stray, and a synth file never a recording's.
    expect(await files.strays(new Set(), 2_000)).toEqual([recording])
  })
})
