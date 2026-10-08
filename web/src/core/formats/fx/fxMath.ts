// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/FxMath.kt
//
// The arithmetic the FX bus is built from (an addition), so that the Kotlin
// effects, their C++ port and this one work out the same samples, bit for
// bit. Everything is a 32-bit float, one rounding a step, in the order
// written here: no Math.sin, exp, pow or other function whose last bit can
// differ between runtimes, only + - * / and comparisons. Where a curve is
// needed it is a rational or a polynomial (the tangent, the soft clip, the
// LFO shapes), and where a table is needed its entries are written as float
// bits. The web test (web/test/core/formats/fx/fxMath.test.ts) checks that
// against vectors the Kotlin functions wrote (app/src/test/cpp/fx-math.golden).
//
// Web deltas:
// - Kotlin's Float math is kept with Math.fround around every single
//   operation (f(f(a * b) + c), never f(a * b + c)), so each step rounds as
//   Kotlin's does. Arguments are taken to be floats already (fround'ed).
// - Kotlin's Int is a number here; Lcg keeps its state with Math.imul and | 0
//   so it wraps as Kotlin's Int does.

const f = Math.fround

/** Below this, a value in a feedback path is flushed to 0, so a decaying tail never turns denormal. */
export const DENORMAL = f(1e-15)

/** π as a float (bits 0x40490fdb). */
export const PI_F = f(3.14159274)

/** [y], or 0 when it is smaller than DENORMAL either way. */
export function flush(y: number): number {
  return Math.abs(y) < DENORMAL ? 0 : y
}

/** [x] held to 0..1; NaN (no number) is 0. */
export function clamp01(x: number): number {
  return x > 0 ? (x < 1 ? x : 1) : 0
}

/** From [a] at [t] = 0 to [b] at [t] = 1, in a straight line. */
export function lerp(a: number, b: number, t: number): number {
  return f(a + f(f(b - a) * t))
}

/**
 * The per-sample step k of a one-pole smoother (y += k * (target - y)) that
 * settles over about [ms] at [rate]: 1 / (1 + ms * rate / 1000), in (0, 1].
 * A rational rather than the usual exponential; 0 ms or less is 1 (no smoothing).
 */
export function onePoleCoef(ms: number, rate: number): number {
  if (ms <= 0) return 1
  return f(1 / f(1 + f(f(ms * f(rate)) / 1000)))
}

/** tan([w]) by its Padé approximant w(15 - w²) / (15 - 6w²); the caller keeps w ≤ 0.4π. */
export function tanApprox(w: number): number {
  const w2 = f(w * w)
  return f(f(w * f(15 - w2)) / f(15 - f(6 * w2)))
}

/** A state-variable filter's g for a cutoff of [hz] at [rate]: tan(π hz / rate), the cutoff held to 0.4 of the rate. */
export function svfG(hz: number, rate: number): number {
  const r = f(rate)
  const cap = f(f(0.4) * r)
  const h = hz < cap ? hz : cap
  return tanApprox(f(f(PI_F * h) / r))
}

/**
 * A soft clip that is close to linear near 0 and reaches ±1 smoothly at ±3:
 * x(27 + x²) / (27 + 9x²) (tanh's Padé approximant), ±1 beyond.
 */
export function softClip(x: number): number {
  if (x > 3) return 1
  if (x < -3) return -1
  const x2 = f(x * x)
  return f(f(x * f(27 + x2)) / f(27 + f(9 * x2)))
}

/** A knob's 0..1 [k] as a frequency from [lo] to [hi], on a cubic curve so the low end gets most of the travel. */
export function knobHz(k: number, lo: number, hi: number): number {
  const k3 = f(f(k * k) * k)
  return f(lo + f(f(hi - lo) * k3))
}

/** A triangle LFO at [phase] (0..1): 0 at 0, 1 at a quarter, -1 at three quarters, in phase with a sine. */
export function triangle(phase: number): number {
  if (phase < 0.25) return f(4 * phase)
  if (phase < 0.75) return f(2 - f(4 * phase))
  return f(f(4 * phase) - 4)
}

/**
 * About sin(2π [phase]) for [phase] in 0..1, from two parabolas: with x the
 * phase as -1..1 around the zero crossing, 4x(1 - |x|). Within 0.06 of a
 * sine, and smooth enough for a tremolo or an LFO.
 */
export function parabolicSine(phase: number): number {
  const x = phase < 0.5 ? f(2 * phase) : f(f(2 * phase) - 2)
  return f(f(4 * x) * f(1 - Math.abs(x)))
}

/** A phase moved back into 0..1 after a step: [p] in -1..2 less its whole part. */
export function wrap01(p: number): number {
  return p >= 1 ? f(p - 1) : p < 0 ? f(p + 1) : p
}

/** 2^(n/12) for n = -12..12, rounded once to float. */
const SEMITONES = new Float32Array(
  Uint32Array.from([
    0x3f000000, 0x3f079c7d, 0x3f0facd6, 0x3f1837f0, 0x3f214518, 0x3f2adc08, 0x3f3504f3, 0x3f3fc887, 0x3f4b2ff5,
    0x3f5744fd, 0x3f6411f0, 0x3f71a1bf, 0x3f800000, 0x3f879c7d, 0x3f8facd6, 0x3f9837f0, 0x3fa14518, 0x3faadc08,
    0x3fb504f3, 0x3fbfc887, 0x3fcb2ff5, 0x3fd744fd, 0x3fe411f0, 0x3ff1a1bf, 0x40000000,
  ]).buffer,
)

/** 2^(n/12), the speed ratio [n] semitones up (-12..12, held there), as exact float entries. */
export function semitoneRatio(n: number): number {
  return SEMITONES[(n < -12 ? -12 : n > 12 ? 12 : n) + 12] as number
}

/**
 * The effects' own random numbers: a 32-bit linear congruential generator
 * (Numerical Recipes' constants), the same sequence in every port for the
 * same [seed].
 */
export class Lcg {
  private s: number

  constructor(seed: number) {
    this.s = seed | 0
  }

  /** The next state, as a signed 32-bit number: s * 1664525 + 1013904223, wrapping. */
  next(): number {
    this.s = (Math.imul(this.s, 1664525) + 1013904223) | 0
    return this.s
  }

  /** The next number in 0..1 (1 excluded), from the state's top 24 bits. */
  unit(): number {
    return f((this.next() >>> 8) * f(1 / 16777216))
  }
}
