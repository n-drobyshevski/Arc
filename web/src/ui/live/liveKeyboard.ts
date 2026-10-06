// Web only (no Android counterpart): Live's computer keyboard on a desktop,
// beyond the piano's letters (live/keyboard.ts). Pure: which command a key
// press means in Live, for live/useLiveKeys to carry out, and the rows the
// Keyboard keys sheet lists (appKeys keyHelp).
//
// - The pads: the number pad as the EP-133's keypad (7 8 9 / 4 5 6 / 1 2 3 /
//   . 0 ENTER, by KeyboardEvent.code, so NumLock off plays too), and the
//   number row and . by the number printed on each pad, for laptops. Main
//   Enter plays ENTER only off a control (on a button it presses it).
// - PADS: A to D pick the group, E toggles EDIT (a pad key then opens that
//   pad's sound), V all groups or one, F Follow, / the Sounds search.
// - KEYS: the pad keys play the grid's keys; Z X the octave (the piano does
//   its own), [ ] the key, Shift+[ ] the scale, V grid or piano.
// - Both: M pads or keys.
// - Nothing with Ctrl, Cmd or Alt, nothing while composing, and nothing the
//   piano plays while it shows (its letters, Z and X, by code).

import { COMPUTER_KEYS } from './keyboard'
import type { KeyInput } from '../keyGuard'

/** The number pad by code, to the pad offset (padNotes LABELS: '.' 0, '0' 1, ENTER 2, '1' 3 … '9' 11). */
export const NUMPAD_OFFSET: Readonly<Record<string, number>> = Object.freeze({
  Numpad7: 9,
  Numpad8: 10,
  Numpad9: 11,
  Numpad4: 6,
  Numpad5: 7,
  Numpad6: 8,
  Numpad1: 3,
  Numpad2: 4,
  Numpad3: 5,
  NumpadDecimal: 0,
  Numpad0: 1,
  NumpadEnter: 2,
})

/** The number row and the full stop by code, to the pad printed with that number. */
export const ROW_OFFSET: Readonly<Record<string, number>> = Object.freeze({
  Digit1: 3,
  Digit2: 4,
  Digit3: 5,
  Digit4: 6,
  Digit5: 7,
  Digit6: 8,
  Digit7: 9,
  Digit8: 10,
  Digit9: 11,
  Digit0: 1,
  Period: 0,
})

/** The pad offset (0..11) a key plays, or null; Shift held plays none, main Enter only off a control. */
export function padOffset(input: KeyInput): number | null {
  if (input.shift) return null
  const n = NUMPAD_OFFSET[input.code] ?? ROW_OFFSET[input.code]
  if (n !== undefined) return n
  if (input.code === 'Enter' && !input.onControl) return 2
  return null
}

/** The Latin letter a key means: what it types, else (a Cyrillic or Greek layout) its place's. */
export function latinLetter(key: string, code: string): string | null {
  if (/^[a-zA-Z]$/.test(key)) return key.toLowerCase()
  const m = /^Key([A-Z])$/.exec(code)
  return m ? m[1]!.toLowerCase() : null
}

/** What Live shows, for [liveCommand]. */
export interface LiveContext {
  /** KEYS (else PADS). */
  keys: boolean
  /** KEYS on the piano (its letters are its own). */
  pianoShown: boolean
  /** EDIT is offered (the desk's EDIT tab). */
  editAvailable: boolean
  editOn: boolean
  oneGroup: boolean
  /** KEYS: the grid / piano switch is offered and the piano has room. */
  viewSwitchable: boolean
  /** The desk's Sounds tab is there (docked tools with EDIT). */
  soundsTab: boolean
}

export type LiveCommand =
  | { readonly kind: 'pad'; readonly offset: number }
  | { readonly kind: 'editPad'; readonly offset: number }
  | { readonly kind: 'gridKey'; readonly offset: number }
  | { readonly kind: 'group'; readonly group: number }
  | { readonly kind: 'edit' }
  | { readonly kind: 'view' }
  | { readonly kind: 'follow' }
  | { readonly kind: 'mode' }
  | { readonly kind: 'find' }
  | { readonly kind: 'octave'; readonly step: -1 | 1 }
  | { readonly kind: 'root'; readonly step: -1 | 1 }
  | { readonly kind: 'scale'; readonly step: -1 | 1 }

/** What [input] does in Live as [ctx] shows it, or null (the key is someone else's, or nobody's). */
export function liveCommand(input: KeyInput, ctx: LiveContext): LiveCommand | null {
  if (input.ctrl || input.meta || input.alt || input.composing) return null
  // The piano's own keys, by place, while it shows.
  if (ctx.pianoShown && (COMPUTER_KEYS.includes(input.code) || input.code === 'KeyZ' || input.code === 'KeyX')) return null
  // The app's: help and Escape.
  if (input.key === '?' || input.key === 'Escape') return null
  if (input.code === 'BracketLeft' || input.code === 'BracketRight') {
    if (!ctx.keys) return null
    const step = input.code === 'BracketLeft' ? -1 : 1
    return input.shift ? { kind: 'scale', step } : { kind: 'root', step }
  }
  // '/' is Shift+7 on some layouts: by what it types.
  if (input.key === '/') return !ctx.keys && ctx.soundsTab ? { kind: 'find' } : null
  if (input.shift) return null
  const offset = padOffset(input)
  if (offset !== null) {
    if (!ctx.keys) return ctx.editOn ? { kind: 'editPad', offset } : { kind: 'pad', offset }
    return ctx.pianoShown ? null : { kind: 'gridKey', offset }
  }
  switch (latinLetter(input.key, input.code)) {
    case 'm':
      return { kind: 'mode' }
    case 'v':
      return !ctx.keys || ctx.viewSwitchable ? { kind: 'view' } : null
    case 'a':
    case 'b':
    case 'c':
    case 'd':
      return ctx.keys ? null : { kind: 'group', group: 'abcd'.indexOf(latinLetter(input.key, input.code)!) }
    case 'e':
      return !ctx.keys && ctx.editAvailable ? { kind: 'edit' } : null
    case 'f':
      return !ctx.keys && ctx.oneGroup ? { kind: 'follow' } : null
    case 'z':
      return ctx.keys ? { kind: 'octave', step: -1 } : null
    case 'x':
      return ctx.keys ? { kind: 'octave', step: 1 } : null
    default:
      return null
  }
}

/** Where a row of the Keyboard keys sheet applies. */
export type KeyScope = 'pads' | 'edit' | 'grid' | 'piano' | 'everywhere'

/** One row of the Keyboard keys sheet: the keys (each a chip) and what they do. */
export interface KeyRow {
  readonly keys: readonly string[]
  readonly label: string
  readonly scope: KeyScope
}
