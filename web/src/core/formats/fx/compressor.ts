// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Compressor.kt
//
// The compressor: a feed-forward, stereo-linked peak compressor, 4:1 above
// -18 dBFS, X its input drive (with make-up gain) and Y its speed (attack and
// release, fast to slow). The bus has two: the EP-133's COMPRESSOR effect on
// the send bus (process, as every Effect), and the master compressor after
// everything (an addition, processInPlace).
//
// X drives the input 1 to 8 times (1 + 7 x²) and makes it up by
// 1 / sqrt(drive) on the way out, so a harder drive is pushed further into
// the compressor while what is below the threshold comes up by sqrt(drive).
// The envelope follows the louder channel's peak (the two channels are
// compressed alike) with a one-pole (onePoleCoef) that rises at the attack
// and falls at the release; above the threshold the gain is
// (threshold / envelope)^(3/4), the 4:1 slope, worked out as q³ with
// q = sqrt(sqrt(threshold / envelope)). Y picks one of eight attack and
// release pairs, from 0.5 ms / 40 ms to 30 ms / 600 ms.
//
// The drive and make-up glide across each block, sample by sample, from the
// last block's values to the new ones (an addition). With no tail of its own
// (its return is its input times a gain), it is silent once a block's input
// was all 0 and the envelope is below the threshold: skipped blocks then
// leave the envelope where it was, which changes nothing until a peak takes
// it over the threshold again.
//
// Web deltas:
// - Kotlin's Float math is kept with Math.fround around every single
//   operation, so it renders what the Kotlin one does, bit for bit
//   (voiceMixer.test.ts replays VoiceMixerGoldenTest's FX scenarios).
//   Arguments are taken to be floats already (fround'ed).
// - silent is a getter; the companion's constants are statics.

import type { Effect } from './fxBus'
import { flush, onePoleCoef } from './fxMath'

const f = Math.fround

export class Compressor implements Effect {
  /** -18 dBFS on the mixer's scale: 0.1259 × 32768, to the nearest half (exact in a float). */
  static readonly THRESHOLD = 4125.5
  /** The speeds Y picks from, fast to slow: attack and release, in ms. */
  static readonly ATTACK_MS: readonly number[] = [0.5, 1, 2, 4, 7, 12, 20, 30]
  static readonly RELEASE_MS: readonly number[] = [40, 60, 90, 130, 190, 280, 420, 600]
  static readonly SPEEDS = 8

  private readonly attacks: Float32Array
  private readonly releases: Float32Array
  private attack: number
  private release: number

  /** The drive and make-up now, and where the block glides them to. */
  private drive = 1
  private makeup = 1
  private driveTo = 1
  private makeupTo = 1
  private env = 0

  /** No knobs yet since the last reset: the next ones are taken as they are, with no glide. */
  private fresh = true
  private quiet = true

  constructor(readonly outRate: number) {
    this.attacks = Float32Array.from(Compressor.ATTACK_MS, (ms) => onePoleCoef(ms, outRate))
    this.releases = Float32Array.from(Compressor.RELEASE_MS, (ms) => onePoleCoef(ms, outRate))
    this.attack = this.attacks[Compressor.SPEEDS / 2]!
    this.release = this.releases[Compressor.SPEEDS / 2]!
  }

  get silent(): boolean {
    return this.quiet && this.env < Compressor.THRESHOLD
  }

  reset(): void {
    this.env = 0
    this.fresh = true
    this.quiet = true
  }

  setParams(x: number, y: number, _bpm: number): void {
    this.driveTo = f(1 + f(f(7 * x) * x))
    this.makeupTo = f(1 / f(Math.sqrt(this.driveTo)))
    if (this.fresh) {
      this.drive = this.driveTo
      this.makeup = this.makeupTo
      this.fresh = false
    }
    const s = Math.trunc(f(y * Compressor.SPEEDS))
    const speed = s < 0 ? 0 : s > Compressor.SPEEDS - 1 ? Compressor.SPEEDS - 1 : s
    this.attack = this.attacks[speed]!
    this.release = this.releases[speed]!
  }

  process(input: Float32Array, out: Float32Array, frames: number): void {
    this.run(input, out, frames, true)
  }

  /** Compresses [mix] (stereo, interleaved, [frames] long) in place: the master compressor. */
  processInPlace(mix: Float32Array, frames: number): void {
    this.run(mix, mix, frames, false)
  }

  /** [input] compressed into [out]: added to it, or in place of it. */
  private run(input: Float32Array, out: Float32Array, frames: number, add: boolean): void {
    if (frames <= 0) return
    const T = Compressor.THRESHOLD
    const driveStep = f(f(this.driveTo - this.drive) / frames)
    const makeupStep = f(f(this.makeupTo - this.makeup) / frames)
    const { attack, release } = this
    let d = this.drive
    let m = this.makeup
    let e = this.env
    let zero = true
    for (let i = 0; i < frames; i++) {
      d = f(d + driveStep)
      m = f(m + makeupStep)
      const l = input[2 * i]!
      const r = input[2 * i + 1]!
      if (l !== 0 || r !== 0) zero = false
      const dl = f(l * d)
      const dr = f(r * d)
      const al = Math.abs(dl)
      const ar = Math.abs(dr)
      const p = al > ar ? al : ar
      e = flush(f(e + f((p > e ? attack : release) * f(p - e))))
      let g = m
      if (e > T) {
        const q = f(Math.sqrt(f(Math.sqrt(f(T / e)))))
        g = f(f(f(q * q) * q) * m)
      }
      if (add) {
        out[2 * i] = out[2 * i]! + f(dl * g)
        out[2 * i + 1] = out[2 * i + 1]! + f(dr * g)
      } else {
        out[2 * i] = f(dl * g)
        out[2 * i + 1] = f(dr * g)
      }
    }
    this.drive = this.driveTo
    this.makeup = this.makeupTo
    this.env = e
    this.quiet = zero
  }
}
