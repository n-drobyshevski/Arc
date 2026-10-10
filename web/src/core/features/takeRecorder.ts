// Port of core/src/main/kotlin/dev/arc/ep133/features/TakeRecorder.kt
//
// Web delta: frame counts are plain numbers (Kotlin Long), and the burst is
// an Int16Array of interleaved stereo frames (Kotlin ShortArray).

/** Live's REC key: off, waiting for the first sound, or recording for [seconds]. */
export type RecState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'armed' }
  | { readonly kind: 'recording'; readonly seconds: number }

export const REC_IDLE: RecState = { kind: 'idle' }
export const REC_ARMED: RecState = { kind: 'armed' }

/** Record [frames] frames of the burst from frame [from]; [last] when the take reached maxFrames with them. */
export interface Keep {
  readonly from: number
  readonly frames: number
  readonly last: boolean
}

export type TakeState = 'IDLE' | 'ARMED' | 'RECORDING'

/**
 * Which part of Live's mix goes into a take (an addition): REC arms it, the
 * first sound after that starts it (so a take has no silence in front, as on
 * the EP-133's sampler), and it runs until [stop] or [maxFrames]. Silence
 * after the last sound is left out when it stops.
 *
 * The EP-133 starting to play (MIDI clock start, [transportStart]) also starts
 * an armed take, from the next burst, so the take lines up with the device's
 * bar; such a take is [byTransport], and the device stopping ends it.
 *
 * A take locked to the pattern is armed at a mix frame instead ([armAt]): it
 * starts there, sound or not, and is stopped at one ([stopAt]), keeping the
 * silence up to it, so it is exactly the frames between.
 *
 * Only the output's thread calls it: [onBurst] once for each burst the mixer
 * renders, before the next.
 */
export class TakeRecorder {
  /** Ten minutes: about 115 MB at 48 kHz stereo. */
  static readonly MAX_SECONDS = 600

  private _state: TakeState = 'IDLE'
  private _frames = 0
  private _audible = 0
  private _byTransport = false
  // The device started playing while armed: the next burst starts the take.
  private startNext = false
  // [armAt]'s frame (null: the first sound's), [stopAt]'s (none: Infinity), the take's first mix frame.
  private startAt: number | null = null
  private endAt = Infinity
  private first = 0

  constructor(
    readonly outRate: number,
    readonly maxFrames: number = TakeRecorder.MAX_SECONDS * outRate,
  ) {}

  get state(): TakeState {
    return this._state
  }

  /** Frames recorded so far. */
  get frames(): number {
    return this._frames
  }

  /** Frames up to the last one that isn't silent: what the take keeps. */
  get audible(): number {
    return this._audible
  }

  /** Whether the device's PLAY started the take, so the device stopping ends it. */
  get byTransport(): boolean {
    return this._byTransport
  }

  get seconds(): number {
    return Math.trunc(this._frames / this.outRate)
  }

  arm(): void {
    if (this._state !== 'IDLE') return
    this._state = 'ARMED'
    this._frames = 0
    this._audible = 0
    this._byTransport = false
    this.startNext = false
    this.startAt = null
    this.endAt = Infinity
  }

  /** Arms the take to start at mix frame [frame], whether or not anything sounds then; armed already, it starts there instead. */
  armAt(frame: number): void {
    if (this._state === 'RECORDING') return
    this._state = 'ARMED'
    this._frames = 0
    this._audible = 0
    this.startAt = frame
    this.endAt = Infinity
    this._byTransport = false
    this.startNext = false
  }

  /**
   * Ends the take at mix frame [frame], keeping the silence up to it: the
   * burst that reaches it is the last ([Keep.last]). A frame already
   * recorded past ends it there.
   */
  stopAt(frame: number): void {
    if (this._state !== 'IDLE') this.endAt = frame
  }

  /** The EP-133 started playing: an armed take starts with the next burst. */
  transportStart(): void {
    if (this._state === 'ARMED') this.startNext = true
  }

  /**
   * The burst just rendered: [frames] stereo frames in [out], the first at
   * mix frame [at]; [firstStart] is the earliest mix frame a voice began at
   * in it, if any did. Returns the part to record, or null for none.
   */
  onBurst(out: Int16Array, frames: number, at: number, firstStart: number | null): Keep | null {
    let from: number
    switch (this._state) {
      case 'IDLE':
        return null
      case 'ARMED':
        if (this.startNext) {
          // The device's PLAY: from this burst on, so the take lines up with it.
          this.startNext = false
          this._byTransport = true
          this._state = 'RECORDING'
          this.first = at
          from = 0
        } else {
          const start = this.startAt ?? firstStart
          if (start === null) return null
          // Armed at a frame: not yet. Come late, it starts with this burst.
          if (start >= at + frames) return null
          this._state = 'RECORDING'
          from = Math.min(Math.max(start - at, 0), frames)
          this.first = at + from
        }
        break
      case 'RECORDING':
        from = 0
        break
    }
    // Up to [stopAt]'s frame, if it comes in this burst (or came already).
    const left = this.endAt === Infinity ? Infinity : Math.max(0, this.endAt - (at + from))
    const n = Math.min(frames - from, this.maxFrames - this._frames, left)
    for (let i = n - 1; i >= 0; i--) {
      const j = 2 * (from + i)
      if (out[j] !== 0 || out[j + 1] !== 0) {
        this._audible = this._frames + i + 1
        break
      }
    }
    this._frames += n
    const stopped = this.endAt !== Infinity && at + from + n >= this.endAt
    // Stopped at a frame: the silence before it is kept too.
    if (stopped) this._audible = this.keptTo(this.endAt)
    const last = this._frames >= this.maxFrames || stopped
    if (last) this._state = 'IDLE'
    return { from, frames: n, last }
  }

  /** Stops: the frames the take keeps, 0 when nothing was played since REC (nor did an [armAt] frame come). */
  stop(): number {
    const keep =
      this._state === 'ARMED' ? 0 : this._state === 'RECORDING' && this.endAt !== Infinity ? this.keptTo(this.endAt) : this._audible
    this._state = 'IDLE'
    this.startNext = false
    return keep
  }

  /** The frames recorded up to mix frame [end], silent or not. */
  private keptTo(end: number): number {
    return Math.min(Math.max(end - this.first, 0), this._frames)
  }
}
