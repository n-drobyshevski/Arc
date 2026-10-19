// Port of core/src/main/kotlin/dev/arc/ep133/features/Tempo.kt
//
// Live's TEMPO key (an addition): the phone's click, its tempo, and following
// the EP-133's MIDI clock.
//
// Web deltas: all times are MILLISECONDS (MIDIMessageEvent timeStamp /
// performance.now()), where the Kotlin uses nanoseconds, and stay fractional
// where the Kotlin rounds to whole nanoseconds (BeatGrid.at, the fitted
// anchor); TapTempo's resetNs is resetMs and BeatGrid's periodNs is
// periodMs; BeatGrid is an interface with free functions (gridAt, ...) for
// its methods; @Synchronized is dropped (single-threaded JS).

import type { MidiEvent } from '../protocol/midiInput'
import { CLOCK_TIMEOUT_MS } from './liveMirror'

export const MIN = 40
export const MAX = 240
export const DEFAULT = 120
/** The click accents a bar's first beat, in 4/4 (the EP-133's own count). */
export const BEATS_PER_BAR = 4
/** MIDI clocks per quarter note. */
export const TICKS_PER_BEAT = 24

export function clamp(bpm: number): number {
  return Math.min(Math.max(bpm, MIN), MAX)
}

/** [bpm] rounded half up (JS Math.round) and clamped. */
export function round(bpm: number): number {
  return clamp(Math.floor(bpm + 0.5))
}

/** The Kotlin `object Tempo`. */
export const Tempo = { MIN, MAX, DEFAULT, BEATS_PER_BAR, TICKS_PER_BEAT, clamp, round } as const

/**
 * Tap tempo: the mean of up to the last [maxTaps] − 1 intervals. A pause
 * longer than [resetMs] starts again; so does an interval more than half off
 * the mean so far, from the tap before it (a changed mind, not jitter).
 */
export class TapTempo {
  private readonly taps: number[] = []

  constructor(
    private readonly maxTaps = 5,
    private readonly resetMs = 2000,
  ) {}

  /** A tap at [at]: the tempo the taps give, rounded and clamped; null on a run's first tap. */
  tap(at: number): number | null {
    const taps = this.taps
    const last = taps.length > 0 ? taps[taps.length - 1]! : null
    if (last !== null) {
      const interval = at - last
      if (interval <= 0 || interval > this.resetMs) {
        taps.length = 0
      } else if (taps.length >= 2) {
        const mean = (last - taps[0]!) / (taps.length - 1)
        if (interval > mean * 1.5 || interval < mean * 0.5) {
          taps.length = 0
          taps.push(last)
        }
      }
    }
    taps.push(at)
    while (taps.length > this.maxTaps) taps.shift()
    if (taps.length < 2) return null
    const mean = (taps[taps.length - 1]! - taps[0]!) / (taps.length - 1)
    return round(60000 / mean)
  }

  reset(): void {
    this.taps.length = 0
  }
}

/**
 * A beat to click or flash: the [index]th counted (from Start when one was
 * seen), at [at] ms; [accent] on a bar's first beat, only while the bar is
 * known.
 */
export interface Beat {
  index: number
  at: number
  accent: boolean
}

/**
 * The device's beats as fitted from its clock: beat [beatIndex] falls at
 * [anchor] (ms) and the rest every [periodMs] from it. [barKnown] once a
 * Start was seen and the device counts its clocks: then the beats are in
 * phase with the device's and index 0, 4, 8 … start its bars. Without it
 * only the tempo is the device's; the phase comes from whichever clock was
 * counted first.
 */
export interface BeatGrid {
  anchor: number
  beatIndex: number
  periodMs: number
  barKnown: boolean
}

export function gridBpm(g: BeatGrid): number {
  return 60000 / g.periodMs
}

/** When beat [index] falls. */
export function gridAt(g: BeatGrid, index: number): number {
  return g.anchor + (index - g.beatIndex) * g.periodMs
}

/** The first beat at or after [t]. */
export function gridIndexFrom(g: BeatGrid, t: number): number {
  return g.beatIndex + Math.ceil((t - g.anchor) / g.periodMs)
}

