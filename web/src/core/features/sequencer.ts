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
 * as it was recorded). Nothing is allocated but the notes.
 */
function window(
  p: ProjectPatterns,
  clock: TransportClock,
  from: number,
  to: number,
  skip: ReadonlyMap<number, number>,
  out: SeqNote[],
): void {
  out.length = 0
  if (to <= from) return
  const first = Math.max(firstTick(clock, from), 0)
  const end = firstTick(clock, to)
  if (end <= first) return
  for (let g = 0; g < 4; g++) {
    const pat = ProjectPatterns.group(p, g)
    const len = Pattern.lengthTicks(pat)
    for (const n of pat.notes) {
      if (n.tick >= len) continue
      let pass = pat.open ? 0 : Math.floor((first - n.tick + len - 1) / len)
      let t = n.tick + pass * len
      while (t < end) {
        if (t >= first && (n.id === 0 || skip.size === 0 || skip.get(n.id) !== pass)) {
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

/** Which pass of a pattern [lengthTicks] long global [globalTick] falls in: 0 for the first, −1 in the count-in. */
export function passOf(globalTick: number, lengthTicks: number): number {
  return Math.floor(globalTick / lengthTicks)
}

/** The first loop start (a whole number of [lengthTicks]) at or after [globalTick]: 0 during the count-in. */
export function nextLoopStart(globalTick: number, lengthTicks: number): number {
  return Math.max(Math.ceil(globalTick / lengthTicks), 0) * lengthTicks
}

/** Where a pattern is: [bar] and [beat] from 1, of [bars], and [fraction] of the way through the loop (0..1). */
export interface PatternPosition {
  readonly bar: number
  readonly beat: number
  readonly bars: number
  readonly fraction: number
}

/** Where [p] is at global [globalTick]; the count-in shows its start. */
export function positionOf(globalTick: number, p: Pattern): PatternPosition {
  const len = Pattern.lengthTicks(p)
  const t = globalTick <= 0 ? 0 : p.open ? globalTick : globalTick - Math.floor(globalTick / len) * len
  const bar = Math.floor(t / Seq.TICKS_PER_BAR)
  const beat = Math.floor((t - bar * Seq.TICKS_PER_BAR) / Seq.PPQN)
  return { bar: bar + 1, beat: beat + 1, bars: p.bars, fraction: Math.min(Math.max(t / len, 0), 1) }
}
