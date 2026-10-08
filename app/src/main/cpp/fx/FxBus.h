// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/FxBus.kt, for the
// native Live engine (an addition): the mixer's sends, dry law, sidechain
// duck, smoothing, master effect (with its crossfade on a change of type),
// punch-ins and master compressor, in the same float arithmetic in the same
// order, so the C++ mixer renders what the Kotlin one does, bit for bit: the
// host test replays VoiceMixerGoldenTest's FX scenarios
// (app/src/test/cpp/voice-mixer.golden).
//
// Deltas from the Kotlin bus:
// - Fixed storage, allocated at construction for blocks of up to maxFrames.
// - [setRate] starts over at another output rate (VoiceMixer::reset): the
//   settings stay, the effects go back to silence, every smoothed value lands
//   on its target, and no duck or crossfade runs.
// - [dry] and [send] give a pointer, null where Kotlin gives null.
#pragma once

#include <cstdint>
#include <cstring>

#include "Chorus.h"
#include "Compressor.h"
#include "Delay.h"
#include "Distortion.h"
#include "Effect.h"
#include "Filter.h"
#include "FxMath.h"
#include "Punch.h"
#include "Reverb.h"

namespace arc::fx {

class FxBus {
public:
    /** How long the sends and knobs take to reach a new value, about. */
    static constexpr float SMOOTH_MS = 20.0f;
    /** A smoothed value this close to its target lands on it. */
    static constexpr float SNAP = 1e-6f;
    /** A new effect type fades in over this long, the old one out. */
    static constexpr int32_t CROSSFADE_MS = 20;
    /** The duck's floor: -20 dB. */
    static constexpr float DUCK_FLOOR = 0.1f;
    /** How long the duck takes to reach its floor. */
    static constexpr int32_t DUCK_DIP_MS = 2;
    /** The duck's length at x = 0, and what x = 1 adds to it. */
    static constexpr float DUCK_MS = 30.0f;
    static constexpr float DUCK_MS_RANGE = 570.0f;
    static constexpr float BPM_DEFAULT = 120.0f;
    static constexpr float BPM_MIN = 20.0f;
    static constexpr float BPM_MAX = 300.0f;

    FxBus(int32_t outRate, int maxFrames)
        : maxFrames_(maxFrames < 1 ? 1 : maxFrames),
          delay_(outRate),
          reverb_(outRate),
          distortion_(outRate),
          chorus_(outRate),
          filter_(outRate),
          compressorFx_(outRate),
          compressor_(outRate),
          punch_(outRate),
          buffers_(new float[static_cast<size_t>(maxFrames_) * (6 + 2 * FxControl::GROUPS)]()) {
        fxIn_ = buffers_;
        fadeOld_ = fxIn_ + 2 * maxFrames_;
        fadeNew_ = fadeOld_ + 2 * maxFrames_;
        dryGains_ = fadeNew_ + 2 * maxFrames_;
        sendGains_ = dryGains_ + FxControl::GROUPS * maxFrames_;
        effects_[FxControl::NONE] = nullptr;
        effects_[FxControl::DELAY] = &delay_;
        effects_[FxControl::REVERB] = &reverb_;
        effects_[FxControl::DISTORTION] = &distortion_;
        effects_[FxControl::CHORUS] = &chorus_;
        effects_[FxControl::FILTER] = &filter_;
        effects_[FxControl::COMPRESSOR] = &compressorFx_;
        rate(outRate);
        duckLength_ = lengthOf(duckX_);
    }

    ~FxBus() { delete[] buffers_; }
    FxBus(const FxBus &) = delete;
    FxBus &operator=(const FxBus &) = delete;

