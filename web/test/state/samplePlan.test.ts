// Port of app/src/test/kotlin/dev/arc/ep133/controller/SampleKeepTest.kt
//
// SAMPLE's controller rules: where a take goes, the inputs offered, the
// longest take, and what the review keeps (trim, Trim silence, Normalize,
// the slot).
//
// Web deltas: padTargetOrWhy is the controller's editTarget here (its
// cases are in the controller's tests); offlineAssign is the controller's
// assignOffline, so [offlineAssign] below is its rule (the read's own device
// sound back drops the change, any other is put).

import { describe, expect, it } from 'vitest'
import { LiveMirror } from '../../src/core/features/liveMirror'
import type { PadTarget } from '../../src/core/features/liveMirror'
import { OfflinePads, SoundSource, type OfflinePad } from '../../src/core/features/offlinePads'
import { physicalPad } from '../../src/core/features/padNotes'
import { SampleCapture } from '../../src/core/features/sampleCapture'
import type { LiveSnapshot } from '../../src/core/features/liveSnapshot'
import { MirrorText } from '../../src/core/text/mirrorText'
import {
  latchAfterTake,
  physicalPadOf,
  pickSampleInput,
  recordingsLetGo,
  reviewedPcm,
  sampleInputs,
  sampleMaxFrames,
  samplePress,
  sampleReviewOf,
  slotsTaken,
  stepFreeSlot,
  trimReview,
  withTrimSilence,
  withoutRecordingsOn,
} from '../../src/state/samplePlan'

const rsp = { source: 'rsp', stereo: false } as const

// Pad '7' of group A is pad 1 in the project file, counted from the top before any press.
const seven = physicalPad(0, 9)

function snapshot(project: number | null): LiveSnapshot {
  return { savedAt: 1, activeProject: project, groups: [{ name: 'a', pads: new Map([[1, 5]]) }], names: new Map([[5, 'kick']]) }
}

function mirror(project: number | null = 1, learned: Map<number, number> = new Map()): LiveMirror {
  const m = new LiveMirror(learned)
  m.load(snapshot(project))
  return m
}

function review(
  pcm: Int16Array,
  { channels = 1, rate = 1000, trimSilence = false, normalize = false, occupied = new Set([1, 2, 4]) as ReadonlySet<number> | null } = {},
) {
  return sampleReviewOf(seven, rsp, pcm, channels, rate, SampleCapture.End.STOPPED, false, 'rsp 1007-142301', normalize, trimSilence, occupied, 4)
}

const ramp = (n: number, from: number): Int16Array => Int16Array.from({ length: n }, (_, i) => (i >= from ? 10000 : 0))

function offlineAssign(pads: OfflinePads, t: PadTarget, slot: number, name: string, source: SoundSource, readSlot: number | null): OfflinePads {
  return source === SoundSource.DEVICE && slot === readSlot
    ? OfflinePads.drop(pads, t.project, t.group, t.pad)
    : OfflinePads.put(pads, { project: t.project, group: t.group, pad: t.pad, slot, name, source })
}

