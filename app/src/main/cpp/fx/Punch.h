// Port of core/src/main/kotlin/dev/arc/ep133/formats/fx/Punch.kt (an
// addition): the punch-in effects on the whole mix after the master effect,
// twelve slots each held at a depth while its pad is, fading in and out over
// 5 ms. The replays (STUTTER, BEAT_REPEAT, TAPE_STOP) read a 2 s history of
// the mix and play first; then the pitch shifters (PITCH_RANDOM,
// OCTAVE_DOWN), granular, on what comes to them; then SLICE, FILTER_LFO, LPF,
// HPF, TREMOLO and DECIMATOR, sample by sample. SEND_FX only raises the
// sends (sendBoost). The same float operations in the same order as the
// Kotlin one, so it plays what that does, bit for bit
// (VoiceMixerParityTest.cpp replays VoiceMixerGoldenTest's punch-in
// scenarios).
//
// Deltas from the Kotlin punch-ins: [setRate] (VoiceMixer::reset) works out
// the rate's values again and silences the history, keeping the slots held
// (each starts over at the next block); the history, the loops' copies and
// the shifters' lines are allocated there (and at construction), and only
// grow, never while rendering.
#pragma once

#include <cstdint>
#include <cstring>
#include <memory>

#include "Effect.h"
#include "FxMath.h"
#include "Svf.h"

namespace arc::fx {

class Punch {
public:
    /** The slots in the order they play. */
    static constexpr int32_t ORDER[11] = {
        FxControl::STUTTER, FxControl::BEAT_REPEAT, FxControl::TAPE_STOP, FxControl::PITCH_RANDOM,
        FxControl::OCTAVE_DOWN, FxControl::SLICE, FxControl::FILTER_LFO, FxControl::LPF,
        FxControl::HPF, FxControl::TREMOLO, FxControl::DECIMATOR,
    };
    /** How much of the mix the history keeps. */
    static constexpr int32_t HISTORY_SECONDS = 2;
    /** A slot's fade in and out. */
    static constexpr int32_t FADE_MS = 5;
    /** The stutter's loop at depth 0, and what depth 1 adds to it. */
    static constexpr float STUTTER_MS = 20.0f;
    static constexpr float STUTTER_MS_RANGE = 60.0f;
    /** The beat repeat's longest loop. */
    static constexpr int32_t REPEAT_SECONDS = 1;
    /** The tape's stop at depth 0, and what depth 1 takes off it. */
    static constexpr float TAPE_SECONDS = 1.5f;
    static constexpr float TAPE_SECONDS_RANGE = 1.2f;
    /** The pitch shifters' window. */
    static constexpr int32_t GRAIN_MS = 50;
    /** The pitch shifter's seed: its steps are the same each time. */
    static constexpr int32_t SEED = 133;
    /** How much of each 16th the slice's gate closes at depth 1, and its edges. */
    static constexpr float SLICE_CLOSE = 0.8f;
    static constexpr int32_t SLICE_EDGE_MS = 2;
    /** The filter LFO's sweep, its Q at depth 0 and what depth 1 adds, and the frames between cutoffs. */
    static constexpr float LFO_FROM = 200.0f;
    static constexpr float LFO_TO = 4000.0f;
    static constexpr float LFO_Q = 1.0f;
    static constexpr float LFO_Q_RANGE = 7.0f;
    static constexpr int32_t LFO_TICK = 16;
    /** The low-pass's cutoff at depth 1 and 0, the high-pass's at 0 and 1, both at Q 1/√2. */
    static constexpr float LPF_FROM = 80.0f;
    static constexpr float LPF_TO = 20000.0f;
    static constexpr float HPF_FROM = 20.0f;
    static constexpr float HPF_TO = 6000.0f;
    static constexpr float BUTTERWORTH = 0.70710677f;
    /** The decimator's hold at depth 1 (less the one frame at 0), and the bits it takes off. */
    static constexpr float DECIMATE_HOLD = 15.0f;
    static constexpr float DECIMATE_BITS = 12.0f;

    explicit Punch(int32_t outRate) { rate(outRate); }
    Punch(const Punch &) = delete;
    Punch &operator=(const Punch &) = delete;

