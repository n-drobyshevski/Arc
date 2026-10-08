// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/FxMath.kt, for the
// native Live engine's FX bus (an addition). The same functions in the same
// float arithmetic in the same order, so the effects built on them render the
// same samples as the Kotlin ones, bit for bit: the host test
// (app/src/test/cpp/FxMathParityTest.cpp) checks that against vectors the
// Kotlin functions wrote (app/src/test/cpp/fx-math.golden).
//
// Only + - * / and comparisons: no library function whose last bit can differ
// from the JVM's. The build passes -ffp-contract=off and -fno-fast-math, so
// nothing is fused into an fma or reordered.
//
// Deltas from the Kotlin functions:
// - Free functions in arc::fx; the constants are constexpr.
// - The semitone table is kept as float bits and copied out (no bit_cast in
//   C++17).
#pragma once

#include <cstdint>
#include <cstring>

namespace arc::fx {

/** Below this, a value in a feedback path is flushed to 0, so a decaying tail never turns denormal. */
constexpr float DENORMAL = 1e-15f;

/** π as a float (bits 0x40490fdb). */
constexpr float PI_F = 3.14159274f;

/** The float with these bits. */
inline float fromBits(uint32_t bits) {
    float f;
    std::memcpy(&f, &bits, sizeof f);
    return f;
}

/** [y], or 0 when it is smaller than DENORMAL either way. */
inline float flush(float y) { return (y < 0.0f ? -y : y) < DENORMAL ? 0.0f : y; }

/** [x] held to 0..1; NaN (no number) is 0. */
inline float clamp01(float x) { return x > 0.0f ? (x < 1.0f ? x : 1.0f) : 0.0f; }

/** From [a] at [t] = 0 to [b] at [t] = 1, in a straight line. */
inline float lerp(float a, float b, float t) { return a + (b - a) * t; }

/**
 * The per-sample step k of a one-pole smoother that settles over about [ms]
 * at [rate]: 1 / (1 + ms * rate / 1000), in (0, 1]; 0 ms or less is 1.
 */
inline float onePoleCoef(float ms, int32_t rate) {
    if (ms <= 0.0f) return 1.0f;
    return 1.0f / (1.0f + ms * static_cast<float>(rate) / 1000.0f);
}

/** tan([w]) by its Padé approximant w(15 - w²) / (15 - 6w²); the caller keeps w ≤ 0.4π. */
inline float tanApprox(float w) {
    const float w2 = w * w;
    return w * (15.0f - w2) / (15.0f - 6.0f * w2);
}

/** A state-variable filter's g for a cutoff of [hz] at [rate]: tan(π hz / rate), the cutoff held to 0.4 of the rate. */
inline float svfG(float hz, int32_t rate) {
    const float r = static_cast<float>(rate);
    const float cap = 0.4f * r;
    const float h = hz < cap ? hz : cap;
    return tanApprox(PI_F * h / r);
}

/** x(27 + x²) / (27 + 9x²), ±1 beyond ±3. */
inline float softClip(float x) {
    if (x > 3.0f) return 1.0f;
    if (x < -3.0f) return -1.0f;
    const float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

/** A knob's 0..1 [k] as a frequency from [lo] to [hi], on a cubic curve. */
inline float knobHz(float k, float lo, float hi) {
    const float k3 = k * k * k;
    return lo + (hi - lo) * k3;
}

/** A triangle LFO at [phase] (0..1): 0 at 0, 1 at a quarter, -1 at three quarters. */
inline float triangle(float phase) {
    if (phase < 0.25f) return 4.0f * phase;
    if (phase < 0.75f) return 2.0f - 4.0f * phase;
    return 4.0f * phase - 4.0f;
}

/** About sin(2π [phase]) from two parabolas: 4x(1 - |x|), x the phase as -1..1. */
inline float parabolicSine(float phase) {
    const float x = phase < 0.5f ? 2.0f * phase : 2.0f * phase - 2.0f;
    return 4.0f * x * (1.0f - (x < 0.0f ? -x : x));
}

/** A phase moved back into 0..1 after a step: [p] in -1..2 less its whole part. */
inline float wrap01(float p) { return p >= 1.0f ? p - 1.0f : (p < 0.0f ? p + 1.0f : p); }

/** 2^(n/12), the speed ratio [n] semitones up (-12..12, held there), as exact float entries. */
inline float semitoneRatio(int32_t n) {
    static constexpr uint32_t BITS[25] = {
        0x3f000000, 0x3f079c7d, 0x3f0facd6, 0x3f1837f0, 0x3f214518, 0x3f2adc08, 0x3f3504f3, 0x3f3fc887, 0x3f4b2ff5,
        0x3f5744fd, 0x3f6411f0, 0x3f71a1bf, 0x3f800000, 0x3f879c7d, 0x3f8facd6, 0x3f9837f0, 0x3fa14518, 0x3faadc08,
        0x3fb504f3, 0x3fbfc887, 0x3fcb2ff5, 0x3fd744fd, 0x3fe411f0, 0x3ff1a1bf, 0x40000000,
    };
    return fromBits(BITS[(n < -12 ? -12 : (n > 12 ? 12 : n)) + 12]);
}

/** The effects' own random numbers: the Kotlin Lcg's sequence for the same seed. */
class Lcg {
public:
    explicit Lcg(int32_t seed) : s_(static_cast<uint32_t>(seed)) {}

    /** The next state, as a signed 32-bit number: s * 1664525 + 1013904223, wrapping. */
    int32_t next() {
        s_ = s_ * 1664525u + 1013904223u;
        return static_cast<int32_t>(s_);
    }

    /** The next number in 0..1 (1 excluded), from the state's top 24 bits. */
    float unit() { return static_cast<float>(static_cast<uint32_t>(next()) >> 8) * (1.0f / 16777216.0f); }

private:
    uint32_t s_;
};

}  // namespace arc::fx
