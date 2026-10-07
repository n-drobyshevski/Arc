// Port of core/src/main/kotlin/dev/arc/ep133/features/SampleCapture.kt
//
// One take in SAMPLE mode (an addition, after the EP-133's own sampler):
// the input's blocks go in through [feed], each at its absolute input frame,
// and the take comes out as 16-bit PCM at [channels] channels and the
// input's [rate]. A take is armed, by a held pad, to start at a frame or
// when the input first reaches a threshold; or scheduled, for some bars, to
// start and end at exact frames. It ends when stopped at a frame, at
// [maxFrames], at the scheduled end, or when cancelled or the input is lost.
//
// The last [preRollFrames] frames (20 ms) are always kept, so a take that
// waits for the threshold still has the attack that crossed it, and one armed
// a moment late (a press time the input has already passed) starts where it
// was asked to, or at a threshold those frames already crossed.
//
// Only the input's callback calls it, and it allocates nothing after it is
// built but the Started event of each take: the take's buffer is the full
// [maxFrames] from the start. Rounding is
// floor(x + 0.5) and stereo mixes down with >>, so it gives the same samples
// as the Kotlin.
//
// Web deltas:
// - ShortArray is Int16Array; Kotlin's Long frames are JS numbers, and
//   Long.MAX_VALUE ("no end yet") is Infinity.
// - The sealed SamplePhase and SampleCapture.Event are tagged unions
//   ({type: 'Ready' | 'Waiting' | ...}, {type: 'Started' | 'Ended'}) with
//   constructors of the same names (SamplePhase.Waiting(pad), Started(frame),
//   Ended(end)); the enums State and End are const objects plus string-union
//   types, also on the class (SampleCapture.State, SampleCapture.End).
// - [gain] and the threshold are Kotlin Floats: both go through Math.fround,
//   so a level a Float can't hold exactly scales samples as the Kotlin does.
// - Kotlin's `require` is a RangeError.

import type { PhysicalPad } from './padNotes'

/** What SAMPLE mode's line under the keys shows (an addition): ready, waiting for a take to start, recording, or uploading one. */
export type SamplePhase =
  /** Nothing going on: holding a pad records into it. */
  | { readonly type: 'Ready' }
  /** [pad] is held or latched, and the take waits for the input to pass the threshold. */
  | { readonly type: 'Waiting'; readonly pad: PhysicalPad }
  /** A take of some bars into [pad] waits for PLAY on the EP-133 (its MIDI Start). */
  | { readonly type: 'WaitingForPlay'; readonly pad: PhysicalPad }
  /** The click counts [beat] of the bar before a take of some bars into [pad]. */
  | { readonly type: 'CountIn'; readonly pad: PhysicalPad; readonly beat: number }
  /** Recording into [pad]: [seconds] of at most [max]; [latched] when it runs hands-free until SAMPLE stops it. */
  | { readonly type: 'Recording'; readonly pad: PhysicalPad; readonly seconds: number; readonly max: number; readonly latched: boolean }
  /** A kept take goes onto [pad] on the EP-133, [percent] of it sent. */
  | { readonly type: 'Uploading'; readonly pad: PhysicalPad; readonly percent: number }

export const SamplePhase = {
  Ready: Object.freeze({ type: 'Ready' }) as SamplePhase,
  Waiting: (pad: PhysicalPad): SamplePhase => ({ type: 'Waiting', pad }),
  WaitingForPlay: (pad: PhysicalPad): SamplePhase => ({ type: 'WaitingForPlay', pad }),
  CountIn: (pad: PhysicalPad, beat: number): SamplePhase => ({ type: 'CountIn', pad, beat }),
  Recording: (pad: PhysicalPad, seconds: number, max: number, latched: boolean): SamplePhase => ({
    type: 'Recording',
    pad,
    seconds,
    max,
    latched,
  }),
  Uploading: (pad: PhysicalPad, percent: number): SamplePhase => ({ type: 'Uploading', pad, percent }),
} as const

