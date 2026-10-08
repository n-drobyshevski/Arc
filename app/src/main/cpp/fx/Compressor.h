// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Compressor.kt (an addition).
// The compressor: a feed-forward, stereo-linked peak compressor, 4:1 above
// -18 dBFS, X its input drive (1 + 7 x², made up by 1 / sqrt(drive)) and Y
// its speed (one of eight attack and release pairs). The bus has two: the
// EP-133's COMPRESSOR effect on the send bus (process, as every Effect), and
// the master compressor after everything (processInPlace). The same float
// operations in the same order as the Kotlin one, so it renders what that
// does, bit for bit (VoiceMixerParityTest.cpp replays VoiceMixerGoldenTest's
// FX scenarios).
//
// Deltas from the Kotlin compressor: setRate (the native mixer can start over
// at another rate) works out the speeds' coefficients again and resets it.
#pragma once

#include <cmath>
#include <cstdint>

#include "Effect.h"
#include "FxMath.h"

namespace arc::fx {

class Compressor final : public Effect {
public:
    /** -18 dBFS on the mixer's scale: 0.1259 × 32768, to the nearest half (exact in float). */
    static constexpr float THRESHOLD = 4125.5f;
    static constexpr int32_t SPEEDS = 8;

    explicit Compressor(int32_t outRate) { rate(outRate); }

    int32_t outRate() const { return outRate_; }
    void setRate(int32_t rate) override {
        this->rate(rate);
        reset();
    }
    bool silent() const override { return quiet_ && env_ < THRESHOLD; }

    void reset() override {
        env_ = 0.0f;
        fresh_ = true;
        quiet_ = true;
    }

    void setParams(float x, float y, float /*bpm*/) override {
        driveTo_ = 1.0f + 7.0f * x * x;
        makeupTo_ = 1.0f / std::sqrt(driveTo_);
        if (fresh_) {
            drive_ = driveTo_;
            makeup_ = makeupTo_;
            fresh_ = false;
        }
        const int32_t s = static_cast<int32_t>(y * static_cast<float>(SPEEDS));
        const int32_t speed = s < 0 ? 0 : (s > SPEEDS - 1 ? SPEEDS - 1 : s);
        attack_ = attacks_[speed];
        release_ = releases_[speed];
    }

    void process(const float *in, float *out, int frames) override { run(in, out, frames, true); }

    /** Compresses [mix] (stereo, interleaved, [frames] long) in place: the master compressor. */
    void processInPlace(float *mix, int frames) { run(mix, mix, frames, false); }

private:
    void rate(int32_t outRate) {
        // The speeds Y picks from, fast to slow: attack and release, in ms.
        static constexpr float ATTACK_MS[SPEEDS] = {0.5f, 1.0f, 2.0f, 4.0f, 7.0f, 12.0f, 20.0f, 30.0f};
        static constexpr float RELEASE_MS[SPEEDS] = {40.0f, 60.0f, 90.0f, 130.0f, 190.0f, 280.0f, 420.0f, 600.0f};
        outRate_ = outRate;
        for (int32_t i = 0; i < SPEEDS; i++) {
            attacks_[i] = onePoleCoef(ATTACK_MS[i], outRate);
            releases_[i] = onePoleCoef(RELEASE_MS[i], outRate);
        }
        attack_ = attacks_[SPEEDS / 2];
        release_ = releases_[SPEEDS / 2];
    }

    /** [in] compressed into [out]: added to it, or in place of it (in may be out). */
    void run(const float *in, float *out, int frames, bool add) {
        if (frames <= 0) return;
        const float n = static_cast<float>(frames);
        const float driveStep = (driveTo_ - drive_) / n;
        const float makeupStep = (makeupTo_ - makeup_) / n;
        float d = drive_;
        float m = makeup_;
        float e = env_;
        bool zero = true;
        for (int i = 0; i < frames; i++) {
            d += driveStep;
            m += makeupStep;
            const float l = in[2 * i];
            const float r = in[2 * i + 1];
            if (l != 0.0f || r != 0.0f) zero = false;
            const float dl = l * d;
            const float dr = r * d;
            const float al = std::fabs(dl);
            const float ar = std::fabs(dr);
            const float p = al > ar ? al : ar;
            e = flush(e + (p > e ? attack_ : release_) * (p - e));
            float g = m;
            if (e > THRESHOLD) {
                const float q = std::sqrt(std::sqrt(THRESHOLD / e));
                g = q * q * q * m;
            }
            if (add) {
                out[2 * i] += dl * g;
                out[2 * i + 1] += dr * g;
            } else {
                out[2 * i] = dl * g;
                out[2 * i + 1] = dr * g;
            }
        }
        drive_ = driveTo_;
        makeup_ = makeupTo_;
        env_ = e;
        quiet_ = zero;
    }

    int32_t outRate_ = 0;
    float attacks_[SPEEDS] = {};
    float releases_[SPEEDS] = {};
    float attack_ = 0.0f;
    float release_ = 0.0f;
    /** The drive and make-up now, and where the block glides them to. */
    float drive_ = 1.0f;
    float makeup_ = 1.0f;
    float driveTo_ = 1.0f;
    float makeupTo_ = 1.0f;
    float env_ = 0.0f;
    bool fresh_ = true;
    bool quiet_ = true;
};

}  // namespace arc::fx