    int32_t outRate() const { return outRate_; }

    /** Starts over at [rate]: the history silent; the slots held stay held, and start over. */
    void setRate(int32_t rate) {
        this->rate(rate);
        for (int32_t s = 0; s < FxControl::SLOTS; s++) {
            ramps_[s] = 0;
            fresh_[s] = held_[s];
        }
    }

    /** Whether a slot is held or still fading out: the bus calls [process] only then. */
    bool active() const {
        for (int32_t slot : ORDER) {
            if (held_[slot] || ramps_[slot] > 0) return true;
        }
        return false;
    }

    /** Holds [slot] at [depth] (0..1); 0 lets go of it. */
    void set(int32_t slot, float depth) {
        if (slot < 0 || slot >= FxControl::SLOTS) return;
        const float d = clamp01(depth);
        if (d > 0.0f) {
            if (!held_[slot] && ramps_[slot] == 0) fresh_[slot] = true;
            held_[slot] = true;
            depths_[slot] = d;
        } else {
            // The depth stays, for the fade out.
            held_[slot] = false;
        }
    }

    /** The tempo the synced slots follow, in BPM. */
    void setTempo(float bpm) { bpm_ = bpm; }
    float tempo() const { return bpm_; }

    /** SEND_FX's depth: every group's send is at least this while it is held. */
    float sendBoost() const { return held_[FxControl::SEND_FX] ? depths_[FxControl::SEND_FX] : 0.0f; }

    /** Writes [mix] (stereo, interleaved, [frames] long, before the punch-ins) into the history; every block. */
    void record(const float *mix, int frames) {
        int32_t from = 0;
        int32_t left = frames;
        while (left > 0) {
            const int32_t room = historySize_ - head_;
            const int32_t n = left < room ? left : room;
            std::memcpy(history_.get() + head_ * 2, mix + from * 2, sizeof(float) * static_cast<size_t>(n) * 2);
            head_ += n;
            if (head_ == historySize_) head_ = 0;
            from += n;
            left -= n;
        }
    }

    /** Plays the held slots over [mix] (stereo, interleaved, [frames] long, just recorded), in place. */
    void process(float *mix, int frames) {
        if (frames <= 0) return;
        // The history's frame for the block's first.
        int32_t s = (head_ - frames) % historySize_;
        if (s < 0) s += historySize_;
        for (int32_t slot : ORDER) {
            const bool on = held_[slot];
            const int32_t r0 = ramps_[slot];
            if (!on && r0 == 0) continue;
            if (fresh_[slot]) {
                start(slot, s);
                fresh_[slot] = false;
            }
            // Let go of: until its fade is out.
            const int32_t n = on ? frames : (frames < r0 - 1 ? frames : r0 - 1);
            switch (slot) {
                case FxControl::STUTTER: loop(stutter_, mix, n, on, r0); break;
                case FxControl::BEAT_REPEAT: loop(repeat_, mix, n, on, r0); break;
                case FxControl::TAPE_STOP: tape(mix, n, s, on, r0); break;
                case FxControl::PITCH_RANDOM: pitchRandom(mix, n, on, r0); break;
                case FxControl::OCTAVE_DOWN: octaveDown(mix, n, on, r0); break;
                case FxControl::SLICE: slice(mix, n, on, r0); break;
                case FxControl::FILTER_LFO: filterLfo(mix, n, on, r0); break;
                case FxControl::LPF: pass(lpL_, lpR_, false, mix, n, on, r0); break;
                case FxControl::HPF: pass(hpL_, hpR_, true, mix, n, on, r0); break;
                case FxControl::TREMOLO: tremolo(mix, n, on, r0); break;
                case FxControl::DECIMATOR: decimate(mix, n, on, r0); break;
                default: break;
            }
            if (on) {
                ramps_[slot] = r0 + frames < fadeFrames_ ? r0 + frames : fadeFrames_;
            } else {
                ramps_[slot] = r0 - frames > 0 ? r0 - frames : 0;
            }
        }
    }

