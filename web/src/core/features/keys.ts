// Port of core/src/main/kotlin/dev/arc/ep133/features/Keys.kt
//
// KEYS mode in Live (an addition), after the EP-133's: the 12 pads play one
// sound as notes of a scale. Key i is the pad at offset i in the official
// note order ('.' lowest, then '0', 'ENTER', '1' … '9'; see padNotes).
//
// Web delta: the Kotlin enums `Scale` and `NoteNames` are const objects plus
// string-union types of the same name (the values are the enum names, so they
// persist as the same strings); `Scale.intervals` is `SCALE_INTERVALS[s]` /
// `intervals(s)`, and `entries` are SCALES / NOTE_NAMES.

/** The scales Live's KEYS can play (an addition). */
export const Scale = {
  CHROMATIC: 'CHROMATIC',
  MAJOR: 'MAJOR',
  MINOR: 'MINOR',
  DORIAN: 'DORIAN',
  PHRYGIAN: 'PHRYGIAN',
  LYDIAN: 'LYDIAN',
  MIXOLYDIAN: 'MIXOLYDIAN',
  MAJOR_PENTATONIC: 'MAJOR_PENTATONIC',
  MINOR_PENTATONIC: 'MINOR_PENTATONIC',
  BLUES: 'BLUES',
} as const
export type Scale = (typeof Scale)[keyof typeof Scale]

/** Scale.entries, in declaration order. */
export const SCALES: readonly Scale[] = Object.freeze(Object.values(Scale))

/** Each scale as semitones from the root. */
export const SCALE_INTERVALS: Readonly<Record<Scale, readonly number[]>> = Object.freeze({
  CHROMATIC: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
  MAJOR: Object.freeze([0, 2, 4, 5, 7, 9, 11]),
  MINOR: Object.freeze([0, 2, 3, 5, 7, 8, 10]),
  DORIAN: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
  PHRYGIAN: Object.freeze([0, 1, 3, 5, 7, 8, 10]),
  LYDIAN: Object.freeze([0, 2, 4, 6, 7, 9, 11]),
  MIXOLYDIAN: Object.freeze([0, 2, 4, 5, 7, 9, 10]),
  MAJOR_PENTATONIC: Object.freeze([0, 2, 4, 7, 9]),
  MINOR_PENTATONIC: Object.freeze([0, 3, 5, 7, 10]),
  BLUES: Object.freeze([0, 3, 5, 6, 7, 10]),
})

/** Scale.intervals. */
export function intervals(s: Scale): readonly number[] {
  return SCALE_INTERVALS[s]
}

/** Scale.valueOf, or null. */
export function scaleOf(name: string | null | undefined): Scale | null {
  return name != null && (SCALES as readonly string[]).includes(name) ? (name as Scale) : null
}

/** How KEYS names its notes: fixed-do solfège (DO RE MI) or letters (C D E). */
export const NoteNames = { SOLFEGE: 'SOLFEGE', LETTERS: 'LETTERS' } as const
export type NoteNames = (typeof NoteNames)[keyof typeof NoteNames]

/** NoteNames.entries, in declaration order. */
export const NOTE_NAMES: readonly NoteNames[] = Object.freeze([NoteNames.SOLFEGE, NoteNames.LETTERS])

/** NoteNames.valueOf, or null. */
export function noteNamesOf(name: string | null | undefined): NoteNames | null {
  return name === NoteNames.SOLFEGE || name === NoteNames.LETTERS ? name : null
}

/** A sound plays at its own pitch on this note (the EP-133's default root, C4). */
export const ROOT_NOTE = 60
export const MIN_OCTAVE = 0
export const MAX_OCTAVE = 8

const SOLFEGE: readonly string[] = ['DO', 'DI', 'RE', 'RI', 'MI', 'FA', 'FI', 'SO', 'SI', 'LA', 'LI', 'TI']
const LETTERS: readonly string[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const coerceIn = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
const pc = (note: number): number => ((note % 12) + 12) % 12

/** The MIDI note of each key, lowest first: [scale] from [root] (0 = C) in [octave] (4 = C4 octave). */
export function notes(root: number, scale: Scale, octave: number): number[] {
  const base = 12 * (octave + 1) + coerceIn(root, 0, 11)
  const steps = SCALE_INTERVALS[scale]
  return Array.from({ length: 12 }, (_, i) =>
    coerceIn(base + 12 * Math.trunc(i / steps.length) + steps[i % steps.length]!, 0, 127),
  )
}

/** Fixed-do name of a note: DO is C, sharps are DI, RI, FI, SI, LI. */
export function solfege(note: number): string {
  return SOLFEGE[pc(note)]!
}

/** Letter name of a note, sharps for the black keys: C, C#, D … B. */
export function letter(note: number): string {
  return LETTERS[pc(note)]!
}

/** A note's name (no octave) the way [names] says. */
export function name(note: number, names: NoteNames): string {
  switch (names) {
    case NoteNames.SOLFEGE:
      return solfege(note)
    case NoteNames.LETTERS:
      return letter(note)
  }
}

/** The note's octave number as the guide's note table counts it (C4 = 60). */
export function octaveOf(note: number): number {
  return Math.trunc(note / 12) - 1
}

/** The key a note played on the device lights: the same note, else the first one with its name. */
export function keyFor(note: number, keyNotes: readonly number[]): number | null {
  const i = keyNotes.indexOf(note)
  if (i >= 0) return i
  const j = keyNotes.findIndex((n) => n % 12 === note % 12)
  return j >= 0 ? j : null
}

/** The Kotlin `Keys` object, for call sites that read `Keys.notes(...)`. */
export const Keys = {
  ROOT_NOTE,
  MIN_OCTAVE,
  MAX_OCTAVE,
  notes,
  solfege,
  letter,
  name,
  octaveOf,
  keyFor,
} as const
