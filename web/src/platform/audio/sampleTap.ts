// Port of app/src/main/kotlin/dev/arc/ep133/audio/SampleRecorder.kt (its mix side: RSP)
//
// SAMPLE's RSP in the audio thread (an addition): Live's mix, before the
// click, metered from the moment it opens and recorded into a pad only when
// a take is armed. MixerHost feeds it each block (the same 16-bit burst TAKE
// takes) and posts what it says to the main thread.
//
// Each take buffer keeps the last [REACH_MS] of the mix, so a press reaches
// back past the output's latency (the mix is made that far ahead of what is
// heard): a take starts at its press however late the press is picked up.
//
// Web deltas:
// - One thread: the commands queue up and are taken before the next block,
//   as Kotlin's are, but a finished take is copied out and posted at once.
//   So one capture buffer does (Kotlin keeps two, one fed while the other is
//   copied on another thread): after a take its ring still holds the latest
//   frames, and the next arm starts from them.
// - A press comes as the mix frame heard then (the main thread's stamp, as
//   the pattern's presses do), not System.nanoTime; null: the frames fed.
// - Pads are pad keys (group × 12 + offset); MIC and USB are not here.
// - A rate change is a new output, so a new MixerHost and a new tap: no
//   reopen, no hand-over.

import { PeakMeter } from '../../core/features/peakMeter'
import { SampleCapture, type End } from '../../core/features/sampleCapture'
import { SampleLimits } from '../../core/features/sampleSource'

/** How far back a press reaches into frames already fed (ms): past the output's latency, Bluetooth's included. */
export const REACH_MS = 500

/** How often the level goes to the main thread for the meter (ms). */
export const LEVEL_EVERY_MS = 50

/** What the tap's take is doing, for SAMPLE's header. */
export type TapPhase =
  | { readonly kind: 'ready' }
  | { readonly kind: 'waiting'; readonly pad: number; readonly latched: boolean }
  | { readonly kind: 'recording'; readonly pad: number; readonly seconds: number; readonly maxSeconds: number; readonly latched: boolean }

/** A take the tap made: [pcm] interleaved at [channels] and [rate], into [pad]; why it ended; [latched] when it ran hands-free. */
export interface TapTake {
  readonly pad: number
  readonly pcm: Int16Array
  readonly channels: number
  readonly rate: number
  readonly end: End
  readonly latched: boolean
}

/** A command for the tap, taken before the next block. */
export type TapAsk =
  /** A take into [pad] from mix frame [at] (null: where the mix is), or from the [threshold] crossing after it; at most [maxFrames]. */
  | { readonly kind: 'arm'; readonly pad: number; readonly at: number | null; readonly latched: boolean; readonly maxFrames: number; readonly threshold: number | null }
  /** A take of exactly [length] frames into [pad] from mix frame [start], whatever the level (bars, a pattern's loop). */
  | { readonly kind: 'schedule'; readonly pad: number; readonly start: number; readonly length: number; readonly maxFrames: number }
  /** The take stops at mix frame [at] (null: where the mix is), keeping what came before. */
  | { readonly kind: 'stop'; readonly at: number | null }
  /** The take is thrown away. */
  | { readonly kind: 'cancel' }

/** What the tap tells the main thread. */
export interface TapListener {
  phase(p: TapPhase): void
  level(level01: number, clip: boolean): void
  take(t: TapTake): void
}

/**
 * RSP open on the mix: [stereo] or mixed down, at [rate], its level [gain]
 * (linear); an armed take brings the threshold it waits for (TapAsk).
 */
export class SampleTap {
  gain = 1

  private readonly channels: number
  private readonly capture: SampleCapture
  private readonly meter: PeakMeter
  private readonly asks: TapAsk[] = []
  private readonly levelEvery: number
  private sinceLevel = 0
  private fed = false
  private fedEnd = 0
  private closed = false

  // The take going on: its pad, how it runs, its cap, and what the phase shows of it.
  private pad: number | null = null
  private latched = false
  private cap = 0
  private capped = false
  private startSeen = false
  private shown = -1

  constructor(
    readonly rate: number,
    stereo: boolean,
    private readonly out: TapListener,
  ) {
    this.channels = stereo ? 2 : 1
    this.capture = new SampleCapture(rate, this.channels, SampleLimits.maxFrames(stereo, rate), Math.trunc(rate / 50), Math.max(Math.trunc((rate * REACH_MS) / 1000), Math.trunc(rate / 50)))
    this.meter = new PeakMeter(rate)
    this.levelEvery = Math.trunc((rate * LEVEL_EVERY_MS) / 1000)
  }

  /** Whether a take is under way: waiting for its start or recording. */
  get going(): boolean {
    return this.pad !== null && this.active()
  }