export const State = { IDLE: 'IDLE', ARMED: 'ARMED', SCHEDULED: 'SCHEDULED', RECORDING: 'RECORDING', DONE: 'DONE' } as const
export type State = (typeof State)[keyof typeof State]

/** Why a take ended: [stop], [maxFrames], the scheduled length, [cancel], or [lost]. */
export const End = { STOPPED: 'STOPPED', LIMIT: 'LIMIT', BARS: 'BARS', CANCELLED: 'CANCELLED', LOST: 'LOST' } as const
export type End = (typeof End)[keyof typeof End]

/** What a [feed] did to the take, if anything. */
export type Event =
  /** The take starts at input frame [frame]. */
  | { readonly type: 'Started'; readonly frame: number }
  /** The take ended, for [end]. */
  | { readonly type: 'Ended'; readonly end: End }

export const Started = (frame: number): Event => ({ type: 'Started', frame })
export const Ended = (end: End): Event => ({ type: 'Ended', end })

const endings: Readonly<Record<End, Event>> = {
  STOPPED: Ended(End.STOPPED),
  LIMIT: Ended(End.LIMIT),
  BARS: Ended(End.BARS),
  CANCELLED: Ended(End.CANCELLED),
  LOST: Ended(End.LOST),
}

export class SampleCapture {
  static readonly State = State
  static readonly End = End

  private readonly buffer: Int16Array

  // The last frames fed, converted, oldest first from ringHead - ringCount;
  // the newest is the frame before nextFrame.
  private readonly ring: Int16Array

  // The loudest sample of each frame in the ring, after gain, before mixing
  // down: what the threshold is checked against.
  private readonly ringPeak: Int32Array
  private ringHead = 0
  private ringCount = 0

  private fed = false
  private nextFrame = 0

  private fromFrame = 0
  private threshold: number | null = null

  // The first frame already fed when the take was armed that reaches its
  // threshold, or null: the next feed or stop starts the take there.
  private ringHit: number | null = null
  private startFrame = 0
  private barsEnd = Infinity
  private stopFrame = Infinity
  private event: Event | null = null
  private level = 1

  private _state: State = State.IDLE
  private _frames = 0
  private _end: End | null = null
  private _started: number | null = null
  private _blockPeak = 0

  constructor(
    readonly rate: number,
    readonly channels: number,
    readonly maxFrames: number,
    readonly preRollFrames: number = Math.trunc(rate / 50),
  ) {
    if (channels !== 1 && channels !== 2) throw new RangeError(`a take is mono or stereo, not ${channels} channels`)
    if (!(maxFrames >= 0 && preRollFrames >= 0)) throw new RangeError(`no take of ${maxFrames} frames with ${preRollFrames} before it`)
    this.buffer = new Int16Array(maxFrames * channels)
    this.ring = new Int16Array(preRollFrames * channels)
    this.ringPeak = new Int32Array(preRollFrames)
  }

  /** The input level: each sample is multiplied by it, then clipped to 16 bits. */
  get gain(): number {
    return this.level
  }

  set gain(value: number) {
    this.level = Math.fround(value)
  }

  get state(): State {
    return this._state
  }

  /** Frames in the take so far. */
  get frames(): number {
    return this._frames
  }

  get seconds(): number {
    return Math.trunc(this._frames / this.rate)
  }

  /** Why the take ended, null until it has. */
  get end(): End | null {
    return this._end
  }

  /** The input frame the take started at, null until it has (or after [cancel]). */
  get started(): number | null {
    return this._started
  }

  /** The loudest sample of the last block fed, after [gain]: 0..1 of full scale. */
  get blockPeak(): number {
    return this._blockPeak
  }

  /**
   * Waits for a take that starts at [fromFrame], or with a [threshold] (a
   * level 0..1 of full scale, after [gain]) when the input first reaches it
   * at or after [fromFrame], [preRollFrames] earlier. Either start reaches
   * back only as far as frames were fed, and never before [fromFrame].
   * Forgets any take before it.
   */
  arm(fromFrame: number, threshold: number | null): void {
    this.reset(State.ARMED)
    this.fromFrame = fromFrame
    this.threshold = threshold === null ? null : Math.fround(threshold)
    if (this.threshold !== null && this.fed) this.ringHit = this.ringCrossing(fromFrame, this.nextFrame, this.threshold * 32768)
  }