export function gridAccent(g: BeatGrid, index: number): boolean {
  return g.barKnown && (((index % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR) === 0
}

export function gridBeat(g: BeatGrid, index: number): Beat {
  return { index, at: gridAt(g, index), accent: gridAccent(g, index) }
}

/** Clocks needed for a tempo, as for Live's BPM. */
export const MIN_CLOCKS = 25

/**
 * Follows the EP-133's MIDI clock (24 a beat) for the click and the TEMPO
 * key's light. The clocks' times are fitted to a line (least squares over
 * the last [window]), so the beats come out steady through the MIDI
 * receiver's jitter.
 *
 * - Start counts from 0: the first clock after it is a bar's first beat.
 * - Stop holds the count; Continue goes on from it. Clocks while stopped
 *   keep the tempo but count nothing.
 * - Opened while the device plays (no Start seen), the tempo is followed and
 *   the phase is unknown until the next Start.
 * - Like Live's BPM: no grid under [MIN_CLOCKS] clocks, or after
 *   [CLOCK_TIMEOUT_MS] without one. Except after a Start, a Continue or a
 *   pause in the clock: the clocks before it go (a gap would drag the fit),
 *   but the tempo they gave is held, so the grid is there from the first
 *   clock after it, in the device's phase, until enough new ones are fitted.
 */
export class ClockFollow {
  static readonly MIN_CLOCKS = MIN_CLOCKS

  /** [clock number, time]; the number counts every clock, so the fit spans stops. */
  private readonly clocks: [number, number][] = []
  private seq = 0
  /** The count of the next clock while playing (24 per beat). */
  private nextTick = 0
  /** The count of the last clock, and its number in [clocks]. */
  private lastTick = -1
  private lastTickSeq = -1
  private stopped = false
  private barKnown = false
  /** The last fitted tempo, ms a clock, held over a [drop] (NaN: none yet). */
  private held = NaN

  constructor(private readonly window = 48) {}

  /** Feeds one event; a [Beat] when it is a clock that lands on a beat. */
  onMidi(e: MidiEvent): Beat | null {
    switch (e.type) {
      case 'Clock': {
        const clocks = this.clocks
        const prev = clocks.length > 0 ? clocks[clocks.length - 1]! : null
        if (prev !== null && e.time - prev[1] > CLOCK_TIMEOUT_MS) this.drop()
        clocks.push([++this.seq, e.time])
        while (clocks.length > this.window) clocks.shift()
        if (this.stopped) return null
        const tick = this.nextTick++
        this.lastTick = tick
        this.lastTickSeq = this.seq
        if (tick % TICKS_PER_BEAT !== 0) return null
        const index = tick / TICKS_PER_BEAT
        return { index, at: e.time, accent: this.barKnown && index % BEATS_PER_BAR === 0 }
      }
      case 'Start':
        // As LiveMirror: a gap before Start would drag the fit.
        this.drop()
        this.nextTick = 0
        this.lastTick = -1
        this.stopped = false
        this.barKnown = true
        break
      case 'Continue':
        this.drop()
        this.stopped = false
        break
      case 'Stop':
        this.stopped = true
        break
      default:
        break
    }
    return null
  }

  /** Clears the clocks, holding the tempo they gave. */
  private drop(): void {
    const slope = this.slopeOf()
    if (slope !== null) this.held = slope
    this.clocks.length = 0
  }

  /** The clocks' fitted ms a clock (least squares), or null under [MIN_CLOCKS]. */
  private slopeOf(): number | null {
    const clocks = this.clocks
    if (clocks.length < MIN_CLOCKS) return null
    const [n0, t0] = clocks[0]!
    let sx = 0
    let sy = 0
    for (const [n, t] of clocks) {
      sx += n - n0
      sy += t - t0
    }
    const mx = sx / clocks.length
    const my = sy / clocks.length
    let sxy = 0
    let sxx = 0
    for (const [n, t] of clocks) {
      const dx = n - n0 - mx
      sxy += dx * (t - t0 - my)
      sxx += dx * dx
    }
    const slope = sxy / sxx
    return slope > 0 ? slope : null
  }

  /** The beats at [now], or null while the tempo isn't known. */
  grid(now: number): BeatGrid | null {
    const clocks = this.clocks
    if (clocks.length === 0 || now - clocks[clocks.length - 1]![1] > CLOCK_TIMEOUT_MS) return null
    // Too few clocks since a Start: the tempo held from before it, laid through them.
    const slope = this.slopeOf() ?? (clocks.length < MIN_CLOCKS && !Number.isNaN(this.held) ? this.held : null)
    if (slope === null) return null
    // time = t0 + mean + slope * (n - meanN), relative to the first clock.
    const [n0, t0] = clocks[0]!
    let sx = 0
    let sy = 0
    for (const [n, t] of clocks) {
      sx += n - n0
      sy += t - t0
    }
    const mx = sx / clocks.length
    const my = sy / clocks.length
    const timeOf = (n: number): number => t0 + my + slope * (n - n0 - mx)
    // Beats go by the play count when the last clock was counted (as onMidi's do),
    // else (clocks while stopped) by clock number.
    const lastN = clocks[clocks.length - 1]![0]
    const counted = this.lastTick >= 0 && this.lastTickSeq === lastN
    const count = counted ? this.lastTick : lastN
    const beatIndex = Math.floor(count / TICKS_PER_BEAT)
    const beatN = lastN - (count - beatIndex * TICKS_PER_BEAT)
    return { anchor: timeOf(beatN), beatIndex, periodMs: slope * TICKS_PER_BEAT, barKnown: counted && this.barKnown }
  }

  reset(): void {
    this.clocks.length = 0
    this.seq = 0
    this.nextTick = 0
    this.lastTick = -1
    this.lastTickSeq = -1
    this.stopped = false
    this.barKnown = false
    this.held = NaN
  }
}
