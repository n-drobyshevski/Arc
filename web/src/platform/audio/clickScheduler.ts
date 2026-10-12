// Port of app/src/main/kotlin/dev/arc/ep133/audio/ClickScheduler.kt (and ClickSound.kt's ClickTrack)
//
// Where the clicks fall in Live's mix, block by block, to the frame, and the
// click's sound laid into a block.
//
// Web deltas:
// - Everything is in mix frames: the grid comes worked out in frames
//   ([FrameGrid]: the main thread maps the EP-133's beats through the output's
//   stamp, and the pattern's are its clock's), so there is no timestamp here,
//   and a click's Beat carries its frame where Kotlin's carries when it is heard.
// - The click is mixed into Live's own output (after TAKE has taken the
//   block, so a take leaves it out, as Kotlin's own click stream does).

import { BEATS_PER_BAR, clamp } from '../../core/features/tempo'
import { ClickSound } from './patternScheduler'

/** Beats in mix frames: beat [beatIndex] at [anchorFrame], the rest every [periodFrames]; the bar known: 0, 4, 8 … are accented. */
export interface FrameGrid {
  readonly anchorFrame: number
  readonly beatIndex: number
  readonly periodFrames: number
  readonly barKnown: boolean
}

/** A click at mix [frame]: beat [index], [accent] on a bar's first. */
export interface Click {
  readonly frame: number
  readonly index: number
  readonly accent: boolean
}

/**
 * Where the clicks fall:
 * - Free run, at the phone's tempo: the next beat's frame is kept fractional
 *   and moved on a beat's frames at each click, so the beats never drift; a
 *   new tempo applies from the beat after the next.
 * - On a grid (the EP-133's clock, or the pattern's): a beat up to
 *   [LATE_MS] past is clicked at once; one further past is skipped.
 * - Clicks closer than [MIN_GAP] of a beat are one beat (a grid re-fitted,
 *   or the switch from free run to a grid).
 * - When the grid goes, it runs free on from the last click, at the phone's
 *   tempo, counting on from the grid's beat.
 */
export class ClickScheduler {
  /** A beat this little past is still clicked, at the block's start. */
  static readonly LATE_MS = 2
  /** Clicks closer than this share of a beat are one beat. */
  static readonly MIN_GAP = 0.4

  private readonly clicks: Click[] = []
  // The free run's next beat (NaN: from the last click, or now), and its number.
  private next = NaN
  private index = 0
  // The last click's frame (NaN: none yet), and whether the bar is known.
  private last = NaN
  private barKnown = true

  constructor(private readonly rate: number) {}

  /** Forgets where it was: the next block starts a free run at once (the click turned on). */
  reset(): void {
    this.next = NaN
    this.last = NaN
    this.index = 0
    this.barKnown = true
  }

  /** The clicks in the block of [frames] from mix frame [from]: at [bpm] in a free run, else on [grid]'s beats. Reused by the next call. */
  block(from: number, frames: number, bpm: number, grid: FrameGrid | null): readonly Click[] {
    const clicks = this.clicks
    clicks.length = 0
    const end = from + frames
    if (grid !== null) {
      const period = grid.periodFrames
      const late = (ClickScheduler.LATE_MS * this.rate) / 1000
      let i = grid.beatIndex + Math.ceil((from - late - grid.anchorFrame) / period)
      for (;;) {
        const f = Math.max(Math.round(grid.anchorFrame + (i - grid.beatIndex) * period), from)
        if (f >= end) break
        if (Number.isNaN(this.last) || f - this.last >= ClickScheduler.MIN_GAP * period) {
          this.barKnown = grid.barKnown
          this.click(f, i)
          this.index = i + 1
        }
        i++
      }
      // Should the grid go, the free run starts from the last click.
      this.next = NaN
      return clicks
    }
    const period = (this.rate * 60) / clamp(bpm)
    if (Number.isNaN(this.next)) this.next = Number.isNaN(this.last) ? from : this.last + period
    // Fallen behind (a grid gone long after its last click): the beats missed are skipped.
    while (Math.round(this.next) < from) {
      this.next += period
      this.index++
    }
    for (;;) {
      const f = Math.round(this.next)
      if (f >= end) break
      this.click(f, this.index)
      this.index++
      this.next += (this.rate * 60) / clamp(bpm)
    }
    return clicks
  }

  private click(f: number, i: number): void {
    this.last = f
    const accent = this.barKnown && ((i % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR === 0
    this.clicks.push({ frame: f, index: i, accent })
  }
}

/**
 * Lays clicks into blocks: silence, and each click from its frame on,
 * carried into the next block when it runs past this one's end. A click that
 * starts while another still sounds cuts it. Allocates nothing per block.
 */
export class ClickTrack {
  private readonly plain: Int16Array
  private readonly accented: Int16Array
  // The click sounding and how far into it, across blocks.
  private sound: Int16Array | null = null
  private pos = 0

  constructor(rate: number) {
    this.plain = ClickSound.render(rate, false)
    this.accented = ClickSound.render(rate, true)
  }

  /** Whether a click still sounds (its tail goes into the next block). */
  get sounding(): boolean {
    return this.sound !== null
  }

  /** Adds [clicks] (in order, inside the block from mix frame [from]) to [left] and [right]'s first [frames]. */
  mix(left: Float32Array, right: Float32Array, frames: number, from: number, clicks: readonly Click[]): void {
    let c = 0
    for (let i = 0; i < frames; i++) {
      while (c < clicks.length && clicks[c]!.frame - from <= i) {
        this.sound = clicks[c]!.accent ? this.accented : this.plain
        this.pos = 0
        c++
      }
      const s = this.sound
      if (s === null) continue
      const v = s[this.pos++]! / 32768
      left[i] = left[i]! + v
      right[i] = right[i]! + v
      if (this.pos >= s.length) this.sound = null
    }
  }
}
