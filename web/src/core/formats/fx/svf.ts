// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Svf.kt
//
// A state-variable filter (an addition), one channel: the topology-preserving
// (trapezoidal) form from Zavalishin's "The Art of VA Filter Design", in
// Simper's arrangement, so it stays stable and in tune right up to the cutoff
// cap and while the cutoff moves. Each process gives the low-pass, band-pass
// and high-pass of the same sample at once (lp, bp, hp); the filter effect,
// the distortion's colour and the filter punch-ins pick one, or morph between
// them.
//
// tune sets the cutoff (held to 0.4 of the rate by svfG) and the Q (k = 1 / Q,
// so Q 0.5 is the gentlest and Q 8 rings); it keeps the state, so a cutoff
// can sweep without a click. The two integrators are flushed below DENORMAL,
// so a tail decays to exactly 0.
//
// Web deltas:
// - Kotlin's Float math is kept with Math.fround around every single
//   operation, so it filters as the Kotlin one does, bit for bit
//   (web/test/core/formats/fx/fxMath.test.ts replays FxMathGoldenTest's svf
//   vectors). Arguments are taken to be floats already (fround'ed).
// - lp, bp and hp are getters.

import { flush, svfG } from './fxMath'

const f = Math.fround

export class Svf {
  private a1 = 1
  private a2 = 0
  private a3 = 0
  private k = 2
  private ic1 = 0
  private ic2 = 0
  private outLp = 0
  private outBp = 0
  private outHp = 0

  /** The last sample's low-pass. */
  get lp(): number {
    return this.outLp
  }

  /** The last sample's band-pass. */
  get bp(): number {
    return this.outBp
  }

  /** The last sample's high-pass. */
  get hp(): number {
    return this.outHp
  }

  /** A cutoff of [hz] at [rate] and a resonance of [q] (above 0; 0.5 to 8 in use). */
  tune(hz: number, q: number, rate: number): void {
    this.set(svfG(hz, rate), q)
  }

  /** The same with g worked out already (FxMath's svfG), for a caller that keeps it. */
  set(g: number, q: number): void {
    this.k = f(1 / q)
    this.a1 = f(1 / f(1 + f(g * f(g + this.k))))
    this.a2 = f(g * this.a1)
    this.a3 = f(g * this.a2)
  }

  /** Filters [x]: lp, bp and hp are then its outputs. */
  process(x: number): void {
    const v3 = f(x - this.ic2)
    const v1 = f(f(this.a1 * this.ic1) + f(this.a2 * v3))
    const v2 = f(f(this.ic2 + f(this.a2 * this.ic1)) + f(this.a3 * v3))
    this.ic1 = flush(f(f(2 * v1) - this.ic1))
    this.ic2 = flush(f(f(2 * v2) - this.ic2))
    this.outLp = v2
    this.outBp = v1
    this.outHp = f(f(x - f(this.k * v1)) - v2)
  }

  /** Back to silence; the tuning stays. */
  reset(): void {
    this.ic1 = 0
    this.ic2 = 0
    this.outLp = 0
    this.outBp = 0
    this.outHp = 0
  }
}
