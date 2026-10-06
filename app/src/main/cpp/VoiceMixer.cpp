// Port of core/src/main/kotlin/dev/arc/ep133/formats/VoiceMixer.kt; see VoiceMixer.h for the deltas.
//
// The arithmetic follows the Kotlin line by line: positions and steps in
// double, interpolation, gains and the mix in float, conversions truncating
// as Kotlin's toInt/toLong do. The build turns off floating-point contraction
// (-ffp-contract=off) so the compiler can't fuse a multiply and an add into
// one rounding where the JVM rounds twice.
#include "VoiceMixer.h"

#include <climits>
#include <cstring>

namespace arc {

VoiceMixer::VoiceMixer(int outRate, int maxVoices, int maxFrames)
    : maxVoices_(maxVoices < 1 ? 1 : (maxVoices > MAX_KEYS ? MAX_KEYS : maxVoices)),
      maxFrames_(maxFrames < 1 ? 1 : maxFrames),
      mix_(new float[static_cast<size_t>(maxFrames_) * 2]) {
    setRate(outRate);
}

VoiceMixer::~VoiceMixer() { delete[] mix_; }

void VoiceMixer::setRate(int outRate) {
    outRate_ = outRate;
    minGate_ = MIN_GATE_MS * outRate / 1000LL;
    const int fade = FADE_MS * outRate / 1000;
    const int choke = CHOKE_MS * outRate / 1000;
    fade_ = fade > 1 ? fade : 1;
    choke_ = choke > 1 ? choke : 1;
}

bool VoiceMixer::queue(const Command &c) {
    if (commandCount_ >= MAX_COMMANDS) return false;
    commands_[commandCount_++] = c;
    return true;
}

bool VoiceMixer::start(int32_t key, Sample *sample, int32_t sampleRate, double pitch, int64_t tag) {
    if (sample == nullptr || sample->channels < 1 || sample->channels > 2) return false;
    return queue({Kind::Start, key, sample, static_cast<double>(sampleRate) / outRate_ * pitch, tag});
}

bool VoiceMixer::release(int32_t key) { return queue({Kind::Release, key, nullptr, 0.0, 0}); }

bool VoiceMixer::cut(int32_t key) { return queue({Kind::Cut, key, nullptr, 0.0, 0}); }

bool VoiceMixer::stopAll() { return queue({Kind::StopAll, 0, nullptr, 0.0, 0}); }

void VoiceMixer::render(int16_t *out, int frames) {
    if (frames > maxFrames_) frames = maxFrames_;
    startedCount_ = 0;
    for (int i = 0; i < commandCount_; i++) apply(commands_[i]);
    commandCount_ = 0;
    std::memset(mix_, 0, sizeof(float) * static_cast<size_t>(frames) * 2);
    // Ended voices dropped in place, by index.
    int kept = 0;
    for (int i = 0; i < voiceCount_; i++) {
        Voice &v = voices_[i];
        if (play(v, frames)) {
            if (kept != i) voices_[kept] = v;
            kept++;
        } else {
            v.sample->voices--;
        }
    }
    voiceCount_ = kept;
    for (int i = 0; i < frames * 2; i++) {
        float m = mix_[i];
        if (m < -32768.0f) m = -32768.0f;
        else if (m > 32767.0f) m = 32767.0f;
        out[i] = static_cast<int16_t>(static_cast<int32_t>(m));
    }
    frame_ += frames;
    if (keysChanged()) {
        keyCount_ = 0;
        for (int i = 0; i < voiceCount_; i++) {
            const Voice &v = voices_[i];
            if (v.choked) continue;
            bool seen = false;
            for (int k = 0; k < keyCount_; k++) seen = seen || keys_[k] == v.key;
            if (!seen && keyCount_ < MAX_KEYS) keys_[keyCount_++] = v.key;
        }
        keysVersion_++;
    }
}

void VoiceMixer::reset(int outRate) {
    for (int i = 0; i < voiceCount_; i++) voices_[i].sample->voices--;
    voiceCount_ = 0;
    commandCount_ = 0;
    startedCount_ = 0;
    if (keyCount_ != 0) {
        keyCount_ = 0;
        keysVersion_++;
    }
    setRate(outRate);
}

// Whether the voices not cut short differ from [keys] (each key has one such voice).
bool VoiceMixer::keysChanged() const {
    int n = 0;
    for (int i = 0; i < voiceCount_; i++) {
        const Voice &v = voices_[i];
        if (v.choked) continue;
        bool known = false;
        for (int k = 0; k < keyCount_ && !known; k++) known = keys_[k] == v.key;
        if (!known) return true;
        n++;
    }
    return n != keyCount_;
}

void VoiceMixer::removeVoice(int index) {
    voices_[index].sample->voices--;
    for (int i = index + 1; i < voiceCount_; i++) voices_[i - 1] = voices_[i];
    voiceCount_--;
}

void VoiceMixer::apply(const Command &c) {
    switch (c.kind) {
        case Kind::Start: {
            if (c.sample->frames < 1) return;
            cutKey(c.key);
            while (true) {
                int held = 0;
                int firstLetGo = -1;
                int first = -1;
                for (int i = 0; i < voiceCount_; i++) {
                    const Voice &v = voices_[i];
                    if (v.choked) continue;
                    held++;
                    if (first < 0) first = i;
                    if (firstLetGo < 0 && v.fadeAt != INT64_MAX) firstLetGo = i;
                }
                if (held < maxVoices_) break;
                cutVoice(voices_[firstLetGo >= 0 ? firstLetGo : first]);
            }
            if (voiceCount_ == VOICE_SLOTS) {
                // Out of slots (only with many voices cut short at once): the oldest of those goes now.
                int oldest = -1;
                for (int i = 0; i < voiceCount_ && oldest < 0; i++) {
                    if (voices_[i].choked) oldest = i;
                }
                if (oldest < 0) return;
                removeVoice(oldest);
            }
            voices_[voiceCount_++] = {c.key, c.sample, c.sample->frames, c.step, frame_, 0.0, INT64_MAX, 1, false};
            c.sample->voices++;
            if (startedCount_ < MAX_STARTED) started_[startedCount_++] = {c.key, c.tag, frame_};
            return;
        }
        case Kind::Release:
            for (int i = 0; i < voiceCount_; i++) {
                Voice &v = voices_[i];
                if (v.key != c.key || v.choked || v.fadeAt != INT64_MAX) continue;
                const int64_t gateEnd = v.startFrame + minGate_;
                v.fadeAt = frame_ > gateEnd ? frame_ : gateEnd;
                v.fadeFrames = fade_;
            }
            return;
        case Kind::Cut:
            cutKey(c.key);
            return;
        case Kind::StopAll:
            for (int i = 0; i < voiceCount_; i++) {
                if (!voices_[i].choked) cutVoice(voices_[i]);
            }
            return;
    }
}

// Cuts short the voice of [key], if one sounds.
void VoiceMixer::cutKey(int32_t key) {
    for (int i = 0; i < voiceCount_; i++) {
        Voice &v = voices_[i];
        if (v.key == key && !v.choked) cutVoice(v);
    }
}

// Cuts [v] short: from wherever its level is now, down to nothing in CHOKE_MS.
void VoiceMixer::cutVoice(Voice &v) {
    v.choked = true;
    const float g = gain(v, frame_);
    v.fadeFrames = choke_;
    v.fadeAt = frame_ - static_cast<int64_t>((1.0f - g) * static_cast<float>(choke_));
}

float VoiceMixer::gain(const Voice &v, int64_t at) const {
    return at < v.fadeAt ? 1.0f : 1.0f - static_cast<float>(at - v.fadeAt) / static_cast<float>(v.fadeFrames);
}

// Adds [frames] of [v] to the mix; false once it has ended.
bool VoiceMixer::play(Voice &v, int frames) {
    const int32_t last = v.frames - 1;
    const int16_t *pcm = v.sample->pcm;
    const int32_t ch = v.sample->channels;
    for (int i = 0; i < frames; i++) {
        const double p = v.pos;
        if (p > last) return false;
        const int64_t at = frame_ + i;
        const float g = gain(v, at);
        if (g <= 0.0f) return false;
        const int32_t i0 = static_cast<int32_t>(p);
        const int32_t i1 = i0 + 1 < last ? i0 + 1 : last;
        const float frac = static_cast<float>(p - i0);
        const float l0 = static_cast<float>(pcm[i0 * ch]);
        const float l = l0 + (static_cast<float>(pcm[i1 * ch]) - l0) * frac;
        float r;
        if (ch == 2) {
            const float r0 = static_cast<float>(pcm[i0 * 2 + 1]);
            r = r0 + (static_cast<float>(pcm[i1 * 2 + 1]) - r0) * frac;
        } else {
            r = l;
        }
        mix_[2 * i] += l * g;
        mix_[2 * i + 1] += r * g;
        v.pos = p + v.step;
    }
    return true;
}

}  // namespace arc
