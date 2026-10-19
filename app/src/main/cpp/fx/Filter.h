// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Filter.kt (an addition).
// The filter (the EP-133's FILTER): a state-variable filter (Svf, one a
// channel) on the send bus, X a low-pass below 0.47 (60 Hz to 20 kHz) and a
// high-pass above 0.53 (20 Hz to 8 kHz), the input untouched between, Y its
// Q (0.5 to 8). Moving between the three crossfades over 10 ms, each with a
// weight gliding to 1 or 0. The same float operations in the same order as
// the Kotlin one, so it renders what that does, bit for bit
// (VoiceMixerParityTest.cpp replays VoiceMixerGoldenTest's FX scenarios).
//
// Deltas from the Kotlin filter: setRate (the native mixer can start over at
// another rate) works out the fade's length again and resets it.
#pragma once

#include <cmath>
#include <cstdint>

#include "Effect.h"
#include "FxMath.h"
#include "Svf.h"

namespace arc::fx {

class Filter final : public Effect {
public:
    /** Where X stops being a low-pass, and where it starts being a high-pass. */
    static constexpr float LOW_END = 0.47f;
    static constexpr float HIGH_START = 0.53f;
    /** How far each of them runs along X. */
    static constexpr float SPAN = 0.47f;
    static constexpr float LOW_FROM = 60.0f;
    static constexpr float LOW_TO = 20000.0f;
    static constexpr float HIGH_FROM = 20.0f;
    static constexpr float HIGH_TO = 8000.0f;
    static constexpr float Q_FROM = 0.5f;
    static constexpr float Q_TO = 8.0f;
    /** How long moving from one mode to another takes. */
    static constexpr int32_t FADE_MS = 10;
    /** Below this, a block's return counts as silence. */
    static constexpr float TAIL = 1e-6f;

    explicit Filter(int32_t outRate) { rate(outRate); }

    int32_t outRate() const { return outRate_; }
    void setRate(int32_t rate) override {
        this->rate(rate);
        reset();
    }
    bool silent() const override { return quiet_; }

    void reset() override {
        lowL_.reset();
        lowR_.reset();
        highL_.reset();
        highR_.reset();
        fresh_ = true;
        quiet_ = true;
    }

    void setParams(float x, float y, float /*bpm*/) override {
        const float q = Q_FROM + (Q_TO - Q_FROM) * y * y * y;
        const int32_t m = x < LOW_END ? LOW : (x > HIGH_START ? HIGH : OPEN);
        if (m == LOW) {
            const float g = svfG(knobHz(x / SPAN, LOW_FROM, LOW_TO), outRate_);
            lowL_.set(g, q);
            lowR_.set(g, q);
        } else if (m == HIGH) {
            const float g = svfG(knobHz((x - HIGH_START) / SPAN, HIGH_FROM, HIGH_TO), outRate_);
            highL_.set(g, q);
            highR_.set(g, q);
        }
        if (fresh_) {
            for (float &w : weights_) w = 0.0f;
            weights_[m] = 1.0f;
            fading_ = false;
            fresh_ = false;
        } else if (m != mode_) {
            // Coming back in from nothing: from silence.
            if (weights_[m] == 0.0f) {
                if (m == LOW) {
                    lowL_.reset();
                    lowR_.reset();
                } else if (m == HIGH) {
                    highL_.reset();
                    highR_.reset();
                }
            }
            fading_ = true;
        }
        mode_ = m;
    }

    void process(const float *in, float *out, int frames) override {
        bool zero = true;
        float peak = 0.0f;
        for (int i = 0; i < frames; i++) {
            const float l = in[2 * i];
            const float r = in[2 * i + 1];
            if (l != 0.0f || r != 0.0f) zero = false;
            float sl;
            float sr;
            if (!fading_) {
                if (mode_ == LOW) {
                    lowL_.process(l);
                    lowR_.process(r);
                    sl = lowL_.lp();
                    sr = lowR_.lp();
                } else if (mode_ == HIGH) {
                    highL_.process(l);
                    highR_.process(r);
                    sl = highL_.hp();
                    sr = highR_.hp();
                } else {
                    sl = l;
                    sr = r;
                }
            } else {
                bool done = true;
                for (int32_t k = 0; k < MODES; k++) {
                    const float w = weights_[k];
                    float v;
                    if (k == mode_) {
                        const float up = w + step_;
                        v = up < 1.0f ? up : 1.0f;
                    } else {
                        const float down = w - step_;
                        v = down > 0.0f ? down : 0.0f;
                    }
                    weights_[k] = v;
                    if (v != (k == mode_ ? 1.0f : 0.0f)) done = false;
                }
                sl = weights_[OPEN] * l;
                sr = weights_[OPEN] * r;
                const float wl = weights_[LOW];
                if (wl > 0.0f) {
                    lowL_.process(l);
                    lowR_.process(r);
                    sl += wl * lowL_.lp();
                    sr += wl * lowR_.lp();
                }
                const float wh = weights_[HIGH];
                if (wh > 0.0f) {
                    highL_.process(l);
                    highR_.process(r);
                    sl += wh * highL_.hp();
                    sr += wh * highR_.hp();
                }
                fading_ = !done;
            }
            out[2 * i] += sl;
            out[2 * i + 1] += sr;
            const float al = std::fabs(sl);
            const float ar = std::fabs(sr);
            if (al > peak) peak = al;
            if (ar > peak) peak = ar;
        }
        quiet_ = zero && peak < TAIL;
    }

private:
    /** The modes, by weight. */
    static constexpr int32_t LOW = 0;
    static constexpr int32_t OPEN = 1;
    static constexpr int32_t HIGH = 2;
    static constexpr int32_t MODES = 3;

    void rate(int32_t outRate) {
        outRate_ = outRate;
        const int32_t frames = FADE_MS * outRate / 1000;
        fadeFrames_ = frames > 1 ? frames : 1;
        step_ = 1.0f / static_cast<float>(fadeFrames_);
    }

    int32_t outRate_ = 0;
    int32_t fadeFrames_ = 1;
    float step_ = 1.0f;
    Svf lowL_;
    Svf lowR_;
    Svf highL_;
    Svf highR_;
    /** Each mode's weight in the return; while fading, they glide toward 1 for the mode and 0 for the rest. */
    float weights_[MODES] = {0.0f, 1.0f, 0.0f};
    int32_t mode_ = OPEN;
    bool fading_ = false;
    bool fresh_ = true;
    bool quiet_ = true;
};

}  // namespace arc::fx
