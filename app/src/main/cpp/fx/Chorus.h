// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Chorus.kt (an addition).
// The chorus (the EP-133's CHORUS): two moving taps on a short delay of the
// send bus, X their rate, Y their depth and feedback.
//
// A stub for now, as the Kotlin one: it adds nothing and is always silent, so
// the bus skips it.
#pragma once

#include <cstdint>

#include "Effect.h"

namespace arc::fx {

class Chorus final : public Effect {
public:
    explicit Chorus(int32_t outRate) : outRate_(outRate) {}

    int32_t outRate() const { return outRate_; }
    void setRate(int32_t rate) override {
        outRate_ = rate;
        reset();
    }
    bool silent() const override { return true; }
    void reset() override {}
    void setParams(float /*x*/, float /*y*/, float /*bpm*/) override {}
    void process(const float * /*in*/, float * /*out*/, int /*frames*/) override {}

private:
    int32_t outRate_;
};

}  // namespace arc::fx
