// Port of core/src/main/kotlin/dev/arc/ep133/features/PadNotes.kt
//
// The official MIDI note map of the EP-133 (teenage engineering's guide,
// "midi note map" and implementation chart): notes 36-83 are the pads, one
// octave per group (A 36-47, B 48-59, C 60-71, D 72-83). Inside a group the
// notes go '.', '0', 'enter', '1' ... '9'. In KEYS mode the device can send
// any note 0-127, so a note in this range may also be a KEYS note.
//
// Web delta: Kotlin's PhysicalPad data class is a plain readonly object built
// by `physicalPad()`, with `label` and `groupLetter` as fields. JS Maps have
// no value equality for objects, so maps key pads by `padKey()`
// (group * 12 + offset).

export const FIRST = 36
export const LAST = 83
export const LABELS: readonly string[] = ['.', '0', 'ENTER', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/** The keypad as it sits on the device, top row first: 7 8 9 / 4 5 6 / 1 2 3 / . 0 ENTER. */
export const ROWS: readonly (readonly number[])[] = [
  [9, 10, 11],
  [6, 7, 8],
  [3, 4, 5],
  [0, 1, 2],
]

/** A physical pad: group 0..3 (A..D) and its place in the group's note octave, 0..11. */
export interface PhysicalPad {
  readonly group: number
  readonly offset: number
  readonly label: string
  readonly groupLetter: string
}

export function physicalPad(group: number, offset: number): PhysicalPad {
  const label = LABELS[offset]
  // Kotlin's LABELS[offset] throws for an offset outside 0..11.
  if (label === undefined) throw new RangeError(`Index ${offset} out of bounds for length ${LABELS.length}`)
  return { group, offset, label, groupLetter: String.fromCharCode(65 + group) }
}

/** The numeric map key for a pad: group * 12 + offset (0..47). */
export function padKey(pad: { readonly group: number; readonly offset: number }): number {
  return pad.group * 12 + pad.offset
}

/** The pad for a [padKey] value. */
export function padFromKey(key: number): PhysicalPad {
  return physicalPad(Math.trunc(key / 12), key % 12)
}

export function pad(note: number): PhysicalPad | null {
  return note >= FIRST && note <= LAST ? physicalPad(Math.trunc((note - FIRST) / 12), (note - FIRST) % 12) : null
}

export function note(pad: { readonly group: number; readonly offset: number }): number {
  return FIRST + pad.group * 12 + pad.offset
}

const NAMES: readonly string[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** "C2" for 36, as the guide's note table names it (middle C 60 = C4). */
export function noteName(note: number): string {
  const name = NAMES[note % 12]
  if (name === undefined) throw new RangeError(`Index ${note % 12} out of bounds for length ${NAMES.length}`)
  return name + (Math.trunc(note / 12) - 1)
}
