// Port of core/src/main/kotlin/dev/arc/ep133/features/Steps.kt
//
// A pattern as steps, as the device steps through it while stopped (− / +,
// and RECORD + pad to place a note): one step a TIMING interval, swung as the
// grid is. Every interval but 'off' divides a bar, so a pattern of n bars has
// exactly n * 384 / ticks steps. The interval is never 'off' here: callers
// pass TimingSettings' interval, whatever the quantize mode is. Pure.
//
// Web deltas:
// - The object's functions are on the `Steps` const object.
// - occupied gives a boolean[] (Kotlin's BooleanArray).
// - padsOn gives a Set of `Steps.padKey(offset, semitones)` strings
//   ("3:n" for pad 3's hit, "3:2" for its KEYS note 2 semitones up) where the
//   Kotlin gives (offset, semitones) Pairs, as JS Sets have no value equality
//   for tuples.

import { Pattern, quantize, swingOffset, timingTicks, type PatternNote, type Timing } from './pattern'

/** How many steps [p] has at [interval]. */
function count(p: Pattern, interval: Timing): number {
  return Math.trunc(Pattern.lengthTicks(p) / timingTicks(interval))
}

/** The tick step [step] plays at: its place on the grid, played late by the swing on the odd ones. */
function tickOf(step: number, interval: Timing, swing: number): number {
  return step * timingTicks(interval) + swingOffset(interval, step, swing)
}

/**
 * The step a note at [tick] sits on: the nearest point of the swung grid (as
 * recording snaps to it), of [count]. A swung point k lies within half a step
 * after k * ticks, so the step is the grid tick's whole steps; a note near the
 * end rounds up to [count], which is step 0.
 */
function indexOf(tick: number, interval: Timing, swing: number, count: number): number {
  const k = Math.floor(quantize(interval, tick, swing) / timingTicks(interval))
  return floorMod(k, count)
}

/** The notes that play on [step], in the pattern's order; notes past the end aren't on any. */
function notesOn(p: Pattern, step: number, interval: Timing, swing: number): PatternNote[] {
  const n = count(p, interval)
  const len = Pattern.lengthTicks(p)
  return p.notes.filter((note) => note.tick < len && indexOf(note.tick, interval, swing, n) === step)
}

/** For each step, whether a note plays on it: what the step strip marks. */
function occupied(p: Pattern, interval: Timing, swing: number): boolean[] {
  const n = count(p, interval)
  const len = Pattern.lengthTicks(p)
  const out = new Array<boolean>(n).fill(false)
  for (const note of p.notes) if (note.tick < len) out[indexOf(note.tick, interval, swing, n)] = true
  return out
}

/** A pad's note as padsOn keys it: "3:n" for pad 3's hit, "3:2" for its KEYS note [semitones] 2. */
function padKey(offset: number, semitones: number | null): string {
  return `${offset}:${semitones ?? 'n'}`
}

/** The pads with a note on [step], by padKey: what lights, a KEYS note by its pitch. */
function padsOn(p: Pattern, step: number, interval: Timing, swing: number): Set<string> {
  return new Set(notesOn(p, step, interval, swing).map((n) => padKey(n.offset, n.semitones)))
}

/** [step] wrapped round the [count] steps, as − / + go past either end. */
function clampStep(step: number, count: number): number {
  return floorMod(step, count)
}

/** The step at [to] where [step] at [from] starts (rounded down): the cursor keeps its place when the interval changes. */
function convert(step: number, from: Timing, to: Timing): number {
  return Math.trunc((step * timingTicks(from)) / timingTicks(to))
}

function floorMod(x: number, m: number): number {
  return ((x % m) + m) % m
}

export const Steps = { count, tickOf, indexOf, notesOn, occupied, padKey, padsOn, clampStep, convert } as const
