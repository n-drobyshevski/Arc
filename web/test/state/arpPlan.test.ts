// Port of app/src/test/kotlin/dev/arc/ep133/controller/ArpPlanTest.kt: the notes the arp plays as the
// controller keeps them (presses, releases, latch, pressure, and the plan and line from them).
// Web deltas: times are performance.now() ms (pressMs, not pressNanos); the seed folds the press's
// microseconds, so Kotlin's 0x1_0000_0002 ns press is 4294967.298 ms here; plan() takes ArpVoices
// (sample keys and shapes by pad key) and gives a LiveArpPlan; ui() gives a plain object.
import { beforeEach, describe, expect, it } from 'vitest'
import { ArpOrder, ArpSettings, arpNote, type ArpNote } from '../../src/core/features/arp'
import { NoteNames } from '../../src/core/features/keys'
import { physicalPad, type PhysicalPad } from '../../src/core/features/padNotes'
import { Timing, TimingSettings } from '../../src/core/features/pattern'
import { ArpDesk, pressureVelocity, type ArpVoices } from '../../src/state/arpPlan'

const keysPad = physicalPad(0, 4)
const a7 = physicalPad(0, 9)
const b1 = physicalPad(1, 3)

const key = (semis: number): ArpNote => arpNote(keysPad, semis)
const noteKey = (semis: number): string => `note:${60 + semis}`
const hit = (pad: PhysicalPad): ArpNote => arpNote(pad, null)
const padKey = (pad: PhysicalPad): string => `live:${pad.group}:${pad.offset}`

