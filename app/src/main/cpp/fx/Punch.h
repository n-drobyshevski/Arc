// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Punch.kt (an
// addition): the punch-in effects on the whole mix after the master effect,
// twelve slots each held at a depth while its pad is.
//
// A stub for now, as the Kotlin one: no slot processes (active is false), but
// the depths are kept, so sendBoost (SEND_FX's) already works.
//
// Deltas from the Kotlin punch-ins: [setRate] (VoiceMixer::reset), which
// keeps the slots held.
#pragma once

#include <cstdint>

#include "Effect.h"
#include "FxMath.h"

namespace arc::fx {

class Punch {
public:
    explicit Punch(int32_t outRate) : outRate_(outRate) {}

    int32_t outRate() const { return outRate_; }
    /** Starts over at [rate]; the slots held stay held. */
    void setRate(int32_t rate) { outRate_ = rate; }

    /** Whether a slot is held or still fading out: the bus calls [process] only then. */
    bool active() const { return false; }

    /** Holds [slot] at [depth] (0..1); 0 lets go of it. */
    void set(int32_t slot, float depth) {
        if (slot < 0 || slot >= FxControl::SLOTS) return;
        depths_[slot] = clamp01(depth);
    }

    /** The tempo the synced slots follow, in BPM. */
    void setTempo(float bpm) { bpm_ = bpm; }
    float tempo() const { return bpm_; }

    /** SEND_FX's depth: every group's send is at least this while it is held. */
    float sendBoost() const { return depths_[FxControl::SEND_FX]; }

    /** Writes [mix] (stereo, interleaved, [frames] long, before the punch-ins) into the history; every block. */
    void record(const float * /*mix*/, int /*frames*/) {}

    /** Plays the held slots over [mix] (stereo, interleaved, [frames] long), in place. */
    void process(float * /*mix*/, int /*frames*/) {}

    /** Every slot let go of at once, the history silent. */
    void reset() {
        for (float &d : depths_) d = 0.0f;
    }

private:
    int32_t outRate_;
    float depths_[FxControl::SLOTS] = {};
    float bpm_ = 120.0f;
};

}  // namespace arc::fx
