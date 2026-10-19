// Port of core/src/main/kotlin/dev/arc/ep133/features/SampleTiming.kt
//
// SAMPLE's timing (an addition): an input stream's timestamp, the count-in
// before a take of set bars, and the EP-133's PLAY starting one. The web has
// no SAMPLE mode; this is the core logic only.
//
// Web deltas:
// - All times are MILLISECONDS (as in tempo.ts's Beat), where the Kotlin uses
//   nanoseconds: FrameClock's `nanos` is `ms`, CountIn.onBeat's periodNs is
//   periodMs and Start's atNanos is atMs. Start's time stays fractional where
//   the Kotlin rounds it to whole nanoseconds; frameAt still rounds to a
//   whole frame half up, as the Kotlin does.
// - FrameClock is a plain readonly interface and `clock.frameAt(t)` is
//   `frameAt(clock, t)`.
// - The sealed CountIn.Step is a tagged union (CountInStep, {type:
//   'Waiting' | 'Counting' | 'Start', ...}) with Waiting / Counting / Start
//   constructors.

import { BEATS_PER_BAR, type Beat } from './tempo'

/**
 * An input stream's timestamp: [frame] was captured at [ms]
 * (performance.now()) at [rate] frames a second. SAMPLE uses it to turn a
 * moment (a pad press, the downbeat after a count-in) into the input frame
 * recorded then.
 */
export interface FrameClock {
  readonly frame: number
  readonly ms: number
  readonly rate: number
}

/** The frame [clock] captured at [t] ms, before or after the stamp; rounded half up. */
export function frameAt(clock: FrameClock, t: number): number {
  return clock.frame + Math.floor(((t - clock.ms) * clock.rate) / 1e3 + 0.5)
}

export type CountInStep =
  /** Before the bar's first beat. */
  | { readonly type: 'Waiting' }
  /** Beat [beat] of the count, 1 to [beats] − 1. */
  | { readonly type: 'Counting'; readonly beat: number }
  /** The last beat of the count: the take starts at [atMs]. */
  | { readonly type: 'Start'; readonly atMs: number }

export const Waiting: CountInStep = { type: 'Waiting' }
export const Counting = (beat: number): CountInStep => ({ type: 'Counting', beat })
export const Start = (atMs: number): CountInStep => ({ type: 'Start', atMs })

/**
 * SAMPLE's count-in before a take of set bars (an addition): the click's
 * beats go in, and it waits for a bar's first beat (an accented one), counts
 * from it, and on the last of [beats] beats gives when the take starts: the
 * beat after it. Beats skipped (a late click) still count by their index; a
 * count going back, as on a new Start from the EP-133, starts again from the
 * next accent. After Start it waits for an accent again.
 */
export class CountIn {
  // The beat the count started on, while counting.
  private downbeat: Beat | null = null

  constructor(readonly beats: number = BEATS_PER_BAR) {}

  /** [beat] was clicked, beats being [periodMs] apart. */
  onBeat(beat: Beat, periodMs: number): CountInStep {
    const down = this.downbeat
    const n = down == null ? 0 : beat.index - down.index + 1
    if (n < 1) {
      if (!beat.accent) {
        this.downbeat = null
        return Waiting
      }
      this.downbeat = beat
      return this.beats <= 1 ? this.start(beat, 1, periodMs) : Counting(1)
    }
    return n >= this.beats ? this.start(beat, n, periodMs) : Counting(n)
  }

  reset(): void {
    this.downbeat = null
  }

  // From the latest beat rather than the downbeat, so a tempo nudged during the count is followed.
  private start(beat: Beat, n: number, periodMs: number): CountInStep {
    this.downbeat = null
    return Start(beat.at + (this.beats - n + 1) * periodMs)
  }
}

/** Whether the EP-133 just started playing: [playing] now and not before ([was]); unknown counts as not. */
export function followStart(playing: boolean | null, was: boolean | null): boolean {
  return playing === true && was !== true
}
