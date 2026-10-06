// Port of core/src/main/kotlin/dev/arc/ep133/features/Piano.kt
//
// Live's wide KEYS (an addition): a chromatic piano across the window in
// place of the EP-133's 4×3 keypad. Every note plays; the key and scale only
// mark the keys ([mark]). It starts on a C, an octave under OCT's own C, so
// OCT 4 shows C3–C5 with the sound's own pitch (C4) in the middle.
//
// Web deltas: the Kotlin enums `KeyMark` and `KeysView` are const objects plus
// string-union types of the same name (the values are the enum names, so they
// persist as the same strings). Kotlin's IntRange is a {first, last}
// NoteRange, empty when first > last (EMPTY_RANGE); `rangeNotes` lists it.
// Units are CSS px where Android has dp (the same 44 minimum).

import { intervals, type Scale } from './keys'

/** Where a note stands in KEYS' key: its root, another note of the scale, or outside it. */
export const KeyMark = { ROOT: 'ROOT', IN: 'IN', OUT: 'OUT' } as const
export type KeyMark = (typeof KeyMark)[keyof typeof KeyMark]

/**
 * Whether Live's KEYS plays on the 3×4 grid or the piano (an addition),
 * remembered once for a wide window and once for a tall one. AUTO is the
 * piano when the window is wide and it fits.
 */
export const KeysView = { AUTO: 'AUTO', PADS: 'PADS', PIANO: 'PIANO' } as const
export type KeysView = (typeof KeysView)[keyof typeof KeysView]

/** KeysView.entries, in declaration order. */
export const KEYS_VIEWS: readonly KeysView[] = Object.freeze([KeysView.AUTO, KeysView.PADS, KeysView.PIANO])

/** KeysView.valueOf, or null. */
export function keysViewOf(name: string | null | undefined): KeysView | null {
  return name != null && (KEYS_VIEWS as readonly string[]).includes(name) ? (name as KeysView) : null
}

/** A rectangle on the piano, in whatever unit its width and height came in. */
export interface KeyRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export const keyRect = (left: number, top: number, width: number, height: number): KeyRect => ({ left, top, width, height })
export const rectRight = (r: KeyRect): number => r.left + r.width
export const rectBottom = (r: KeyRect): number => r.top + r.height

/** Inside, with the left and top edges in and the right and bottom out, so neighbours never share a point. */
export function rectContains(r: KeyRect, x: number, y: number): boolean {
  return x >= r.left && x < rectRight(r) && y >= r.top && y < rectBottom(r)
}

/**
 * One key of the piano: [rect] is drawn, [hitRect] is what a finger hits.
 * A black key is hit wider than it is drawn; a white key is hit on its whole
 * face, the black keys over it winning where they overlap.
 */
export interface PianoKey {
  readonly note: number
  readonly black: boolean
  readonly rect: KeyRect
  readonly hitRect: KeyRect
}

/** Notes first..last; empty when first > last (Kotlin IntRange). */
export interface NoteRange {
  readonly first: number
  readonly last: number
}

/** IntRange.EMPTY. */
export const EMPTY_RANGE: NoteRange = Object.freeze({ first: 1, last: 0 })

export const isEmptyRange = (r: NoteRange): boolean => r.first > r.last

/** The notes of [r], lowest first. */
export function rangeNotes(r: NoteRange): number[] {
  const out: number[] = []
  for (let n = r.first; n <= r.last; n++) out.push(n)
  return out
}

/** The white keys it can show, widest first: three octaves, two, one and a half (C–G), one. */
export const WHITES: readonly number[] = Object.freeze([22, 15, 12, 8])
/** A white key is never narrower than this (px): under it the grid stays instead. */
export const MIN_WHITE = 44
/** The piano needs a room at least this tall (px): under it the grid stays instead. */
export const MIN_HEIGHT = 120
/** Under this width (px, Android's compact breakpoint) a tall window always plays on the grid. */
export const COMPACT_WIDTH = 600

/** Settings' piano sizes: null (Auto, the widest that fits), then one octave, one and a half, two, three. */
export const CHOICES: readonly (number | null)[] = Object.freeze([null, 8, 12, 15, 22])

// Black keys against a white one: drawn as KeysStrip draws them (a touch longer),
// hit a little wider so a finger meant for the narrow key finds it.
export const BLACK_WIDTH = 0.6
export const BLACK_HEIGHT = 0.62
export const BLACK_HIT_WIDTH = 0.72

const BLACK = new Set([1, 3, 6, 8, 10])

/** A stored piano size as a choice: one of [WHITES], else Auto (null). */
export function choiceOf(stored: number | null | undefined): number | null {
  return stored != null && WHITES.includes(stored) ? stored : null
}

/** Whether [whites] white keys fit [width] at [minWhite] or wider each (Settings greys out a size that doesn't). */
export function fits(width: number, whites: number, minWhite: number = MIN_WHITE): boolean {
  return whites > 0 && width / whites >= minWhite
}

/**
 * How many white keys to show across [width], each [minWhite] or wider:
 * the widest that fits for Auto (a null [choice]), else [choice] capped at
 * what fits (a window too narrow for it falls back to the largest that
 * fits). 0 when even one octave doesn't.
 */
