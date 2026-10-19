// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Reverb.kt (an addition).
// The reverb (the EP-133's REVERB): Freeverb at half its size (four damped
// combs and two all-passes a channel, Freeverb's lengths scaled to the rate,
// the right channel's 23 frames longer), X its size (the combs' feedback,
// 0.7 to 0.98), Y its tone (more damping below the middle, a high shelf
// above it). The feedback and damping are set once a block, the shelf's gain
// glides across it. The same float operations in the same order as the
// Kotlin one, so it renders what that does, bit for bit
// (VoiceMixerParityTest.cpp replays VoiceMixerGoldenTest's FX scenarios).
//
// Deltas from the Kotlin reverb: setRate (the native mixer can start over at
// another rate) works out the lines again and resets it; the lines are
// allocated there (and at construction), and only grow, never while
// rendering.
#pragma once

#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>

#include "Effect.h"
#include "FxMath.h"

namespace arc::fx {

class Reverb final : public Effect {
public:
    /** Freeverb's comb and all-pass lengths at 44.1 kHz, and how much longer the right channel's are. */
    static constexpr int32_t COMBS[4] = {1116, 1188, 1277, 1356};
    static constexpr int32_t ALLPASSES[2] = {556, 441};
    static constexpr int32_t SPREAD = 23;
    static constexpr int32_t BASE_RATE = 44100;
    /** The input's gain into the combs (Freeverb's fixed gain). */
    static constexpr float INPUT = 0.015f;
    /** The combs' feedback at X = 0, and what X = 1 adds to it. */
    static constexpr float ROOM = 0.7f;
    static constexpr float ROOM_RANGE = 0.28f;
    /** The combs' damping from the middle of Y up, and at Y = 0. */
    static constexpr float DAMP = 0.2f;
    static constexpr float DAMP_DARK = 0.8f;
    /** The all-passes' feedback. */
    static constexpr float ALLPASS = 0.5f;
    /** The return's gain. */
    static constexpr float WET = 2.0f;
    /** Where the bright shelf starts, and how much of the top end it adds at Y = 1. */
    static constexpr float SHELF_HZ = 3000.0f;
    static constexpr float SHELF = 1.5f;
    /** Below this, the return counts as silence. */
    static constexpr float TAIL = 1e-6f;

    explicit Reverb(int32_t outRate) { rate(outRate); }

    int32_t outRate() const { return outRate_; }
    void setRate(int32_t rate) override {
        this->rate(rate);
        reset();
    }
    bool silent() const override { return quietFrames_ >= span_; }

    void reset() override {
        // Only what was written to needs clearing: a type change switches to a reverb that never ran at no cost.
        if (!clean_) {
            std::memset(lines_.get(), 0, sizeof(float) * static_cast<size_t>(total_));
            clean_ = true;
        }
        for (int32_t &p : positions_) p = 0;
        for (float &s : stores_) s = 0.0f;
        shelfStates_[0] = 0.0f;
        shelfStates_[1] = 0.0f;
        fresh_ = true;
        quietFrames_ = span_;
    }

    void setParams(float x, float y, float /*bpm*/) override {
        feedback_ = ROOM + ROOM_RANGE * x;
        float damp;
        if (y < 0.5f) {
            damp = DAMP + (DAMP_DARK - DAMP) * ((0.5f - y) * 2.0f);
            shelfTo_ = 0.0f;
        } else {
            damp = DAMP;
            shelfTo_ = SHELF * ((y - 0.5f) * 2.0f);
        }
        damp1_ = damp;
        damp2_ = 1.0f - damp;
        if (fresh_) {
            shelf_ = shelfTo_;
            fresh_ = false;
        }
    }