    /** Starts over at [outRate], keeping the settings (see the deltas above). */
    void setRate(int32_t outRate) {
        rate(outRate);
        duckLength_ = lengthOf(duckX_);
        for (Effect *e : effects_) {
            if (e != nullptr) e->setRate(outRate);
        }
        compressor_.setRate(outRate);
        punch_.setRate(outRate);
        fade_ = 0;
        oldType_ = FxControl::NONE;
        duckAt_ = IDLE;
        fxX_ = fxXTo_;
        fxY_ = fxYTo_;
        compX_ = compXTo_;
        compY_ = compYTo_;
        for (int g = 0; g < FxControl::GROUPS; g++) sends_[g] = sendsTo_[g];
        std::memset(fxIn_, 0, sizeof(float) * static_cast<size_t>(maxFrames_) * 2);
        dirty_ = 0;
    }

    /** Takes one of FxControl's commands. */
    void control(int32_t what, int32_t index, float x, float y) {
        switch (what) {
            case FxControl::FX_TYPE: {
                const int32_t t = index >= 0 && index < FxControl::TYPES ? index : FxControl::NONE;
                fxXTo_ = clamp01(x);
                fxYTo_ = clamp01(y);
                if (t == type_) return;
                // A new effect starts at its knobs; the one fading out (if any) goes at once.
                if (fade_ > 0 && effects_[oldType_] != nullptr) effects_[oldType_]->reset();
                oldType_ = type_;
                type_ = t;
                fade_ = fadeFrames_;
                fxX_ = fxXTo_;
                fxY_ = fxYTo_;
                if (effects_[t] != nullptr) effects_[t]->reset();
                return;
            }
            case FxControl::FX_XY:
                fxXTo_ = clamp01(x);
                fxYTo_ = clamp01(y);
                return;
            case FxControl::SEND:
                if (index >= 0 && index < FxControl::GROUPS) sendsTo_[index] = clamp01(x);
                return;
            case FxControl::COMP:
                compOn_ = index != 0;
                compXTo_ = clamp01(x);
                compYTo_ = clamp01(y);
                return;
            case FxControl::SIDECHAIN:
                dests_ = index & ((1 << FxControl::GROUPS) - 1);
                duckX_ = clamp01(x);
                duckY_ = clamp01(y);
                duckLength_ = lengthOf(duckX_);
                return;
            case FxControl::TEMPO:
                bpm_ = x > BPM_MIN ? (x < BPM_MAX ? x : BPM_MAX) : BPM_MIN;
                punch_.setTempo(bpm_);
                return;
            case FxControl::PUNCH:
                punch_.set(index, x);
                return;
            default:
                return;
        }
    }

    /** A duck source starts at output frame [at]: the duck dips from where it is now. */
    void trigger(int64_t at) {
        duckFrom_ = duck(at);
        duckAt_ = at;
    }

    /** A block of [frames] (at most maxFrames) frames starts: fxIn cleared. */
    void begin(int frames) {
        frames_ = frames;
        if (dirty_ > 0) std::memset(fxIn_, 0, sizeof(float) * static_cast<size_t>(dirty_));
        dirty_ = 0;
        sent_ = false;
    }

    /**
     * Works out each group's gains for the block's frames [offset] until
     * [offset] + [frames] (output frame [at] at [offset]): read them with
     * [dry] and [send].
     */
    void gains(int offset, int frames, int64_t at) {
        if (duckAt_ != IDLE && at - duckAt_ >= duckLength_) duckAt_ = IDLE;
        const float boost = punch_.sendBoost();
        bool live = boost > 0.0f;
        for (int g = 0; g < FxControl::GROUPS; g++) {
            dryOn_[g] = false;
            sendOn_[g] = false;
            if (sends_[g] != 0.0f || sendsTo_[g] != 0.0f) live = true;
        }
        const bool ducking = dests_ != 0 && duckAt_ != IDLE;
        if (!live && !ducking) return;
        for (int i = 0; i < frames; i++) {
            const float d = ducking ? duck(at + i) : 1.0f;
            for (int g = 0; g < FxControl::GROUPS; g++) {
                const float s0 = smooth(sends_[g], sendsTo_[g]);
                sends_[g] = s0;
                const float s = boost > s0 ? boost : s0;
                const float gd = ((dests_ >> g) & 1) != 0 ? d : 1.0f;
                const float dry = gd * dryLaw(s);
                const float send = gd * s;
                dryGains_[g * maxFrames_ + offset + i] = dry;
                sendGains_[g * maxFrames_ + offset + i] = send;
                if (dry != 1.0f) dryOn_[g] = true;
                if (send != 0.0f) sendOn_[g] = true;
            }
        }
        for (int g = 0; g < FxControl::GROUPS; g++) {
            if (sendOn_[g]) {
                sent_ = true;
                dirty_ = frames_ * 2;
            }
        }
    }