  /**
   * A take of exactly [lengthFrames] from [startFrame], whatever the level
   * (for some bars): it ends BARS, or LIMIT if [maxFrames] comes first.
   * Frames before the start that were never fed are silence, so the take
   * still lines up with the bars. Forgets any take before it.
   */
  schedule(startFrame: number, lengthFrames: number): void {
    if (!(lengthFrames >= 0)) throw new RangeError(`a take can't be ${lengthFrames} frames long`)
    this.reset(State.SCHEDULED)
    this.startFrame = startFrame
    this.barsEnd = startFrame + lengthFrames
  }

  /**
   * Stops the take at input frame [atFrame], keeping the frames before it.
   * When the input hasn't reached it yet the take goes on until it does; a
   * take that never started ends with no frames. Nothing happens when there
   * is no take going on.
   */
  stop(atFrame: number): void {
    if (this._state === State.IDLE || this._state === State.DONE) return
    this.stopFrame = Math.min(this.stopFrame, atFrame)
    // The frames up to the stop are still to come: feed ends the take.
    if (!this.fed || this.stopFrame > this.nextFrame) return
    switch (this._state) {
      case State.ARMED: {
        const reach = this.nextFrame - this.ringCount
        let from: number | null
        if (this.threshold === null) from = Math.max(this.fromFrame, reach)
        else if (this.ringHit !== null && this.ringHit < this.stopFrame) from = this.ringStart(reach)
        else from = null
        if (from !== null && from < this.stopFrame) this.begin(from, this.stopFrame, this.nextFrame)
        break
      }
      case State.SCHEDULED:
        if (this.startFrame < this.stopFrame) this.begin(this.startFrame, this.stopFrame, this.nextFrame)
        break
      case State.RECORDING:
        this._frames = Math.min(Math.max(this.stopFrame - this._started!, 0), this._frames)
        break
    }
    // Read through the getter: begin() may have ended the take, which the narrowing above can't see.
    if (this.state !== State.DONE) this.finish(End.STOPPED)
  }

  /** Throws the take away: it ends CANCELLED with no frames. */
  cancel(): void {
    this._state = State.DONE
    this._end = End.CANCELLED
    this._frames = 0
    this._started = null
  }

  /** The input went away: the take ends LOST, keeping what was recorded. */
  lost(): void {
    if (this._state === State.ARMED || this._state === State.SCHEDULED || this._state === State.RECORDING) this.finish(End.LOST)
  }

  /**
   * The input's next block: [frames] frames of [pcm], interleaved at
   * [inChannels] (1 or 2), the first at input frame [at]. Each sample goes
   * through [gain] and is clipped, then stereo is mixed down to a mono take
   * ((l + r) >> 1) or mono doubled for a stereo one. Frames between the
   * last block and [at] (a block the input dropped) are silence; frames
   * already fed are skipped. Returns Started when the take starts, Ended
   * when it ends (also when it started in the same block; see [started]),
   * or null.
   */
  feed(pcm: Int16Array, frames: number, inChannels: number, at: number): Event | null {
    if (inChannels !== 1 && inChannels !== 2) throw new RangeError(`the input is mono or stereo, not ${inChannels} channels`)
    if (!(frames >= 0 && pcm.length >= frames * inChannels)) throw new RangeError(`${frames} frames don't fit in ${pcm.length} samples`)
    const g = this.level
    let peak = 0
    for (let i = 0; i < frames * inChannels; i++) peak = Math.max(peak, Math.abs(gained(pcm[i]!, g)))
    this._blockPeak = peak / 32768
    this.event = null
    let skip = 0
    if (this.fed) {
      if (at > this.nextFrame) this.run(null, 0, 1, this.nextFrame, at - this.nextFrame, g)
      else skip = Math.min(this.nextFrame - at, frames)
    }
    if (skip < frames) this.run(pcm, skip * inChannels, inChannels, at + skip, frames - skip, g)
    this.nextFrame = this.fed ? Math.max(this.nextFrame, at + frames) : at + frames
    this.fed = true
    return this.event
  }

