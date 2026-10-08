// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Compressor.kt (an addition).
// The compressor: a feed-forward, stereo-linked peak compressor, 4:1 above
// -18 dBFS, X its input drive (with make-up gain) and Y its speed. The bus has
// two: the EP-133's COMPRESSOR effect on the send bus (process, as every
// Effect), and the master compressor after everything (processInPlace).
//
// A stub for now, as the Kotlin one: it adds nothing and is always silent, so
// the bus skips it.
#pragma once

#include <cstdint>

#include "Effect.h"

namespace arc::fx {

class Compressor final : public Effect {
public:
    explicit Compressor(int32_t outRate) : outRate_(outRate) {}

    int32_t outRate() const { return outRate_; }
    void setRate(int32_t rate) override {
        outRate_ = rate;
        reset();
    }
    bool silent() const override { return true; }
    void reset() override {}
    void setParams(float /*x*/, float /*y*/, float /*bpm*/) override {}
    void process(const float * /*in*/, float * /*out*/, int /*frames*/) override {}

    /** Compresses [mix] (stereo, interleaved, [frames] long) in place: the master compressor. */
    void processInPlace(float * /*mix*/, int /*frames*/) {}

private:
    int32_t outRate_;
};

}  // namespace arc::fx