    /** Every slot let go of at once, the history silent. */
    void reset() {
        for (int32_t s = 0; s < FxControl::SLOTS; s++) {
            depths_[s] = 0.0f;
            held_[s] = false;
            fresh_[s] = false;
            ramps_[s] = 0;
        }
        std::memset(history_.get(), 0, sizeof(float) * static_cast<size_t>(historySize_) * 2);
        head_ = 0;
        lcg_ = Lcg(SEED);
    }

private:
    /** A loop's own copy of its slice ([capacity] frames at most), and where it is in it. */
    struct Loop {
        std::unique_ptr<float[]> copy;
        int32_t room = 0;
        int32_t capacity = 0;
        int32_t length = 1;
        /** The history frame the slice starts at. */
        int32_t from = 0;
        int32_t at = 0;
        /** Still going round the first time: reading the history. */
        bool first = true;

        void size(int32_t frames) {
            capacity = frames;
            if (frames > room) {
                copy.reset(new float[static_cast<size_t>(frames) * 2]());
                room = frames;
            }
        }

        /** A slice [frames] long (held to 1..[capacity]), ending at history frame [s]. */
        void start(float frames, int32_t s, int32_t historySize) {
            const int32_t f = static_cast<int32_t>(frames);
            length = f > capacity ? capacity : (f > 1 ? f : 1);
            from = s - length;
            if (from < 0) from += historySize;
            at = 0;
            first = true;
        }
    };

    /**
     * A granular pitch shifter, stereo: two heads read a line of its input
     * [window] long (50 ms), their delays growing by 1 - ratio a frame, each
     * starting over as its triangle window closes; the two windows are half a
     * window apart.
     */
    struct Shifter {
        int32_t window = 2;
        int32_t half = 1;
        float most = 2.0f;
        float gainStep = 1.0f;
        /** The line: the window, and one more frame either side of the read. */
        int32_t size = 4;
        int32_t room = 0;
        std::unique_ptr<float[]> left;
        std::unique_ptr<float[]> right;
        int32_t write = 0;
        /** Where head A is in its window (head B half a window on). */
        int32_t grain = 0;
        float delayA = 0.0f;
        float delayB = 0.0f;
        float ratio = 1.0f;
        /** Where a head's delay starts over. */
        float restart = 0.0f;
        float outL = 0.0f;
        float outR = 0.0f;

        void rate(int32_t rate) {
            const int32_t w = rate * GRAIN_MS / 2000;
            window = (w > 1 ? w : 1) * 2;
            half = window / 2;
            most = static_cast<float>(window);
            gainStep = 2.0f / static_cast<float>(window);
            size = window + 2;
            if (size > room) {
                left.reset(new float[static_cast<size_t>(size)]());
                right.reset(new float[static_cast<size_t>(size)]());
                room = size;
            }
        }

        /** At [ratio], the line filled with the history before frame [s], head A's window opening. */
        void start(float r, const float *history, int32_t s, int32_t historySize) {
            retune(r);
            int32_t k = s - size;
            if (k < 0) k += historySize;
            for (int32_t j = 0; j < size; j++) {
                left[j] = history[2 * k];
                right[j] = history[2 * k + 1];
                k++;
                if (k == historySize) k = 0;
            }
            write = 0;
            grain = 0;
            delayA = restart;
            delayB = inLine(restart + static_cast<float>(half) * (1.0f - ratio));
        }

        /** A new speed: the heads glide on from where they are. */
        void retune(float r) {
            ratio = r;
            restart = r > 1.0f ? inLine((r - 1.0f) * most) : 0.0f;
        }