describe('SampleKeep', () => {
  it('a pad the device numbers otherwise: the physical pad a pad number belongs to, for an upload\'s progress', () => {
    // '8' was learned as pad 1: '7''s guess, pad 1, now belongs to another key.
    const m = mirror(1, new Map([[10, 1]]))
    expect(physicalPadOf(m, 0, 1)).toEqual(physicalPad(0, 10))
    expect(physicalPadOf(mirror(), 0, 1)).toEqual(seven)
    expect(physicalPadOf(m, 0, 13)).toBeNull()
  })

  it('the inputs offered follow the mic, its stereo and USB, RSP always', () => {
    const ids = (l: readonly { source: Parameters<typeof MirrorText.sourceShort>[0]; stereo: boolean }[]) => l.map((i) => MirrorText.sourceShort(i.source, i.stereo))
    expect(ids(sampleInputs(true, true, true, true))).toEqual(['Mic', 'Mic St', 'Rsp', 'Rsp St', 'Usb', 'Usb St'])
    expect(ids(sampleInputs(true, false, false, true))).toEqual(['Mic', 'Rsp', 'Rsp St'])
    // No mic permission: RSP only.
    expect(ids(sampleInputs(false, true, false, false))).toEqual(['Rsp', 'Rsp St'])
    expect(ids(sampleInputs(false, false, true, false))).toEqual(['Rsp', 'Rsp St', 'Usb'])
    // The input chosen when offered, else RSP in the same mono or stereo.
    const inputs = sampleInputs(false, false, false, false)
    expect(pickSampleInput({ source: 'mic', stereo: true }, inputs)).toEqual({ source: 'rsp', stereo: true })
    expect(pickSampleInput({ source: 'rsp', stereo: true }, inputs)).toEqual({ source: 'rsp', stereo: true })
  })

  it("the longest take is the device's limit, less when its space is short", () => {
    expect(sampleMaxFrames(false, 48000, null)).toBe(40 * 48000)
    expect(sampleMaxFrames(true, 48000, 1e9)).toBe(20 * 48000)
    // 93750 bytes free: a second of mono at 46875 Hz, so 48000 frames at 48 kHz.
    expect(sampleMaxFrames(false, 48000, 93750)).toBe(48000)
    expect(sampleMaxFrames(true, 48000, 0)).toBe(0)
  })

  it('a review keeps the whole take, or from where the sound starts with Trim silence', () => {
    // 30 silent frames, then sound: the sound starts at 30, less 20 ms (20 frames at 1000 Hz).
    const pcm = ramp(100, 30)
    const r = review(pcm)
    expect(r.frames).toBe(100)
    expect(r.start).toBe(0)
    expect(r.length).toBe(100)
    expect(r.silenceAt).toBe(10)
    expect(r.peaks.length).toBe(4)
    const t = review(pcm, { trimSilence: true })
    expect(t.start).toBe(10)
    expect(t.length).toBe(90)
    expect(t.trimSilence).toBe(true)
    // All silent: nothing to trim to.
    expect(review(new Int16Array(50), { trimSilence: true }).silenceAt).toBeNull()
    expect(review(new Int16Array(50), { trimSilence: true }).start).toBe(0)
  })

  it('connected the slot is the next free one, offline it is picked on upload', () => {
    const r = review(new Int16Array(10))
    expect(r.slot).toBe(3)
    expect(r.nextFree).toBe(3)
    expect(r.offline).toBe(false)
    const off = review(new Int16Array(10), { occupied: null })
    expect(off.slot).toBeNull()
    expect(off.offline).toBe(true)
  })

  it("the review's trim stays inside the take and keeps a frame at least", () => {
    const r = review(ramp(100, 30))
    const at = (x: { start: number; length: number }) => [x.start, x.length]
    expect(at(trimReview(r, 20, 30))).toEqual([20, 30])
    expect(at(trimReview(r, 500, 30))).toEqual([99, 1])
    expect(at(trimReview(r, -5, 0))).toEqual([0, 1])
    expect(at(trimReview(r, 40, 1000))).toEqual([40, 60])
    // Moved off where the sound starts, Trim silence is off.
    const t = withTrimSilence(r, true)
    expect(trimReview(t, 10, 50).trimSilence).toBe(true)
    expect(trimReview(t, 12, 50).trimSilence).toBe(false)
  })

  it('Trim silence moves the start, its end left where it was', () => {
    const r = trimReview(review(ramp(100, 30)), 0, 80)
    const on = withTrimSilence(r, true)
    expect([on.start, on.length]).toEqual([10, 70])
    expect(on.trimSilence).toBe(true)
    const off = withTrimSilence(on, false)
    expect([off.start, off.length]).toEqual([0, 80])
    expect(off.trimSilence).toBe(false)
  })

  it('KEEP puts the part kept on the pad, normalized when asked', () => {
    const pcm = Int16Array.from([0, 100, -200, 400, 1000, -16384, 0, 0])
    const r = trimReview(review(pcm), 2, 4)
    expect([...reviewedPcm(r)]).toEqual([-200, 400, 1000, -16384])
    // The loudest sample of the part, -16384, to full scale: twice as loud (32767 / 16384), rounded half up.
    expect([...reviewedPcm({ ...r, normalize: true })]).toEqual([-400, 800, 2000, -32767])
    // Stereo frames are cut whole.
    const st = trimReview(review(Int16Array.from([1, 2, 3, 4, 5, 6]), { channels: 2 }), 1, 1)
    expect([...reviewedPcm(st)]).toEqual([3, 4])
  })

  it('the slot steps over the slots in use and stays at either end', () => {
    const used = new Set([1, 2, 4, 998])
    expect(stepFreeSlot(used, null, 1)).toBe(3)
    expect(stepFreeSlot(used, 3, 1)).toBe(5)
    expect(stepFreeSlot(used, 3, 2)).toBe(6)
    expect(stepFreeSlot(used, 5, -1)).toBe(3)
    // Nothing free below 3, nor above 999.
    expect(stepFreeSlot(used, 3, -1)).toBe(3)
    expect(stepFreeSlot(used, 997, 1)).toBe(999)
    expect(stepFreeSlot(used, 999, 1)).toBe(999)
    expect(stepFreeSlot(new Set(Array.from({ length: 999 }, (_, i) => i + 1)), null, 1)).toBeNull()
  })

  it('a recorded pad change plays from its file and names the take', () => {
    // The offline mirror plays a recording from its file, under its name, with no slot to show.
    const rec: OfflinePad = { project: 1, group: 0, pad: 1, slot: 0, name: 'mic 1007-142301', source: SoundSource.RECORDED, file: 'smp-20261007-142301.wav' }
    const m = mirror()
    m.setLocal({ list: [rec] })
    expect(m.sampleOf(seven)?.file).toBe('smp-20261007-142301.wav')
    expect(m.nameOf(seven)).toBe('mic 1007-142301')
    expect(m.slotOf(seven)).toBeNull()
    expect(m.target(seven)).toEqual({ project: 1, group: 0, pad: 1, slot: null })
  })

  it('a recording let go of on its pad goes to Takes, unless it is going up', () => {
    const t: PadTarget = { project: 1, group: 0, pad: 1, slot: 5 }
    const rec: OfflinePad = { project: 1, group: 0, pad: 1, slot: 0, name: 'mic 1007-142301', source: SoundSource.RECORDED, file: 'smp-a.wav' }
    const snare: OfflinePad = { project: 1, group: 0, pad: 2, slot: 7, name: 'snare', source: SoundSource.DEVICE }
    const before: OfflinePads = { list: [rec, snare] }
    // Another sound picked for its pad offline.
    const picked = offlineAssign(before, t, 9, 'hat', SoundSource.DEVICE, 5)
    expect(recordingsLetGo(before, picked, new Set())).toEqual([rec])
    // The device's own sound picked again: the pad's change, the recording, is dropped.
    const back = offlineAssign(before, t, 5, 'kick', SoundSource.DEVICE, 5)
    expect(recordingsLetGo(before, back, new Set())).toEqual([rec])
    // A newer take kept on it; one going up now is left to its upload.
    const newer = OfflinePads.put(before, { ...rec, file: 'smp-b.wav' })
    expect(recordingsLetGo(before, newer, new Set())).toEqual([rec])
    expect(recordingsLetGo(before, newer, new Set(['smp-a.wav']))).toEqual([])
    // Another pad changed: the recording stays where it is.
    const other = offlineAssign(before, { project: 1, group: 0, pad: 2, slot: 7 }, 9, 'hat', SoundSource.DEVICE, 7)
    expect(recordingsLetGo(before, other, new Set())).toEqual([])
  })

  it('a sound written on a pad while connected takes the recordings waiting there off it', () => {
    const t: PadTarget = { project: 1, group: 0, pad: 1, slot: 5 }
    const rec: OfflinePad = { project: 1, group: 0, pad: 1, slot: 0, name: 'mic 1007-142301', source: SoundSource.RECORDED, file: 'smp-a.wav' }
    const snare: OfflinePad = { project: 1, group: 0, pad: 2, slot: 7, name: 'snare', source: SoundSource.DEVICE }
    const otherRec: OfflinePad = { project: 1, group: 0, pad: 2, slot: 0, name: 'mic 1007-142302', source: SoundSource.RECORDED, file: 'smp-b.wav' }
    const pads: OfflinePads = { list: [rec, snare, otherRec] }
    // Queued (or failed): it would overwrite the sound just written when its turn came.
    expect(withoutRecordingsOn(pads, t, new Set()).list).toEqual([snare, otherRec])
    // Going up now: left to its upload.
    expect(withoutRecordingsOn(pads, t, new Set(['smp-a.wav'])).list).toEqual(pads.list)
    // Another project's pad of the same number keeps its recording.
    expect(withoutRecordingsOn(pads, { ...t, project: 2 }, new Set()).list).toEqual(pads.list)
  })

  it('a review counts the slots the recordings kept and not up yet go into as in use', () => {
    // A kept with slot 6 and waiting: B's review steps over it, and its next free one is not 6.
    const taken = slotsTaken(new Set([1, 2, 4]), [6, null])
    expect(taken).toEqual(new Set([1, 2, 4, 6]))
    expect(stepFreeSlot(taken, 3, 1)).toBe(5)
    expect(stepFreeSlot(taken, 5, 1)).toBe(7)
    expect(review(Int16Array.from([1]), { occupied: slotsTaken(new Set([1, 2, 3, 4, 5]), [6]) }).nextFree).toBe(7)
  })

  it("a tap on the hands-free take's pad stops it, an unsure one once kept", () => {
    const other = physicalPad(0, 3)
    const press = ({ pad = seven, held = null as typeof seven | null, latched = seven as typeof seven | null, handsFree = true, going = true, latch = true, unsure = false } = {}) =>
      samplePress(pad, held, latched, handsFree, going, latch, unsure)
    expect(press()).toBe('STOP')
    // On the scrolling page a scroll that starts on the pad must not stop it.
    expect(press({ unsure: true })).toBe('STOP_WHEN_KEPT')
    // Another pad plays beside the take, as ever.
    expect(press({ pad: other })).toBe('PLAY')
    // Its count-in or wait over with nothing (the take ended): the pad latches again.
    expect(press({ handsFree: false, going: false })).toBe('LATCH')
    expect(press({ handsFree: false, going: false, unsure: true })).toBe('LATCH_WHEN_KEPT')
    // A held take going on: its pad isn't a hands-free one, another pad plays.
    expect(press({ held: other, latched: null, handsFree: false })).toBe('PLAY')
    // LATCH off and nothing going: held to record.
    expect(press({ latched: null, handsFree: false, going: false, latch: false })).toBe('HOLD')
  })

  it('a take coming in lets go of its latch, unless the pad was latched anew as it ended', () => {
    const other = physicalPad(0, 3)
    expect(latchAfterTake(seven, seven, false)).toBeNull()
    // Tapped again on the downbeat as its bars ran out: the new take keeps its latch.
    expect(latchAfterTake(seven, seven, true)).toEqual(seven)
    // Another pad's latch is left alone.
    expect(latchAfterTake(other, seven, false)).toEqual(other)
    expect(latchAfterTake(null, seven, false)).toBeNull()
  })
})