  /** The longest take this tap can make, in frames. */
  get maxFrames(): number {
    return this.capture.maxFrames
  }

  ask(a: TapAsk): void {
    this.asks.push(a)
  }

  /** A block of the mix: [frames] stereo frames of [pcm], the first at mix frame [at]. */
  mixed(pcm: Int16Array, frames: number, at: number): void {
    if (this.closed) return
    this.take()
    const c = this.capture
    c.gain = this.gain
    c.feed(pcm, frames, 2, at)
    this.meter.onBlock(c.blockPeak, frames)
    this.fedEnd = this.fed ? Math.max(this.fedEnd, at + frames) : at + frames
    this.fed = true
    this.after()
    this.sinceLevel += frames
    if (this.sinceLevel >= this.levelEvery) {
      this.sinceLevel = 0
      this.out.level(this.meter.level01(), this.meter.clip)
    }
  }

  /** Closes the tap: a take going on ends with what was fed, one still waiting with nothing. */
  close(): void {
    if (this.closed) return
    this.take()
    this.closed = true
    if (this.going) {
      if (this.fed) this.capture.stop(this.fedEnd)
      if (this.active()) this.capture.cancel()
      this.after()
    }
    this.out.phase({ kind: 'ready' })
  }

  /** Live's output went (closed, or gave out): a take going on ends LOST with what was recorded. */
  lost(): void {
    if (this.closed) return
    this.closed = true
    if (this.going) {
      this.capture.lost()
      if (this.active()) this.capture.cancel()
      this.after()
    }
    this.out.phase({ kind: 'ready' })
  }

  // The commands queued since the last block, in order.
  private take(): void {
    for (let a = this.asks.shift(); a !== undefined; a = this.asks.shift()) {
      const c = this.capture
      switch (a.kind) {
        case 'arm':
        case 'schedule': {
          const at = a.kind === 'arm' ? (a.at ?? this.frameNow()) : a.start
          if (this.going) {
            // The take before it ends where this one starts, and is handed over first.
            if (this.fed) c.stop(Math.min(at, this.fedEnd))
            if (this.active()) c.cancel()
            this.after()
          }
          if (a.maxFrames <= 0) break
          this.pad = a.pad
          this.latched = a.kind === 'schedule' ? true : a.latched
          this.cap = Math.min(a.maxFrames, c.maxFrames)
          this.capped = this.cap < c.maxFrames
          this.startSeen = false
          this.shown = -1
          if (a.kind === 'arm') c.arm(at, a.threshold)
          else c.schedule(at, a.length)
          this.out.phase({ kind: 'waiting', pad: a.pad, latched: this.latched })
          this.after()
          break
        }
        case 'stop':
          if (this.going) {
            c.stop(a.at ?? this.frameNow())
            this.after()
          }
          break
        case 'cancel':
          if (this.going) {
            c.cancel()
            this.after()
          }
          break
      }
    }
  }

  private active(): boolean {
    const s = this.capture.state
    return s === SampleCapture.State.ARMED || s === SampleCapture.State.SCHEDULED || s === SampleCapture.State.RECORDING
  }

  // Where the mix is: the frame after the last one fed (the first to come before any was).
  private frameNow(): number {
    return this.fed ? this.fedEnd : 0
  }

  // What the take did: capped once it started, shown as it goes, handed over once it ends.
  private after(): void {
    const p = this.pad
    if (p === null) return
    const c = this.capture
    if (!this.startSeen && c.started !== null) {
      this.startSeen = true
      // A cap below the buffer's length (the free space) ends the take there.
      if (this.capped) c.stop(c.started + this.cap)
    }
    if (c.state === SampleCapture.State.RECORDING) {
      const seconds = Math.trunc(c.frames / this.rate)
      if (seconds !== this.shown) {
        this.shown = seconds
        this.out.phase({ kind: 'recording', pad: p, seconds, maxSeconds: Math.trunc(this.cap / this.rate), latched: this.latched })
      }
    } else if (c.state === SampleCapture.State.DONE) {
      this.finish(p)
    }
  }

  private finish(p: number): void {
    const c = this.capture
    const ended = c.end ?? SampleCapture.End.CANCELLED
    const frames = Math.min(c.frames, this.cap)
    const end = this.capped && ended === SampleCapture.End.STOPPED && c.frames >= this.cap ? SampleCapture.End.LIMIT : ended
    const latched = this.latched
    this.pad = null
    this.out.phase({ kind: 'ready' })
    if (end === SampleCapture.End.CANCELLED || frames <= 0) return
    const all = c.take()
    const n = frames * this.channels
    const pcm = all.length > n ? all.slice(0, n) : all
    this.out.take({ pad: p, pcm, channels: this.channels, rate: this.rate, end, latched })
  }
}
