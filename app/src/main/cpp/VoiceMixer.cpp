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

static_assert(VoiceShape().releaseMs == VoiceMixer::FADE_MS, "the default release is the fade");

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

bool VoiceMixer::start(int32_t key, Sample *sample, int32_t sampleRate, double pitch, int64_t tag,
                       const VoiceShape &shape, int64_t at) {
    if (sample == nullptr || sample->channels < 1 || sample->channels > 2) return false;
    return queue({Kind::Start, key, sample, static_cast<double>(sampleRate) / outRate_ * pitch, tag, shape, at});
}

bool VoiceMixer::release(int32_t key, int64_t at, int64_t tag) {
    return queue({Kind::Release, key, nullptr, 0.0, tag, VoiceShape(), at});
}

bool VoiceMixer::cut(int32_t key) { return queue({Kind::Cut, key, nullptr, 0.0, 0, VoiceShape(), NOW}); }

bool VoiceMixer::stopAll() { return queue({Kind::StopAll, 0, nullptr, 0.0, 0, VoiceShape(), NOW}); }

bool VoiceMixer::flushTimed() { return queue({Kind::FlushTimed, 0, nullptr, 0.0, 0, VoiceShape(), NOW}); }

void VoiceMixer::render(int16_t *out, int frames) {
    if (frames > maxFrames_) frames = maxFrames_;
    startedCount_ = 0;
    for (int i = 0; i < commandCount_; i++) take(commands_[i]);
    commandCount_ = 0;
    std::memset(mix_, 0, sizeof(float) * static_cast<size_t>(frames) * 2);
    const int64_t end = frame_ + frames;
    int done = 0;
    while (true) {
        applyDue();
        const int64_t next = pendingCount_ == 0 || pending_[0].at > end ? end : pending_[0].at;
        const int n = static_cast<int>(next - frame_);
        if (n > 0) {
            playAll(done, n);
            done += n;
            frame_ += n;
        }
        if (frame_ >= end) break;
    }
    for (int i = 0; i < frames * 2; i++) {
        float m = mix_[i];
        if (m < -32768.0f) m = -32768.0f;
        else if (m > 32767.0f) m = 32767.0f;
        out[i] = static_cast<int16_t>(static_cast<int32_t>(m));
    }
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

// A command off the queue: applied now or, timed, kept until its frame,
// behind those already waiting for it (by insertion: the list is short).
void VoiceMixer::take(const Command &c) {
    if (c.kind == Kind::FlushTimed) {
        flushPending();
        return;
    }
    if (c.at == NOW || pendingCount_ == MAX_PENDING) {
        apply(c);
        return;
    }
    int i = pendingCount_;
    while (i > 0 && pending_[i - 1].at > c.at) {
        pending_[i] = pending_[i - 1];
        i--;
    }
    pending_[i] = c;
    pendingCount_++;
    if (c.kind == Kind::Start) c.sample->pending++;
}

// Applies the timed commands whose frame has come (or gone), in order.
void VoiceMixer::applyDue() {
    int n = 0;
    while (n < pendingCount_ && pending_[n].at <= frame_) n++;
    if (n == 0) return;
    for (int i = 0; i < n; i++) {
        if (pending_[i].kind == Kind::Start) pending_[i].sample->pending--;
        apply(pending_[i]);
    }
    for (int i = n; i < pendingCount_; i++) pending_[i - n] = pending_[i];
    pendingCount_ -= n;
}

// Drops every timed command waiting.
void VoiceMixer::flushPending() {
    for (int i = 0; i < pendingCount_; i++) {
        if (pending_[i].kind == Kind::Start) pending_[i].sample->pending--;
    }
    pendingCount_ = 0;
}

// Adds the next [frames] of every voice to the mix, from its frame [offset]; ended voices are dropped in place, by index.
void VoiceMixer::playAll(int offset, int frames) {
    int kept = 0;
    for (int i = 0; i < voiceCount_; i++) {
        Voice &v = voices_[i];
        if (play(v, offset, frames)) {
            if (kept != i) voices_[kept] = v;
            kept++;
        } else {
            v.sample->voices--;
        }
    }
    voiceCount_ = kept;
}

void VoiceMixer::reset(int outRate) {
    for (int i = 0; i < voiceCount_; i++) voices_[i].sample->voices--;
    voiceCount_ = 0;
    commandCount_ = 0;
    flushPending();
    startedCount_ = 0;
    if (keyCount_ != 0) {
        keyCount_ = 0;
        keysVersion_++;
    }
    setRate(outRate);
}

// Whether the voices not cut short differ from [keys]. A Key-mode key may have
// several such voices: each key is counted at its first.
bool VoiceMixer::keysChanged() const {
    int n = 0;
    for (int i = 0; i < voiceCount_; i++) {
        const Voice &v = voices_[i];
        if (v.choked || keyBefore(i)) continue;
        bool known = false;
        for (int k = 0; k < keyCount_ && !known; k++) known = keys_[k] == v.key;
        if (!known) return true;
        n++;
    }
    return n != keyCount_;
}

// Whether a voice before [index], not cut short, has its key.
bool VoiceMixer::keyBefore(int index) const {
    const int32_t key = voices_[index].key;
    for (int i = 0; i < index; i++) {
        if (!voices_[i].choked && voices_[i].key == key) return true;
    }
    return false;
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
            const VoiceShape &shape = c.shape;
            const int32_t frames = c.sample->frames;
            const int32_t first = shape.start < 0 ? 0 : (shape.start > frames ? frames : shape.start);
            const int32_t end = shape.end < first ? first : (shape.end > frames ? frames : shape.end);
            // Trimmed to nothing: as an empty sound.
            if (end <= first) return;
            if (shape.mode == static_cast<int32_t>(VoiceMode::Legato) && legato(c)) return;
            if (shape.mode != static_cast<int32_t>(VoiceMode::Key)) cutKey(c.key);
            if (shape.muteGroup > 0) {
                for (int i = 0; i < voiceCount_; i++) {
                    Voice &v = voices_[i];
                    if (v.group == shape.muteGroup && !v.choked) cutVoice(v);
                }
            }
            while (true) {
                int held = 0;
                int firstLetGo = -1;
                int first = -1;
                for (int i = 0; i < voiceCount_; i++) {
                    const Voice &v = voices_[i];
                    if (v.choked) continue;
                    held++;
                    if (first < 0) first = i;
                    if (firstLetGo < 0 && (v.letGo || v.fadeAt != INT64_MAX)) firstLetGo = i;
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
            const int32_t pan = shape.pan < -PAN_MAX ? -PAN_MAX : (shape.pan > PAN_MAX ? PAN_MAX : shape.pan);
            const float level = shape.gain < 0.0f ? 0.0f : (shape.gain > 1.0f ? 1.0f : shape.gain);
            const float left = static_cast<float>(PAN_MAX - pan) / static_cast<float>(PAN_MAX);
            const float right = static_cast<float>(PAN_MAX + pan) / static_cast<float>(PAN_MAX);
            const int32_t release = framesOf(shape.releaseMs);
            voices_[voiceCount_++] = {c.key,
                                      c.tag,
                                      c.sample,
                                      end,
                                      c.step,
                                      frame_,
                                      level,
                                      left < 1.0f ? left : 1.0f,
                                      right < 1.0f ? right : 1.0f,
                                      framesOf(shape.attackMs),
                                      release > fade_ ? release : fade_,
                                      shape.mode,
                                      shape.muteGroup,
                                      static_cast<double>(first),
                                      INT64_MAX,
                                      1,
                                      false,
                                      false};
            c.sample->voices++;
            if (startedCount_ < MAX_STARTED) started_[startedCount_++] = {c.key, c.tag, frame_};
            return;
        }
        case Kind::Release:
            for (int i = 0; i < voiceCount_; i++) {
                Voice &v = voices_[i];
                if (v.key != c.key || v.choked || (c.tag != 0 && v.tag != c.tag)) continue;
                v.letGo = true;
                if (v.fadeAt != INT64_MAX) continue;
                if (v.mode == static_cast<int32_t>(VoiceMode::OneShot)) continue;
                const int64_t gateEnd = v.startFrame + minGate_;
                v.fadeAt = frame_ > gateEnd ? frame_ : gateEnd;
                v.fadeFrames = v.release;
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
        case Kind::FlushTimed:
            flushPending();
            return;
    }
}

// A legato start: when [c]'s key has a legato voice still held on the same
// sound, that voice takes [c]'s pitch and tag where it is (its other voices,
// if any, are cut) and true comes back; false when a voice is to start.
bool VoiceMixer::legato(const Command &c) {
    int held = -1;
    for (int i = 0; i < voiceCount_; i++) {
        const Voice &v = voices_[i];
        if (v.key == c.key && !v.choked && v.fadeAt == INT64_MAX && v.mode == static_cast<int32_t>(VoiceMode::Legato)) {
            held = i;
        }
    }
    if (held < 0 || voices_[held].sample != c.sample) return false;
    for (int i = 0; i < voiceCount_; i++) {
        Voice &o = voices_[i];
        if (i != held && o.key == c.key && !o.choked) cutVoice(o);
    }
    voices_[held].step = c.step;
    voices_[held].tag = c.tag;
    if (startedCount_ < MAX_STARTED) started_[startedCount_++] = {c.key, c.tag, frame_};
    return true;
}

// [ms] in output frames (0 for less than none).
int32_t VoiceMixer::framesOf(int32_t ms) const {
    const int64_t f = static_cast<int64_t>(ms > 0 ? ms : 0) * outRate_ / 1000;
    return f < INT32_MAX ? static_cast<int32_t>(f) : INT32_MAX;
}

// Cuts short the voices of [key], if any sound.
void VoiceMixer::cutKey(int32_t key) {
    for (int i = 0; i < voiceCount_; i++) {
        Voice &v = voices_[i];
        if (v.key == key && !v.choked) cutVoice(v);
    }
}

// Cuts [v] short: from wherever its fade's level is now, down to nothing in CHOKE_MS.
void VoiceMixer::cutVoice(Voice &v) {
    v.choked = true;
    const float g = gain(v, frame_);
    v.fadeFrames = choke_;
    v.fadeAt = frame_ - static_cast<int64_t>((1.0f - g) * static_cast<float>(choke_));
}

// The fade's level at output frame [at]: 1 until it starts, then down to 0.
float VoiceMixer::gain(const Voice &v, int64_t at) const {
    return at < v.fadeAt ? 1.0f : 1.0f - static_cast<float>(at - v.fadeAt) / static_cast<float>(v.fadeFrames);
}

// The attack's level at output frame [at]: up from 0 to 1 over [attack] frames.
float VoiceMixer::ramp(const Voice &v, int64_t at) const {
    const int64_t since = at - v.startFrame;
    return since >= v.attack ? 1.0f : static_cast<float>(since) / static_cast<float>(v.attack);
}

// Adds [frames] of [v] to the mix from its frame [offset] (output frame frame_); false once it has ended.
bool VoiceMixer::play(Voice &v, int offset, int frames) {
    const int32_t last = v.end - 1;
    const int16_t *pcm = v.sample->pcm;
    const int32_t ch = v.sample->channels;
    for (int i = 0; i < frames; i++) {
        const double p = v.pos;
        if (p > last) return false;
        const int64_t at = frame_ + i;
        const float fadeGain = gain(v, at);
        if (fadeGain <= 0.0f) return false;
        const float g = ramp(v, at) * fadeGain * v.level;
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
        mix_[2 * (offset + i)] += l * g * v.left;
        mix_[2 * (offset + i) + 1] += r * g * v.right;
        v.pos = p + v.step;
    }
    return true;
}

}  // namespace arc