        /** Takes in a frame: [outL] and [outR] are then the shifted one. */
        void frame(float l, float r) {
            float *lt = left.get();
            float *rt = right.get();
            lt[write] = l;
            rt[write] = r;
            const float gA = static_cast<float>(grain < half ? grain : window - grain) * gainStep;
            int32_t kb = grain + half;
            if (kb >= window) kb -= window;
            const float gB = static_cast<float>(kb < half ? kb : window - kb) * gainStep;
            const int32_t wa = static_cast<int32_t>(delayA);
            const float fa = delayA - static_cast<float>(wa);
            int32_t a0 = write - wa;
            if (a0 < 0) a0 += size;
            int32_t a1 = a0 - 1;
            if (a1 < 0) a1 += size;
            const int32_t wb = static_cast<int32_t>(delayB);
            const float fb = delayB - static_cast<float>(wb);
            int32_t b0 = write - wb;
            if (b0 < 0) b0 += size;
            int32_t b1 = b0 - 1;
            if (b1 < 0) b1 += size;
            outL = lerp(lt[a0], lt[a1], fa) * gA + lerp(lt[b0], lt[b1], fb) * gB;
            outR = lerp(rt[a0], rt[a1], fa) * gA + lerp(rt[b0], rt[b1], fb) * gB;
            const float glide = 1.0f - ratio;
            delayA = inLine(delayA + glide);
            delayB = inLine(delayB + glide);
            write++;
            if (write == size) write = 0;
            grain++;
            if (grain == window) grain = 0;
            // A head starts over as its window closes (its gain 0).
            if (grain == 0) {
                delayA = restart;
            } else if (grain == half) {
                delayB = restart;
            }
        }

        /** A delay held to the line. */
        float inLine(float d) const { return d < 0.0f ? 0.0f : (d > most ? most : d); }
    };

    void rate(int32_t outRate) {
        outRate_ = outRate;
        historySize_ = HISTORY_SECONDS * outRate;
        if (historySize_ > historyRoom_) {
            history_.reset(new float[static_cast<size_t>(historySize_) * 2]());
            historyRoom_ = historySize_;
        } else {
            std::memset(history_.get(), 0, sizeof(float) * static_cast<size_t>(historySize_) * 2);
        }
        head_ = 0;
        const int32_t fade = FADE_MS * outRate / 1000;
        fadeFrames_ = fade > 1 ? fade : 1;
        fadeStep_ = 1.0f / static_cast<float>(fadeFrames_);
        stutter_.size(static_cast<int32_t>(STUTTER_MS + STUTTER_MS_RANGE) * outRate / 1000 + 1);
        repeat_.size(REPEAT_SECONDS * outRate);
        pitch_.rate(outRate);
        octave_.rate(outRate);
        const int32_t edge = SLICE_EDGE_MS * outRate / 1000;
        sliceEdge_ = edge > 1 ? edge : 1;
    }

    /** [slot] pressed from silence, the block's first frame at history frame [s]: its state from the start. */
    void start(int32_t slot, int32_t s) {
        const float d = depths_[slot];
        switch (slot) {
            case FxControl::STUTTER:
                stutter_.start((STUTTER_MS + STUTTER_MS_RANGE * d) * static_cast<float>(outRate_) / 1000.0f, s, historySize_);
                break;
            case FxControl::BEAT_REPEAT: {
                const int32_t q = static_cast<int32_t>(d * 4.0f);
                const int32_t division = 1 << (q > 3 ? 3 : q);
                repeat_.start(static_cast<float>(outRate_) * 60.0f / bpm_ / static_cast<float>(division), s, historySize_);
                break;
            }
            case FxControl::TAPE_STOP: {
                const int32_t t = static_cast<int32_t>((TAPE_SECONDS - TAPE_SECONDS_RANGE * d) * static_cast<float>(outRate_));
                tapeFrames_ = t > 1 ? t : 1;
                tapeStep_ = 1.0f / static_cast<float>(tapeFrames_);
                tapeAt_ = 0;
                tapeLag_ = 0.0f;
                break;
            }
            case FxControl::PITCH_RANDOM:
                pitch_.start(randomStep(d), history_.get(), s, historySize_);
                beatAt_ = 0;
                break;
            case FxControl::OCTAVE_DOWN:
                octave_.start(0.5f, history_.get(), s, historySize_);
                break;
            case FxControl::SLICE:
                slicePhase_ = 0.0f;
                break;
            case FxControl::FILTER_LFO:
                // From the bottom of the sweep.
                lfoPhase_ = 0.75f;
                lfoTick_ = 0;
                lfoL_.reset();
                lfoR_.reset();
                break;
            case FxControl::LPF:
                lpL_.reset();
                lpR_.reset();
                break;
            case FxControl::HPF:
                hpL_.reset();
                hpR_.reset();
                break;
            case FxControl::TREMOLO:
                // From the top of the swell.
                tremoloPhase_ = 0.25f;
                break;
            case FxControl::DECIMATOR:
                decimateAt_ = 0;
                break;
            default:
                break;
        }
    }