describe('ArpDesk', () => {
  let desk: ArpDesk
  beforeEach(() => {
    desk = new ArpDesk()
  })

  // A finger down on KEYS note [semis] at [at].
  const down = (semis: number, at = 1, latch = false): boolean => desk.press(noteKey(semis), key(semis), true, at, latch)

  // Kotlin's notes.single().
  const single = (): ArpNote => {
    expect(desk.notes).toHaveLength(1)
    return desk.notes[0]!
  }

  it('presses gather in the order pressed, the first starting the run, and each finger up lets its note go', () => {
    expect(down(7, 100)).toBe(true)
    expect(down(0, 200)).toBe(false)
    expect(down(4, 300)).toBe(false)
    expect(desk.notes).toEqual([key(7), key(0), key(4)])
    expect(desk.keys).toBe(true)
    expect(desk.pressMs).toBe(100)
    expect(desk.release(noteKey(0), false)).toBe(true)
    expect(desk.notes).toEqual([key(7), key(4)])
    // A finger never down lets nothing go.
    expect(desk.release(noteKey(11), false)).toBe(false)
    desk.release(noteKey(7), false)
    desk.release(noteKey(4), false)
    expect(desk.notes).toEqual([])
    expect(desk.anyDown).toBe(false)
    // Pressed again, a run of its own.
    expect(down(2, 900)).toBe(true)
    expect(desk.pressMs).toBe(900)
  })

  it('a press a scroll may take tells its time once kept, and nothing once cut', () => {
    expect(desk.press(padKey(a7), hit(a7), false, 50, false, true)).toBe(true)
    expect(desk.notes).toEqual([hit(a7)])
    expect(desk.keep(padKey(a7))).toBe(50)
    // Kept once: RECORD isn't started by it again.
    expect(desk.keep(padKey(a7))).toBeNull()
    desk.press(padKey(b1), hit(b1), false, 60, false, true)
    expect(desk.cut(padKey(b1))).toBe(true)
    expect(desk.keep(padKey(b1))).toBeNull()
    // A sure press has nothing to keep.
    desk.press(padKey(b1), hit(b1), false, 70, false)
    expect(desk.keep(padKey(b1))).toBeNull()
    desk.press(padKey(keysPad), hit(keysPad), false, 80, false, true)
    desk.clear()
    expect(desk.keep(padKey(keysPad))).toBeNull()
  })

  it('the same note under two fingers plays once and goes with the last of them', () => {
    desk.press('note:60', key(0), true, 1, false)
    desk.press('grid:60', key(0), true, 2, false)
    expect(desk.notes).toEqual([key(0)])
    expect(desk.release('note:60', false)).toBe(false)
    expect(desk.notes).toEqual([key(0)])
    expect(desk.release('grid:60', false)).toBe(true)
    expect(desk.notes).toEqual([])
  })

  it('latched, the notes stay after the fingers are up, and a press after that starts a set of its own', () => {
    down(0, 10, true)
    down(4, 20, true)
    expect(desk.release(noteKey(0), true)).toBe(false)
    // A finger still down: the next press joins the set.
    expect(down(7, 30, true)).toBe(false)
    desk.release(noteKey(4), true)
    desk.release(noteKey(7), true)
    expect(desk.notes).toEqual([key(0), key(4), key(7)])
    expect(desk.pressMs).toBe(10)
    // Every finger up: the next press is a new set, and a new run.
    expect(down(9, 40, true)).toBe(true)
    expect(desk.notes).toEqual([key(9)])
    expect(desk.pressMs).toBe(40)
    // LATCH off: what no finger holds goes.
    expect(down(2, 50, true)).toBe(false)
    desk.release(noteKey(9), true)
    expect(desk.unlatch()).toBe(true)
    expect(desk.notes).toEqual([key(2)])
    expect(desk.unlatch()).toBe(false)
  })

  it("a scroll's press goes latched or not, and clear forgets everything", () => {
    desk.press(padKey(a7), hit(a7), false, 1, true)
    desk.press(padKey(b1), hit(b1), false, 2, true)
    expect(desk.cut(padKey(b1))).toBe(true)
    expect(desk.notes).toEqual([hit(a7)])
    expect(desk.cut(padKey(b1))).toBe(false)
    expect(desk.clear()).toBe(true)
    expect(desk.notes).toEqual([])
    expect(desk.anyDown).toBe(false)
    expect(desk.clear()).toBe(false)
  })

  it("KEYS notes and pad hits don't arp together, one of the other kind starts a set of its own", () => {
    down(0, 1)
    down(4, 2)
    expect(desk.press(padKey(a7), hit(a7), false, 3, false)).toBe(true)
    expect(desk.keys).toBe(false)
    expect(desk.notes).toEqual([hit(a7)])
    expect(desk.pressMs).toBe(3)
    // The KEYS fingers' release lets nothing of the pads' go.
    expect(desk.release(noteKey(0), false)).toBe(false)
    expect(desk.notes).toEqual([hit(a7)])
    expect(desk.press(padKey(b1), hit(b1), false, 4, false)).toBe(false)
    expect(desk.notes).toEqual([hit(a7), hit(b1)])
  })

  it('pressure is velocity only once the device shows it tells pressure', () => {
    expect(pressureVelocity(0)).toBe(1)
    expect(pressureVelocity(0.5)).toBe(64)
    expect(pressureVelocity(1)).toBe(127)
    expect(pressureVelocity(3)).toBe(127)
    down(0)
    // The same pressure every touch (many screens): none to play with.
    expect(desk.pressure(noteKey(0), 1)).toBe(false)
    expect(desk.pressure(noteKey(0), 1)).toBe(false)
    expect(single().velocity).toBe(127)
    // Pressures that spread: light is soft, hard is loud.
    expect(desk.pressure(noteKey(0), 0.2)).toBe(true)
    expect(single().velocity).toBe(1)
    expect(desk.pressure(noteKey(0), 0.6)).toBe(true)
    expect(single().velocity).toBe(pressureVelocity(0.5))
    expect(desk.pressure(noteKey(0), 0.6)).toBe(false)
    // A finger not down changes nothing, though its pressure is seen.
    expect(desk.pressure(noteKey(5), 0.9)).toBe(false)
    // Latched and up, the note keeps the velocity it had.
    desk.release(noteKey(0), true)
    expect(single().velocity).toBe(64)
  })

  it('the plan is the notes on their voices at the settings, null with none', () => {
    const timing = TimingSettings.of({ interval: Timing.EIGHTH, swing: 60 })
    const arp = ArpSettings.of({ order: ArpOrder.UP, octaves: 2, gate: 75, latch: false })
    const voices: ArpVoices = {
      voices: new Map([[4, 'kick']]),
      shapes: new Map([[4, { gain: 0.5 }]]),
      keysShapes: new Map(),
    }
    expect(desk.plan(voices, timing, arp, 120)).toBeNull()
    // Kotlin's 0x1_0000_0002 ns: 2³² + 2 µs.
    const press = 4294967.298
    down(4, press)
    down(0, 5)
    const p = desk.plan(voices, timing, arp, 97.5)!
    expect(p.notes).toEqual([key(4), key(0)])
    expect(p.voices).toBe(voices.voices)
    expect(p.shapes).toBe(voices.shapes)
    expect(p.keysShapes).toBe(voices.keysShapes)
    expect(p.keys).toBe(true)
    expect(p.timing).toEqual(timing)
    expect(p.settings).toEqual(arp)
    expect(p.bpm).toBe(97.5)
    expect(p.pressMs).toBe(press)
    // The run's own seed, the same for every plan of it.
    expect(p.seed).toBe(3)
    expect(desk.plan(voices, timing, arp, 120)!.seed).toBe(p.seed)
    desk.clear()
    down(4, 77)
    expect(desk.plan(voices, timing, arp, 120)!.seed).not.toBe(p.seed)
  })

  it('Live shows the notes, and the display line while the arp plays', () => {
    const timing = TimingSettings.of()
    const off = desk.ui(false, ArpSettings.DEFAULT, timing, NoteNames.SOLFEGE)
    expect(off.on).toBe(false)
    expect(off.sounding).toBe(false)
    expect(off.line).toBeNull()
    down(5)
    down(9)
    down(0)
    const on = desk.ui(true, ArpSettings.DEFAULT, timing, NoteNames.SOLFEGE)
    expect(on.on && on.sounding && on.keys).toBe(true)
    expect(on.held).toEqual([key(5), key(9), key(0)])
    expect(on.line).toBe('ARP · 1/16 · FA LA DO')
    // Off with notes held: nothing plays, no line.
    expect(desk.ui(false, ArpSettings.DEFAULT, timing, NoteNames.SOLFEGE).line).toBeNull()
    desk.clear()
    desk.press(padKey(a7), hit(a7), false, 1, true)
    desk.press(padKey(b1), hit(b1), false, 2, true)
    const latched = ArpSettings.withLatch(ArpSettings.DEFAULT, true)
    const rpt = desk.ui(true, latched, TimingSettings.of({ interval: Timing.THIRTY_SECOND }), NoteNames.LETTERS)
    expect(rpt.latch).toBe(true)
    expect(rpt.keys).toBe(false)
    expect(rpt.line).toBe('REPEAT ∞ · 1/32 · A 7, B 1')
  })
})
