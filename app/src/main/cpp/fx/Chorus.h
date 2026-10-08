// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Chorus.kt (an addition).
// The chorus (the EP-133's CHORUS): the send bus summed to mono into a
// line about 25 ms long, the left return read at one tap and the right at
// another, each 15 ms back give or take up to 10 ms, swung by triangle LFOs
// a quarter of a cycle apart. X is their rate (0.05 to 5 Hz), Y how far
// they swing (a quarter of the way to all of it) and how much of the taps
// is fed back (0 to 0.7). The swing and feedback glide across each block.
// The same float operations in the same order as the Kotlin one, so it
// renders what that does, bit for bit (VoiceMixerParityTest.cpp replays
// VoiceMixerGoldenTest's FX scenarios).
//
// Deltas from the Kotlin chorus: setRate (the native mixer can start over at
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

class Chorus final : public Effect {
public:
    /** Where the taps sit, and how far either way they swing at most. */
    static constexpr float CENTRE_MS = 15.0f;
    static constexpr float SWING_MS = 10.0f;
    /** The LFOs' rate at X = 0 and X = 1. */
    static constexpr float RATE_FROM = 0.05f;
    static constexpr float RATE_TO = 5.0f;
    /** How much of the swing Y = 0 keeps. */
    static constexpr float DEPTH_FROM = 0.25f;
    /** The feedback at Y = 1. */
    static constexpr float FEEDBACK = 0.7f;
    /** The line's length: past the farthest tap, with room for the frame after it. */
    static constexpr int32_t LINE_MS = 26;
    /** Below this, what goes into the line counts as silence. */
    static constexpr float TAIL = 1e-6f;

    explicit Chorus(int32_t outRate) { rate(outRate); }

    int32_t outRate() const { return outRate_; }
    void setRate(int32_t rate) override {
        this->rate(rate);
        reset();
    }
    bool silent() const override { return quietFrames_ >= size_; }

    void reset() override {
        std::memset(line_.get(), 0, sizeof(float) * static_cast<size_t>(size_));
        write_ = 0;
        phase_ = 0.0f;
        fresh_ = true;
        quietFrames_ = size_;
    }

    void setParams(float x, float y, float /*bpm*/) override {
        step_ = knobHz(x, RATE_FROM, RATE_TO) / static_cast<float>(outRate_);
        swingTo_ = swingMax_ * (DEPTH_FROM + (1.0f - DEPTH_FROM) * y);
        feedbackTo_ = FEEDBACK * y;
        if (fresh_) {
            swing_ = swingTo_;
            feedback_ = feedbackTo_;
            fresh_ = false;
        }
    }

    void process(const float *in, float *out, int frames) override {
        if (frames <= 0) return;
        const float n = static_cast<float>(frames);
        const float swingStep = (swingTo_ - swing_) / n;
        const float feedbackStep = (feedbackTo_ - feedback_) / n;
        float *line = line_.get();
        float sw = swing_;
        float fb = feedback_;
        float p = phase_;
        int32_t w = write_;
        bool zero = true;
        bool loud = false;
        for (int i = 0; i < frames; i++) {
            sw += swingStep;
            fb += feedbackStep;
            const float a = tap(line, w, centre_ + sw * triangle(p));
            const float b = tap(line, w, centre_ + sw * triangle(wrap01(p + 0.25f)));
            p = wrap01(p + step_);
            const float il = in[2 * i];
            const float ir = in[2 * i + 1];
            if (il != 0.0f || ir != 0.0f) zero = false;
            const float v = flush((il + ir) * 0.5f + fb * ((a + b) * 0.5f));
            line[w] = v;
            if (std::fabs(v) >= TAIL) loud = true;
            out[2 * i] += a;
            out[2 * i + 1] += b;
            w++;
            if (w == size_) w = 0;
        }
        swing_ = swingTo_;
        feedback_ = feedbackTo_;
        phase_ = p;
        write_ = w;
        if (!zero || loud) {
            quietFrames_ = 0;
        } else if (quietFrames_ < size_) {
            quietFrames_ += frames;
        }
    }

private:
    void rate(int32_t outRate) {
        outRate_ = outRate;
        size_ = LINE_MS * outRate / 1000 + 3;
        if (size_ > capacity_) {
            line_.reset(new float[static_cast<size_t>(size_)]());
            capacity_ = size_;
        }
        centre_ = CENTRE_MS * static_cast<float>(outRate) / 1000.0f;
        swingMax_ = SWING_MS * static_cast<float>(outRate) / 1000.0f;
        quietFrames_ = size_;
    }

    /** The line [t] frames before [w], between the two samples either side. */
    float tap(const float *line, int32_t w, float t) const {
        const int32_t whole = static_cast<int32_t>(t);
        const float frac = t - static_cast<float>(whole);
        int32_t r0 = w - whole;
        if (r0 < 0) r0 += size_;
        int32_t r1 = r0 - 1;
        if (r1 < 0) r1 += size_;
        return lerp(line[r0], line[r1], frac);
    }

    int32_t outRate_ = 0;
    int32_t size_ = 0;
    int32_t capacity_ = 0;
    std::unique_ptr<float[]> line_;
    int32_t write_ = 0;
    float centre_ = 0.0f;
    float swingMax_ = 0.0f;
    float phase_ = 0.0f;
    float step_ = 0.0f;
    float swing_ = 0.0f;
    float swingTo_ = 0.0f;
    float feedback_ = 0.0f;
    float feedbackTo_ = 0.0f;
    bool fresh_ = true;
    int32_t quietFrames_ = 0;
};

}  // namespace arc::fx
