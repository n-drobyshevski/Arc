// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Distortion.kt
//
// The distortion (the EP-133's DISTORTION): the send bus driven into a soft
// clip, X the drive, Y its colour (low-pass to high-pass, open in the middle).
//
// X drives the input 1 to 40 times (1 + 39 x², on the clip's scale, where
// the mixer's full scale is 1) into softClip, and brings what comes out back
// down by 1 / sqrt(drive): a harder drive is denser more than it is louder.
// Y colours the clip with a state-variable filter (Svf, one a channel):
// below the middle a low-pass that closes from 16 kHz down to 200 Hz, above
// it a high-pass that opens from 20 Hz up to 6 kHz, its resonance rising
// toward either end (Q 0.7 to 2.5). The filter fades in over the first
// quarter of the way from the middle, so the middle is the clip alone,
// exactly, and crossing it does not click: the filter starts from silence,
// and from none of it heard, each time it comes in or changes side.
//
// The drive, its make-up and how much of the filter is heard glide across
// each block, sample by sample, from the last block's values to the new ones
// (an addition); the filter's cutoff and Q are set once a block. silent once
// a block's input was all 0 and what it added was below 1e-6.
//
// Web deltas:
// - Kotlin's Float math is kept with Math.fround around every single
//   operation, so it renders what the Kotlin one does, bit for bit
//   (voiceMixer.test.ts replays VoiceMixerGoldenTest's FX scenarios).
//   Arguments are taken to be floats already (fround'ed).
// - silent is a getter.

import type { Effect } from './fxBus'
import { knobHz, lerp, softClip, svfG } from './fxMath'
import { Svf } from './svf'

const f = Math.fround

/** The mixer's full scale: the clip's 1. */
const SCALE = 32768
/** The low-pass's cutoff at the middle and at Y = 0. */
const LOW_TOP = 16000
const LOW_BOTTOM = 200
/** The high-pass's cutoff at the middle and at Y = 1. */
const HIGH_BOTTOM = 20
const HIGH_TOP = 6000
/** The colour's Q at the middle, and what either end adds to it. */
const Q_OPEN = f(0.7)
const Q_RANGE = f(1.8)
/** How fast the colour fades in away from the middle: fully in a quarter of the way to an end. */
const FADE_IN = 4
/** Below this, a block's return counts as silence. */
const TAIL = f(1e-6)

export class Distortion implements Effect {
  private readonly left = new Svf()
  private readonly right = new Svf()

  /** The drive and make-up (on the mixer's scale) now, and where the block glides them to. */
  private gainIn = f(1 / SCALE)
  private gainOut = SCALE
  private gainInTo = f(1 / SCALE)
  private gainOutTo = SCALE

  /** How much of the filter is heard (0: none, the clip alone) now and by the block's end, and which side it is on. */
  private colour = 0
  private colourTo = 0
  private colourLow = false

  /** No knobs yet since the last reset: the next ones are taken as they are, with no glide. */
  private fresh = true
  private quiet = true

  constructor(readonly outRate: number) {}

  get silent(): boolean {
    return this.quiet
  }

  reset(): void {
    this.left.reset()
    this.right.reset()
    this.colour = 0
    this.colourTo = 0
    this.fresh = true
    this.quiet = true
  }

  setParams(x: number, y: number, _bpm: number): void {
    const drive = f(1 + f(f(39 * x) * x))
    this.gainInTo = f(drive / SCALE)
    this.gainOutTo = f(SCALE / f(Math.sqrt(drive)))
    const t = f(Math.abs(f(y - 0.5)) * 2)
    const low = y < 0.5
    const fade = f(FADE_IN * t)
    const mix = fade < 1 ? fade : 1
    if (mix > 0) {
      const hz = low ? knobHz(f(1 - t), LOW_BOTTOM, LOW_TOP) : knobHz(t, HIGH_BOTTOM, HIGH_TOP)
      const g = svfG(hz, this.outRate)
      const q = f(Q_OPEN + f(f(Q_RANGE * t) * t))
      // Coming in, or over to the other side: from silence, and faded in from none (near the
      // middle either side is close to the clip alone, so going back to none is no step).
      if (this.colourTo === 0 || low !== this.colourLow) {
        this.left.reset()
        this.right.reset()
        this.colour = 0
      }
      this.left.set(g, q)
      this.right.set(g, q)
    }
    this.colourTo = mix
    this.colourLow = low
    if (this.fresh) {
      this.gainIn = this.gainInTo
      this.gainOut = this.gainOutTo
      this.colour = this.colourTo
      this.fresh = false
    }
  }

  process(input: Float32Array, out: Float32Array, frames: number): void {
    if (frames <= 0) return
    const n = frames
    const inStep = f(f(this.gainInTo - this.gainIn) / n)
    const outStep = f(f(this.gainOutTo - this.gainOut) / n)
    const colourStep = f(f(this.colourTo - this.colour) / n)
    let gi = this.gainIn
    let go = this.gainOut
    let c = this.colour
    const filtered = this.colour > 0 || this.colourTo > 0
    const { left, right } = this
    let zero = true
    let peak = 0
    for (let i = 0; i < frames; i++) {
      gi = f(gi + inStep)
      go = f(go + outStep)
      c = f(c + colourStep)
      const l = input[2 * i]!
      const r = input[2 * i + 1]!
      if (l !== 0 || r !== 0) zero = false
      let wl = f(softClip(f(l * gi)) * go)
      let wr = f(softClip(f(r * gi)) * go)
      if (filtered) {
        left.process(wl)
        right.process(wr)
        wl = lerp(wl, this.colourLow ? left.lp : left.hp, c)
        wr = lerp(wr, this.colourLow ? right.lp : right.hp, c)
      }
      out[2 * i] = out[2 * i]! + wl
      out[2 * i + 1] = out[2 * i + 1]! + wr
      const al = Math.abs(wl)
      const ar = Math.abs(wr)
      if (al > peak) peak = al
      if (ar > peak) peak = ar
    }
    this.gainIn = this.gainInTo
    this.gainOut = this.gainOutTo
    this.colour = this.colourTo
    this.quiet = zero && peak < TAIL
  }
}
