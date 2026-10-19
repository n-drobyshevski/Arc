// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/MirrorScreen.kt (KeysGrid, KeysDisplay, ModeRow maths)
//
// The pure parts of Live's KEYS view, factored out so they can be tested: how
// lit each key is from the device's notes, which octave colour a key's ring
// takes, the note the display names, and the octave word's choices.

import { signal, type ReadonlySignal } from '@preact/signals'
import type { PadLight } from '../../core/features/liveMirror'
import { Keys, MAX_OCTAVE, MIN_OCTAVE, type NoteNames, type Scale } from '../../core/features/keys'
import type { PhysicalPad } from '../../core/features/padNotes'
import type { NoteRange } from '../../core/features/piano'
import { MirrorText } from '../../core/text/mirrorText'
import { glow } from './glow'

/** What the KEYS view shows: whether it is on, the key, scale and octave, and the sound it plays (Kotlin KeysUi). */
export interface KeysUi {
  readonly on: boolean
  readonly root: number
  readonly scale: Scale
  readonly octave: number
  /** Solfège (DO RE MI) or letter (C D E) note names. */
  readonly names: NoteNames
  /** The keys write their note names in their rings (off: rings and octave numbers only). */
  readonly showNames: boolean
  /** The sound KEYS plays, and its sample's name when known. */
  readonly pad: PhysicalPad | null
  readonly padName: string | null
  /**
   * The notes playing on the phone (a chord), grid and piano alike, as MIDI
   * notes, first pressed first: ringed on the grid, outlined on the piano (Kotlin playingNotes).
   */
  readonly playingNotes: ReadonlySet<number>
  /** The piano's white keys as chosen in Settings (Piano.CHOICES); null is Auto, the widest that fits. */
  readonly pianoWhites: number | null
}

/** The sound KEYS plays, and its sample's name (KeysUi's pad and padName). */
export type KeysSound = Pick<KeysUi, 'pad' | 'padName'>

/**
 * KeysUi less what plays on the phone: Live reads that from its own signals
 * (MirrorScreen's LivePlaying), so a voice starting or ending re-renders only
 * the keys it rings, not the screen. The sound is a signal too (web
 * addition): another pad played re-renders only what names it.
 */
export type KeysShown = Omit<KeysUi, 'playingNotes' | 'pad' | 'padName'> & { readonly sound: ReadonlySignal<KeysSound> }

/** KeysUi() with its defaults. */
export const DEFAULT_KEYS: KeysUi = Object.freeze({
  on: false,
  root: 0,
  scale: 'CHROMATIC',
  octave: 4,
  names: 'SOLFEGE',
  showNames: true,
  pad: null,
  padName: null,
  playingNotes: new Set<number>(),
  pianoWhites: null,
})

/** KeysShown with KeysUi()'s defaults. */
export const DEFAULT_KEYS_SHOWN: KeysShown = Object.freeze({
  on: DEFAULT_KEYS.on,
  root: DEFAULT_KEYS.root,
  scale: DEFAULT_KEYS.scale,
  octave: DEFAULT_KEYS.octave,
  names: DEFAULT_KEYS.names,
  showNames: DEFAULT_KEYS.showNames,
  pianoWhites: DEFAULT_KEYS.pianoWhites,
  sound: signal<KeysSound>({ pad: null, padName: null }),
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

/** Whether a key's ring is the orange one: the octaves above the chosen one alternate navy, orange, navy… */
export function upperOctave(note: number, octave: number): boolean {
  return (Keys.octaveOf(note) - octave) % 2 === 1
}

/**
 * The note the KEYS display names: the note (grid key or piano key) last
 * pressed on the phone, else the device's last note.
 */
export function keysDisplayNote(keys: KeysUi, lastNote: number | null): number | null {
  let note: number | undefined
  for (const n of keys.playingNotes) note = n
  return note ?? lastNote
}

/** The octave word's choices, lowest first. */
export function octaves(): number[] {
  const out: number[] = []
  for (let o = MIN_OCTAVE; o <= MAX_OCTAVE; o++) out.push(o)
  return out
}


/** Which of the mode row's lists is open over the grid (the key's own word only shows over the piano). */
export type KeysPicker = 'scale' | 'octave' | 'key'

/** The dialog layer id prefix of those lists ('pick:scale', 'pick:octave', 'pick:key'): Back closes them. */
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

/** Which of KEYS' words opened the KEYS sheet (ui/sheets/ScaleSheet.tsx): its section is scrolled into view. */
export const KeysSheetPart = { SCALE: 'scale', KEY: 'key', OCTAVE: 'octave' } as const
export type KeysSheetPart = (typeof KeysSheetPart)[keyof typeof KeysSheetPart]

/**
 * The KEYS sheet's layer id prefix: 'scale:<part>' (web: 'keys' is the keyboard keys sheet), so
 * Back, Escape and the scrim close it.
 */
export const SCALE_SHEET_PREFIX = 'scale:'

/** The KEYS sheet open, and the part it opened at, from the navigation stack's open sheets. */
export function scaleSheetOf(sheets: readonly string[]): KeysSheetPart | null {
  for (const s of sheets) {
    if (!s.startsWith(SCALE_SHEET_PREFIX)) continue
    const part = s.slice(SCALE_SHEET_PREFIX.length)
    return part === KeysSheetPart.KEY || part === KeysSheetPart.OCTAVE ? part : KeysSheetPart.SCALE
  }
  return null
}

/**
 * The KEYS display's note words with the piano showing ([range]): a device
 * note past its ends is named as such ("DO2, below the keys"), as there is
 * no key to light for it (Kotlin KeysDisplay).
 */
export function keysNoteText(keys: KeysUi, lastNote: number | null, range: NoteRange | null): string | null {
  const n = keysDisplayNote(keys, lastNote)
  if (n === null) return null
  if (range !== null && (n < range.first || n > range.last) && !keys.playingNotes.has(n)) {
    return MirrorText.outOfRange(n, keys.names, n < range.first)
  }
  return MirrorText.noteName(n, keys.names)
}