    /** Group [bus]'s dry gains for the last [gains], by block frame; null when they are all exactly 1. */
    const float *dry(int32_t bus) const { return dryOn_[bus] ? dryGains_ + bus * maxFrames_ : nullptr; }

    /** Group [bus]'s send gains for the last [gains], by block frame; null when they are all exactly 0. */
    const float *send(int32_t bus) const { return sendOn_[bus] ? sendGains_ + bus * maxFrames_ : nullptr; }

    /** The send bus's input for the block: what the voices send, stereo, interleaved. */
    float *fxIn() { return fxIn_; }

    /**
     * The block's end, before the mixer's clip: the effect's return added to
     * [mix] ([frames] stereo frames), then the punch-ins, then the master
     * compressor. Each is skipped when it has nothing to do.
     */
    void process(float *mix, int frames) {
        const float x = fxX_;
        const float y = fxY_;
        fxX_ = glide(fxX_, fxXTo_, frames);
        fxY_ = glide(fxY_, fxYTo_, frames);
        const float cx = compX_;
        const float cy = compY_;
        compX_ = glide(compX_, compXTo_, frames);
        compY_ = glide(compY_, compYTo_, frames);
        Effect *effect = effects_[type_];
        if (fade_ > 0) {
            crossfade(mix, frames, effect, x, y);
        } else if (effect != nullptr && (sent_ || !effect->silent())) {
            effect->setParams(x, y, bpm_);
            effect->process(fxIn_, mix, frames);
        }
        punch_.record(mix, frames);
        if (punch_.active()) punch_.process(mix, frames);
        if (compOn_) {
            compressor_.setParams(cx, cy, bpm_);
            compressor_.processInPlace(mix, frames);
        }
    }

private:
    /** No duck running. */
    static constexpr int64_t IDLE = INT64_MIN;

    void rate(int32_t outRate) {
        outRate_ = outRate;
        smoothK_ = onePoleCoef(SMOOTH_MS, outRate);
        const int32_t fade = CROSSFADE_MS * outRate / 1000;
        const int32_t dip = DUCK_DIP_MS * outRate / 1000;
        fadeFrames_ = fade > 1 ? fade : 1;
        dip_ = dip > 1 ? dip : 1;
    }

    // The old effect's return fading out under the new one's, by the frame; the old one reset once it is gone.
    void crossfade(float *mix, int frames, Effect *effect, float x, float y) {
        const size_t n = static_cast<size_t>(frames) * 2;
        std::memset(fadeOld_, 0, sizeof(float) * n);
        std::memset(fadeNew_, 0, sizeof(float) * n);
        Effect *old = effects_[oldType_];
        if (old != nullptr) old->process(fxIn_, fadeOld_, frames);
        if (effect != nullptr) {
            effect->setParams(x, y, bpm_);
            effect->process(fxIn_, fadeNew_, frames);
        }
        for (int i = 0; i < frames; i++) {
            float a = 0.0f;
            float b = 1.0f;
            if (fade_ > 0) {
                b = static_cast<float>(fadeFrames_ - fade_) / static_cast<float>(fadeFrames_);
                a = 1.0f - b;
                fade_--;
            }
            mix[2 * i] += fadeOld_[2 * i] * a + fadeNew_[2 * i] * b;
            mix[2 * i + 1] += fadeOld_[2 * i + 1] * a + fadeNew_[2 * i + 1] * b;
        }
        if (fade_ == 0) {
            if (old != nullptr) old->reset();
            oldType_ = FxControl::NONE;
        }
    }