    /** A slot's fade at its block's frame [i]: in by a frame each while [on], out by one each after. */
    int32_t rampAt(bool on, int32_t r0, int32_t i) const {
        if (!on) return r0 - i - 1;
        const int32_t r = r0 + i + 1;
        return r < fadeFrames_ ? r : fadeFrames_;
    }

    /** [x] (what came to a slot) toward [p] (what it makes of it) by its fade [r]. */
    float wet(float x, float p, int32_t r) const {
        if (r >= fadeFrames_) return p;
        return x + (p - x) * (static_cast<float>(r) * fadeStep_);
    }

    /** A loop's slice over [n] frames of [mix]: out of the history the first time round, copied as it goes. */
    void loop(Loop &lp, float *mix, int32_t n, bool on, int32_t r0) {
        const float *h = history_.get();
        float *copy = lp.copy.get();
        int32_t at = lp.at;
        bool first = lp.first;
        for (int32_t i = 0; i < n; i++) {
            const int32_t r = rampAt(on, r0, i);
            if (first) {
                int32_t k = lp.from + at;
                if (k >= historySize_) k -= historySize_;
                copy[2 * at] = h[2 * k];
                copy[2 * at + 1] = h[2 * k + 1];
            }
            mix[2 * i] = wet(mix[2 * i], copy[2 * at], r);
            mix[2 * i + 1] = wet(mix[2 * i + 1], copy[2 * at + 1], r);
            at++;
            if (at == lp.length) {
                at = 0;
                first = false;
            }
        }
        lp.at = at;
        lp.first = first;
    }

    /** The tape: the history read further and further behind, slower and slower, then silence. */
    void tape(float *mix, int32_t n, int32_t s, bool on, int32_t r0) {
        const float *h = history_.get();
        int32_t cur = s;
        int32_t at = tapeAt_;
        float lag = tapeLag_;
        for (int32_t i = 0; i < n; i++) {
            const int32_t r = rampAt(on, r0, i);
            float l = 0.0f;
            float rr = 0.0f;
            if (at < tapeFrames_) {
                // Between the two samples lag frames back; the lag grows by at / tapeFrames a frame.
                const int32_t whole = static_cast<int32_t>(lag);
                const float frac = lag - static_cast<float>(whole);
                int32_t k0 = cur - whole;
                if (k0 < 0) k0 += historySize_;
                int32_t k1 = k0 - 1;
                if (k1 < 0) k1 += historySize_;
                l = lerp(h[2 * k0], h[2 * k1], frac);
                rr = lerp(h[2 * k0 + 1], h[2 * k1 + 1], frac);
                at++;
                lag += static_cast<float>(at) * tapeStep_;
            }
            mix[2 * i] = wet(mix[2 * i], l, r);
            mix[2 * i + 1] = wet(mix[2 * i + 1], rr, r);
            cur++;
            if (cur == historySize_) cur = 0;
        }
        tapeAt_ = at;
        tapeLag_ = lag;
    }

    /** A random step of 1 to 1 + 11 [d] semitones, up or down, as a speed. */
    float randomStep(float d) {
        const int32_t most = static_cast<int32_t>(1.0f + 11.0f * d);
        int32_t k = static_cast<int32_t>(lcg_.unit() * static_cast<float>(2 * most));
        if (k > 2 * most - 1) k = 2 * most - 1;
        int32_t n = k - most;
        if (n >= 0) n++;
        return semitoneRatio(n);
    }

