// Port of core/src/main/kotlin/dev/arc/ep133/features/Sequencer.kt
//
// The pattern transport's clock (arc's own, free running), which notes of a
// project's patterns play in a stretch of mix frames, and where a pattern is.
// The web has no pattern playback yet; this is the core logic only.
//
// Web deltas:
// - All times are MILLISECONDS (as in tempo.ts and sampleTiming.ts) where
//   the Kotlin uses nanoseconds: nanosOf is msOf, and it stays fractional
//   where the Kotlin rounds to whole nanoseconds.
// - TransportClock and SeqNote are plain readonly interfaces; the clock's
//   methods are functions taking it first (`clock.frameOf(t)` is
//   `frameOf(clock, t)`), also on the `TransportClock` object.
// - PatternPlayer.window takes the skip map as a ReadonlyMap and fills an
//   array (emptied first) for the Kotlin MutableList.
// - PhaseAnchors is a plain readonly interface with a const object of the
//   same name for ZERO, of and with; localTick's Double and Long overloads are
//   one function (a whole tick in, a whole tick out).
// - Kotlin's Long frames, ticks and passes are whole JS numbers;
//   PatternPosition's fraction is a double where the Kotlin's is a Float.

import { Pattern, ProjectPatterns, Seq, type PatternNote } from './pattern'
import type { FrameClock } from './sampleTiming'
import type { BeatGrid } from './tempo'

/**
 * The pattern transport's clock: global tick 0 (bar 1) falls on mix frame
 * [anchorFrame] at [rate] frames a second, and the ticks go at [bpm],
 * Seq.PPQN a beat.
 */
export interface TransportClock {
  readonly anchorFrame: number
  readonly rate: number
  readonly bpm: number
}

export function transportClock(anchorFrame: number, rate: number, bpm: number): TransportClock {
  return { anchorFrame, rate, bpm }
}

export function framesPerTick(c: TransportClock): number {
  return (c.rate * 60.0) / (c.bpm * Seq.PPQN)
}

/** The mix frame [tick] plays at, rounded half up (as barFrames). */
export function frameOf(c: TransportClock, tick: number): number {
  return c.anchorFrame + Math.floor(tick * framesPerTick(c) + 0.5)
}

/** The tick at mix frame [frame], fractional. */
export function tickAt(c: TransportClock, frame: number): number {
  return (frame - c.anchorFrame) / framesPerTick(c)
}

/** Another tempo from [atFrame] on: the tick there stays. */
export function retempo(c: TransportClock, atFrame: number, bpm: number): TransportClock {
  const next = transportClock(atFrame, c.rate, bpm)
  return { ...next, anchorFrame: atFrame - Math.floor(tickAt(c, atFrame) * framesPerTick(next) + 0.5) }
}

/** [tick] at [atFrame] of a new frame count at [rate] (the stream opened again, or another engine). */
export function rebase(c: TransportClock, atFrame: number, tick: number, rate: number): TransportClock {
  const next = transportClock(atFrame, rate, c.bpm)
  return { ...next, anchorFrame: atFrame - Math.floor(tick * framesPerTick(next) + 0.5) }
}

/**
 * The click's beats for an output stamped [out]: beat 0 on tick 0 and its
 * bar known, so the count-in's beats are −4..−1.
 */
export function beatGrid(c: TransportClock, out: FrameClock): BeatGrid {
  return { anchor: msOf(c, 0, out), beatIndex: 0, periodMs: 60000 / c.bpm, barKnown: true }
}

/** When [tick] plays on [out]'s clock (the frame it plays at, through the output's stamp). */
export function msOf(c: TransportClock, tick: number, out: FrameClock): number {
  return out.ms + ((frameOf(c, tick) - out.frame) * 1e3) / out.rate
}

/** The Kotlin `TransportClock`'s members. */
export const TransportClock = { framesPerTick, frameOf, tickAt, retempo, rebase, beatGrid, msOf } as const

/**
 * Where each group's pattern started: the global tick of its local tick 0,
 * one for each group (0..3). A pattern switched in while the transport runs
 * starts at its bar 1 on the tick the switch takes over, as the device starts
 * it, so its local tick is the global one less its anchor (localTick); all
 * are 0 when the transport starts (ZERO).
 */
export interface PhaseAnchors {
  readonly ticks: readonly number[]
}

/** [group]'s anchor; 0 for a group out of range. */
function anchorOf(a: PhaseAnchors, group: number): number {
  return a.ticks[group] ?? 0
}

/** [group]'s pattern starts at global [tick]. */
function withAnchor(a: PhaseAnchors, group: number, tick: number): PhaseAnchors {
  if (group < 0 || group > 3 || anchorOf(a, group) === tick) return a
  return { ticks: [0, 1, 2, 3].map((g) => (g === group ? tick : anchorOf(a, g))) }
}

export const PhaseAnchors = {
  ZERO: { ticks: [0, 0, 0, 0] } as PhaseAnchors,
  of: anchorOf,
  with: withAnchor,
} as const

/** A note of [group]'s pattern to play: at global [startTick], mix frame [startFrame]. */
export interface SeqNote {
  readonly group: number
  readonly note: PatternNote
  readonly startTick: number
  readonly startFrame: number
}