  /** A copy of the take: [frames] frames, interleaved at [channels]. */
  take(): Int16Array {
    return this.buffer.slice(0, this._frames * this.channels)
  }

  private reset(to: State): void {
    this._state = to
    this._frames = 0
    this._end = null
    this._started = null
    this.threshold = null
    this.ringHit = null
    this.barsEnd = Infinity
    this.stopFrame = Infinity
  }

  // [n] frames from input frame [first]: from [src] at sample [offset], or
  // silence when [src] is null. The ring holds the frames before [first].
  private run(src: Int16Array | null, offset: number, inChannels: number, first: number, n: number, g: number): void {
    const last = first + n
    let pos = first
    while (pos < last) {
      switch (this._state) {
        case State.IDLE:
        case State.DONE:
          pos = last
          break
        case State.ARMED:
          pos = this.armed(src, offset, inChannels, first, last, g)
          break
        case State.SCHEDULED:
          pos = this.scheduled(first, last)
          break
        case State.RECORDING:
          pos = this.record(src, offset, inChannels, first, pos, last, g)
          break
      }
    }
    this.remember(src, offset, inChannels, n, g)
  }

  private armed(src: Int16Array | null, offset: number, inChannels: number, first: number, last: number, g: number): number {
    const until = Math.min(last, this.stopFrame)
    const reach = first - this.ringCount
    const thr = this.threshold
    let from: number | null
    if (thr === null) {
      from = this.fromFrame < until ? Math.max(this.fromFrame, reach) : null
    } else if (this.ringHit !== null) {
      from = this.ringHit < until ? this.ringStart(reach) : null
    } else {
      const c = this.crossing(src, offset, inChannels, first, Math.max(this.fromFrame, first), until, thr, g)
      from = c === null ? null : Math.max(c - this.preRollFrames, this.fromFrame, reach)
    }
    // A frame the ring had when armed is only checked once, now it's past.
    this.ringHit = null
    if (from === null) {
      if (this.stopFrame <= last) this.finish(End.STOPPED)
      return last
    }
    this.begin(from, first, first)
    return Math.max(from, first)
  }

  // Where a take starts that the ring crossed the threshold for, at [ringHit]:
  // the pre-roll before it, no further back than [reach] or the armed frame.
  // null when the ring didn't cross it.
  private ringStart(reach: number): number | null {
    return this.ringHit === null ? null : Math.max(this.ringHit - this.preRollFrames, this.fromFrame, reach)
  }

  private scheduled(first: number, last: number): number {
    if (this.startFrame < Math.min(last, this.stopFrame)) {
      this.begin(this.startFrame, first, first)
      return Math.max(this.startFrame, first)
    }
    if (this.stopFrame <= last) this.finish(End.STOPPED)
    return last
  }

  // The take starts at [from]; frames before [until] are already past, so
  // they come from the ring, which ends at [ringEnd], or are silence where
  // it doesn't reach.
  private begin(from: number, until: number, ringEnd: number): void {
    this._state = State.RECORDING
    this._started = from
    this._frames = 0
    this.event = Started(from)
    const to = Math.min(until, this.endFrame())
    const stereo = this.channels === 2
    for (let f = from; f < to; f++) {
      const o = this._frames * this.channels
      const back = ringEnd - f
      if (back > this.ringCount) {
        this.buffer[o] = 0
        if (stereo) this.buffer[o + 1] = 0
      } else {
        const r = ((this.ringHead - back + this.preRollFrames) % this.preRollFrames) * this.channels
        this.buffer[o] = this.ring[r]!
        if (stereo) this.buffer[o + 1] = this.ring[r + 1]!
      }
      this._frames++
    }
    this.settle()
  }

