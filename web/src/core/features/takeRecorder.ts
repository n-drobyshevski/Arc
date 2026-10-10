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
          this.startNext = false
          this._byTransport = true
          this._state = 'RECORDING'
          from = 0
        } else {
          if (firstStart === null) return null
          this._state = 'RECORDING'
          from = Math.min(Math.max(firstStart - at, 0), frames)
        }
        break
      case 'RECORDING':
        from = 0
        break
    }
    const n = Math.min(frames - from, this.maxFrames - this._frames)
    for (let i = n - 1; i >= 0; i--) {
      const j = 2 * (from + i)
      if (out[j] !== 0 || out[j + 1] !== 0) {
        this._audible = this._frames + i + 1
        break
      }
    }
    this._frames += n
    const last = this._frames >= this.maxFrames
    if (last) this._state = 'IDLE'
    return { from, frames: n, last }
  }

  /** Stops: the frames the take keeps, 0 when nothing was played since REC. */
  stop(): number {
    const keep = this._state === 'ARMED' ? 0 : this._audible
    this._state = 'IDLE'
    this.startNext = false
    return keep
  }
}
