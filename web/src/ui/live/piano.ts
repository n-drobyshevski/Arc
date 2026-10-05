// Port of app/src/main/kotlin/dev/arc/ep133/ui/screens/MirrorScreen.kt and PianoKeyboard.kt (the piano's maths)
//
// The pure parts of Live's landscape piano, factored out so they can be
// tested: whether the piano shows (else the 4×3 grid stays), how lit each key
// is from the device's notes, the device notes past either end, and the
// fingers on the keys (PianoFingers: Compose's pointer loop, fed by pointer
// events).

import type { PadLight } from '../../core/features/liveMirror'
import { NoteTouches, type NoteEvent } from '../../core/features/noteTouches'
import { Piano, inRange, whitesFor, type NoteRange, type PianoKey } from '../../core/features/piano'
import { glow } from './glow'

/** How far (px) a finger may stray past a key's edge before the next key takes over (keyAt's slop). */
export const SLIDE_SLOP = 8

/** Under this the plate is too low to play, and the grid stays (a narrow split screen). */
export const MIN_PIANO_HEIGHT = 120
/** On a tall window (a tablet, a computer) the piano stops at this height. */
export const MAX_PIANO_HEIGHT = 340

/**
 * How many white keys the piano shows on a [width] × [height] plate in a
 * landscape window, or 0 to keep the grid: a portrait window, a plate too
 * narrow for one octave at 44 px a white key, or too low to play.
 */
export function pianoWhites(isLandscape: boolean, width: number, height: number): number {
  if (!isLandscape || height < MIN_PIANO_HEIGHT) return 0
  return whitesFor(width)
}

/** How lit each piano key is now: its own note's glow, exactly (note -> 0..1). */
export function pianoLit(notes: ReadonlyMap<number, PadLight>, range: NoteRange, now: number): Map<number, number> {
  const lit = new Map<number, number>()
  for (const [n, l] of notes) {
    if (!inRange(range, n)) continue
    const g = glow(l, now)
    if (g > 0) lit.set(n, g)
  }
  return lit
}

/** The device's notes sounding past either end of the piano, the latest each side (for the ◂ / ▸ ticks). */
export function pastEnds(notes: ReadonlyMap<number, PadLight>, range: NoteRange, now: number): { below: number | null; above: number | null } {
  let below: { note: number; at: number } | null = null
  let above: { note: number; at: number } | null = null
  for (const [n, l] of notes) {
    if (inRange(range, n) || glow(l, now) <= 0) continue
    if (n < range.first) {
      if (below === null || l.onAt >= below.at) below = { note: n, at: l.onAt }
    } else if (above === null || l.onAt >= above.at) above = { note: n, at: l.onAt }
  }
  return { below: below?.note ?? null, above: above?.note ?? null }
}

/** A finger on the plate: its note, and where it was when that note last changed (and on which layout). */
interface Finger {
  note: number | null
  x: number
  y: number
  gen: number
}

/**
 * The fingers on the piano, one per pointer id, in the plate's own px. A
 * finger sliding onto the next key lets go of one note and plays the next (a
 * glissando); a black key takes over from a white one once the finger is the
 * slop inside it (keyAt). When the keys move under resting fingers (− / +,
 * [relayout]), each keeps its note until it moves more than the slop from
 * where it rested. The events say what to play and let go of (NoteTouches).
 */
export class PianoFingers {
  private readonly touches = new NoteTouches()
  private readonly fingers = new Map<number, Finger>()
  private gen = 0

  constructor(private readonly slop: number = SLIDE_SLOP) {}

  /** The keys moved under the fingers (the octave stepped). */
  relayout(): void {
    this.gen++
  }

  /** Pointer [id] went down at ([x], [y]) on [keys]; off every key, it is not followed. */
  down(id: number, x: number, y: number, keys: readonly PianoKey[]): NoteEvent[] {
    const note = Piano.keyAt(keys, x, y, null, this.slop)
    if (note === null) return []
    this.fingers.set(id, { note, x, y, gen: this.gen })
    return this.touches.down(id, note)
  }

  /** Pointer [id] moved to ([x], [y]). */
  move(id: number, x: number, y: number, keys: readonly PianoKey[]): NoteEvent[] {
    const f = this.fingers.get(id)
    if (!f) return []
    const fresh = f.gen !== this.gen
    // The keys moved under a resting finger: it keeps its note until it moves on.
    if (fresh && Math.hypot(x - f.x, y - f.y) <= this.slop) return []
    const note = Piano.keyAt(keys, x, y, fresh ? null : f.note, this.slop)
    if (note === f.note && !fresh) return []
    this.fingers.set(id, { note, x, y, gen: this.gen })
    return this.touches.move(id, note)
  }

  /** Pointer [id] lifted, was cancelled or lost. */
  up(id: number): NoteEvent[] {
    if (!this.fingers.delete(id)) return []
    return this.touches.up(id)
  }

  /** Every finger gone at once (the keys went away). */
  releaseAll(): NoteEvent[] {
    this.fingers.clear()
    return this.touches.releaseAll()
  }

  /** Whether pointer [id] is being followed. */
  has(id: number): boolean {
    return this.fingers.has(id)
  }
}
