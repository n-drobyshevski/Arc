package dev.arc.ep133.formats.fx

import kotlin.math.abs

/*
 * The arithmetic the FX bus is built from (an addition), so that the Kotlin
 * effects, their C++ port (app/src/main/cpp/fx/FxMath.h) and their web port
 * (web/src/core/formats/fx/fxMath.ts) work out the same samples, bit for bit.
 * Everything is Float, one rounding a step, in the order written here: no
 * sin, exp, pow or other library function whose last bit can differ between
 * runtimes, only + - * / and comparisons. Where a curve is needed it is a
 * rational or a polynomial (the tangent, the soft clip, the LFO shapes), and
 * where a table is needed its entries are written as float bits.
 *
 * The host test (app/src/test/cpp/FxMathParityTest.cpp) and the web test
 * (web/test/core/formats/fx/fxMath.test.ts) check that against vectors
 * these functions wrote (app/src/test/cpp/fx-math.golden).
 */

/** Below this, a value in a feedback path is flushed to 0, so a decaying tail never turns denormal. */
const val DENORMAL = 1e-15f

/** π as a Float (bits 0x40490fdb). */
const val PI_F = 3.14159274f

/** [y], or 0 when it is smaller than [DENORMAL] either way. */
fun flush(y: Float): Float = if (abs(y) < DENORMAL) 0f else y

/** [x] held to 0..1; NaN (no number) is 0. */
fun clamp01(x: Float): Float = if (x > 0f) (if (x < 1f) x else 1f) else 0f

/** From [a] at [t] = 0 to [b] at [t] = 1, in a straight line. */
fun lerp(a: Float, b: Float, t: Float): Float = a + (b - a) * t

/**
 * The per-sample step k of a one-pole smoother (y += k * (target - y)) that
 * settles over about [ms] at [rate]: 1 / (1 + ms * rate / 1000), in (0, 1].
 * A rational rather than the usual exponential; 0 ms or less is 1 (no smoothing).
 */
fun onePoleCoef(ms: Float, rate: Int): Float {
    if (ms <= 0f) return 1f
    return 1f / (1f + ms * rate.toFloat() / 1000f)
}

/**
 * tan([w]) by its Padé approximant w(15 - w²) / (15 - 6w²): within 1% up to
 * w = 0.4π (where the caller keeps it), and closer the lower it goes.
 */
fun tanApprox(w: Float): Float {
    val w2 = w * w
    return w * (15f - w2) / (15f - 6f * w2)
}

/** A state-variable filter's g for a cutoff of [hz] at [rate]: tan(π hz / rate), the cutoff held to 0.4 of the rate. */
fun svfG(hz: Float, rate: Int): Float {
    val r = rate.toFloat()
    val cap = 0.4f * r
    val h = if (hz < cap) hz else cap
    return tanApprox(PI_F * h / r)
}

/**
 * A soft clip that is close to linear near 0 and reaches ±1 smoothly at ±3:
 * x(27 + x²) / (27 + 9x²) (tanh's Padé approximant), ±1 beyond.
 */
fun softClip(x: Float): Float {
    if (x > 3f) return 1f
    if (x < -3f) return -1f
    val x2 = x * x
    return x * (27f + x2) / (27f + 9f * x2)
}

/** A knob's 0..1 [k] as a frequency from [lo] to [hi], on a cubic curve so the low end gets most of the travel. */
fun knobHz(k: Float, lo: Float, hi: Float): Float {
    val k3 = k * k * k
    return lo + (hi - lo) * k3
}

/** A triangle LFO at [phase] (0..1): 0 at 0, 1 at a quarter, -1 at three quarters, in phase with a sine. */
fun triangle(phase: Float): Float {
    if (phase < 0.25f) return 4f * phase
    if (phase < 0.75f) return 2f - 4f * phase
    return 4f * phase - 4f
}

/**
 * About sin(2π [phase]) for [phase] in 0..1, from two parabolas: with x the
 * phase as -1..1 around the zero crossing, 4x(1 - |x|). Within 0.06 of a sine,
 * and smooth enough for a tremolo or an LFO.
 */
fun parabolicSine(phase: Float): Float {
    val x = if (phase < 0.5f) 2f * phase else 2f * phase - 2f
    return 4f * x * (1f - abs(x))
}

/** A phase moved back into 0..1 after a step: [p] in -1..2 less its whole part. */
fun wrap01(p: Float): Float = if (p >= 1f) p - 1f else if (p < 0f) p + 1f else p

/** 2^(n/12), the speed ratio [n] semitones up (-12..12, held there), as exact Float entries. */
fun semitoneRatio(n: Int): Float = SEMITONES[(if (n < -12) -12 else if (n > 12) 12 else n) + 12]

/** 2^(n/12) for n = -12..12, rounded once to Float. */
private val SEMITONES = intArrayOf(
    0x3f000000, 0x3f079c7d, 0x3f0facd6, 0x3f1837f0, 0x3f214518, 0x3f2adc08, 0x3f3504f3, 0x3f3fc887, 0x3f4b2ff5,
    0x3f5744fd, 0x3f6411f0, 0x3f71a1bf, 0x3f800000, 0x3f879c7d, 0x3f8facd6, 0x3f9837f0, 0x3fa14518, 0x3faadc08,
    0x3fb504f3, 0x3fbfc887, 0x3fcb2ff5, 0x3fd744fd, 0x3fe411f0, 0x3ff1a1bf, 0x40000000,
).let { bits -> FloatArray(bits.size) { Float.fromBits(bits[it]) } }

/**
 * The effects' own random numbers: a 32-bit linear congruential generator
 * (Numerical Recipes' constants), the same sequence in every port for the
 * same [seed].
 */
class Lcg(seed: Int) {
    private var s = seed

    /** The next state, as a signed 32-bit number: s * 1664525 + 1013904223, wrapping. */
    fun next(): Int {
        s = s * 1664525 + 1013904223
        return s
    }

    /** The next number in 0..1 (1 excluded), from the state's top 24 bits. */
    fun unit(): Float = (next() ushr 8).toFloat() * (1f / 16777216f)
}
