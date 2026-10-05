// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/MirrorScreen.kt (KeysGrid, KeysDisplay, ModeRow maths)
//
// The pure parts of Live's KEYS view, factored out so they can be tested: how
// lit each key is from the device's notes, which keys are the scale's root
// (orange rings), the note the display names, and the octave word's choices.

import type { PadLight } from '../../core/features/liveMirror'
import { Keys, MAX_OCTAVE, MIN_OCTAVE, intervals, type NoteNames, type Scale } from '../../core/features/keys'
import type { PhysicalPad } from '../../core/features/padNotes'
import { glow } from './glow'

/** What the KEYS view shows: whether it is on, the key, scale and octave, and the sound it plays (Kotlin KeysUi). */
export interface KeysUi {
  readonly on: boolean
  readonly root: number
  readonly scale: Scale
  readonly octave: number
  /** Solfège (DO RE MI) or letter (C D E) note names. */
  readonly names: NoteNames
  /** The sound KEYS plays, and its sample's name when known. */
  readonly pad: PhysicalPad | null
  readonly padName: string | null
  /** The notes playing on the phone (a chord), as MIDI notes, latest last, outlined. */
  readonly playingNotes: ReadonlySet<number>
}

/** KeysUi() with its defaults. */
export const DEFAULT_KEYS: KeysUi = Object.freeze({
  on: false,
  root: 0,
  scale: 'CHROMATIC',
  octave: 4,
  names: 'SOLFEGE',
  pad: null,
  padName: null,
  playingNotes: new Set<number>(),
})

/** How lit each key is now: the brightest device note that falls on it (key index -> 0..1). */
export function keysLit(notes: ReadonlyMap<number, PadLight>, keyNotes: readonly number[], now: number): Map<number, number> {
  const lit = new Map<number, number>()
  for (const [n, l] of notes) {
    const k = Keys.keyFor(n, keyNotes)
    if (k === null) continue
    lit.set(k, Math.max(lit.get(k) ?? 0, glow(l, now)))
  }
  return lit
}

/**
 * Whether grid key [k] is the scale's root, ringed orange as the piano rings
 * it: the first key of each octave of the scale (the others ring plain).
 */
export function rootKey(k: number, scale: Scale): boolean {
  return k % intervals(scale).length === 0
}

/** The note the KEYS display names: the note last pressed on the phone, else the device's last note. */
export function keysDisplayNote(keys: KeysUi, lastNote: number | null): number | null {
  let last: number | undefined
  for (const n of keys.playingNotes) last = n
  return last ?? lastNote
}

/** The octave word's choices, lowest first. */
export function octaves(): number[] {
  const out: number[] = []
  for (let o = MIN_OCTAVE; o <= MAX_OCTAVE; o++) out.push(o)
  return out
}


/** Which of the mode row's lists is open over the grid (the key's own word only shows over the piano). */
export type KeysPicker = 'scale' | 'octave' | 'key'

/** The dialog layer id prefix of those lists ('pick:scale', 'pick:octave'): Back closes them. */
export const PICK_PREFIX = 'pick:'

/** The KEYS list open, from the navigation stack's open dialogs. */
export function keysPickerOf(dialogs: readonly string[]): KeysPicker | null {
  for (const d of dialogs) {
    if (d === PICK_PREFIX + 'scale') return 'scale'
    if (d === PICK_PREFIX + 'octave') return 'octave'
    if (d === PICK_PREFIX + 'key') return 'key'
  }
  return null
}