    // The duck's gain at output frame [at] (before the sidechain's mask).
    float duck(int64_t at) const {
        if (duckAt_ == IDLE) return 1.0f;
        const int64_t t = at - duckAt_;
        if (t < dip_) return lerp(duckFrom_, DUCK_FLOOR, static_cast<float>(t) / static_cast<float>(dip_));
        if (t >= duckLength_) return 1.0f;
        const float u = static_cast<float>(t - dip_) / static_cast<float>(duckLength_ - dip_);
        const float v = 1.0f - u;
        const float fast = 1.0f - v * v * v;
        const float slow = u * u * u;
        return DUCK_FLOOR + (1.0f - DUCK_FLOOR) * lerp(fast, slow, duckY_);
    }

    // The duck's length in frames for an [x] of 0..1, longer than its dip.
    int32_t lengthOf(float x) const {
        const float ms = DUCK_MS + DUCK_MS_RANGE * x;
        const int32_t frames = static_cast<int32_t>(ms * static_cast<float>(outRate_) / 1000.0f);
        return frames > dip_ + 1 ? frames : dip_ + 1;
    }

    // How much of the dry a group keeps at send [s], by the effect.
    float dryLaw(float s) const {
        switch (type_) {
            case FxControl::DELAY:
            case FxControl::REVERB:
            case FxControl::CHORUS:
                return 1.0f - 0.3f * s;
            case FxControl::DISTORTION:
            case FxControl::FILTER:
            case FxControl::COMPRESSOR:
                return 1.0f - s;
            default:
                return 1.0f;
        }
    }

    // One frame of the one-pole from [cur] toward [target], landing on it once
    // within SNAP, or once a step no longer moves it.
    float smooth(float cur, float target) const {
        const float d = target - cur;
        if ((d < 0.0f ? -d : d) < SNAP) return target;
        const float next = cur + smoothK_ * d;
        return next == cur ? target : next;
    }

    // [frames] frames of [smooth].
    float glide(float cur, float target, int frames) const {
        float c = cur;
        for (int i = 0; i < frames; i++) {
            if (c == target) break;
            c = smooth(c, target);
        }
        return c;
    }

    const int maxFrames_;
    int32_t outRate_ = 0;
    Delay delay_;
    Reverb reverb_;
    Distortion distortion_;
    Chorus chorus_;
    Filter filter_;
    Compressor compressorFx_;
    Compressor compressor_;
    Punch punch_;
    // By type; NONE has none.
    Effect *effects_[FxControl::TYPES];

    float smoothK_ = 1.0f;
    int32_t fadeFrames_ = 1;
    int32_t dip_ = 1;

    int32_t type_ = FxControl::NONE;
    float fxX_ = 0.5f;
    float fxY_ = 0.5f;
    float fxXTo_ = 0.5f;
    float fxYTo_ = 0.5f;
    // The type fading out, and the frames of the fade still to go (0: none).
    int32_t oldType_ = FxControl::NONE;
    int32_t fade_ = 0;

    float sends_[FxControl::GROUPS] = {};
    float sendsTo_[FxControl::GROUPS] = {};

    bool compOn_ = false;
    float compX_ = 0.5f;
    float compY_ = 0.5f;
    float compXTo_ = 0.5f;
    float compYTo_ = 0.5f;

    int32_t dests_ = 0;
    float duckX_ = 0.3f;
    float duckY_ = 0.5f;
    int32_t duckLength_ = 0;
    int64_t duckAt_ = IDLE;
    float duckFrom_ = 1.0f;

    float bpm_ = BPM_DEFAULT;

    // One allocation: fxIn, the two crossfade buffers (each 2 * maxFrames), then each group's dry and send gains.
    float *buffers_;
    float *fxIn_;
    float *fadeOld_;
    float *fadeNew_;
    float *dryGains_;
    float *sendGains_;
    bool dryOn_[FxControl::GROUPS] = {};
    bool sendOn_[FxControl::GROUPS] = {};
    int frames_ = 0;
    // How much of fxIn may be other than 0; whether anything was sent this block.
    int dirty_ = 0;
    bool sent_ = false;
};

}  // namespace arc::fx
