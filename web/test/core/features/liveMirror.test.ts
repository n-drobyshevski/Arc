// Port of core/src/test/kotlin/dev/arc/ep133/features/LiveMirrorTest.kt
//
// Kotlin times are nanoseconds; the web mirror runs on milliseconds, so every
// Kotlin value is converted exactly: `ms` (1_000_000 ns) is 1, a raw ns value
// n is ns(n) = n / 1e6, and LiveMirror.X_NS is X_MS.
//
// Not here:
// - The three "MIDI input" cases are already ported in
//   test/core/protocol/midiParts.test.ts ("LiveMirrorTest: MIDI input").
import { describe, expect, it } from 'vitest'
import { LiveMirror, type PadFid } from '../../../src/core/features/liveMirror'
import { LiveSnapshot } from '../../../src/core/features/liveSnapshot'
import { LABELS, note, noteName, pad, padKey, physicalPad, ROWS } from '../../../src/core/features/padNotes'
import type { PadGroup } from '../../../src/core/features/projectPads'
import type { MidiEvent } from '../../../src/core/protocol/midiInput'
import { MirrorText } from '../../../src/core/text/mirrorText'

const ms = 1
const ns = (n: number): number => n / 1e6

const NoteOn = (channel: number, note: number, velocity: number, time: number): MidiEvent => ({
  type: 'NoteOn',
  channel,
  note,
  velocity,
  time,
})
const NoteOff = (channel: number, note: number, time: number): MidiEvent => ({ type: 'NoteOff', channel, note, time })
const Clock = (time: number): MidiEvent => ({ type: 'Clock', time })
const Start = (time: number): MidiEvent => ({ type: 'Start', time })
const Continue = (time: number): MidiEvent => ({ type: 'Continue', time })
const Stop = (time: number): MidiEvent => ({ type: 'Stop', time })
const Fid = (project: number, group: number, pad: number): PadFid => ({ project, group, pad })
const group = (name: string, pads: [number, number | null][]): PadGroup => ({ name, pads: new Map(pads) })

