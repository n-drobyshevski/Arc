// Port of core/src/test/kotlin/dev/arc/ep133/features/KeysTest.kt
//
// Kotlin times are nanoseconds; the web mirror runs on milliseconds. The
// mirror case uses raw times 0..21, which read the same in either unit;
// LiveMirror.FADE_NS is FADE_MS.
import { describe, expect, it } from 'vitest'
import { Keys, NoteNames, Scale } from '../../../src/core/features/keys'
import { LiveMirror } from '../../../src/core/features/liveMirror'
import type { MidiEvent } from '../../../src/core/protocol/midiInput'

const NoteOn = (channel: number, note: number, velocity: number, time: number): MidiEvent => ({
  type: 'NoteOn',
  channel,
  note,
  velocity,
  time,
})
const NoteOff = (channel: number, note: number, time: number): MidiEvent => ({ type: 'NoteOff', channel, note, time })
const Stop = (time: number): MidiEvent => ({ type: 'Stop', time })
const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i)

describe('KeysTest', () => {
  it('twelve notes per scale, continuing up an octave', () => {
    expect(Keys.notes(0, Scale.CHROMATIC, 4)).toEqual(range(60, 71))
    expect(Keys.notes(0, Scale.MAJOR, 4)).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79])
    // A minor pentatonic from LA3.
    expect(Keys.notes(9, Scale.MINOR_PENTATONIC, 3)).toEqual([57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84])
    // Stays inside MIDI.
    expect(Keys.notes(11, Scale.MINOR_PENTATONIC, 9).every((n) => n >= 0 && n <= 127)).toBe(true)
  })

  it('fixed-do names and octaves', () => {
    expect([60, 61, 62, 64, 68, 71].map(Keys.solfege)).toEqual(['DO', 'DI', 'RE', 'MI', 'SI', 'TI'])
    expect([60, 61, 62, 64, 68, 71].map(Keys.letter)).toEqual(['C', 'C#', 'D', 'E', 'G#', 'B'])
    expect(Keys.name(57, NoteNames.LETTERS)).toBe('A')
    expect(Keys.name(57, NoteNames.SOLFEGE)).toBe('LA')
    expect(Keys.octaveOf(60)).toBe(4)
    expect(Keys.octaveOf(36)).toBe(2)
  })

  it('a device note lights its key, or one with its name', () => {
    const keys = Keys.notes(0, Scale.MAJOR, 4)
    expect(Keys.keyFor(64, keys)).toBe(2)
    expect(Keys.keyFor(52, keys)).toBe(2) // MI3: the MI on the grid
    expect(Keys.keyFor(61, keys)).toBeNull() // DI isn't in C major
  })

  it('the mirror keeps every note for KEYS, and they fade like pads', () => {
    const m = new LiveMirror()
    m.onMidi(NoteOn(1, 64, 90, 0))
    m.onMidi(NoteOn(1, 40, 80, 0)) // a pad note counts too
    let s = m.snapshot(1)
    expect(new Set(s.notes.keys())).toEqual(new Set([64, 40]))
    expect(s.lastNote).toBe(40)
    m.onMidi(NoteOff(1, 64, 10))
    s = m.snapshot(11)
    expect(s.notes.get(64)!.offAt).toBe(10)
    expect(m.snapshot(10 + LiveMirror.FADE_MS + 1).notes.get(64)).toBeUndefined()
    m.onMidi(Stop(20))
    expect(m.snapshot(21).notes.get(40)!.offAt).toBe(20)
  })
})