  private record(src: Int16Array | null, offset: number, inChannels: number, first: number, pos: number, last: number, g: number): number {
    const to = Math.min(last, this.endFrame())
    for (let f = pos; f < to; f++) {
      this.convert(src, offset + (f - first) * inChannels, inChannels, g, this.buffer, this._frames * this.channels)
      this._frames++
    }
    return this.settle() ? last : to
  }

  // The frame the take can't go past: the scheduled end, the limit or the stop.
  private endFrame(): number {
    return Math.min(this.barsEnd, this._started! + this.maxFrames, this.stopFrame)
  }

  // Ends the take if it reached its end; whether it did.
  private settle(): boolean {
    const at = this._started! + this._frames
    let why: End
    if (at >= this.barsEnd) why = End.BARS
    else if (this._frames >= this.maxFrames) why = End.LIMIT
    else if (at >= this.stopFrame) why = End.STOPPED
    else return false
    this.finish(why)
    return true
  }

  private finish(why: End): void {
    this._state = State.DONE
    this._end = why
    this.event = endings[why]
  }

  // The first frame in [from, to) with a sample at or above [threshold], or null.
  private crossing(
    src: Int16Array | null,
    offset: number,
    inChannels: number,
    first: number,
    from: number,
    to: number,
    threshold: number,
    g: number,
  ): number | null {
    if (from >= to) return null
    const level = threshold * 32768
    if (src === null) return 0 >= level ? from : null
    for (let f = from; f < to; f++) {
      const i = offset + (f - first) * inChannels
      for (let c = 0; c < inChannels; c++) if (Math.abs(gained(src[i + c]!, g)) >= level) return f
    }
    return null
  }

  // The first frame the ring holds, from [from] on, with a sample at or
  // above [level]; [ringEnd] is the frame after its newest. null if none.
  private ringCrossing(from: number, ringEnd: number, level: number): number | null {
    for (let f = Math.max(from, ringEnd - this.ringCount); f < ringEnd; f++) {
      const back = ringEnd - f
      if (this.ringPeak[(this.ringHead - back + this.preRollFrames) % this.preRollFrames]! >= level) return f
    }
    return null
  }

  // Keeps the last of the [n] frames just run in the ring.
  private remember(src: Int16Array | null, offset: number, inChannels: number, n: number, g: number): void {
    const m = Math.min(n, this.preRollFrames)
    for (let k = n - m; k < n; k++) {
      const i = offset + k * inChannels
      this.convert(src, i, inChannels, g, this.ring, this.ringHead * this.channels)
      this.ringPeak[this.ringHead] =
        src === null
          ? 0
          : inChannels === 1
            ? Math.abs(gained(src[i]!, g))
            : Math.max(Math.abs(gained(src[i]!, g)), Math.abs(gained(src[i + 1]!, g)))
      this.ringHead = (this.ringHead + 1) % this.preRollFrames
    }
    this.ringCount = Math.min(this.ringCount + m, this.preRollFrames)
  }

  // One input frame at sample [i] of [src] (silence when null), as a frame of the take at [o] of [dst].
  private convert(src: Int16Array | null, i: number, inChannels: number, g: number, dst: Int16Array, o: number): void {
    const stereo = this.channels === 2
    if (src === null) {
      dst[o] = 0
      if (stereo) dst[o + 1] = 0
    } else if (inChannels === 1) {
      const v = gained(src[i]!, g)
      dst[o] = v
      if (stereo) dst[o + 1] = v
    } else {
      const l = gained(src[i]!, g)
      const r = gained(src[i + 1]!, g)
      if (stereo) {
        dst[o] = l
        dst[o + 1] = r
      } else {
        dst[o] = (l + r) >> 1
      }
    }
  }
}

function gained(s: number, g: number): number {
  if (g === 1) return s
  const v = Math.floor(s * g + 0.5)
  return v > 32767 ? 32767 : v < -32768 ? -32768 : v
}
