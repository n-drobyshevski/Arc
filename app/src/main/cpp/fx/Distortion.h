// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Distortion.kt (an addition).
// The distortion (the EP-133's DISTORTION): the send bus driven into a soft
// clip, X the drive (1 + 39 x², made up by 1 / sqrt(drive)), Y its colour (a
// low-pass below the middle, a high-pass above it, the clip alone in the
// middle, faded in over the first quarter of the way to either end). The
// drive, its make-up and the colour's mix glide across each block; the
// colour's cutoff and Q are set once a block. The same float operations in
// the same order as the Kotlin one, so it renders what that does, bit for
// bit (VoiceMixerParityTest.cpp replays VoiceMixerGoldenTest's FX scenarios).
//
// Deltas from the Kotlin distortion: setRate (the native mixer can start over
// at another rate) resets it.
#pragma once

#include <cmath>
#include <cstdint>

#include "Effect.h"
#include "FxMath.h"
#include "Svf.h"

namespace arc::fx {

class Distortion final : public Effect {
public:
    /** The mixer's full scale: the clip's 1. */
    static constexpr float SCALE = 32768.0f;
    /** The low-pass's cutoff at the middle and at Y = 0. */
    static constexpr float LOW_TOP = 16000.0f;
    static constexpr float LOW_BOTTOM = 200.0f;
    /** The high-pass's cutoff at the middle and at Y = 1. */
    static constexpr float HIGH_BOTTOM = 20.0f;
    static constexpr float HIGH_TOP = 6000.0f;
    /** The colour's Q at the middle, and what either end adds to it. */
    static constexpr float Q_OPEN = 0.7f;
    static constexpr float Q_RANGE = 1.8f;
    /** How fast the colour fades in away from the middle: fully in a quarter of the way to an end. */
    static constexpr float FADE_IN = 4.0f;
    /** Below this, a block's return counts as silence. */
    static constexpr float TAIL = 1e-6f;

    explicit Distortion(int32_t outRate) : outRate_(outRate) {}

    int32_t outRate() const { return outRate_; }
    void setRate(int32_t rate) override {
        outRate_ = rate;
        reset();
    }
    bool silent() const override { return quiet_; }

    void reset() override {
        left_.reset();
        right_.reset();
        colour_ = 0.0f;
        colourTo_ = 0.0f;
        fresh_ = true;
        quiet_ = true;
    }

    void setParams(float x, float y, float /*bpm*/) override {
        const float drive = 1.0f + 39.0f * x * x;
        gainInTo_ = drive / SCALE;
        gainOutTo_ = SCALE / std::sqrt(drive);
        const float t = std::fabs(y - 0.5f) * 2.0f;
        const bool low = y < 0.5f;
        const float fade = FADE_IN * t;
        const float mix = fade < 1.0f ? fade : 1.0f;
        if (mix > 0.0f) {
            const float hz = low ? knobHz(1.0f - t, LOW_BOTTOM, LOW_TOP) : knobHz(t, HIGH_BOTTOM, HIGH_TOP);
            const float g = svfG(hz, outRate_);
            const float q = Q_OPEN + Q_RANGE * t * t;
            // Coming in, or over to the other side: from silence, and faded in from none.
            if (colourTo_ == 0.0f || low != colourLow_) {
                left_.reset();
                right_.reset();
                colour_ = 0.0f;
            }
            left_.set(g, q);
            right_.set(g, q);
        }
        colourTo_ = mix;
        colourLow_ = low;
        if (fresh_) {
            gainIn_ = gainInTo_;
            gainOut_ = gainOutTo_;
            colour_ = colourTo_;
            fresh_ = false;
        }
    }

    void process(const float *in, float *out, int frames) override {
        if (frames <= 0) return;
        const float n = static_cast<float>(frames);
        const float inStep = (gainInTo_ - gainIn_) / n;
        const float outStep = (gainOutTo_ - gainOut_) / n;
        const float colourStep = (colourTo_ - colour_) / n;
        float gi = gainIn_;
        float go = gainOut_;
        float c = colour_;
        const bool filtered = colour_ > 0.0f || colourTo_ > 0.0f;
        bool zero = true;
        float peak = 0.0f;
        for (int i = 0; i < frames; i++) {
            gi += inStep;
            go += outStep;
            c += colourStep;
            const float l = in[2 * i];
            const float r = in[2 * i + 1];
            if (l != 0.0f || r != 0.0f) zero = false;
            float wl = softClip(l * gi) * go;
            float wr = softClip(r * gi) * go;
            if (filtered) {
                left_.process(wl);
                right_.process(wr);
                wl = lerp(wl, colourLow_ ? left_.lp() : left_.hp(), c);
                wr = lerp(wr, colourLow_ ? right_.lp() : right_.hp(), c);
            }
            out[2 * i] += wl;
            out[2 * i + 1] += wr;
            const float al = std::fabs(wl);
            const float ar = std::fabs(wr);
            if (al > peak) peak = al;
            if (ar > peak) peak = ar;
        }
        gainIn_ = gainInTo_;
        gainOut_ = gainOutTo_;
        colour_ = colourTo_;
        quiet_ = zero && peak < TAIL;
    }

private:
    int32_t outRate_;
    Svf left_;
    Svf right_;
    float gainIn_ = 1.0f / SCALE;
    float gainOut_ = SCALE;
    float gainInTo_ = 1.0f / SCALE;
    float gainOutTo_ = SCALE;
    float colour_ = 0.0f;
    float colourTo_ = 0.0f;
    bool colourLow_ = false;
    bool fresh_ = true;
    bool quiet_ = true;
};

}  // namespace arc::fx
