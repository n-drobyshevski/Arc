// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Filter.kt
//
// The filter (the EP-133's FILTER): a state-variable filter (Svf, one a
// channel) on the send bus, X a low-pass below the middle and a high-pass
// above it (open between), Y its resonance.
//
// Below 0.47 X is a low-pass whose cutoff rises from 60 Hz (X = 0) to 20 kHz
// (held to 0.4 of the rate), above 0.53 a high-pass from 20 Hz up to 8 kHz,
// both on a cubic curve (knobHz) so the low end gets most of the travel;
// between, the return is the input, exactly. Y is the Q, 0.5 to 8 (cubic
// too, so the middle is a gentle 1.4).
//
// Moving from one of the three to another crossfades over 10 ms: each has a
// weight that rises to 1 while it is the one X is on and falls to 0 when it
// is not, so even a jump straight across the middle, or back before a fade
// is over, glides. The low-pass and high-pass have a filter each, which runs
// only while it is heard and starts from silence when it comes back in. The
// cutoff and Q are set once a block; the filter keeps its state, so a sweep
// does not click.
//
// silent once a block's input was all 0 and what it added was below 1e-6.
//
// Web deltas:
// - Kotlin's Float math is kept with Math.fround around every single
//   operation, so it renders what the Kotlin one does, bit for bit
//   (voiceMixer.test.ts replays VoiceMixerGoldenTest's FX scenarios).
//   Arguments are taken to be floats already (fround'ed).
// - silent is a getter.

import type { Effect } from './fxBus'
import { knobHz, svfG } from './fxMath'
import { Svf } from './svf'

const f = Math.fround

/** Where X stops being a low-pass, and where it starts being a high-pass. */
const LOW_END = f(0.47)
const HIGH_START = f(0.53)
/** How far each of them runs along X. */
const SPAN = f(0.47)
const LOW_FROM = 60
const LOW_TO = 20000
const HIGH_FROM = 20
const HIGH_TO = 8000
const Q_FROM = 0.5
const Q_TO = 8
/** How long moving from one mode to another takes. */
const FADE_MS = 10
/** Below this, a block's return counts as silence. */
const TAIL = f(1e-6)

/** The modes, by weight. */
const LOW = 0
const OPEN = 1
const HIGH = 2
const MODES = 3

export class Filter implements Effect {
  private readonly fadeFrames: number
  private readonly step: number

  private readonly lowL = new Svf()
  private readonly lowR = new Svf()
  private readonly highL = new Svf()
  private readonly highR = new Svf()

  /** Each mode's weight in the return; while fading, they glide toward 1 for the mode and 0 for the rest. */
  private readonly weights = Float32Array.of(0, 1, 0)
  private mode = OPEN
  private fading = false

  /** No knobs yet since the last reset: the next ones set the mode at once, with no fade. */
  private fresh = true
  private quiet = true

  constructor(readonly outRate: number) {
    this.fadeFrames = Math.max(1, Math.trunc((FADE_MS * outRate) / 1000))
    this.step = f(1 / this.fadeFrames)
  }

  get silent(): boolean {
    return this.quiet
  }

  reset(): void {
    this.lowL.reset()
    this.lowR.reset()
    this.highL.reset()
    this.highR.reset()
    this.fresh = true
    this.quiet = true
  }

  setParams(x: number, y: number, _bpm: number): void {
    const q = f(Q_FROM + f(f(f(f(Q_TO - Q_FROM) * y) * y) * y))
    const m = x < LOW_END ? LOW : x > HIGH_START ? HIGH : OPEN
    if (m === LOW) {
      const g = svfG(knobHz(f(x / SPAN), LOW_FROM, LOW_TO), this.outRate)
      this.lowL.set(g, q)
      this.lowR.set(g, q)
    } else if (m === HIGH) {
      const g = svfG(knobHz(f(f(x - HIGH_START) / SPAN), HIGH_FROM, HIGH_TO), this.outRate)
      this.highL.set(g, q)
      this.highR.set(g, q)
    }
    if (this.fresh) {
      this.weights.fill(0)
      this.weights[m] = 1
      this.fading = false
      this.fresh = false
    } else if (m !== this.mode) {
      // Coming back in from nothing: from silence.
      if (this.weights[m] === 0) {
        if (m === LOW) {
          this.lowL.reset()
          this.lowR.reset()
        } else if (m === HIGH) {
          this.highL.reset()
          this.highR.reset()
        }
      }
      this.fading = true
    }
    this.mode = m
  }

  process(input: Float32Array, out: Float32Array, frames: number): void {
    const { lowL, lowR, highL, highR, weights, step } = this
    let zero = true
    let peak = 0
    for (let i = 0; i < frames; i++) {
      const l = input[2 * i]!
      const r = input[2 * i + 1]!
      if (l !== 0 || r !== 0) zero = false
      let sl: number
      let sr: number
      if (!this.fading) {
        if (this.mode === LOW) {
          lowL.process(l)
          lowR.process(r)
          sl = lowL.lp
          sr = lowR.lp
        } else if (this.mode === HIGH) {
          highL.process(l)
          highR.process(r)
          sl = highL.hp
          sr = highR.hp
        } else {
          sl = l
          sr = r
        }
      } else {
        let done = true
        for (let k = 0; k < MODES; k++) {
          const w = weights[k]!
          let v: number
          if (k === this.mode) {
            const up = f(w + step)
            v = up < 1 ? up : 1
          } else {
            const down = f(w - step)
            v = down > 0 ? down : 0
          }
          weights[k] = v
          if (v !== (k === this.mode ? 1 : 0)) done = false
        }
        sl = f(weights[OPEN]! * l)
        sr = f(weights[OPEN]! * r)
        const wl = weights[LOW]!
        if (wl > 0) {
          lowL.process(l)
          lowR.process(r)
          sl = f(sl + f(wl * lowL.lp))
          sr = f(sr + f(wl * lowR.lp))
        }
        const wh = weights[HIGH]!
        if (wh > 0) {
          highL.process(l)
          highR.process(r)
          sl = f(sl + f(wh * highL.hp))
          sr = f(sr + f(wh * highR.hp))
        }
        this.fading = !done
      }
      out[2 * i] = out[2 * i]! + sl
      out[2 * i + 1] = out[2 * i + 1]! + sr
      const al = Math.abs(sl)
      const ar = Math.abs(sr)
      if (al > peak) peak = al
      if (ar > peak) peak = ar
    }
    this.quiet = zero && peak < TAIL
  }
}
