// Port of core/src/test/kotlin/dev/arc/ep133/features/PadAssignTest.kt
//
// Live's EDIT: a pad's sound set with a METADATA SET of {"sym": slot} on its
// pad file (community notes). Kotlin's IllegalArgumentException is a RangeError.
import { describe, expect, it } from 'vitest'
import { LiveMirror, type PadTarget } from '../../../src/core/features/liveMirror'
import { physicalPad } from '../../../src/core/features/padNotes'
import { fid, node, PadOrder, topNumber } from '../../../src/core/features/padPush'
import { read as readPads } from '../../../src/core/features/projectPads'
import { UploadError, uploadToPad } from '../../../src/core/features/sampleUpload'
import { encodeWav } from '../../../src/core/formats/wav'
import { assignPad, padPatch, readProject } from '../../../src/core/protocol/device'
import { DeviceError } from '../../../src/core/protocol/errors'
import { Session } from '../../../src/core/protocol/session'
import { MirrorText } from '../../../src/core/text/mirrorText'
import { noise } from '../../helpers/bytes'
import { DemoData } from '../../helpers/demoData'
import type { MockEP133 } from '../../helpers/mockDevice'

async function connect(dev: MockEP133): Promise<Session> {
  const s = new Session(dev.transport())
  await s.handshake()
  return s
}

const target = (project: number, group: number, pad: number, slot: number | null): PadTarget => ({ project, group, pad, slot })
const padsOf = async (s: Session, project: number, group: string): Promise<Map<number, number | null> | undefined> =>
  readPads(await readProject(s, project)).find((g) => g.name === group)?.pads

