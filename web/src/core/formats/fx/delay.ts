// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Delay.kt
//
// The delay (the EP-133's DELAY): a tempo-synced echo of the send bus, X its
// length (one of twelve divisions of the beat), Y its feedback.
//
// X picks the length from TICKS by twelfths of its travel: a 32nd note, a
// 16th triplet, a 16th, an 8th triplet, a dotted 16th, an 8th, a quarter
// triplet, a dotted 8th, a quarter, a half triplet, a dotted quarter and a
// half. The tempo makes that frames (held to MAX_SECONDS and to at least
// one); when it changes (X onto another division, or a new tempo), the read
// head glides to the new length over 60 ms, in a straight line, its pitch
// bending on the way as a tape's would. Y feeds 0 to 0.95 of the echo back
// in, through a one-pole low-pass at 6 kHz (trapezoidal, so it is in tune),
// so each repeat is a little darker than the last; the first is the input
// as it was. Each channel echoes itself, at the same length on both (no
// ping-pong). The echo is read between two samples with a straight line, so
// a gliding length moves smoothly.
//
// The feedback glides across each block, sample by sample, from the last
// block's value to the new one (an addition). silent once the line has taken
// in nothing but silence (below 1e-6) for as long as it is: its input all 0,
// and its echoes died away.
//
// Web deltas:
// - Kotlin's Float math is kept with Math.fround around every single
//   operation, so it renders what the Kotlin one does, bit for bit
//   (voiceMixer.test.ts replays VoiceMixerGoldenTest's FX scenarios).
//   Arguments are taken to be floats already (fround'ed).
// - silent is a getter; the companion's constants are statics.

import type { Effect } from './fxBus'
import { flush, lerp, svfG } from './fxMath'

const f = Math.fround

export class Delay implements Effect {
  /** Each length in 24ths of a beat: 1/32, 1/16T, 1/16, 1/8T, 1/16D, 1/8, 1/4T, 1/8D, 1/4, 1/2T, 1/4D, 1/2. */
  static readonly TICKS: readonly number[] = [3, 4, 6, 8, 9, 12, 16, 18, 24, 32, 36, 48]
  static readonly DIVISIONS = 12
  /** Seconds a 24th of a beat lasts at 1 BPM: 60 / 24. */
  static readonly TICK_SECONDS = 2.5
  /** The longest echo. */
  static readonly MAX_SECONDS = 2
  /** The feedback at Y = 1. */
  static readonly FEEDBACK = f(0.95)
  /** The cutoff of the low-pass in the loop. */
  static readonly DAMP_HZ = 6000
  /** How long the read head takes to glide to a new length. */
  static readonly GLIDE_MS = 60
  /** Below this, what goes into the line counts as silence. */
  static readonly TAIL = f(1e-6)

  private readonly maxTime: number
  /** The line's length: the longest echo, and one more frame either side of the read. */
  private readonly size: number
  private readonly left: Float32Array
  private readonly right: Float32Array
  private write = 0

  /** The loop's low-pass: G of a trapezoidal one-pole, and its state a channel. */
  private readonly damp: number
  private dampL = 0
  private dampR = 0

  /** The echo's length in frames now and where it glides to, a frame's step and the frames to go. */
  private readonly glideFrames: number
  private time = 1
  private timeTo = 1
  private glideStep = 0
  private gliding = 0

  /** The feedback now, and where the block glides it to. */
  private feedback = 0
  private feedbackTo = 0

  /** No knobs yet since the last reset: the next ones are taken as they are, with no glide. */
  private fresh = true
  /** The frames since something other than silence went into the line; nothing has since the line was cleared. */
  private quietFrames: number
  private clean = true

  constructor(readonly outRate: number) {
    this.maxTime = Delay.MAX_SECONDS * outRate
    this.size = this.maxTime + 2
    this.left = new Float32Array(this.size)
    this.right = new Float32Array(this.size)
    const g = svfG(Delay.DAMP_HZ, outRate)
    this.damp = f(g / f(1 + g))
    this.glideFrames = Math.max(1, Math.trunc((Delay.GLIDE_MS * outRate) / 1000))
    this.quietFrames = this.size
  }

  get silent(): boolean {
    return this.quietFrames >= this.size
  }

  reset(): void {
    // Only what was written to needs clearing: a type change switches to a delay that never ran at no cost.
    if (!this.clean) {
      this.left.fill(0)
      this.right.fill(0)
      this.clean = true
    }
    this.write = 0
    this.dampL = 0
    this.dampR = 0
    this.gliding = 0
    this.fresh = true
    this.quietFrames = this.size
  }

  setParams(x: number, y: number, bpm: number): void {
    const d = Math.trunc(f(x * Delay.DIVISIONS))
    const division = d < 0 ? 0 : d > Delay.DIVISIONS - 1 ? Delay.DIVISIONS - 1 : d
    const frames = f(f(f(f(Delay.TICKS[division]!) * f(this.outRate)) * Delay.TICK_SECONDS) / bpm)
    const max = f(this.maxTime)
    const t = frames > max ? max : frames > 1 ? frames : 1
    this.feedbackTo = f(Delay.FEEDBACK * y)
    if (this.fresh) {
      this.time = t
      this.timeTo = t
      this.gliding = 0
      this.feedback = this.feedbackTo
      this.fresh = false
    } else if (t !== this.timeTo) {
      this.timeTo = t
      this.glideStep = f(f(t - this.time) / this.glideFrames)
      this.gliding = this.glideFrames
    }
  }

  process(input: Float32Array, out: Float32Array, frames: number): void {
    if (frames <= 0) return
    this.clean = false
    const feedbackStep = f(f(this.feedbackTo - this.feedback) / frames)
    const { left, right, size, damp, timeTo, glideStep } = this
    const TAIL = Delay.TAIL
    let fb = this.feedback
    let t = this.time
    let gliding = this.gliding
    let w = this.write
    let sl = this.dampL
    let sr = this.dampR
    let zero = true
    let loud = false
    for (let i = 0; i < frames; i++) {
      fb = f(fb + feedbackStep)
      if (gliding > 0) {
        gliding--
        t = gliding === 0 ? timeTo : f(t + glideStep)
      }
      // The echo, between the two samples t frames back.
      const whole = Math.trunc(t)
      const frac = f(t - whole)
      let r0 = w - whole
      if (r0 < 0) r0 += size
      let r1 = r0 - 1
      if (r1 < 0) r1 += size
      const el = lerp(left[r0]!, left[r1]!, frac)
      const er = lerp(right[r0]!, right[r1]!, frac)
      // Back in through the low-pass.
      const vl = f(f(el - sl) * damp)
      const ll = f(vl + sl)
      sl = flush(f(ll + vl))
      const vr = f(f(er - sr) * damp)
      const lr = f(vr + sr)
      sr = flush(f(lr + vr))
      const il = input[2 * i]!
      const ir = input[2 * i + 1]!
      if (il !== 0 || ir !== 0) zero = false
      const l = flush(f(il + f(fb * ll)))
      const r = flush(f(ir + f(fb * lr)))
      left[w] = l
      right[w] = r
      if (Math.abs(l) >= TAIL || Math.abs(r) >= TAIL) loud = true
      out[2 * i] = out[2 * i]! + el
      out[2 * i + 1] = out[2 * i + 1]! + er
      w++
      if (w === size) w = 0
    }
    this.feedback = this.feedbackTo
    this.time = t
    this.gliding = gliding
    this.write = w
    this.dampL = sl
    this.dampR = sr
    if (!zero || loud) this.quietFrames = 0
    else if (this.quietFrames < size) this.quietFrames += frames
  }
}