// The first tick whose frame is at or after [frame].
function firstTick(clock: TransportClock, frame: number): number {
  let t = Math.ceil(tickAt(clock, frame)) - 1
  while (frameOf(clock, t) < frame) t++
  return t
}

// By tick, then group.
const ORDER = (a: SeqNote, b: SeqNote): number => (a.startTick !== b.startTick ? a.startTick - b.startTick : a.group - b.group)

/**
 * Into [out] (emptied), in tick order: the notes whose start frame is in
 * [[from], [to]), so windows back to back miss and repeat none. Negative
 * ticks (the count-in) play nothing; an open pattern plays once, not
 * looping. [skip] gives a note's id the pass not to play (it was heard live
 * as it was recorded), counted from the group's anchor in [phase] (nothing of
 * a pattern plays before it). Nothing is allocated but the notes.
 */
function window(
  p: ProjectPatterns,
  clock: TransportClock,
  from: number,
  to: number,
  skip: ReadonlyMap<number, number>,
  out: SeqNote[],
  phase: PhaseAnchors = PhaseAnchors.ZERO,
): void {
  out.length = 0
  if (to <= from) return
  const first = Math.max(firstTick(clock, from), 0)
  const end = firstTick(clock, to)
  if (end <= first) return
  for (let g = 0; g < 4; g++) {
    const pat = ProjectPatterns.group(p, g)
    const len = Pattern.lengthTicks(pat)
    const anchor = anchorOf(phase, g)
    const start = Math.max(first, anchor)
    for (const n of pat.notes) {
      if (n.tick >= len) continue
      let pass = pat.open ? 0 : firstPassAtOrAfter(start, n.tick, len, anchor)
      let t = globalTickOf(n.tick, pass, len, anchor)
      while (t < end) {
        if (t >= start && (n.id === 0 || skip.size === 0 || skip.get(n.id) !== pass)) {
          out.push({ group: g, note: n, startTick: t, startFrame: frameOf(clock, t) })
        }
        if (pat.open) break
        pass++
        t += len
      }
    }
  }
  out.sort(ORDER)
}

/** Which notes of a project's patterns play in a stretch of mix frames. */
export const PatternPlayer = { window } as const

/**
 * The time since a pattern's [anchor] (PhaseAnchors) at [globalTick]: what
 * localTick takes the loop out of, and what a press is quantized on.
 */
export function sinceAnchor(globalTick: number, anchor: number): number {
  return globalTick - anchor
}

/**
 * [globalTick] on a pattern's own clock (where a global tick becomes a local
 * one, with sinceAnchor, passOf, firstPassAtOrAfter and globalTickOf): the time
 * since its [anchor] (PhaseAnchors), round its loop unless it is open, where it
 * grows instead. Below 0 before the anchor for an open pattern.
 */
export function localTick(globalTick: number, anchor: number, p: Pattern): number {
  const t = sinceAnchor(globalTick, anchor)
  if (p.open) return t
  const len = Pattern.lengthTicks(p)
  return t - Math.floor(t / len) * len
}

/**
 * Which pass of a pattern [lengthTicks] long global [globalTick] falls in,
 * counted from its [anchor]: 0 for the first, −1 before it (the count-in).
 */
export function passOf(globalTick: number, lengthTicks: number, anchor = 0): number {
  return Math.floor(sinceAnchor(globalTick, anchor) / lengthTicks)
}

/** The first pass in which a note at [noteTick] of a pattern [lengthTicks] long plays at or after global [globalTick], counted from its [anchor]. */
export function firstPassAtOrAfter(globalTick: number, noteTick: number, lengthTicks: number, anchor = 0): number {
  return Math.floor((sinceAnchor(globalTick, anchor) - noteTick + lengthTicks - 1) / lengthTicks)
}

/** The global tick a note at [noteTick] plays in [pass] of a pattern [lengthTicks] long, counted from its [anchor]. */
export function globalTickOf(noteTick: number, pass: number, lengthTicks: number, anchor = 0): number {
  return anchor + noteTick + pass * lengthTicks
}

/** The first loop start (the [anchor] and a whole number of [lengthTicks] on) at or after [globalTick]: the anchor before it (the count-in). */
export function nextLoopStart(globalTick: number, lengthTicks: number, anchor = 0): number {
  return anchor + Math.max(Math.ceil((globalTick - anchor) / lengthTicks), 0) * lengthTicks
}

/** Where a pattern is: [bar] and [beat] from 1, of [bars], and [fraction] of the way through the loop (0..1). */
export interface PatternPosition {
  readonly bar: number
  readonly beat: number
  readonly bars: number
  readonly fraction: number
}

/** Where [p], started at global tick [anchor], is at global [globalTick]; the count-in (and before the anchor) shows its start. */
export function positionOf(globalTick: number, p: Pattern, anchor = 0): PatternPosition {
  const len = Pattern.lengthTicks(p)
  const t = globalTick <= anchor ? 0 : localTick(globalTick, anchor, p)
  const bar = Math.floor(t / Seq.TICKS_PER_BAR)
  const beat = Math.floor((t - bar * Seq.TICKS_PER_BAR) / Seq.PPQN)
  return { bar: bar + 1, beat: beat + 1, bars: p.bars, fraction: Math.min(Math.max(t / len, 0), 1) }
}
