// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Delay.kt (an addition).
// The delay (the EP-133's DELAY): a tempo-synced echo of the send bus, X its
// length (one of twelve divisions of the beat, held to 2 s), Y its feedback
// (0 to 0.95, through a 6 kHz one-pole low-pass in the loop). A new length
// glides there over 60 ms, as a tape's would; each channel echoes itself at
// the same length. The feedback glides across each block. The same float
// operations in the same order as the Kotlin one, so it renders what that
// does, bit for bit (VoiceMixerParityTest.cpp replays VoiceMixerGoldenTest's
// FX scenarios).
//
// Deltas from the Kotlin delay: setRate (the native mixer can start over at
// another rate) works out the rate's values again and resets it; the line is
// allocated there (and at construction), and only grows, never while
// rendering.
#pragma once

#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>

#include "Effect.h"
#include "FxMath.h"

namespace arc::fx {

class Delay final : public Effect {
public:
    /** Each length in 24ths of a beat: 1/32, 1/16T, 1/16, 1/8T, 1/16D, 1/8, 1/4T, 1/8D, 1/4, 1/2T, 1/4D, 1/2. */
    static constexpr int32_t TICKS[12] = {3, 4, 6, 8, 9, 12, 16, 18, 24, 32, 36, 48};
    static constexpr int32_t DIVISIONS = 12;
    /** Seconds a 24th of a beat lasts at 1 BPM: 60 / 24. */
    static constexpr float TICK_SECONDS = 2.5f;
    /** The longest echo. */
    static constexpr int32_t MAX_SECONDS = 2;
    /** The feedback at Y = 1. */
    static constexpr float FEEDBACK = 0.95f;
    /** The cutoff of the low-pass in the loop. */
    static constexpr float DAMP_HZ = 6000.0f;
    /** How long the read head takes to glide to a new length. */
    static constexpr int32_t GLIDE_MS = 60;
    /** Below this, what goes into the line counts as silence. */
    static constexpr float TAIL = 1e-6f;

    explicit Delay(int32_t outRate) { rate(outRate); }

    int32_t outRate() const { return outRate_; }
    void setRate(int32_t rate) override {
        this->rate(rate);
        reset();
    }
    bool silent() const override { return quietFrames_ >= size_; }

    void reset() override {
        // Only what was written to needs clearing: a type change switches to a delay that never ran at no cost.
        if (!clean_) {
            std::memset(left_.get(), 0, sizeof(float) * static_cast<size_t>(size_));
            std::memset(right_.get(), 0, sizeof(float) * static_cast<size_t>(size_));
            clean_ = true;
        }
        write_ = 0;
        dampL_ = 0.0f;
        dampR_ = 0.0f;
        gliding_ = 0;
        fresh_ = true;
        quietFrames_ = size_;
    }

    void setParams(float x, float y, float bpm) override {
        const int32_t d = static_cast<int32_t>(x * static_cast<float>(DIVISIONS));
        const int32_t division = d < 0 ? 0 : (d > DIVISIONS - 1 ? DIVISIONS - 1 : d);
        const float frames = static_cast<float>(TICKS[division]) * static_cast<float>(outRate_) * TICK_SECONDS / bpm;
        const float max = static_cast<float>(maxTime_);
        const float t = frames > max ? max : (frames > 1.0f ? frames : 1.0f);
        feedbackTo_ = FEEDBACK * y;
        if (fresh_) {
            time_ = t;
            timeTo_ = t;
            gliding_ = 0;
            feedback_ = feedbackTo_;
            fresh_ = false;
        } else if (t != timeTo_) {
            timeTo_ = t;
            glideStep_ = (t - time_) / static_cast<float>(glideFrames_);
            gliding_ = glideFrames_;
        }
    }

    void process(const float *in, float *out, int frames) override {
        if (frames <= 0) return;
        clean_ = false;
        const float feedbackStep = (feedbackTo_ - feedback_) / static_cast<float>(frames);
        float *left = left_.get();
        float *right = right_.get();
        const int32_t size = size_;
        float fb = feedback_;
        float t = time_;
        int32_t w = write_;
        float sl = dampL_;
        float sr = dampR_;
        bool zero = true;
        bool loud = false;
        for (int i = 0; i < frames; i++) {
            fb += feedbackStep;
            if (gliding_ > 0) {
                gliding_--;
                t = gliding_ == 0 ? timeTo_ : t + glideStep_;
            }
            // The echo, between the two samples t frames back.
            const int32_t whole = static_cast<int32_t>(t);
            const float frac = t - static_cast<float>(whole);
            int32_t r0 = w - whole;
            if (r0 < 0) r0 += size;
            int32_t r1 = r0 - 1;
            if (r1 < 0) r1 += size;
            const float el = lerp(left[r0], left[r1], frac);
            const float er = lerp(right[r0], right[r1], frac);
            // Back in through the low-pass.
            const float vl = (el - sl) * damp_;
            const float ll = vl + sl;
            sl = flush(ll + vl);
            const float vr = (er - sr) * damp_;
            const float lr = vr + sr;
            sr = flush(lr + vr);
            const float il = in[2 * i];
            const float ir = in[2 * i + 1];
            if (il != 0.0f || ir != 0.0f) zero = false;
            const float l = flush(il + fb * ll);
            const float r = flush(ir + fb * lr);
            left[w] = l;
            right[w] = r;
            if (std::fabs(l) >= TAIL || std::fabs(r) >= TAIL) loud = true;
            out[2 * i] += el;
            out[2 * i + 1] += er;
            w++;
            if (w == size) w = 0;
        }
        feedback_ = feedbackTo_;
        time_ = t;
        write_ = w;
        dampL_ = sl;
        dampR_ = sr;
        if (!zero || loud) {
            quietFrames_ = 0;
        } else if (quietFrames_ < size_) {
            quietFrames_ += frames;
        }
    }

private:
    void rate(int32_t outRate) {
        outRate_ = outRate;
        maxTime_ = MAX_SECONDS * outRate;
        size_ = maxTime_ + 2;
        if (size_ > capacity_) {
            left_.reset(new float[static_cast<size_t>(size_)]());
            right_.reset(new float[static_cast<size_t>(size_)]());
            capacity_ = size_;
        } else {
            std::memset(left_.get(), 0, sizeof(float) * static_cast<size_t>(size_));
            std::memset(right_.get(), 0, sizeof(float) * static_cast<size_t>(size_));
        }
        clean_ = true;
        const float g = svfG(DAMP_HZ, outRate);
        damp_ = g / (1.0f + g);
        const int32_t glide = GLIDE_MS * outRate / 1000;
        glideFrames_ = glide > 1 ? glide : 1;
        quietFrames_ = size_;
    }

    int32_t outRate_ = 0;
    int32_t maxTime_ = 0;
    int32_t size_ = 0;
    int32_t capacity_ = 0;
    std::unique_ptr<float[]> left_;
    std::unique_ptr<float[]> right_;
    int32_t write_ = 0;
    float damp_ = 0.0f;
    float dampL_ = 0.0f;
    float dampR_ = 0.0f;
    int32_t glideFrames_ = 1;
    float time_ = 1.0f;
    float timeTo_ = 1.0f;
    float glideStep_ = 0.0f;
    int32_t gliding_ = 0;
    float feedback_ = 0.0f;
    float feedbackTo_ = 0.0f;
    bool fresh_ = true;
    int32_t quietFrames_ = 0;
    bool clean_ = true;
};

}  // namespace arc::fx