    void pitchRandom(float *mix, int32_t n, bool on, int32_t r0) {
        const float d = depths_[FxControl::PITCH_RANDOM];
        const int32_t b = static_cast<int32_t>(static_cast<float>(outRate_) * 60.0f / bpm_);
        const int32_t beat = b > 1 ? b : 1;
        for (int32_t i = 0; i < n; i++) {
            const int32_t r = rampAt(on, r0, i);
            const float l = mix[2 * i];
            const float rr = mix[2 * i + 1];
            pitch_.frame(l, rr);
            mix[2 * i] = wet(l, pitch_.outL, r);
            mix[2 * i + 1] = wet(rr, pitch_.outR, r);
            beatAt_++;
            if (beatAt_ >= beat) {
                beatAt_ = 0;
                pitch_.retune(randomStep(d));
            }
        }
    }

    void octaveDown(float *mix, int32_t n, bool on, int32_t r0) {
        const float d = depths_[FxControl::OCTAVE_DOWN];
        for (int32_t i = 0; i < n; i++) {
            const int32_t r = rampAt(on, r0, i);
            const float amount = r >= fadeFrames_ ? d : d * (static_cast<float>(r) * fadeStep_);
            const float l = mix[2 * i];
            const float rr = mix[2 * i + 1];
            octave_.frame(l, rr);
            mix[2 * i] = l + (octave_.outL - l) * amount;
            mix[2 * i + 1] = rr + (octave_.outR - rr) * amount;
        }
    }

    void slice(float *mix, int32_t n, bool on, int32_t r0) {
        const float d = depths_[FxControl::SLICE];
        // A 16th note's share of a cycle a frame, how much of it is open, and 1 over an edge's share.
        const float inc = bpm_ / (15.0f * static_cast<float>(outRate_));
        const float open = 1.0f - SLICE_CLOSE * d;
        const float sharp = 1.0f / (static_cast<float>(sliceEdge_) * inc);
        float p = slicePhase_;
        for (int32_t i = 0; i < n; i++) {
            const int32_t r = rampAt(on, r0, i);
            const float up = p * sharp;
            const float down = (open - p) * sharp;
            const float e = up < down ? up : down;
            const float g = e > 1.0f ? 1.0f : (e > 0.0f ? e : 0.0f);
            const float l = mix[2 * i];
            const float rr = mix[2 * i + 1];
            mix[2 * i] = wet(l, l * g, r);
            mix[2 * i + 1] = wet(rr, rr * g, r);
            p = wrap01(p + inc);
        }
        slicePhase_ = p;
    }

    void filterLfo(float *mix, int32_t n, bool on, int32_t r0) {
        const float q = LFO_Q + LFO_Q_RANGE * depths_[FxControl::FILTER_LFO];
        const float inc = bpm_ / (60.0f * static_cast<float>(outRate_));
        float p = lfoPhase_;
        int32_t tick = lfoTick_;
        for (int32_t i = 0; i < n; i++) {
            const int32_t r = rampAt(on, r0, i);
            if (tick == 0) {
                const float u = 0.5f + 0.5f * triangle(p);
                const float g = svfG(LFO_FROM + (LFO_TO - LFO_FROM) * (u * u), outRate_);
                lfoL_.set(g, q);
                lfoR_.set(g, q);
                // The band-pass at 1 in its middle.
                lfoGain_ = 1.0f / q;
            }
            tick++;
            if (tick == LFO_TICK) tick = 0;
            const float l = mix[2 * i];
            const float rr = mix[2 * i + 1];
            lfoL_.process(l);
            lfoR_.process(rr);
            mix[2 * i] = wet(l, lfoL_.bp() * lfoGain_, r);
            mix[2 * i + 1] = wet(rr, lfoR_.bp() * lfoGain_, r);
            p = wrap01(p + inc);
        }
        lfoPhase_ = p;
        lfoTick_ = tick;
    }

    /** The low-pass ([high] false) or the high-pass. */
    void pass(Svf &left, Svf &right, bool high, float *mix, int32_t n, bool on, int32_t r0) {
        const float hz = high ? knobHz(depths_[FxControl::HPF], HPF_FROM, HPF_TO)
                              : knobHz(1.0f - depths_[FxControl::LPF], LPF_FROM, LPF_TO);
        const float g = svfG(hz, outRate_);
        left.set(g, BUTTERWORTH);
        right.set(g, BUTTERWORTH);
        for (int32_t i = 0; i < n; i++) {
            const int32_t r = rampAt(on, r0, i);
            const float l = mix[2 * i];
            const float rr = mix[2 * i + 1];
            left.process(l);
            right.process(rr);
            mix[2 * i] = wet(l, high ? left.hp() : left.lp(), r);
            mix[2 * i + 1] = wet(rr, high ? right.hp() : right.lp(), r);
        }
    }