describe('PadAssignTest', () => {
  it('pad file ids and the patch', () => {
    expect(node({ project: 1, group: 0, pad: 10 })).toBe(3210)
    expect(node({ project: 7, group: 3, pad: 2 })).toBe(9502)
    for (const id of [3201, 3312, 4405, 101512]) expect(node(fid(id)!)).toBe(id)
    expect(() => node({ project: 1, group: 4, pad: 1 })).toThrow(RangeError)
    expect(() => node({ project: 1, group: 0, pad: 13 })).toThrow(RangeError)
    expect(JSON.stringify(padPatch(140))).toBe('{"sym":140}')
    expect(() => padPatch(0)).toThrow(RangeError)
    expect(() => padPatch(1000)).toThrow(RangeError)
    // Counted from the top: 7 8 9 are 1 2 3 ... '.', 0, ENTER are 10, 11, 12.
    expect(Array.from({ length: 12 }, (_, i) => topNumber(i))).toEqual([10, 11, 12, 7, 8, 9, 4, 5, 6, 1, 2, 3])
  })

  it("assigning writes sym on the pad file, and the project's records follow", async () => {
    const dev = DemoData.device()
    const s = await connect(dev)
    // Project 1, group B, pad 2 (demo: slot 2 "snare").
    expect((await padsOf(s, 1, 'b'))?.get(2)).toBe(2)
    await assignPad(s, 1, 1, 2, 110)
    expect(dev.metaWrites[dev.metaWrites.length - 1]).toEqual([3302, '{"sym":110}'])
    expect((await padsOf(s, 1, 'b'))?.get(2)).toBe(110)
    // A pad with no record yet gets one.
    await assignPad(s, 1, 3, 12, 7)
    expect((await padsOf(s, 1, 'd'))?.get(12)).toBe(7)
    // No such project: the device refuses.
    await expect(assignPad(s, 9, 0, 1, 1)).rejects.toBeInstanceOf(DeviceError)
    s.close()
  })

  it('the mirror names the target, follows an assignment, and undo puts the old slot back', () => {
    const m = new LiveMirror(new Map([[9, 1]]))
    m.setProject(1, [{ name: 'a', pads: new Map([[1, 5], [10, 1]]) }])
    m.setNames(new Map([[1, 'kick'], [5, 'snare'], [140, 'vox chop']]))
    const seven = physicalPad(0, 9)
    const dot = physicalPad(0, 0)
    expect(m.target(seven)).toEqual(target(1, 0, 1, 5))
    // '.' isn't learned: from the top it is p10, kmorrill's numbering.
    expect(m.target(dot)).toEqual(target(1, 0, 10, 1))
    const before = m.target(seven)!
    m.assigned(before, 140)
    expect(m.nameOf(seven)).toBe('vox chop')
    expect(m.target(seven)).toEqual(target(1, 0, 1, 140))
    expect(m.saved(0).groups).toEqual([{ name: 'a', pads: new Map([[1, 140], [10, 1]]) }])
    // UNDO.
    m.assigned(before, before.slot)
    expect(m.nameOf(seven)).toBe('snare')
    // A new group gets a layout of its own.
    m.assigned(target(1, 2, 4, null), 5)
    expect(m.saved(0).groups.find((g) => g.name === 'c')?.pads).toEqual(new Map([[4, 5]]))
    // Another project now: an assignment for the old one is ignored.
    m.setProject(2, [])
    m.assigned(before, 1)
    expect(m.saved(0).groups).toEqual([])
    // Counted from the bottom, '.' is p01.
    m.setPadOrder(PadOrder.FROM_BOTTOM)
    expect(m.padNumber(dot)).toBe(1)
    expect(m.padNumber(seven)).toBe(10)
  })

  it("an unlearned pad whose top number another key has learned gets no target", () => {
    // The device numbers from the bottom: a press of '.' reported p01.
    const m = new LiveMirror(new Map([[0, 1]]))
    m.setProject(1, [{ name: 'a', pads: new Map([[1, 5], [2, 6]]) }])
    const dot = physicalPad(0, 0)
    const seven = physicalPad(0, 9)
    const eight = physicalPad(0, 10)
    expect(m.target(dot)).toEqual(target(1, 0, 1, 5))
    // '7' is p01 from the top, but p01 is '.': no write to the wrong pad.
    expect(m.padNumber(seven)).toBeNull()
    expect(m.target(seven)).toBeNull()
    // '8' (p02 from the top) isn't anyone's: the guess stands.
    expect(m.target(eight)).toEqual(target(1, 0, 2, 6))
    // Counted from the bottom, nothing is guessed from the top.
    m.setPadOrder(PadOrder.FROM_BOTTOM)
    expect(m.padNumber(seven)).toBe(10)
  })

  it('no target while the project is unknown or not read yet', () => {
    const m = new LiveMirror()
    expect(m.target(physicalPad(0, 0))).toBeNull()
    m.setProject(1, [{ name: 'a', pads: new Map([[1, 5]]) }])
    m.onPadPush({ project: 2, group: 0, pad: 1 }, 0)
    expect(m.target(physicalPad(0, 9))).toBeNull()
    m.setProject(2, [])
    expect(m.target(physicalPad(0, 9))).toEqual(target(2, 0, 1, null))
  })

  it('an upload goes into the first free slot, then onto the pad', async () => {
    const dev = DemoData.device()
    const s = await connect(dev)
    const wav = encodeWav(noise(2000 * 2), 1, 46875)
    // The caller's list is stale (empty here): the device's own list still keeps its sounds.
    const slot = await uploadToPad(s, 'vox take.wav', wav, new Set(), target(2, 0, 1, 4))
    // Demo slots are 1..8 and 108..111: 9 is the first free one.
    expect(slot).toBe(9)
    expect(dev.sounds.get(9)!.name).toBe('vox take')
    expect((await padsOf(s, 2, 'a'))?.get(1)).toBe(9)
    // The same stale list again: 9 is taken now, so the next upload goes to 10.
    expect(await uploadToPad(s, 'vox take 2.wav', wav, new Set(), target(2, 0, 2, null))).toBe(10)
    expect(dev.sounds.get(9)!.name).toBe('vox take')
    const full = new Set(Array.from({ length: 999 }, (_, i) => i + 1))
    const e = await uploadToPad(s, 'x.wav', wav, full, target(2, 0, 1, 9)).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(UploadError)
    expect((e as Error).message).toBe(MirrorText.NO_FREE_SLOT)
    s.close()
  })

  it('an upload into a picked slot needs it free on the device', async () => {
    const dev = DemoData.device()
    const s = await connect(dev)
    const wav = encodeWav(noise(2000 * 2), 1, 46875)
    expect(await uploadToPad(s, 'mic take.wav', wav, new Set(), target(2, 0, 1, 4), null, {}, 42)).toBe(42)
    expect(dev.sounds.get(42)!.name).toBe('mic take')
    expect((await padsOf(s, 2, 'a'))?.get(1)).toBe(42)
    // The caller's list is stale (empty here), but the device lists 5: nothing is written, the pad keeps its sound.
    const snare = dev.sounds.get(5)!.name
    const pads = readPads(await readProject(s, 2))
    const e = await uploadToPad(s, 'mic take 2.wav', wav, new Set(), target(2, 0, 2, null), null, {}, 5).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(UploadError)
    expect((e as Error).message).toBe('Slot 5 has a sound now. Pick another slot.')
    expect(dev.sounds.get(5)!.name).toBe(snare)
    // Taken in the caller's own list counts too.
    const e2 = await uploadToPad(s, 'mic take 2.wav', wav, new Set([50]), target(2, 0, 2, null), null, {}, 50).catch((x: unknown) => x)
    expect(e2).toBeInstanceOf(UploadError)
    expect(dev.sounds.get(50)).toBeUndefined()
    expect(readPads(await readProject(s, 2))).toEqual(pads)
    s.close()
  })
})
