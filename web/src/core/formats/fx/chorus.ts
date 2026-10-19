// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Chorus.kt
//
// The chorus (the EP-133's CHORUS): two moving taps on a short delay of the
// send bus, X their rate, Y their depth and feedback.
//
// The input, summed to mono, goes into a line about 25 ms long; the left
// channel's return is read from it at one tap and the right's at another,
// each 15 ms back give or take up to 10 ms, swung by a triangle LFO, the
// right's a quarter of a cycle behind the left's, so the two sides move
// apart. A tap is read between two samples with a straight line, so it
// moves smoothly. X is the LFOs' rate, 0.05 to 5 Hz on a cubic curve
// (knobHz). Y is how far they swing, from a quarter of the 10 ms at Y = 0
// (so it still moves) to all of it at Y = 1, and how much of the two taps
// (their mean) is fed back into the line, 0 to 0.7.
//
// The swing and feedback glide across each block, sample by sample, from
// the last block's values to the new ones (an addition); the rate is set
// once a block. silent once the line has taken in nothing but silence (below
// 1e-6) for as long as it is: its input all 0, and what it fed back died
// away.
//
// Web deltas:
// - Kotlin's Float math is kept with Math.fround around every single
//   operation, so it renders what the Kotlin one does, bit for bit
//   (voiceMixer.test.ts replays VoiceMixerGoldenTest's FX scenarios).
//   Arguments are taken to be floats already (fround'ed).
// - silent is a getter; the companion's constants are statics.

import type { Effect } from './fxBus'
import { flush, knobHz, lerp, triangle, wrap01 } from './fxMath'

const f = Math.fround

export class Chorus implements Effect {
  /** Where the taps sit, and how far either way they swing at most. */
  static readonly CENTRE_MS = 15
  static readonly SWING_MS = 10
  /** The LFOs' rate at X = 0 and X = 1. */
  static readonly RATE_FROM = f(0.05)
  static readonly RATE_TO = 5
  /** How much of the swing Y = 0 keeps. */
  static readonly DEPTH_FROM = 0.25
  /** The feedback at Y = 1. */
  static readonly FEEDBACK = f(0.7)
  /** The line's length: past the farthest tap, with room for the frame after it. */
  static readonly LINE_MS = 26
  /** Below this, what goes into the line counts as silence. */
  static readonly TAIL = f(1e-6)

  private readonly size: number
  private readonly line: Float32Array
  private write = 0

  private readonly centre: number
  private readonly swingMax: number

  /** The LFOs' phase (the left's; the right's is a quarter on) and its step a frame. */
  private phase = 0
  private step = 0

  /** The swing (in frames) and feedback now, and where the block glides them to. */
  private swing = 0
  private swingTo = 0
  private feedback = 0
  private feedbackTo = 0

  /** No knobs yet since the last reset: the next ones are taken as they are, with no glide. */
  private fresh = true
  /** The frames since something other than silence went into the line. */
  private quietFrames: number

  constructor(readonly outRate: number) {
    this.size = Math.trunc((Chorus.LINE_MS * outRate) / 1000) + 3
    this.line = new Float32Array(this.size)
    this.centre = f(f(Chorus.CENTRE_MS * f(outRate)) / 1000)
    this.swingMax = f(f(Chorus.SWING_MS * f(outRate)) / 1000)
    this.quietFrames = this.size
  }

  get silent(): boolean {
    return this.quietFrames >= this.size
  }

  reset(): void {
    this.line.fill(0)
    this.write = 0
    this.phase = 0
    this.fresh = true
    this.quietFrames = this.size
  }

  setParams(x: number, y: number, _bpm: number): void {
    this.step = f(knobHz(x, Chorus.RATE_FROM, Chorus.RATE_TO) / f(this.outRate))
    this.swingTo = f(this.swingMax * f(Chorus.DEPTH_FROM + f(f(1 - Chorus.DEPTH_FROM) * y)))
    this.feedbackTo = f(Chorus.FEEDBACK * y)
    if (this.fresh) {
      this.swing = this.swingTo
      this.feedback = this.feedbackTo
      this.fresh = false
    }
  }

  process(input: Float32Array, out: Float32Array, frames: number): void {
    if (frames <= 0) return
    const swingStep = f(f(this.swingTo - this.swing) / frames)
    const feedbackStep = f(f(this.feedbackTo - this.feedback) / frames)
    const { line, size, centre, step } = this
    const TAIL = Chorus.TAIL
    let sw = this.swing
    let fb = this.feedback
    let p = this.phase
    let w = this.write
    let zero = true
    let loud = false
    for (let i = 0; i < frames; i++) {
      sw = f(sw + swingStep)
      fb = f(fb + feedbackStep)
      const a = tap(line, size, w, f(centre + f(sw * triangle(p))))
      const b = tap(line, size, w, f(centre + f(sw * triangle(wrap01(f(p + 0.25))))))
      p = wrap01(f(p + step))
      const il = input[2 * i]!
      const ir = input[2 * i + 1]!
      if (il !== 0 || ir !== 0) zero = false
      const v = flush(f(f(f(il + ir) * 0.5) + f(fb * f(f(a + b) * 0.5))))
      line[w] = v
      if (Math.abs(v) >= TAIL) loud = true
      out[2 * i] = out[2 * i]! + a
      out[2 * i + 1] = out[2 * i + 1]! + b
      w++
      if (w === size) w = 0
    }
    this.swing = this.swingTo
    this.feedback = this.feedbackTo
    this.phase = p
    this.write = w
    if (!zero || loud) this.quietFrames = 0
    else if (this.quietFrames < size) this.quietFrames += frames
  }
}

/** [line] (of [size]) [t] frames before [w], between the two samples either side. */
function tap(line: Float32Array, size: number, w: number, t: number): number {
  const whole = Math.trunc(t)
  const frac = f(t - whole)
  let r0 = w - whole
  if (r0 < 0) r0 += size
  let r1 = r0 - 1
  if (r1 < 0) r1 += size
  return lerp(line[r0]!, line[r1]!, frac)
}