export function whitesFor(width: number, choice: number | null = null, minWhite: number = MIN_WHITE): number {
  return WHITES.find((n) => (choice === null || n <= choice) && fits(width, n, minWhite)) ?? 0
}

/** Whether a [width] × [height] room can hold the piano: at least one octave of whites, and [MIN_HEIGHT] tall. */
export function hasRoom(width: number, height: number, choice: number | null = null): boolean {
  return whitesFor(width, choice) > 0 && height >= MIN_HEIGHT
}

/**
 * Whether KEYS offers its Pads ⇄ Piano switch: everywhere but a portrait
 * phone (a tall window under [COMPACT_WIDTH]), which always plays on the grid.
 */
export function switchShown(landscape: boolean, windowWidth: number): boolean {
  return landscape || windowWidth >= COMPACT_WIDTH
}

/**
 * Whether KEYS plays on the piano: never where the switch is hidden or the
 * piano has no [room]; otherwise as [view] says, AUTO being the piano when
 * the window is [landscape].
 */
export function showsPiano(view: KeysView, landscape: boolean, windowWidth: number, room: boolean): boolean {
  if (!switchShown(landscape, windowWidth) || !room) return false
  switch (view) {
    case KeysView.AUTO:
      return landscape
    case KeysView.PIANO:
      return true
    case KeysView.PADS:
      return false
  }
}

/** The piano's lowest note at [octave]: C of the octave below (OCT 4 → C3, 48). */
export function lowest(octave: number): number {
  return 12 * octave
}

/** The notes [whites] white keys cover from [lowest], black keys included; the plate ends at 127 (G9). */
export function range(octave: number, whites: number): NoteRange {
  const lo = lowest(octave)
  if (whites <= 0 || lo < 0 || lo > 127) return EMPTY_RANGE
  let hi = lo
  let count = 1
  while (count < whites && hi < 127) if (!isBlack(++hi)) count++
  return { first: lo, last: hi }
}

export function isBlack(note: number): boolean {
  return BLACK.has(((note % 12) + 12) % 12)
}

/**
 * The keys of [r] on a [w] × [h] plate, lowest first: the white keys side
 * by side, each black key centred on the seam between its two whites.
 */
export function layout(r: NoteRange, w: number, h: number): PianoKey[] {
  const notes = rangeNotes(r)
  const whites = notes.filter((n) => !isBlack(n)).length
  if (whites === 0) return []
  const white = w / whites
  let seen = 0
  return notes.map((note) => {
    if (isBlack(note)) {
      const seam = seen * white
      const drawn = white * BLACK_WIDTH
      const hit = white * BLACK_HIT_WIDTH
      return {
        note,
        black: true,
        rect: keyRect(seam - drawn / 2, 0, drawn, h * BLACK_HEIGHT),
        hitRect: keyRect(seam - hit / 2, 0, hit, h * BLACK_HEIGHT),
      }
    }
    const rect = keyRect(seen++ * white, 0, white, h)
    return { note, black: false, rect, hitRect: rect }
  })
}

/**
 * The note under ([x], [y]), or null off the plate. A finger already on
 * [current] keeps it within [slop] of its edges, so a key doesn't flicker
 * between two neighbours: from a white key a black one takes over only once
 * the finger is [slop] inside it; a black key holds until the finger is
 * [slop] outside it. A fresh touch (no [current]) takes a black key over the
 * white under it.
 */
export function keyAt(keys: readonly PianoKey[], x: number, y: number, current: number | null, slop: number): number | null {
  const held = current === null ? undefined : keys.find((k) => k.note === current)
  if (held) {
    const r = held.hitRect
    const near = x >= r.left - slop && x < rectRight(r) + slop && y >= r.top - slop && y < rectBottom(r) + slop
    if (held.black) {
      if (near) return held.note
    } else {
      // Its top is the plate's: a black key is shrunk only on the sides it shares with whites.
      const black = keys.find(
        (k) =>
          k.black &&
          x >= k.hitRect.left + slop &&
          x < rectRight(k.hitRect) - slop &&
          y >= k.hitRect.top &&
          y < rectBottom(k.hitRect) - slop,
      )
      if (black) return black.note
      if (near) return held.note
    }
  }
  return (
    keys.find((k) => k.black && rectContains(k.hitRect, x, y))?.note ??
    keys.find((k) => !k.black && rectContains(k.hitRect, x, y))?.note ??
    null
  )
}

/** Whether [note] is the root of [root]'s [scale] (any octave), in it, or outside it. */
export function mark(note: number, root: number, scale: Scale): KeyMark {
  const step = (((note - root) % 12) + 12) % 12
  if (step === 0) return KeyMark.ROOT
  return intervals(scale).includes(step) ? KeyMark.IN : KeyMark.OUT
}

/** The Kotlin `Piano` object, for call sites that read `Piano.layout(...)`. */
export const Piano = {
  WHITES,
  MIN_WHITE,
  MIN_HEIGHT,
  COMPACT_WIDTH,
  CHOICES,
  BLACK_WIDTH,
  BLACK_HEIGHT,
  BLACK_HIT_WIDTH,
  choiceOf,
  fits,
  whitesFor,
  hasRoom,
  switchShown,
  showsPiano,
  lowest,
  range,
  isBlack,
  layout,
  keyAt,
  mark,
} as const