    void process(const float *in, float *out, int frames) override {
        if (frames <= 0) return;
        clean_ = false;
        const float shelfStep = (shelfTo_ - shelf_) / static_cast<float>(frames);
        float *lines = lines_.get();
        float k = shelf_;
        bool zero = true;
        float peak = 0.0f;
        for (int i = 0; i < frames; i++) {
            k += shelfStep;
            const float il = in[2 * i];
            const float ir = in[2 * i + 1];
            if (il != 0.0f || ir != 0.0f) zero = false;
            const float mono = (il + ir) * INPUT;
            for (int c = 0; c < 2; c++) {
                // The combs, side by side.
                float acc = 0.0f;
                for (int j = 0; j < COMB_COUNT; j++) {
                    const int line = c * LINES + j;
                    const int32_t at = starts_[line] + positions_[line];
                    const float o = lines[at];
                    const float s = flush(o * damp2_ + stores_[c * COMB_COUNT + j] * damp1_);
                    stores_[c * COMB_COUNT + j] = s;
                    lines[at] = flush(mono + s * feedback_);
                    if (++positions_[line] == lengths_[line]) positions_[line] = 0;
                    acc += o;
                }
                // The all-passes, in a row.
                for (int j = COMB_COUNT; j < LINES; j++) {
                    const int line = c * LINES + j;
                    const int32_t at = starts_[line] + positions_[line];
                    const float b = lines[at];
                    lines[at] = flush(acc + b * ALLPASS);
                    if (++positions_[line] == lengths_[line]) positions_[line] = 0;
                    acc = b - acc;
                }
                // The shelf: the return plus k times its top end.
                const float wet = acc * WET;
                const float v = (wet - shelfStates_[c]) * shelfG_;
                const float low = v + shelfStates_[c];
                shelfStates_[c] = flush(low + v);
                const float o = wet + k * (wet - low);
                out[2 * i + c] += o;
                const float a = std::fabs(o);
                if (a > peak) peak = a;
            }
        }
        shelf_ = shelfTo_;
        if (!zero || peak >= TAIL) {
            quietFrames_ = 0;
        } else if (quietFrames_ < span_) {
            quietFrames_ += frames;
        }
    }

private:
    /** A channel's lines: its combs, then its all-passes. */
    static constexpr int LINES = 6;
    static constexpr int COMB_COUNT = 4;

    void rate(int32_t outRate) {
        outRate_ = outRate;
        int32_t total = 0;
        for (int i = 0; i < 2 * LINES; i++) {
            const int32_t base = i % LINES < COMB_COUNT ? COMBS[i % LINES] : ALLPASSES[i % LINES - COMB_COUNT];
            const int32_t length = (base + SPREAD * (i / LINES)) * outRate / BASE_RATE;
            lengths_[i] = length > 1 ? length : 1;
            starts_[i] = total;
            total += lengths_[i];
        }
        total_ = total;
        if (total_ > capacity_) {
            lines_.reset(new float[static_cast<size_t>(total_)]());
            capacity_ = total_;
        } else {
            std::memset(lines_.get(), 0, sizeof(float) * static_cast<size_t>(total_));
        }
        clean_ = true;
        span_ = lengths_[LINES + COMB_COUNT - 1] + lengths_[LINES + COMB_COUNT] + lengths_[LINES + COMB_COUNT + 1];
        const float g = svfG(SHELF_HZ, outRate);
        shelfG_ = g / (1.0f + g);
        quietFrames_ = span_;
    }

    int32_t outRate_ = 0;
    int32_t lengths_[2 * LINES] = {};
    int32_t starts_[2 * LINES] = {};
    int32_t positions_[2 * LINES] = {};
    int32_t total_ = 0;
    int32_t capacity_ = 0;
    std::unique_ptr<float[]> lines_;
    float stores_[2 * COMB_COUNT] = {};
    int32_t span_ = 0;
    float shelfG_ = 0.0f;
    float shelfStates_[2] = {};
    float feedback_ = ROOM;
    float damp1_ = DAMP;
    float damp2_ = 1.0f - DAMP;
    float shelf_ = 0.0f;
    float shelfTo_ = 0.0f;
    bool fresh_ = true;
    int32_t quietFrames_ = 0;
    bool clean_ = true;
};

}  // namespace arc::fx