describe('LiveMirrorTest', () => {
  // ---------- note map ----------

  it('the official note map', () => {
    expect(pad(36)).toEqual(physicalPad(0, 0))
    expect(pad(36)!.label).toBe('.')
    expect(pad(38)!.label).toBe('ENTER')
    expect(pad(39)!.label).toBe('1')
    expect(pad(47)!.label).toBe('9')
    expect(pad(83)).toEqual(physicalPad(3, 11))
    expect(pad(83)!.groupLetter).toBe('D')
    expect(pad(35)).toBeNull()
    expect(pad(84)).toBeNull()
    for (let n = 36; n <= 83; n++) expect(note(pad(n)!)).toBe(n)
    // The keypad top row is 7 8 9 and the bottom row . 0 ENTER.
    expect(ROWS[0]!.map((i) => LABELS[i])).toEqual(['7', '8', '9'])
    expect(ROWS[3]!.map((i) => LABELS[i])).toEqual(['.', '0', 'ENTER'])
    expect(ROWS.flat().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(noteName(36)).toBe('C2')
    expect(noteName(60)).toBe('C4')
    expect(noteName(1)).toBe('C#-1')
  })

  // ---------- mirror ----------

  function mirror(learned: Map<number, number> = new Map(), saved: Map<number, number>[] = []): LiveMirror {
    const m = new LiveMirror(learned, undefined, (l) => saved.push(l))
    // Group A: p01 holds slot 5, p10 slot 1. Group B: p01 slot 20.
    m.setProject(1, [group('a', [[1, 5], [10, 1]]), group('b', [[1, 20]])])
    m.setNames(new Map([[1, 'kick'], [5, 'snare'], [20, 'bass']]))
    return m
  }

  it('a pad lights and names nothing until it is learned', () => {
    const m = mirror()
    m.onMidi(NoteOn(1, 36, 100, 10 * ms))
    const s = m.snapshot(11 * ms)
    expect(s.pads.get(padKey(physicalPad(0, 0)))).toEqual({ velocity: 100, channel: 1, onAt: 10 * ms, offAt: null })
    expect(s.lastHit).toEqual({ pad: physicalPad(0, 0), note: 36, channel: 1, velocity: 100, slot: null, name: null })
    expect(s.learned.size).toBe(0)
    expect(MirrorText.hit(s.lastHit!)).toBe('A . \u00B7 100')
  })

  it('a note and a push together link the pad, in either order, and are kept', () => {
    const saved: Map<number, number>[] = []
    const m = mirror(undefined, saved)
    // Pad '.' (offset 0) is p10 in the project file; the push comes 40 ms after the note.
    m.onMidi(NoteOn(1, 36, 100, 10 * ms))
    m.onPadPush(Fid(1, 0, 10), 50 * ms)
    let s = m.snapshot(60 * ms)
    expect(s.learned).toEqual(new Map([[0, 10]]))
    expect(saved).toEqual([new Map([[0, 10]])])
    expect(s.lastHit).toEqual({ pad: physicalPad(0, 0), note: 36, channel: 1, velocity: 100, slot: 1, name: 'kick' })
    expect(MirrorText.hit(s.lastHit!)).toBe('A . \u00B7 001 kick \u00B7 100')
    // Push first, then the note, in group B: offset 9 ('7') is p01.
    m.onPadPush(Fid(1, 1, 1), 100 * ms)
    m.onMidi(NoteOn(1, 57, 80, 120 * ms))
    s = m.snapshot(130 * ms)
    expect(s.learned).toEqual(new Map([[0, 10], [9, 1]]))
    expect(s.lastHit!.name).toBe('bass')
    // The same link holds in another group: group A pad '7' is p01 = slot 5.
    m.onMidi(NoteOn(1, 45, 70, 2000 * ms))
    expect(m.snapshot(2001 * ms).lastHit!.name).toBe('snare')
  })

  it('project labels', () => {
    expect(MirrorText.project(3)).toBe('Project 3')
    expect(MirrorText.projectShort(3)).toBe('P3')
    expect(MirrorText.projectShort(12)).toBe('P12')
  })

  it('forgetting learned pads drops their names and saves the empty map', () => {
    const saved: Map<number, number>[] = []
    const m = mirror(new Map([[0, 10]]), saved)
    m.onMidi(NoteOn(1, 36, 90, 5 * ms))
    expect(m.snapshot(6 * ms).lastHit!.name).toBe('kick')
    m.forgetLearned()
    const s = m.snapshot(7 * ms)
    expect(s.learned.size).toBe(0)
    expect(s.lastHit!.name).toBeNull()
    expect(saved).toEqual([new Map()])
    // Nothing learned: nothing to save again.
    m.forgetLearned()
    expect(saved.length).toBe(1)
  })

  it('sequenced notes use what was learned, and far-apart events do not link', () => {
    const m = mirror(new Map([[0, 10]]))
    m.onMidi(NoteOn(1, 36, 90, 5 * ms))
    expect(m.snapshot(6 * ms).lastHit!.name).toBe('kick')
    // A push 400 ms after a note (a sequenced note, then a later press elsewhere) is no pair.
    m.onMidi(NoteOn(1, 37, 90, 1000 * ms))
    m.onPadPush(Fid(1, 0, 4), 1400 * ms)
    expect(m.snapshot(1500 * ms).learned).toEqual(new Map([[0, 10]]))
    // A push for another group is no pair either.
    m.onMidi(NoteOn(1, 38, 90, 3000 * ms))
    m.onPadPush(Fid(1, 2, 4), 3001 * ms)
    expect(m.snapshot(3002 * ms).learned).toEqual(new Map([[0, 10]]))
    expect(m.snapshot(3002 * ms).pushesSeen).toBe(true)
  })

  it("another project's layout changes the names", () => {
    const m = mirror(new Map([[0, 10]]))
    m.setProject(2, [group('a', [[10, 20]])])
    m.onMidi(NoteOn(1, 36, 90, 5 * ms))
    const s = m.snapshot(6 * ms)
    expect(s.activeProject).toBe(2)
    expect(s.lastHit!.name).toBe('bass')
  })

  it('release, fade and keys notes', () => {
    const m = mirror()
    m.onMidi(NoteOn(1, 40, 64, 0))
    m.onMidi(NoteOff(1, 40, 100 * ms))
    expect(m.snapshot(200 * ms).pads.get(padKey(physicalPad(0, 4)))!.offAt).toBe(100 * ms)
    expect(m.snapshot(100 * ms + LiveMirror.FADE_MS + ns(1)).pads.size).toBe(0)
    // Notes outside 36-83 (KEYS mode) are held on the keys strip.
    m.onMidi(NoteOn(3, 90, 50, 0))
    let s = m.snapshot(ns(1))
    expect(s.keysHeld).toEqual(new Map([[90, 3]]))
    expect(s.lastKeysNote).toBe(90)
    expect(MirrorText.hit(s.lastHit!)).toBe('F#6 \u00B7 ch 3 \u00B7 50')
    m.onMidi(NoteOff(3, 90, ns(2)))
    s = m.snapshot(ns(3))
    expect(s.keysHeld.size).toBe(0)
    expect(s.lastKeysNote).toBe(90)
  })

  it('transport and tempo from clock', () => {
    const m = mirror()
    expect(m.snapshot(0).playing).toBeNull()
    m.onMidi(Start(0))
    // 120 BPM: 24 clocks per beat, a beat every 500 ms. Kotlin: 500 * ms / 24 = 20833333 ns (Long division).
    const tick = ns(20833333)
    for (let i = 0; i <= 47; i++) m.onMidi(Clock(i * tick))
    const s = m.snapshot(47 * tick)
    expect(s.playing).toBe(true)
    expect(Math.abs(s.bpm! - 120.0)).toBeLessThanOrEqual(0.01)
    expect(MirrorText.bpm(s.bpm!)).toBe('120.0 BPM')
    // Too few clocks, or none for 2 s: no tempo.
    expect(m.snapshot(47 * tick + LiveMirror.CLOCK_TIMEOUT_MS + ns(1)).bpm).toBeNull()
    m.onMidi(NoteOn(1, 36, 1, 0))
    m.onMidi(Stop(ns(10)))
    const stopped = m.snapshot(ns(11))
    expect(stopped.playing).toBe(false)
    // Stop releases held pads, so a lost note-off can't leave one lit.
    expect(stopped.pads.get(padKey(physicalPad(0, 0)))!.offAt).toBe(ns(10))
    m.onMidi(Start(ns(20)))
    m.onMidi(Clock(ns(21)))
    expect(m.snapshot(ns(22)).bpm).toBeNull()
  })

  it('two pads of one group close together are not linked', () => {
    const saved: Map<number, number>[] = []
    const m = mirror(undefined, saved)
    // '7' and '1' in group A 5 ms apart (a flam, or a sequenced note during a press), then one push.
    m.onMidi(NoteOn(1, 45, 100, 0))
    m.onMidi(NoteOn(1, 39, 100, 5 * ms))
    m.onPadPush(Fid(1, 0, 1), 20 * ms)
    expect(m.snapshot(30 * ms).learned.size).toBe(0)
    expect(saved.length).toBe(0)
    // A clean press afterwards links as usual.
    m.onMidi(NoteOn(1, 45, 100, 1000 * ms))
    m.onPadPush(Fid(1, 0, 1), 1010 * ms)
    expect(m.snapshot(1020 * ms).learned).toEqual(new Map([[9, 1]]))
  })

  it('a pad number belongs to one key, and a relink renames the last hit', () => {
    const saved: Map<number, number>[] = []
    // A wrong link from before: '8' (offset 10) said to be p01, and '7' said to be p10.
    const m = mirror(new Map([[10, 1], [9, 10]]), saved)
    m.onMidi(NoteOn(1, 45, 100, 0)) // '7', named from the old link (p10 = slot 1)
    expect(m.snapshot(ns(1)).lastHit!.name).toBe('kick')
    m.onPadPush(Fid(1, 0, 1), 10 * ms) // the device says '7' is p01
    const s = m.snapshot(20 * ms)
    expect(s.learned).toEqual(new Map([[9, 1]])) // '8' no longer claims p01
    expect(saved).toEqual([new Map([[9, 1]])])
    expect(s.lastHit!.name).toBe('snare') // p01 = slot 5
  })

  it("while another project's pads load, hits get no name", () => {
    const m = mirror(new Map([[0, 10]]))
    m.onMidi(NoteOn(1, 37, 100, 0))
    m.onPadPush(Fid(2, 0, 11), 10 * ms) // the device is on project 2 now
    m.onMidi(NoteOn(1, 36, 100, 2000 * ms))
    expect(m.snapshot(2001 * ms).lastHit!.name).toBeNull()
    // Project 2's pads arrive: the last hit is named from them.
    m.setProject(2, [group('a', [[10, 20]])])
    expect(m.snapshot(2002 * ms).lastHit!.name).toBe('bass')
  })

  it('a pause in the clock starts a fresh tempo', () => {
    const m = mirror()
    const tick = ns(20833333)
    for (let i = 0; i <= 47; i++) m.onMidi(Clock(i * tick))
    // 10 s pause, then Continue-less clocks at 120 BPM again.
    const t0 = 47 * tick + 10_000 * ms
    for (let i = 0; i <= 30; i++) m.onMidi(Clock(t0 + i * tick))
    expect(Math.abs(m.snapshot(t0 + 30 * tick).bpm! - 120.0)).toBeLessThanOrEqual(0.01)
    // Continue also starts afresh.
    m.onMidi(Continue(t0 + 31 * tick))
    expect(m.snapshot(t0 + 31 * tick).bpm).toBeNull()
  })

  it('the last read is saved and names pads again without the device', () => {
    const json = LiveSnapshot.toJson(mirror().saved(1_700_000_000_000))
    const back = LiveSnapshot.fromJson(json)!
    expect(back.savedAt).toBe(1_700_000_000_000)
    expect(back.activeProject).toBe(1)
    expect(back.groups).toEqual([group('a', [[1, 5], [10, 1]]), group('b', [[1, 20]])])
    expect(back.names).toEqual(new Map([[1, 'kick'], [5, 'snare'], [20, 'bass']]))
    // A fresh mirror (no device) with the learned links names the pads from it.
    const offline = new LiveMirror(new Map([[9, 10], [0, 1]]))
    offline.load(back)
    expect(offline.nameOf(physicalPad(0, 9))).toBe('kick')
    expect(offline.nameOf(physicalPad(1, 0))).toBe('bass')
    expect(offline.snapshot(0).activeProject).toBe(1)
  })

  it('an empty pad survives the round trip, and junk reads as nothing', () => {
    const s: LiveSnapshot = { savedAt: 5, activeProject: null, groups: [group('c', [[3, null]])], names: new Map() }
    expect(LiveSnapshot.fromJson(LiveSnapshot.toJson(s))).toEqual(s)
    expect(LiveSnapshot.fromJson('not json')).toBeNull()
    expect(LiveSnapshot.fromJson('{"v":2,"savedAt":1}')).toBeNull()
  })
})
