// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/MirrorScreen.kt (pianoRange, sidewaysRoom, PianoMaxTablet)
//
// The pure parts of Live's piano layout, factored out so they can be tested:
// how much room the piano gets in Live, whether KEYS plays on it, and (web
// only) the computer keyboard that plays it on a desktop.
//
// Web deltas:
// - The room is Live's own box less its chrome, in CSS px: the numbers are
//   MirrorScreen.css's (.live-piano); change both together. Settings
//   estimates the same width from the window (SettingsScreen pianoRoomEstimate).
// - On the desk (from 1024px) the piano spans the page column under the
//   display line and the controls row, with the colours' legend under it,
//   and is no taller than [PIANO_MAX_DESK].
// - The computer keyboard (no Android counterpart): A W S E D F T G Y H U J K
//   O L P ; play C to E an octave and a third up from OCT's own C, as music
//   programs lay out a keyboard on the letter rows (by key position, so other
//   layouts play the same places); Z and X step the octave down and up.

import { KeysView, Piano, type NoteRange } from '../../core/features/piano'

/** A tablet's piano is no taller than this (Android PianoMaxTablet). */
export const PIANO_MAX_TABLET = 340
/** On the desk, the piano is no taller than this (web). */
export const PIANO_MAX_DESK = 420

// Live's chrome around the piano (MirrorScreen.css .live-piano), across and down.
/** The phone's column: the GUIDE tab's gutter on the left, the tools strip on the right. */
const PHONE_X = 30 + 24 + 4
/** The desk's column: its padding each side and the tools strip on the right. */
const DESK_X = 2 * 8 + 24 + 4
/** The body around the keys: padding each side, and the caps' edge on the right and below. */
const PLATE_X_PHONE = 2 * 10 + 2
const PLATE_X_DESK = 2 * 20 + 2
const PLATE_Y_PHONE = 2 * 10 + 3
const PLATE_Y_DESK = 18 + 22 + 3
/** Down the page, all but the keys: the padding, the display line, the controls row and their gaps (and the desk's legend). */
const PHONE_Y = 4 + 12 + 48 + 10 + 44 + 10
const DESK_Y = 4 + 22 + 56 + 14 + 44 + 14 + 40

/** The piano's width (its keys' plate inside the body) in Live's box [liveWidth] wide. */
export function pianoWidth(liveWidth: number, desk: boolean): number {
  return Math.max(0, liveWidth - (desk ? DESK_X + PLATE_X_DESK : PHONE_X + PLATE_X_PHONE))
}

/** The height the piano's keys can take in Live's box [liveHeight] high (not yet capped). */
export function pianoHeight(liveHeight: number, desk: boolean): number {
  return Math.max(0, liveHeight - (desk ? DESK_Y + PLATE_Y_DESK : PHONE_Y + PLATE_Y_PHONE))
}

/** What Live's KEYS shows in a window, from [pianoFor]. */
export interface PianoPlan {
  /** The Pads ⇄ Piano switch is offered (not on a portrait phone). */
  readonly switchShown: boolean
  /** The piano could show here (8 white keys fit, and 120 px of height). */
  readonly room: boolean
  /** The piano's notes when it shows, else null (the grid). */
  readonly range: NoteRange | null
  /** How tall its keys are (px, capped: [PIANO_MAX_TABLET], on the desk [PIANO_MAX_DESK]). */
  readonly height: number
  /** The view remembered for this window's shape, and which shape that is. */
  readonly view: KeysView
  readonly wide: boolean
}

/**
 * Whether Live's KEYS plays on the piano in a [windowWidth] × [windowHeight]
 * window whose Live box is [liveWidth] × [liveHeight] (Android: pianoRange
 * and the view switch's rule): the view remembered for the window's shape
 * ([viewWide] or [viewTall]), the piano's room, and [choice] white keys
 * (null: as many as fit) at [octave].
 */
export function pianoFor(
  windowWidth: number,
  windowHeight: number,
  liveWidth: number,
  liveHeight: number,
  desk: boolean,
  viewWide: KeysView,
  viewTall: KeysView,
  choice: number | null,
  octave: number,
): PianoPlan {
  const wide = windowWidth > windowHeight
  const view = wide ? viewWide : viewTall
  const w = pianoWidth(liveWidth, desk)
  const h = Math.min(pianoHeight(liveHeight, desk), desk ? PIANO_MAX_DESK : PIANO_MAX_TABLET)
  const room = Piano.hasRoom(w, h, choice)
  const shown = Piano.showsPiano(view, wide, windowWidth, room)
  return {
    switchShown: Piano.switchShown(wide, windowWidth),
    room,
    range: shown ? Piano.range(octave, Piano.whitesFor(w, choice)) : null,
    height: h,
    view,
    wide,
  }
}

/** The view a tap on the switch stores: PIANO or PADS (never AUTO again once chosen). */
export function chosenView(piano: boolean): KeysView {
  return piano ? KeysView.PIANO : KeysView.PADS
}

// ---------- the computer keyboard (web only) ----------

/** The keys that play, by KeyboardEvent.code, lowest first: C to E an octave up. */
export const COMPUTER_KEYS: readonly string[] = Object.freeze([
  'KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY',
  'KeyH', 'KeyU', 'KeyJ', 'KeyK', 'KeyO', 'KeyL', 'KeyP', 'Semicolon',
])

/** What each of them is printed with on a US keyboard, the hint on its piano key. */
const HINTS = 'AWSEDFTGYHUJKOLP;'

/** The note [code] plays at [octave] (C of OCT's own octave first: OCT 4's A is C4, 60), or null. */
export function computerNote(code: string, octave: number): number | null {
  const i = COMPUTER_KEYS.indexOf(code)
  if (i < 0) return null
  const n = Piano.lowest(octave) + 12 + i
  return n >= 0 && n <= 127 ? n : null
}

/** The letter hint on [note]'s piano key at [octave], or null when no letter plays it. */
export function computerHint(note: number, octave: number): string | null {
  const i = note - (Piano.lowest(octave) + 12)
  return i >= 0 && i < HINTS.length ? HINTS[i]! : null
}

/** Z steps the octave down, X up; null for any other key. */
export function octaveStep(code: string): -1 | 1 | null {
  return code === 'KeyZ' ? -1 : code === 'KeyX' ? 1 : null
}

/** Just what [playsKeys] reads of a KeyboardEvent. */
export interface KeyLike {
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  /** The event's target is a field (input, textarea, select, contenteditable) or inside a dialog. */
  readonly inField: boolean
}

/** Whether a key press may play: not while typing in a field or a dialog, not with a modifier held (shortcuts). */
export function playsKeys(e: KeyLike): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey && !e.inField
}