    void tremolo(float *mix, int32_t n, bool on, int32_t r0) {
        const float d = depths_[FxControl::TREMOLO];
        const float inc = bpm_ / (15.0f * static_cast<float>(outRate_));
        float p = tremoloPhase_;
        for (int32_t i = 0; i < n; i++) {
            const int32_t r = rampAt(on, r0, i);
            const float g = 1.0f - d * (0.5f - 0.5f * parabolicSine(p));
            const float l = mix[2 * i];
            const float rr = mix[2 * i + 1];
            mix[2 * i] = wet(l, l * g, r);
            mix[2 * i + 1] = wet(rr, rr * g, r);
            p = wrap01(p + inc);
        }
        tremoloPhase_ = p;
    }

    void decimate(float *mix, int32_t n, bool on, int32_t r0) {
        const float d = depths_[FxControl::DECIMATOR];
        const int32_t hold = static_cast<int32_t>(1.0f + DECIMATE_HOLD * d);
        // A power of two: dividing by it is exact.
        const float step = static_cast<float>(1 << static_cast<int32_t>(DECIMATE_BITS * d));
        const float inv = 1.0f / step;
        int32_t at = decimateAt_;
        float hl = decimateL_;
        float hr = decimateR_;
        for (int32_t i = 0; i < n; i++) {
            const int32_t r = rampAt(on, r0, i);
            const float l = mix[2 * i];
            const float rr = mix[2 * i + 1];
            if (at == 0) {
                hl = quantise(l, step, inv);
                hr = quantise(rr, step, inv);
            }
            at++;
            if (at >= hold) at = 0;
            mix[2 * i] = wet(l, hl, r);
            mix[2 * i + 1] = wet(rr, hr, r);
        }
        decimateAt_ = at;
        decimateL_ = hl;
        decimateR_ = hr;
    }

    /** [x] truncated (toward 0) to a multiple of [step]. */
    static float quantise(float x, float step, float inv) {
        constexpr float BIG = 1e9f;
        const float q = x * inv;
        const float c = q > BIG ? BIG : (q < -BIG ? -BIG : q);
        return static_cast<float>(static_cast<int32_t>(c)) * step;
    }

    int32_t outRate_ = 0;
    int32_t historySize_ = 0;
    int32_t historyRoom_ = 0;
    std::unique_ptr<float[]> history_;
    int32_t head_ = 0;

    float depths_[FxControl::SLOTS] = {};
    bool held_[FxControl::SLOTS] = {};
    bool fresh_[FxControl::SLOTS] = {};
    int32_t ramps_[FxControl::SLOTS] = {};
    int32_t fadeFrames_ = 1;
    float fadeStep_ = 1.0f;
    float bpm_ = 120.0f;

    Loop stutter_;
    Loop repeat_;

    int32_t tapeAt_ = 0;
    int32_t tapeFrames_ = 1;
    float tapeStep_ = 1.0f;
    float tapeLag_ = 0.0f;

    Shifter pitch_;
    Shifter octave_;
    Lcg lcg_{SEED};
    int32_t beatAt_ = 0;

    int32_t sliceEdge_ = 1;
    float slicePhase_ = 0.0f;

    Svf lfoL_;
    Svf lfoR_;
    float lfoPhase_ = 0.0f;
    int32_t lfoTick_ = 0;
    float lfoGain_ = 1.0f;

    Svf lpL_;
    Svf lpR_;
    Svf hpL_;
    Svf hpR_;

    float tremoloPhase_ = 0.0f;

    int32_t decimateAt_ = 0;
    float decimateL_ = 0.0f;
    float decimateR_ = 0.0f;
};

}  // namespace arc::fx
