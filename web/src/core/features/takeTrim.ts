// Port of core/src/main/kotlin/dev/arc/ep133/features/TakeTrim.kt
//
// A take's trim (an addition): the frames from [start] to [end] (exclusive)
// that SHARE, SAVE, EP and PLAY use. Nothing is cut: the take's file stays
// whole and the trim is kept beside it as text ([text]), so RESET brings the
// whole take back.
//
// Web deltas:
// - The companion object's constant and functions are static members
//   (TakeTrim.MIN_SECONDS, TakeTrim.of, ...); Kotlin Longs are numbers.
// - range() is a half-open TrimRange, as sampleTrim's are (Kotlin's
//   `start until end`).
// - peaks reads the PCM as bytes (signed 16-bit little-endian, interleaved,
//   as everywhere else in arc) through sampleTrim.peaks, which is the same
//   walk.

import { peaks as samplePeaks, type Peak, type TrimRange } from './sampleTrim'

// Kotlin's coerceIn (min <= max here).
function coerceIn(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Kotlin String.toLongOrNull(): an optional sign then ASCII digits. */
function toLongOrNull(s: string): number | null {
  return /^[+-]?[0-9]+$/.test(s) ? Number(s) : null
}

export class TakeTrim {
  constructor(
    readonly start: number,
    readonly end: number,
  ) {}

  get frames(): number {
    return this.end - this.start
  }

  /** As kept in the take's .trim file: "start end". */
  text(): string {
    return `${this.start} ${this.end}`
  }

  /** The trim as an upload's frames (the Device tab's TRIM). */
  range(): TrimRange {
    return { start: this.start, end: this.end }
  }

  /** The shortest part a trim keeps. */
  static readonly MIN_SECONDS = 0.1

  /** The shortest part, in frames, at [rate]. */
  static minFrames(rate: number): number {
    return Math.max(1, Math.trunc(TakeTrim.MIN_SECONDS * rate))
  }

  /**
   * [start] to [end] in a take of [total] frames at [rate]: kept inside
   * it, at least [MIN_SECONDS] long (the end moves, else the start), or
   * null when that is the whole take.
   */
  static of(start: number, end: number, total: number, rate: number): TakeTrim | null {
    if (total <= 0) return null
    const least = Math.min(TakeTrim.minFrames(rate), total)
    let s = coerceIn(start, 0, total - least)
    let e = coerceIn(end, 0, total)
    if (e - s < least) {
      e = Math.min(total, s + least)
      s = e - least
    }
    return s === 0 && e === total ? null : new TakeTrim(s, e)
  }

  /** A .trim file's text for a take of [total] frames: null when it isn't one, or is the whole take. */
  static parse(text: string, total: number, rate: number): TakeTrim | null {
    // Java's \s: ASCII whitespace only.
    const parts = text.trim().split(/[ \t\n\x0B\f\r]+/)
    if (parts.length !== 2) return null
    const s = toLongOrNull(parts[0]!)
    if (s === null) return null
    const e = toLongOrNull(parts[1]!)
    if (e === null) return null
    if (e <= s) return null
    return TakeTrim.of(s, e, total, rate)
  }

  /** [columns] min/max pairs of interleaved [pcm] across its channels, for the glass's wave. */
  static peaks(pcm: Uint8Array, channels: number, columns: number): Peak[] {
    return samplePeaks(pcm, Math.max(1, channels), columns)
  }
}
