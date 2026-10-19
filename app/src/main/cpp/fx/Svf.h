// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Svf.kt (an addition):
// the topology-preserving state-variable filter, one channel, in the same
// float operations in the same order, so it filters as the Kotlin one does,
// bit for bit (FxMathParityTest.cpp replays FxMathGoldenTest's svf vectors).
//
// Deltas from the Kotlin filter: lp, bp and hp are functions.
#pragma once

#include <cstdint>

#include "FxMath.h"

namespace arc::fx {

class Svf {
public:
    /** A cutoff of [hz] at [rate] and a resonance of [q] (above 0; 0.5 to 8 in use); the state stays. */
    void tune(float hz, float q, int32_t rate) { set(svfG(hz, rate), q); }

    /** The same with g worked out already (svfG), for a caller that keeps it. */
    void set(float g, float q) {
        k_ = 1.0f / q;
        a1_ = 1.0f / (1.0f + g * (g + k_));
        a2_ = g * a1_;
        a3_ = g * a2_;
    }

    /** Filters [x]: lp, bp and hp are then its outputs. */
    void process(float x) {
        const float v3 = x - ic2_;
        const float v1 = a1_ * ic1_ + a2_ * v3;
        const float v2 = ic2_ + a2_ * ic1_ + a3_ * v3;
        ic1_ = flush(2.0f * v1 - ic1_);
        ic2_ = flush(2.0f * v2 - ic2_);
        lp_ = v2;
        bp_ = v1;
        hp_ = x - k_ * v1 - v2;
    }

    /** Back to silence; the tuning stays. */
    void reset() {
        ic1_ = 0.0f;
        ic2_ = 0.0f;
        lp_ = 0.0f;
        bp_ = 0.0f;
        hp_ = 0.0f;
    }

    /** The last sample's low-pass, band-pass and high-pass. */
    float lp() const { return lp_; }
    float bp() const { return bp_; }
    float hp() const { return hp_; }

private:
    float a1_ = 1.0f;
    float a2_ = 0.0f;
    float a3_ = 0.0f;
    float k_ = 2.0f;
    float ic1_ = 0.0f;
    float ic2_ = 0.0f;
    float lp_ = 0.0f;
    float bp_ = 0.0f;
    float hp_ = 0.0f;
};

}  // namespace arc::fx
