// Port of core/src/main/kotlin/dev/arc/ep133/features/Piano.kt
//
// Live's landscape KEYS (an addition): a chromatic piano across the screen in
// place of the EP-133's 4×3 keypad. Every note plays; the key and scale only
// mark the keys (mark). It starts on a C, an octave under OCT's own C, so
// OCT 4 shows C3–C5 with the sound's own pitch (C4) in the middle.
//
// Web delta: Kotlin's IntRange is a {first, last} pair (empty when last <
// first), and the enum KeyMark is a const object plus a string-union type.

import { intervals, type Scale } from './keys'

/** Where a note stands in KEYS' key: its root, another note of the scale, or outside it. */
export const KeyMark = { ROOT: 'ROOT', IN: 'IN', OUT: 'OUT' } as const
export type KeyMark = (typeof KeyMark)[keyof typeof KeyMark]

/** An inclusive range of MIDI notes; empty when last < first. */
export interface NoteRange {
  readonly first: number
  readonly last: number
}

export const EMPTY_RANGE: NoteRange = Object.freeze({ first: 0, last: -1 })

export function rangeNotes(r: NoteRange): number[] {
  const out: number[] = []
  for (let n = r.first; n <= r.last; n++) out.push(n)
  return out
}

export const inRange = (r: NoteRange, note: number): boolean => note >= r.first && note <= r.last

/** A rectangle on the piano, in whatever unit its width and height came in (px or dp). */
export interface KeyRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export const right = (r: KeyRect): number => r.left + r.width
export const bottom = (r: KeyRect): number => r.top + r.height

/** Inside, with the left and top edges in and the right and bottom out, so neighbours never share a point. */
export function contains(r: KeyRect, x: number, y: number): boolean {
  return x >= r.left && x < right(r) && y >= r.top && y < bottom(r)
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

/** The white keys it can show, widest first: three octaves, two, one and a half (C–G), one. */
export const WHITES: readonly number[] = Object.freeze([22, 15, 12, 8])
/** A white key is never narrower than this (CSS px): under it the grid stays instead. */
export const MIN_WHITE = 44

// Black keys against a white one: drawn as the KEYS strip draws them (a touch longer),
// hit a little wider so a finger meant for the narrow key finds it.
export const BLACK_WIDTH = 0.6
export const BLACK_HEIGHT = 0.62
export const BLACK_HIT_WIDTH = 0.72

const BLACK = new Set([1, 3, 6, 8, 10])

/** How many white keys fit [width] at [minWhite] or wider each; 0 when even one octave doesn't. */
export function whitesFor(width: number, minWhite: number = MIN_WHITE): number {
  return WHITES.find((n) => width / n >= minWhite) ?? 0
}

/** The piano's lowest note at [octave]: C of the octave below (OCT 4 → C3, 48). */
export function lowest(octave: number): number {
  return 12 * octave
}

export function isBlack(note: number): boolean {
  return BLACK.has(((note % 12) + 12) % 12)
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

/**
 * The keys of [r] on a [w] × [h] plate, lowest first: the white keys side by
 * side, each black key centred on the seam between its two whites.
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
        rect: { left: seam - drawn / 2, top: 0, width: drawn, height: h * BLACK_HEIGHT },
        hitRect: { left: seam - hit / 2, top: 0, width: hit, height: h * BLACK_HEIGHT },
      }
    }
    const rect = { left: seen++ * white, top: 0, width: white, height: h }
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
  if (held !== undefined) {
    const r = held.hitRect
    const near = x >= r.left - slop && x < right(r) + slop && y >= r.top - slop && y < bottom(r) + slop
    if (held.black) {
      if (near) return held.note
    } else {
      // Its top is the plate's: a black key is shrunk only on the sides it shares with whites.
      const over = keys.find(
        (k) => k.black && x >= k.hitRect.left + slop && x < right(k.hitRect) - slop && y >= k.hitRect.top && y < bottom(k.hitRect) - slop,
      )
      if (over !== undefined) return over.note
      if (near) return held.note
    }
  }
  return (keys.find((k) => k.black && contains(k.hitRect, x, y)) ?? keys.find((k) => !k.black && contains(k.hitRect, x, y)))?.note ?? null
}

/** Whether [note] is the root of [root]'s [scale] (any octave), in it, or outside it. */
export function mark(note: number, root: number, scale: Scale): KeyMark {
  const step = (((note - root) % 12) + 12) % 12
  if (step === 0) return KeyMark.ROOT
  return intervals(scale).includes(step) ? KeyMark.IN : KeyMark.OUT
}

/** The Kotlin `Piano` object, for call sites that read `Piano.range(...)`. */
export const Piano = {
  WHITES,
  MIN_WHITE,
  BLACK_WIDTH,
  BLACK_HEIGHT,
  BLACK_HIT_WIDTH,
  whitesFor,
  lowest,
  range,
  isBlack,
  layout,
  keyAt,
  mark,
} as const
